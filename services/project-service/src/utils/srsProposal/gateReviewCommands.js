/**
 * Gate1 Wave A — atomic decision batch (revision + projection + audit pointers).
 * Persist via injectable stores (default: Mongoose models). Fail-closed ordered writes.
 */

const {
  listProposalItems,
  computeReviewSummary,
  assertNeedsConfirmationAccept,
  DECISION_ACCEPT,
  DECISION_EDIT,
  DECISION_REJECT,
} = require('./review');
const {
  ORIGIN_AI,
  ORIGIN_BA_EDIT,
  ORIGIN_LEGACY,
  extractRevisionContent,
  buildRevisionDoc,
  assertExpectedRevisionId,
  applyEditToContent,
  sectionToArtifactType,
  newRevisionId,
} = require('./artifactRevision');
const {
  newReviewId,
  buildGateSubmissionDoc,
  buildManifestFromDecisions,
} = require('./gateSubmissionManifest');

const GATE1_AUDIT_ACTIONS = Object.freeze({
  REVIEW_STARTED: 'REVIEW_STARTED',
  REVIEW_ACCEPTED: 'REVIEW_ACCEPTED',
  REVIEW_EDITED: 'REVIEW_EDITED',
  REVIEW_REJECTED: 'REVIEW_REJECTED',
  REVIEW_SUBMITTED: 'REVIEW_SUBMITTED',
  REVIEW_WITHDRAWN: 'REVIEW_WITHDRAWN',
  LEGACY_BASELINE_IMPORTED: 'LEGACY_BASELINE_IMPORTED',
});

const REVIEW_POLICY_VERSION = 'GATE1-SOP-1.0';

function actionToAuditEvent(action) {
  const a = String(action || '').toLowerCase();
  if (a === DECISION_ACCEPT) return GATE1_AUDIT_ACTIONS.REVIEW_ACCEPTED;
  if (a === DECISION_EDIT) return GATE1_AUDIT_ACTIONS.REVIEW_EDITED;
  if (a === DECISION_REJECT) return GATE1_AUDIT_ACTIONS.REVIEW_REJECTED;
  return null;
}

function resolveSnapshotId(pack) {
  return (
    pack?.aiAnalysisActiveSnapshotId ||
    pack?.aiAnalysis?.activeSnapshotId ||
    pack?.aiAnalysis?.snapshotId ||
    null
  );
}

/**
 * In-memory tip index: logicalId → revision doc
 * @param {object[]} revisions
 */
function tipMapFromRevisions(revisions) {
  const byLogical = new Map();
  for (const r of revisions || []) {
    const id = String(r.logicalId);
    const prev = byLogical.get(id);
    if (!prev || Number(r.revisionNo) > Number(prev.revisionNo)) {
      byLogical.set(id, r);
    }
  }
  return byLogical;
}

/**
 * Ensure baseline REV-001 for every proposal item missing a tip.
 * Pure + store.insertRevision; emits LEGACY_BASELINE_IMPORTED / AI baseline audits via callback list.
 */
async function ensureBaselineRevisions({
  pack,
  proposal,
  reviewId,
  userId,
  organizationId,
  store,
  existingTips,
}) {
  const items = listProposalItems(proposal);
  const tips = existingTips || new Map();
  const created = [];
  const audits = [];
  const snapshotId = resolveSnapshotId(pack);
  const packId = String(pack._id || pack.id || pack.packId);
  const projectId = pack.projectId ? String(pack.projectId) : null;

  for (const row of items) {
    const logicalId = String(row.logicalId);
    if (tips.has(logicalId)) continue;

    const hasPriorDecision = Boolean(proposal?.review?.decisions?.[logicalId]?.action);
    const origin = hasPriorDecision ? ORIGIN_LEGACY : ORIGIN_AI;
    const content = extractRevisionContent(row.item);
    const doc = buildRevisionDoc({
      revisionId: newRevisionId(),
      organizationId,
      projectId,
      packId,
      reviewId,
      artifactType: sectionToArtifactType(row.section),
      logicalId,
      section: row.section,
      revisionNo: 1,
      parentRevisionId: null,
      origin,
      content,
      snapshotId,
      createdBy: userId || null,
      createdByType: origin === ORIGIN_AI ? 'AI' : 'SYSTEM',
    });
    await store.insertRevision(doc);
    tips.set(logicalId, doc);
    created.push(doc);
    audits.push({
      action:
        origin === ORIGIN_LEGACY
          ? GATE1_AUDIT_ACTIONS.LEGACY_BASELINE_IMPORTED
          : GATE1_AUDIT_ACTIONS.REVIEW_STARTED,
      logicalId,
      fromRevisionId: null,
      toRevisionId: doc.revisionId,
      note: origin === ORIGIN_LEGACY ? 'legacy_baseline' : 'ai_baseline',
    });
  }

  return { tips, created, audits };
}

/**
 * Apply one decision against tip map + proposal (returns next proposal + revision ops).
 * Does not persist — caller persists via store.
 */
function applyOneDecisionPure({
  proposal,
  logicalId,
  decision,
  tips,
  expectedRevisionId,
  userId,
  organizationId,
  pack,
  reviewId,
  expectedReviewVersion,
}) {
  if (
    expectedReviewVersion != null &&
    Number(proposal.reviewVersion || 0) !== Number(expectedReviewVersion)
  ) {
    const err = new Error('Stale reviewVersion');
    err.statusCode = 409;
    err.errorCode = 'STALE_REVIEW_VERSION';
    throw err;
  }

  const items = listProposalItems(proposal);
  const row = items.find((x) => String(x.logicalId) === String(logicalId));
  if (!row) {
    const err = new Error(`Unknown proposal item: ${logicalId}`);
    err.statusCode = 404;
    err.errorCode = 'PROPOSAL_ITEM_NOT_FOUND';
    throw err;
  }

  assertNeedsConfirmationAccept(decision, row.item);

  const tip = tips.get(String(logicalId));
  if (!tip) {
    const err = new Error(`Missing baseline revision for ${logicalId}`);
    err.statusCode = 409;
    err.errorCode = 'REVISION_BASELINE_MISSING';
    throw err;
  }

  assertExpectedRevisionId(tip.revisionId, expectedRevisionId);

  const action = String(decision.action || '').toLowerCase();
  let toRevision = tip;
  let newRevision = null;
  const fromRevisionId = tip.revisionId;

  if (action === DECISION_EDIT) {
    const nextContent = applyEditToContent(tip.content, decision.editedPayload || {});
    newRevision = buildRevisionDoc({
      revisionId: newRevisionId(),
      organizationId,
      projectId: pack.projectId ? String(pack.projectId) : null,
      packId: String(pack._id || pack.id || pack.packId),
      reviewId,
      artifactType: sectionToArtifactType(row.section),
      logicalId: String(logicalId),
      section: row.section,
      revisionNo: Number(tip.revisionNo) + 1,
      parentRevisionId: tip.revisionId,
      origin: ORIGIN_BA_EDIT,
      content: nextContent,
      snapshotId: resolveSnapshotId(pack),
      createdBy: userId || null,
      createdByType: 'HUMAN',
    });
    toRevision = newRevision;
  }

  const next = JSON.parse(JSON.stringify(proposal));
  next.review = next.review || { decisions: {}, locks: {}, summary: {} };
  next.review.decisions = { ...(next.review.decisions || {}) };

  // Apply content edit onto generated items (projection of tip content)
  if (action === DECISION_EDIT && decision.editedPayload && row.section) {
    const block = next.generated[row.section];
    if (block?.items) {
      block.items = block.items.map((it) =>
        String(it.logicalId || it.id) === String(logicalId)
          ? { ...it, ...decision.editedPayload }
          : it
      );
    }
  }

  next.review.decisions[logicalId] = {
    action,
    note: decision.note || null,
    resolution: decision.resolution || null,
    editedPayload: action === DECISION_EDIT ? decision.editedPayload || null : null,
    revisionId: toRevision.revisionId,
    at: new Date().toISOString(),
    by: userId || null,
  };
  next.reviewVersion = Number(next.reviewVersion || 0) + 1;
  next.review.summary = computeReviewSummary(next);

  const auditAction = actionToAuditEvent(action);
  const audit = auditAction
    ? {
        action: auditAction,
        logicalId: String(logicalId),
        fromRevisionId,
        toRevisionId: toRevision.revisionId,
        note: decision.note || null,
        reasonCode: decision.reasonCode || null,
      }
    : null;

  return { proposal: next, newRevision, tipRevision: toRevision, audit };
}

/**
 * Normalize reviewDecisions array | map → entries
 */
function normalizeDecisionEntries(reviewDecisions) {
  if (!reviewDecisions || typeof reviewDecisions !== 'object') return [];
  if (Array.isArray(reviewDecisions)) {
    return reviewDecisions
      .filter((e) => e && e.logicalId)
      .map((e) => {
        const { logicalId, ...decision } = e;
        return { logicalId: String(logicalId), decision };
      });
  }
  return Object.entries(reviewDecisions).map(([logicalId, decision]) => ({
    logicalId: String(logicalId),
    decision: decision || {},
  }));
}

/**
 * Core batch: baseline → decisions → updated proposal + revision inserts + audits.
 * Persistence via store; audit via recordGate1Audit callback.
 */
async function applyGate1DecisionBatch({
  pack,
  proposal,
  reviewDecisions,
  expectedRevisionIds = null,
  expectedReviewVersion = null,
  userId,
  organizationId,
  reviewId,
  store,
  recordGate1Audit,
  requestId = '',
}) {
  if (!store || typeof store.insertRevision !== 'function') {
    const err = new Error('revision store required');
    err.statusCode = 500;
    throw err;
  }

  const existing =
    typeof store.listTipsByPack === 'function'
      ? await store.listTipsByPack(String(pack._id || pack.id || pack.packId))
      : [];
  let tips = tipMapFromRevisions(existing);

  const baseline = await ensureBaselineRevisions({
    pack,
    proposal,
    reviewId,
    userId,
    organizationId,
    store,
    existingTips: tips,
  });
  tips = baseline.tips;

  for (const a of baseline.audits) {
    if (recordGate1Audit) {
      await recordGate1Audit({
        organizationId,
        actorUserId: userId,
        action: a.action,
        reviewId,
        packId: String(pack._id || pack.id || pack.packId),
        logicalId: a.logicalId,
        fromRevisionId: a.fromRevisionId,
        toRevisionId: a.toRevisionId,
        note: a.note,
        snapshotId: resolveSnapshotId(pack),
        requestId,
      });
    }
  }

  let nextProposal = proposal;
  const entries = normalizeDecisionEntries(reviewDecisions);
  const expMap =
    expectedRevisionIds && typeof expectedRevisionIds === 'object'
      ? expectedRevisionIds
      : {};

  // First entry may check reviewVersion once
  let versionCas = expectedReviewVersion;

  for (const { logicalId, decision } of entries) {
    if (!decision?.action) continue;
    const result = applyOneDecisionPure({
      proposal: nextProposal,
      logicalId,
      decision,
      tips,
      expectedRevisionId: expMap[logicalId],
      userId,
      organizationId,
      pack,
      reviewId,
      expectedReviewVersion: versionCas,
    });
    versionCas = null; // only first decision enforces session CAS
    nextProposal = result.proposal;
    if (result.newRevision) {
      await store.insertRevision(result.newRevision);
      tips.set(String(logicalId), result.newRevision);
    } else {
      tips.set(String(logicalId), result.tipRevision);
    }
    if (result.audit && recordGate1Audit) {
      await recordGate1Audit({
        organizationId,
        actorUserId: userId,
        action: result.audit.action,
        reviewId,
        packId: String(pack._id || pack.id || pack.packId),
        logicalId: result.audit.logicalId,
        fromRevisionId: result.audit.fromRevisionId,
        toRevisionId: result.audit.toRevisionId,
        note: result.audit.note,
        reasonCode: result.audit.reasonCode,
        snapshotId: resolveSnapshotId(pack),
        requestId,
      });
    }
  }

  nextProposal.review = nextProposal.review || {};
  nextProposal.review.summary = computeReviewSummary(nextProposal);

  const tipRevisionByLogicalId = {};
  for (const [k, v] of tips.entries()) {
    tipRevisionByLogicalId[k] = v.revisionId;
    // Ensure every tip has a decision projection with revisionId when decided
    const d = nextProposal.review.decisions?.[k];
    if (d && !d.revisionId) {
      nextProposal.review.decisions[k] = { ...d, revisionId: v.revisionId };
    }
  }

  return {
    proposal: nextProposal,
    tips,
    tipRevisionByLogicalId,
    reviewId,
  };
}

/**
 * Build immutable GateSubmission from current decisions + tips.
 */
function buildSubmissionFromBatchResult({
  pack,
  proposal,
  reviewId,
  sequenceNo,
  userId,
  organizationId,
  tipRevisionByLogicalId,
}) {
  const manifest = buildManifestFromDecisions(
    proposal?.review?.decisions || {},
    tipRevisionByLogicalId
  );
  // Include baseline tips even without decision (for blocking FR completeness PO view)
  const seen = new Set(manifest.map((m) => m.logicalId));
  for (const [logicalId, revisionId] of Object.entries(tipRevisionByLogicalId || {})) {
    if (seen.has(logicalId)) continue;
    const d = proposal?.review?.decisions?.[logicalId];
    if (!d?.action) continue;
    manifest.push({ logicalId, revisionId, action: d.action });
  }

  return buildGateSubmissionDoc({
    organizationId,
    projectId: pack.projectId ? String(pack.projectId) : null,
    packId: String(pack._id || pack.id || pack.packId),
    reviewId,
    sequenceNo,
    revisionManifest: manifest,
    snapshotId: resolveSnapshotId(pack),
    reviewPolicyVersion: REVIEW_POLICY_VERSION,
    submittedBy: userId,
  });
}

function createMemoryRevisionStore() {
  const rows = [];
  return {
    rows,
    async insertRevision(doc) {
      rows.push(JSON.parse(JSON.stringify(doc)));
      return doc;
    },
    async listTipsByPack(packId) {
      return rows.filter((r) => String(r.packId) === String(packId));
    },
  };
}

/**
 * Mongoose-backed store for ArtifactRevision (fail-closed insert).
 */
function createMongooseRevisionStore(ArtifactRevisionModel) {
  return {
    async insertRevision(doc) {
      const created = await ArtifactRevisionModel.create({
        revisionId: doc.revisionId,
        organizationId: doc.organizationId,
        projectId: doc.projectId || null,
        packId: doc.packId,
        reviewId: doc.reviewId || null,
        artifactType: doc.artifactType,
        logicalId: doc.logicalId,
        section: doc.section || '',
        revisionNo: doc.revisionNo,
        parentRevisionId: doc.parentRevisionId || null,
        origin: doc.origin,
        content: doc.content,
        contentHash: doc.contentHash,
        snapshotId: doc.snapshotId || null,
        createdBy: doc.createdBy || null,
        createdByType: doc.createdByType || 'SYSTEM',
      });
      return created.toObject ? created.toObject() : created;
    },
    async listTipsByPack(packId) {
      // Latest revisionNo per logicalId
      const rows = await ArtifactRevisionModel.find({ packId })
        .sort({ logicalId: 1, revisionNo: -1 })
        .lean();
      const seen = new Set();
      const tips = [];
      for (const r of rows) {
        const id = String(r.logicalId);
        if (seen.has(id)) continue;
        seen.add(id);
        tips.push(r);
      }
      return tips;
    },
  };
}

module.exports = {
  GATE1_AUDIT_ACTIONS,
  REVIEW_POLICY_VERSION,
  actionToAuditEvent,
  resolveSnapshotId,
  tipMapFromRevisions,
  ensureBaselineRevisions,
  applyOneDecisionPure,
  normalizeDecisionEntries,
  applyGate1DecisionBatch,
  buildSubmissionFromBatchResult,
  createMemoryRevisionStore,
  createMongooseRevisionStore,
  newReviewId,
};

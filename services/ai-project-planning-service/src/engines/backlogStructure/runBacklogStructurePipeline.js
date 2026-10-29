/**
 * Full backlog structure pipeline:
 * validate → reconcile → (needsReview hold | keep/mint) → resolve parents → final validate → coverage → draft lock → write
 */

const { SHAPE_VERSION } = require('./constants');
const { acceptBacklogCandidates } = require('./acceptBacklogCandidates');
const {
  reconcileBacklogBaseline,
  applyIdentityReviewResolutions,
} = require('./reconcileBacklogBaseline');
const { applyReconcileDecisions } = require('./applyReconcileDecisions');
const { resolveBacklogParents } = require('./resolveBacklogParents');
const { acceptBacklogStructure } = require('./acceptBacklogStructure');
const {
  computeStructuralCoverage,
  mergeLlmCoverageProposals,
} = require('./backlogCoverage');
const {
  hashInput,
  beginOrReplay,
  commitOperation,
} = require('./proposalOperationStore');
const { assertDraftRevision, nextDraftRevision } = require('./draftRevision');

/**
 * @param {object} opts
 * @param {object} opts.candidateProposal — LLM output with tempIds
 * @param {string} opts.operationKey
 * @param {object} opts.inputFingerprint — hashed for idempotency (sources+params, no tempRefs)
 * @param {string[]} opts.frAllowList
 * @param {string[]} [opts.acAllowList]
 * @param {string[]} [opts.evidenceAllowList]
 * @param {string[]} [opts.frInScope]
 * @param {string[]} [opts.acInScope]
 * @param {object} [opts.approvedBaseline]
 * @param {object} [opts.currentDraft]
 * @param {object} [opts.userEdits]
 * @param {object} [opts.llmCoverageProposals]
 * @param {Array} [opts.identityResolutions]
 * @param {string|number|null} [opts.expectedDraftRevisionId]
 * @param {string|number|null} [opts.currentDraftRevisionId]
 * @param {string} [opts.sourceSnapshotVersion]
 */
function runBacklogStructurePipeline(opts = {}) {
  const operationKey = String(opts.operationKey || '').trim();
  const inputHash = hashInput(opts.inputFingerprint || {});
  const began = beginOrReplay(operationKey, inputHash);
  if (!began.ok) {
    return {
      ok: false,
      code: began.code,
      message: began.message,
      statusCode: began.code === 'OPERATION_INPUT_MISMATCH' ? 409 : 400,
    };
  }

  if (began.replay && began.record?.result) {
    return {
      ...began.record.result,
      ok: began.record.result.ok !== false,
      replay: true,
    };
  }

  // Optionally ignore a fresh LLM candidate when replaying — handled above.
  // If in_progress without result, continue with provided candidate.

  const accepted = acceptBacklogCandidates(opts.candidateProposal || {}, {
    frAllowList: opts.frAllowList,
    acAllowList: opts.acAllowList,
    evidenceAllowList: opts.evidenceAllowList,
  });
  if (!accepted.ok) {
    return { ok: false, code: 'CANDIDATE_INVALID', errors: accepted.errors, warnings: accepted.warnings };
  }

  let reconciled = reconcileBacklogBaseline(accepted.candidates, {
    approvedBaseline: opts.approvedBaseline,
    currentDraft: opts.currentDraft,
    userEdits: opts.userEdits,
  });

  if (Array.isArray(opts.identityResolutions) && opts.identityResolutions.length) {
    reconciled = applyIdentityReviewResolutions(reconciled, opts.identityResolutions);
  }

  if (reconciled.needsReview || !reconciled.canPublish) {
    const hold = {
      ok: false,
      code: 'IDENTITY_NEEDS_REVIEW',
      needsReview: true,
      canPublish: false,
      identityReview: reconciled.identityReview,
      decisions: reconciled.decisions,
      message: 'Identity unresolved — cannot publish SoT or approve these entities',
    };
    commitOperation(operationKey, {
      status: 'needs_review',
      candidateProposal: opts.candidateProposal,
      result: hold,
    });
    return hold;
  }

  const applied = applyReconcileDecisions(reconciled, {
    tempRefMap: began.record?.tempRefMap || {},
  });
  if (!applied.ok) {
    return applied;
  }

  const resolved = resolveBacklogParents(applied.entities, applied.tempRefMap);
  if (!resolved.ok) {
    return { ok: false, code: 'PARENT_RESOLVE_FAILED', errors: resolved.errors };
  }

  const structural = computeStructuralCoverage({
    frInScope: opts.frInScope || opts.frAllowList || [],
    acInScope: opts.acInScope || opts.acAllowList || [],
    stories: resolved.entities.stories,
    features: resolved.entities.features,
  });
  const coverage = mergeLlmCoverageProposals(structural, opts.llmCoverageProposals || {});

  const draftCheck = assertDraftRevision(
    opts.currentDraftRevisionId,
    opts.expectedDraftRevisionId
  );
  if (!draftCheck.ok) {
    return draftCheck;
  }

  const prelim = {
    ...resolved.entities,
    coverageByFrId: coverage.coverageByFrId,
    coverageByAcRef: coverage.coverageByAcRef,
    identityReview: [],
    meta: {
      shapeVersion: SHAPE_VERSION,
      publishable: true,
      operationKey,
      inputHash,
      sourceSnapshotVersion: opts.sourceSnapshotVersion || null,
    },
  };

  const final = acceptBacklogStructure(prelim, { frAllowList: opts.frAllowList });
  if (!final.ok) {
    return { ok: false, code: 'FINAL_CONTRACT_INVALID', errors: final.errors };
  }

  const draftRevisionId = nextDraftRevision(opts.currentDraftRevisionId);
  const result = {
    ok: true,
    replay: false,
    needsReview: false,
    canPublish: true,
    backlogStructure: {
      ...final.backlogStructure,
      meta: {
        ...final.backlogStructure.meta,
        draftRevisionId,
        operationKey,
        inputHash,
        sourceSnapshotVersion: opts.sourceSnapshotVersion || null,
        structuralGaps: coverage.structuralGaps || [],
      },
    },
    tempRefMap: applied.tempRefMap,
    assignedIds: applied.assignedIds,
    warnings: accepted.warnings,
    draftRevisionId,
  };

  commitOperation(operationKey, {
    status: 'completed',
    candidateProposal: opts.candidateProposal,
    tempRefMap: applied.tempRefMap,
    assignedIds: applied.assignedIds,
    result,
  });

  return result;
}

module.exports = {
  runBacklogStructurePipeline,
};

/**
 * Gate1 submit orchestration helpers — review session + withdraw + submission persist.
 */

const GateReview = require('../../models/GateReview');
const GateSubmission = require('../../models/GateSubmission');
const ArtifactRevision = require('../../models/ArtifactRevision');
const { recordGate1Audit } = require('../../services/audit.service');
const {
  applyGate1DecisionBatch,
  buildSubmissionFromBatchResult,
  createMongooseRevisionStore,
  GATE1_AUDIT_ACTIONS,
  REVIEW_POLICY_VERSION,
  newReviewId,
  resolveSnapshotId,
} = require('./gateReviewCommands');
const { isReviewComplete, computeReviewSummary } = require('./review');
const { materializeSrsDraft } = require('./approvedSrsVersionManifest');

/**
 * @returns {Promise<{ review: object, created: boolean }>}
 */
async function ensureOpenGateReview({
  pack,
  organizationId,
  userId,
  forceNewRound = false,
}) {
  const packId = pack._id;
  if (!forceNewRound) {
    const open = await GateReview.findOne({
      packId,
      organizationId,
      status: 'IN_REVIEW',
    })
      .sort({ round: -1 })
      .lean();
    if (open) return { review: open, created: false };
  }

  const last = await GateReview.findOne({ packId, organizationId })
    .sort({ round: -1 })
    .lean();
  const round = forceNewRound ? Number(last?.round || 0) + 1 : Number(last?.round || 0) + 1 || 1;
  const reviewId = newReviewId();
  const doc = await GateReview.create({
    reviewId,
    organizationId,
    projectId: pack.projectId || null,
    packId,
    gate: 'BA_GATE_1',
    snapshotId: resolveSnapshotId(pack),
    reviewPolicyVersion: REVIEW_POLICY_VERSION,
    status: 'IN_REVIEW',
    round: round > 0 ? round : 1,
    startedBy: userId,
    startedAt: new Date(),
  });
  await recordGate1Audit({
    organizationId,
    actorUserId: userId,
    action: GATE1_AUDIT_ACTIONS.REVIEW_STARTED,
    reviewId,
    packId: String(packId),
    snapshotId: resolveSnapshotId(pack),
    note: `round_${doc.round}`,
  });
  return { review: doc.toObject(), created: true };
}

/**
 * Withdraw active GateSubmission. Idempotent when nothing active / already withdrawn.
 * @returns {{ withdrawn: object|null, skipped: boolean, reason?: string }}
 */
async function withdrawActiveSubmission({
  pack,
  organizationId,
  userId,
  withdrawSubmissionId,
}) {
  const activeId =
    pack.aiAnalysis?.gate1?.activeSubmissionId ||
    null;

  // Client asked to withdraw but pack has no pointer — treat as no-op (legacy / stale FE)
  if (!activeId) {
    if (withdrawSubmissionId) {
      const orphan = await GateSubmission.findOne({
        submissionId: String(withdrawSubmissionId),
        packId: pack._id || pack.id,
        organizationId,
        status: 'ACTIVE',
      });
      if (orphan) {
        orphan.status = 'WITHDRAWN';
        orphan.withdrawnAt = new Date();
        orphan.withdrawnBy = userId;
        await orphan.save();
        if (orphan.reviewId) {
          await GateReview.updateOne(
            { reviewId: orphan.reviewId, packId: pack._id || pack.id },
            { $set: { status: 'WITHDRAWN', activeSubmissionId: null } }
          );
        }
        await recordGate1Audit({
          organizationId,
          actorUserId: userId,
          action: GATE1_AUDIT_ACTIONS.REVIEW_WITHDRAWN,
          reviewId: orphan.reviewId,
          packId: String(pack._id || pack.id),
          note: orphan.submissionId,
          snapshotId: orphan.snapshotId,
        });
        return { withdrawn: orphan.toObject(), skipped: false };
      }
    }
    return { withdrawn: null, skipped: true, reason: 'no_active_submission' };
  }

  if (
    withdrawSubmissionId &&
    String(withdrawSubmissionId) !== String(activeId)
  ) {
    const err = new Error('withdrawSubmissionId không khớp active submission');
    err.statusCode = 409;
    err.errorCode = 'GATE_SUBMISSION_WITHDRAW_MISMATCH';
    err.details = { activeSubmissionId: activeId, withdrawSubmissionId };
    throw err;
  }

  const sub = await GateSubmission.findOne({
    submissionId: String(activeId),
    packId: pack._id || pack.id,
    organizationId,
  });
  if (!sub) {
    // Stale pointer on pack — clear and continue
    return { withdrawn: null, skipped: true, reason: 'submission_missing' };
  }
  if (sub.status !== 'ACTIVE') {
    return { withdrawn: null, skipped: true, reason: 'already_inactive' };
  }

  sub.status = 'WITHDRAWN';
  sub.withdrawnAt = new Date();
  sub.withdrawnBy = userId;
  // status is the only mutable field allowed on submission (lifecycle)
  await sub.save();

  if (sub.reviewId) {
    await GateReview.updateOne(
      { reviewId: sub.reviewId, packId: pack._id || pack.id },
      { $set: { status: 'WITHDRAWN', activeSubmissionId: null } }
    );
  }

  await recordGate1Audit({
    organizationId,
    actorUserId: userId,
    action: GATE1_AUDIT_ACTIONS.REVIEW_WITHDRAWN,
    reviewId: sub.reviewId,
    packId: String(pack._id || pack.id),
    note: sub.submissionId,
    snapshotId: sub.snapshotId,
  });

  return { withdrawn: sub.toObject(), skipped: false };
}

/**
 * Apply Gate1 trust path on submit when srsProposal exists.
 * @returns {{ proposal, submission, review, container }}
 */
async function applyGate1TrustOnSubmit({
  pack,
  container,
  proposal,
  reviewDecisions,
  expectedRevisionIds,
  expectedReviewVersion,
  userId,
  organizationId,
  withdrawSubmissionId = null,
  requestId = '',
}) {
  const activeSubmissionId = container.gate1?.activeSubmissionId || null;

  let forceNewRound = false;
  // Re-submit: auto-withdraw prior ACTIVE (idempotent if none / already withdrawn)
  if (activeSubmissionId || withdrawSubmissionId) {
    await withdrawActiveSubmission({
      pack: { ...pack, aiAnalysis: container },
      organizationId,
      userId,
      withdrawSubmissionId: withdrawSubmissionId || activeSubmissionId,
    });
    forceNewRound = true;
    container.gate1 = {
      ...(container.gate1 || {}),
      activeSubmissionId: null,
      activeReviewId: null,
    };
  }

  const { review } = await ensureOpenGateReview({
    pack,
    organizationId,
    userId,
    forceNewRound,
  });

  const store = createMongooseRevisionStore(ArtifactRevision);
  const batch = await applyGate1DecisionBatch({
    pack,
    proposal,
    reviewDecisions: reviewDecisions || {},
    expectedRevisionIds,
    expectedReviewVersion,
    userId,
    organizationId,
    reviewId: review.reviewId,
    store,
    recordGate1Audit,
    requestId,
  });

  const lastSub = await GateSubmission.findOne({
    packId: pack._id,
    organizationId,
  })
    .sort({ sequenceNo: -1 })
    .select('sequenceNo')
    .lean();
  const sequenceNo = Number(lastSub?.sequenceNo || 0) + 1;

  const submissionDoc = buildSubmissionFromBatchResult({
    pack,
    proposal: batch.proposal,
    reviewId: review.reviewId,
    sequenceNo,
    userId,
    organizationId,
    tipRevisionByLogicalId: batch.tipRevisionByLogicalId,
  });

  const createdSub = await GateSubmission.create({
    ...submissionDoc,
    submittedBy: userId,
    submittedAt: new Date(),
    status: 'ACTIVE',
  });

  await GateReview.updateOne(
    { reviewId: review.reviewId },
    {
      $set: {
        status: 'SUBMITTED',
        submittedBy: userId,
        submittedAt: new Date(),
        activeSubmissionId: createdSub.submissionId,
      },
    }
  );

  await recordGate1Audit({
    organizationId,
    actorUserId: userId,
    action: GATE1_AUDIT_ACTIONS.REVIEW_SUBMITTED,
    reviewId: review.reviewId,
    packId: String(pack._id),
    snapshotId: resolveSnapshotId(pack),
    note: createdSub.submissionId,
    requestId,
  });

  let nextProposal = batch.proposal;
  nextProposal.review = nextProposal.review || {};
  nextProposal.review.summary = computeReviewSummary(nextProposal);

  container.analyses = {
    ...(container.analyses || {}),
    srsProposal: nextProposal,
  };
  if (isReviewComplete(nextProposal) && !container.analyses.srsDraft) {
    container.analyses.srsDraft = materializeSrsDraft(nextProposal, { userId });
  }

  container.gate1 = {
    ...(container.gate1 || {}),
    activeReviewId: review.reviewId,
    activeSubmissionId: createdSub.submissionId,
    reviewPolicyVersion: REVIEW_POLICY_VERSION,
    lastSubmittedAt: new Date().toISOString(),
    // BA confirm → PO lane (SoT; submitRequirementPack also stamps)
    reviewLane: 'po',
    reviewLaneUpdatedAt: new Date().toISOString(),
  };

  return {
    proposal: nextProposal,
    submission: createdSub.toObject(),
    review,
    container,
  };
}

/**
 * Load active GateSubmission for PO approve.
 */
async function loadActiveGateSubmission(pack, organizationId) {
  const submissionId = pack?.aiAnalysis?.gate1?.activeSubmissionId;
  if (!submissionId) return null;
  return GateSubmission.findOne({
    submissionId: String(submissionId),
    packId: pack._id || pack.id,
    organizationId,
    status: 'ACTIVE',
  }).lean();
}

function isGate1SubmissionRequiredEnabled(env = process.env) {
  const raw = String(env.GATE1_SUBMISSION_REQUIRED ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

module.exports = {
  ensureOpenGateReview,
  withdrawActiveSubmission,
  applyGate1TrustOnSubmit,
  loadActiveGateSubmission,
  isGate1SubmissionRequiredEnabled,
};

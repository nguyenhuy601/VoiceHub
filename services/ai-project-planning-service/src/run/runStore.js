const { PlanningRun, RUN_STATUSES } = require('./PlanningRun.model');
const { publishGatePreview } = require('../engines/g4/pipelineProgress');
const {
  deriveComputeStatus,
  deriveCallbackStatus,
  deriveStage,
} = require('./runStatusDerive');

const TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'expired']);

function buildActiveKey(packId, job) {
  return `${String(packId || '').trim()}|${String(job || '').trim()}`;
}

/**
 * G19 Run store — lifecycle + snapshot binding (RULE-09: snapshotId immutable per run).
 */

/**
 * Replay lookup for client Idempotency-Key / requestKey.
 */
async function findByIdempotencyKey({ packId, job, idempotencyKey }) {
  const key = String(idempotencyKey || '').trim();
  if (!key) return null;
  return PlanningRun.findOne({
    packId: String(packId || '').trim(),
    job: String(job || '').trim(),
    idempotencyKey: key,
  })
    .sort({ createdAt: -1 })
    .exec();
}

async function findActiveRun({ packId, job }) {
  return PlanningRun.findOne({
    activeKey: buildActiveKey(packId, job),
  }).exec();
}

async function createQueuedRun(input = {}) {
  const snapshotId = String(input.snapshotId || '').trim();
  if (!snapshotId) {
    const err = new Error('snapshotId is required');
    err.code = 'SNAPSHOT_REQUIRED';
    throw err;
  }
  const packId = String(input.packId || '').trim();
  const organizationId = String(input.organizationId || '').trim();
  const job = String(input.job || '').trim();
  if (!packId || !organizationId || !job) {
    const err = new Error('packId, organizationId and job are required');
    err.code = 'RUN_IDENTIFIERS_REQUIRED';
    throw err;
  }

  const idempotencyKey =
    input.idempotencyKey != null && String(input.idempotencyKey).trim()
      ? String(input.idempotencyKey).trim().slice(0, 256)
      : null;

  if (idempotencyKey) {
    const prior = await findByIdempotencyKey({ packId, job, idempotencyKey });
    if (prior) {
      prior.__idempotentReplay = true;
      return prior;
    }
  }

  try {
    const parentRunId =
      input.parentRunId != null && String(input.parentRunId).trim()
        ? String(input.parentRunId).trim()
        : null;
    const runIdForGen = input.runId != null ? String(input.runId).trim() : null;
    const generationId = runIdForGen || null;

    return await PlanningRun.create({
    ...(input.runId ? { _id: input.runId } : {}),
    projectId: input.projectId != null ? String(input.projectId) : null,
    packId,
    organizationId,
    snapshotId,
    parentRunId,
    generationId,
    approvedSrsVersion:
      input.approvedSrsVersion != null ? String(input.approvedSrsVersion) : null,
    snapshotPayloadRef:
      input.snapshotPayloadRef != null ? String(input.snapshotPayloadRef) : null,
    trigger: input.trigger || 'manual',
    initiatedBy: input.initiatedBy != null ? String(input.initiatedBy) : null,
    job,
    activeKey: buildActiveKey(packId, job),
    idempotencyKey,
    input: input.input || null,
    status: 'queued',
    currentNode: null,
    iteration: 0,
    attempt: 0,
  });
  } catch (error) {
    if (error?.code === 11000 && error?.keyPattern?.activeKey) {
      const active = await findActiveRun({ packId, job });
      // RULE-R07: legacy Data Gate pause must not block new WHAT runs.
      if (
        active &&
        String(active.status) === 'waiting_human' &&
        String(active.gate || '') === 'data_review'
      ) {
        await cancelRun(String(active._id));
        const parentRunIdRetry =
          input.parentRunId != null && String(input.parentRunId).trim()
            ? String(input.parentRunId).trim()
            : null;
        const runIdRetry = input.runId != null ? String(input.runId).trim() : null;
        return PlanningRun.create({
          ...(input.runId ? { _id: input.runId } : {}),
          projectId: input.projectId != null ? String(input.projectId) : null,
          packId,
          organizationId,
          snapshotId,
          parentRunId: parentRunIdRetry,
          generationId: runIdRetry || null,
          approvedSrsVersion:
            input.approvedSrsVersion != null ? String(input.approvedSrsVersion) : null,
          snapshotPayloadRef:
            input.snapshotPayloadRef != null ? String(input.snapshotPayloadRef) : null,
          trigger: input.trigger || 'manual',
          initiatedBy: input.initiatedBy != null ? String(input.initiatedBy) : null,
          job,
          activeKey: buildActiveKey(packId, job),
          idempotencyKey,
          input: input.input || null,
          status: 'queued',
          currentNode: null,
          iteration: 0,
          attempt: 0,
        });
      }
      if (active) {
        active.__idempotentReplay = true;
        return active;
      }
      const conflict = new Error('An active run already exists for this pack and job');
      conflict.code = 'ACTIVE_RUN_EXISTS';
      throw conflict;
    }
    throw error;
  }
}

async function getRunById(runId) {
  return PlanningRun.findById(runId).lean();
}

async function transitionStatus(runId, nextStatus, patch = {}) {
  if (!RUN_STATUSES.includes(nextStatus)) {
    const err = new Error(`Invalid status: ${nextStatus}`);
    err.code = 'INVALID_STATUS';
    throw err;
  }
  const update = { status: nextStatus, ...patch };
  if (nextStatus === 'running' && !patch.startedAt) {
    update.startedAt = new Date();
  }
  if (['completed', 'failed', 'cancelled', 'expired'].includes(nextStatus)) {
    update.completedAt = patch.completedAt || new Date();
  }
  const mutation = { $set: update };
  if (['completed', 'failed', 'cancelled', 'expired'].includes(nextStatus)) {
    mutation.$unset = { activeKey: 1 };
    mutation.$set.executionLeaseOwner = null;
    mutation.$set.executionLeaseExpiresAt = null;
    mutation.$set.callbackLeaseOwner = null;
    mutation.$set.callbackLeaseExpiresAt = null;
  }
  return PlanningRun.findByIdAndUpdate(runId, mutation, { new: true }).lean();
}

async function cancelRun(runId) {
  const cancelled = await PlanningRun.findOneAndUpdate(
    {
      _id: runId,
      status: { $nin: ['cancelled', 'completed', 'failed', 'expired'] },
    },
    {
      $set: {
        status: 'cancelled',
        currentNode: 'cancelled',
        completedAt: new Date(),
        executionLeaseOwner: null,
        executionLeaseExpiresAt: null,
        callbackLeaseOwner: null,
        callbackLeaseExpiresAt: null,
      },
      $unset: { activeKey: 1 },
    },
    { new: true }
  ).lean();
  if (cancelled) return cancelled;
  return PlanningRun.findById(runId).lean();
}

async function resumeRun(runId) {
  const existing = await PlanningRun.findById(runId);
  if (!existing) return null;
  if (TERMINAL_STATUSES.has(existing.status)) {
    const err = new Error(`Cannot resume run in status ${existing.status}`);
    err.code = 'RESUME_DENIED';
    throw err;
  }
  // RULE-09: never change snapshotId
  if (!['waiting_human', 'replanning', 'failed', 'callback_pending'].includes(existing.status)) {
    const err = new Error(`Cannot resume run in status ${existing.status}`);
    err.code = 'RESUME_DENIED';
    throw err;
  }
  existing.status = existing.callbackPayload ? 'callback_pending' : 'queued';
  existing.activeKey = buildActiveKey(existing.packId, existing.job);
  existing.completedAt = null;
  if (!existing.callbackPayload) {
    existing.executionClaimedAt = null;
    existing.executionLeaseOwner = null;
    existing.executionLeaseExpiresAt = null;
  }
  await existing.save();
  return existing.toObject();
}

/** Browser/S2S whitelist — no checkpoint / input dump. */
function toPublicRun(doc, page) {
  if (!doc) return null;
  const id = doc._id != null ? String(doc._id) : doc.runId;
  return {
    runId: id,
    projectId: doc.projectId,
    packId: doc.packId,
    organizationId: doc.organizationId,
    snapshotId: doc.snapshotId,
    parentRunId: doc.parentRunId || null,
    generationId: doc.generationId || id || null,
    approvedSrsVersion: doc.approvedSrsVersion,
    status: doc.status,
    currentNode: doc.currentNode,
    currentTool: doc.currentTool || null,
    pipelineStep: doc.pipelineStep ?? null,
    pipelineSubstep: doc.pipelineSubstep || null,
    progressUpdatedAt: doc.progressUpdatedAt || null,
    gate: doc.gate || null,
    gatePreview: publishGatePreview(doc.gatePreview, page),
    stage: deriveStage(doc),
    computeStatus: deriveComputeStatus(doc),
    callbackStatus: deriveCallbackStatus(doc),
    iteration: doc.iteration,
    attempt: doc.attempt,
    trigger: doc.trigger,
    initiatedBy: doc.initiatedBy,
    job: doc.job,
    result: doc.result,
    evidence: doc.evidence,
    startedAt: doc.startedAt,
    completedAt: doc.completedAt,
    lastCheckpointAt: doc.lastCheckpointAt || null,
    error: doc.error,
    callbackAttempts: doc.callbackAttempts,
    callbackNextRetryAt: doc.callbackNextRetryAt,
    callbackLastError: doc.callbackLastError,
    callbackAckedAt: doc.callbackAckedAt,
  };
}

module.exports = {
  buildActiveKey,
  createQueuedRun,
  findByIdempotencyKey,
  findActiveRun,
  getRunById,
  transitionStatus,
  cancelRun,
  resumeRun,
  toPublicRun,
  RUN_STATUSES,
};

/**
 * Work-unit store. Workflow checkpoint stays in LangGraph; this row is per-chunk state.
 */

const { randomUUID } = require('crypto');
const {
  isWbsChunkMemoryStore,
  resolveWbsChunkMaxAttempts,
  WBS_CHUNK_JOB_TYPE,
  WBS_CHUNK_SCHEMA_VERSION,
} = require('./wbsChunkContract');

/** @type {Map<string, object>} */
const memoryUnits = new Map();

function resetWbsWorkUnitsForTests() {
  memoryUnits.clear();
}

function clone(unit) {
  if (!unit) return null;
  return {
    workUnitId: unit.workUnitId,
    runId: unit.runId,
    generationId: unit.generationId || null,
    type: unit.type,
    status: unit.status,
    attempt: unit.attempt || 0,
    maxAttempts: unit.maxAttempts,
    inputSnapshotId: unit.inputSnapshotId,
    schemaVersion: unit.schemaVersion,
    idempotencyKey: unit.idempotencyKey,
    chunkIndex: unit.chunkIndex,
    input: unit.input || null,
    result: unit.result || null,
    resultRef: unit.resultRef || null,
    error: unit.error || null,
    retryable: unit.retryable !== false,
    startedAt: unit.startedAt || null,
    completedAt: unit.completedAt || null,
    leaseUntil: unit.leaseUntil || null,
  };
}

function leaseMs(env) {
  const n = Number(env.HOW_WBS_CHUNK_LEASE_MS);
  if (Number.isFinite(n) && n >= 1000) return Math.round(n);
  const { resolveWbsLlmTimeoutMs } = require('../contracts/howWbsLlmContract');
  return resolveWbsLlmTimeoutMs(env) + 30000;
}

function findMemoryByKey(idempotencyKey) {
  for (const unit of memoryUnits.values()) {
    if (unit.idempotencyKey === idempotencyKey) return unit;
  }
  return null;
}

async function findByKey(idempotencyKey, env) {
  if (isWbsChunkMemoryStore(env)) return clone(findMemoryByKey(idempotencyKey));
  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const doc = await WbsWorkUnit.findOne({ idempotencyKey }).lean();
  return clone(doc);
}

/**
 * Insert PENDING once. A second call with the same key returns the existing row.
 */
async function createWorkUnit(payload, env = process.env) {
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (!idempotencyKey) throw new Error('wbs_chunk_idempotency_required');
  const existing = await findByKey(idempotencyKey, env);
  if (existing) return existing;

  const unit = {
    workUnitId: payload.workUnitId || `wbs-${randomUUID()}`,
    runId: String(payload.runId || '').trim(),
    generationId: payload.generationId || null,
    type: WBS_CHUNK_JOB_TYPE,
    status: 'PENDING',
    attempt: 0,
    maxAttempts: payload.maxAttempts || resolveWbsChunkMaxAttempts(env),
    inputSnapshotId: String(payload.inputSnapshotId || '').trim(),
    schemaVersion: payload.schemaVersion || WBS_CHUNK_SCHEMA_VERSION,
    idempotencyKey,
    chunkIndex: Number(payload.chunkIndex) || 0,
    input: payload.input || null,
    result: null,
    resultRef: null,
    error: null,
    retryable: true,
    startedAt: null,
    completedAt: null,
    leaseUntil: null,
  };
  if (!unit.runId) throw new Error('wbs_chunk_run_required');
  if (!unit.inputSnapshotId) throw new Error('wbs_chunk_snapshot_required');

  if (isWbsChunkMemoryStore(env)) {
    const raced = findMemoryByKey(idempotencyKey);
    if (raced) return clone(raced);
    memoryUnits.set(unit.workUnitId, unit);
    return clone(unit);
  }

  const WbsWorkUnit = require('./WbsWorkUnit.model');
  try {
    const doc = await WbsWorkUnit.create(unit);
    return clone(doc.toObject());
  } catch (err) {
    if (err?.code === 11000) {
      const again = await findByKey(idempotencyKey, env);
      if (again) return again;
    }
    throw err;
  }
}

async function getWorkUnit(workUnitId, env = process.env) {
  const id = String(workUnitId || '').trim();
  if (!id) return null;
  if (isWbsChunkMemoryStore(env)) return clone(memoryUnits.get(id) || null);
  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const doc = await WbsWorkUnit.findOne({ workUnitId: id }).lean();
  return clone(doc);
}

async function listWorkUnitsByRun(runId, env = process.env) {
  const id = String(runId || '').trim();
  if (!id) return [];
  if (isWbsChunkMemoryStore(env)) {
    return [...memoryUnits.values()]
      .filter((unit) => unit.runId === id)
      .sort((a, b) => a.chunkIndex - b.chunkIndex)
      .map(clone);
  }
  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const docs = await WbsWorkUnit.find({ runId: id }).sort({ chunkIndex: 1 }).lean();
  return docs.map(clone);
}

async function updateUnit(workUnitId, env, mutate) {
  if (isWbsChunkMemoryStore(env)) {
    const unit = memoryUnits.get(workUnitId);
    if (!unit) return null;
    mutate(unit);
    return clone(unit);
  }
  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const current = await WbsWorkUnit.findOne({ workUnitId }).lean();
  if (!current) return null;
  const next = { ...current };
  delete next._id;
  delete next.__v;
  mutate(next);
  delete next._id;
  const doc = await WbsWorkUnit.findOneAndUpdate(
    { workUnitId },
    { $set: next },
    { returnDocument: 'after' }
  ).lean();
  return clone(doc);
}

async function markQueued(workUnitId, env = process.env) {
  return updateUnit(workUnitId, env, (unit) => {
    if (unit.status === 'SUCCEEDED' || unit.status === 'DEAD_LETTER') return;
    unit.status = 'QUEUED';
    unit.error = null;
  });
}

/**
 * Claim PENDING, QUEUED, or a lease that expired. First SUCCEEDED write wins later.
 */
async function claimWorkUnit(workUnitId, env = process.env) {
  const id = String(workUnitId || '').trim();
  const now = Date.now();
  const until = new Date(now + leaseMs(env));

  if (isWbsChunkMemoryStore(env)) {
    const unit = memoryUnits.get(id);
    if (!unit) return null;
    const claimable =
      unit.status === 'PENDING' ||
      unit.status === 'QUEUED' ||
      (unit.status === 'RUNNING' &&
        unit.leaseUntil &&
        new Date(unit.leaseUntil).getTime() <= now);
    if (!claimable) return null;
    unit.status = 'RUNNING';
    unit.attempt = (unit.attempt || 0) + 1;
    unit.startedAt = new Date();
    unit.leaseUntil = until;
    unit.completedAt = null;
    return clone(unit);
  }

  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const doc = await WbsWorkUnit.findOneAndUpdate(
    {
      workUnitId: id,
      $or: [
        { status: { $in: ['PENDING', 'QUEUED'] } },
        { status: 'RUNNING', leaseUntil: { $lte: new Date(now) } },
      ],
    },
    {
      $set: { status: 'RUNNING', startedAt: new Date(), leaseUntil: until, completedAt: null },
      $inc: { attempt: 1 },
    },
    { returnDocument: 'after' }
  ).lean();
  return clone(doc);
}

async function markSucceeded(workUnitId, result, env = process.env) {
  const id = String(workUnitId || '').trim();
  if (isWbsChunkMemoryStore(env)) {
    const unit = memoryUnits.get(id);
    if (!unit) return null;
    if (unit.status === 'SUCCEEDED' && unit.result) return clone(unit);
    unit.status = 'SUCCEEDED';
    unit.result = result || null;
    unit.resultRef = id;
    unit.error = null;
    unit.retryable = false;
    unit.completedAt = new Date();
    unit.leaseUntil = null;
    return clone(unit);
  }
  const WbsWorkUnit = require('./WbsWorkUnit.model');
  const existing = await WbsWorkUnit.findOne({ workUnitId: id, status: 'SUCCEEDED' }).lean();
  if (existing?.result) return clone(existing);
  const doc = await WbsWorkUnit.findOneAndUpdate(
    { workUnitId: id, status: { $in: ['PENDING', 'QUEUED', 'RUNNING', 'RETRY_WAIT'] } },
    {
      $set: {
        status: 'SUCCEEDED',
        result: result || null,
        resultRef: id,
        error: null,
        retryable: false,
        completedAt: new Date(),
        leaseUntil: null,
      },
    },
    { returnDocument: 'after' }
  ).lean();
  return clone(doc || existing);
}

/**
 * LangGraph decides whether RETRY_WAIT is published again.
 * Non-retryable or exhausted attempts land on FAILED.
 */
async function markAttemptFailed(workUnitId, error, env = process.env, retryable = true) {
  const reason = String(error || 'chunk_failed').slice(0, 512);
  return updateUnit(workUnitId, env, (unit) => {
    if (unit.status === 'SUCCEEDED') return;
    const exhausted = (unit.attempt || 0) >= (unit.maxAttempts || 1);
    const canRetry = retryable && !exhausted;
    unit.status = canRetry ? 'RETRY_WAIT' : 'FAILED';
    unit.error = reason;
    unit.retryable = canRetry;
    unit.completedAt = new Date();
    unit.leaseUntil = null;
  });
}

async function markDeadLetter(workUnitId, env = process.env) {
  return updateUnit(workUnitId, env, (unit) => {
    if (unit.status === 'SUCCEEDED') return;
    unit.status = 'DEAD_LETTER';
    unit.retryable = false;
    unit.completedAt = unit.completedAt || new Date();
    unit.leaseUntil = null;
  });
}

module.exports = {
  resetWbsWorkUnitsForTests,
  createWorkUnit,
  getWorkUnit,
  listWorkUnitsByRun,
  markQueued,
  claimWorkUnit,
  markSucceeded,
  markAttemptFailed,
  markDeadLetter,
};

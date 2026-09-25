const { getRedisClient } = require('@enterprise/shared');
const { PlanningRun } = require('../run/PlanningRun.model');
const { g15CheckpointKey } = require('./redisKeys');
const { normalizeAgentState } = require('./agentStateSchema');

/**
 * G15 Checkpoint store — Redis-only AgentState (≠ G19 lifecycle).
 * No dual-write to PlanningRun.checkpoint.
 */

let redisClientOverride = null;

function setRedisClientForTests(client) {
  redisClientOverride = client;
}

function getClient() {
  if (redisClientOverride) return redisClientOverride;
  return getRedisClient();
}

/**
 * @param {string} runId
 * @param {object} agentState
 * @returns {Promise<{ state: object, savedAt: string }>}
 */
async function saveCheckpoint(runId, agentState) {
  const id = String(runId || '').trim();
  if (!id) {
    const err = new Error('runId is required');
    err.code = 'G15_RUN_ID_REQUIRED';
    throw err;
  }

  const savedAt = new Date().toISOString();
  const state = normalizeAgentState({
    ...(agentState && typeof agentState === 'object' ? agentState : {}),
    runId: id,
    savedAt,
  });

  const key = g15CheckpointKey(id);
  const payload = JSON.stringify({ state, savedAt });
  await getClient().set(key, payload);

  await PlanningRun.findByIdAndUpdate(
    id,
    { $set: { lastCheckpointAt: new Date(savedAt) } },
    { new: false }
  ).catch((error) => {
    console.warn('[g15_save] lastCheckpointAt', id, error?.message || error);
  });

  console.log('[g15_save]', id, 'iteration=', state.iteration ?? null);
  return { state, savedAt };
}

/**
 * @param {string} runId
 * @returns {Promise<{ checkpoint: { state: object, savedAt: string }|null, snapshotId: string|null }|null>}
 */
async function loadCheckpoint(runId) {
  const id = String(runId || '').trim();
  if (!id) return null;

  const doc = await PlanningRun.findById(id).select('snapshotId').lean();
  if (!doc) return null;

  const raw = await getClient().get(g15CheckpointKey(id));
  if (raw == null || raw === '') {
    console.log('[g15_miss]', id);
    return {
      checkpoint: null,
      snapshotId: doc.snapshotId || null,
    };
  }

  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    console.log('[g15_miss]', id, 'invalid_json');
    return {
      checkpoint: null,
      snapshotId: doc.snapshotId || null,
    };
  }

  const state = normalizeAgentState(parsed?.state || parsed || {});
  const savedAt =
    (parsed && parsed.savedAt) || state.savedAt || new Date().toISOString();

  console.log('[g15_load]', id, 'iteration=', state.iteration ?? null);
  return {
    checkpoint: { state, savedAt },
    snapshotId: doc.snapshotId || null,
  };
}

/**
 * Delete G15 key (completed / cancelled / expired — not retriable failed).
 * @param {string} runId
 */
async function deleteCheckpoint(runId) {
  const id = String(runId || '').trim();
  if (!id) return false;
  try {
    await getClient().del(g15CheckpointKey(id));
    console.log('[g15_del]', id);
    return true;
  } catch (error) {
    console.warn('[g15_del]', id, error?.message || error);
    return false;
  }
}

/**
 * RULE-G15-03: execution resume requires Redis checkpoint.
 * callback_pending (deliver only) skips this check.
 *
 * @param {string} runId
 * @param {{ hasCallbackPayload?: boolean }} [opts]
 */
async function assertCheckpointForResume(runId, { hasCallbackPayload = false } = {}) {
  if (hasCallbackPayload) {
    return { ok: true, skipped: true, checkpoint: null };
  }
  const loaded = await loadCheckpoint(runId);
  if (!loaded?.checkpoint?.state) {
    const err = new Error('G15 checkpoint missing; cannot resume execution');
    err.code = 'CHECKPOINT_MISSING';
    throw err;
  }
  return { ok: true, skipped: false, checkpoint: loaded.checkpoint, snapshotId: loaded.snapshotId };
}

module.exports = {
  saveCheckpoint,
  loadCheckpoint,
  deleteCheckpoint,
  assertCheckpointForResume,
  setRedisClientForTests,
};

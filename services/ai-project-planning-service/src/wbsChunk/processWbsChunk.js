/**
 * Worker body for one work unit. Persists the outcome before the caller ACKs.
 */

const { getWorkUnit, claimWorkUnit, markSucceeded, markAttemptFailed } = require('./wbsWorkUnitStore');
const { executeWbsChunk } = require('./executeWbsChunk');

/**
 * @param {string} workUnitId
 * @param {{
 *   env?: object,
 *   generateJsonFn?: Function,
 *   messageSnapshotId?: string|null,
 * }} [opts]
 */
async function processWbsChunk(workUnitId, opts = {}) {
  const env = opts.env || process.env;
  const existing = await getWorkUnit(workUnitId, env);
  if (!existing) return { ok: false, error: 'not_found' };
  if (existing.status === 'SUCCEEDED') {
    return { ok: true, alreadyDone: true, unit: existing };
  }
  if (existing.status === 'DEAD_LETTER' || existing.status === 'FAILED') {
    return { ok: false, alreadyDone: true, unit: existing, error: existing.error };
  }
  if (existing.status === 'RETRY_WAIT') {
    return { ok: false, alreadyDone: true, unit: existing, error: 'awaiting_orchestrator_retry' };
  }

  const messageSnapshotId = opts.messageSnapshotId ? String(opts.messageSnapshotId) : '';
  if (messageSnapshotId && messageSnapshotId !== existing.inputSnapshotId) {
    const unit = await markAttemptFailed(workUnitId, 'snapshot_mismatch', env, false);
    return { ok: false, unit, error: 'snapshot_mismatch' };
  }

  const claimed = await claimWorkUnit(workUnitId, env);
  if (!claimed) {
    const again = await getWorkUnit(workUnitId, env);
    if (again?.status === 'SUCCEEDED') return { ok: true, alreadyDone: true, unit: again };
    return { ok: false, error: 'claim_failed', unit: again };
  }

  try {
    const executed = await executeWbsChunk(
      { ...claimed.input, inputSnapshotId: claimed.inputSnapshotId },
      { env, generateJsonFn: opts.generateJsonFn }
    );
    if (executed.ok) {
      const unit = await markSucceeded(
        workUnitId,
        {
          tasks: executed.tasks,
          isolatedFrIds: executed.isolatedFrIds || [],
          llmCalls: executed.llmCalls || 0,
          promptChars: executed.promptChars || 0,
          model: executed.model || null,
          inputSnapshotId: claimed.inputSnapshotId,
        },
        env
      );
      return { ok: true, unit };
    }
    const unit = await markAttemptFailed(
      workUnitId,
      executed.reason || 'llm_failed',
      env,
      executed.retryable !== false
    );
    return { ok: false, unit, error: executed.reason || 'llm_failed' };
  } catch (err) {
    const unit = await markAttemptFailed(
      workUnitId,
      String(err?.message || err || 'worker_throw'),
      env,
      true
    );
    return { ok: false, unit, error: String(err?.message || err) };
  }
}

module.exports = { processWbsChunk };

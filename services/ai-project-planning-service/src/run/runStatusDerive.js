/**
 * Derive compute vs callback lifecycle from PlanningRun status (Wave 1).
 * Compute completed ≠ callback acked.
 */

function deriveComputeStatus(doc = {}) {
  const s = String(doc.status || '');
  if (s === 'queued') return 'queued';
  if (s === 'running' || s === 'waiting_human' || s === 'replanning') return 'running';
  if (s === 'callback_pending' || s === 'callback_delivering' || s === 'completed') {
    return 'completed';
  }
  if (s === 'failed') return 'failed';
  if (s === 'cancelled') return 'cancelled';
  if (s === 'expired') return 'expired';
  return 'unknown';
}

function deriveCallbackStatus(doc = {}) {
  const s = String(doc.status || '');
  if (doc.callbackAckedAt) return 'acked';
  if (s === 'callback_pending') return 'pending';
  if (s === 'callback_delivering') return 'delivering';
  if (s === 'failed' && String(doc.currentNode || '') === 'callback_failed') return 'failed';
  if (s === 'completed') return 'acked';
  if (s === 'queued' || s === 'running' || s === 'waiting_human' || s === 'replanning') {
    return 'none';
  }
  return 'none';
}

function deriveStage(doc = {}) {
  const node = String(doc.currentNode || '').trim();
  if (node) return node;
  const s = String(doc.status || '');
  if (s === 'queued') return 'queued';
  if (s === 'running') return 'running';
  if (s === 'callback_pending' || s === 'callback_delivering') return 'finalizing';
  if (s === 'completed') return 'completed';
  if (s === 'failed') return 'failed';
  return s || null;
}

module.exports = {
  deriveComputeStatus,
  deriveCallbackStatus,
  deriveStage,
};

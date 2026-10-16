/**
 * Auto-friend graph retired — derived roster ACL lives in dmRoster.service.
 * Keep export so placement/membership callers do not break; no HTTP.
 */
async function ensureAcceptedWithPeers(userId, peerUserIds, { source = 'department' } = {}) {
  void userId;
  void peerUserIds;
  void source;
  return { ok: true, noop: true };
}

module.exports = {
  ensureAcceptedWithPeers,
};

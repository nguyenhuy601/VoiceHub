/**
 * Pure policy for DELETE …/participants/:userId (self-leave vs kick).
 */

function resolveParticipantRemoval({ actorId, targetUserId }) {
  const actor = String(actorId || '').trim();
  if (!actor) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const target = String(targetUserId || actor).trim() || actor;
  if (actor === target) {
    return { mode: 'self-leave', targetUserId: actor };
  }
  return { mode: 'kick', targetUserId: target };
}

module.exports = {
  resolveParticipantRemoval,
};

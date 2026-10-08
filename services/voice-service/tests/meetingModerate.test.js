const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveParticipantRemoval } = require('../src/services/meetingModeratePolicy');

describe('resolveParticipantRemoval', () => {
  it('self-leave when actor equals target', () => {
    const r = resolveParticipantRemoval({ actorId: 'u1', targetUserId: 'u1' });
    assert.equal(r.mode, 'self-leave');
    assert.equal(r.targetUserId, 'u1');
  });

  it('self-leave when target omitted (defaults to actor)', () => {
    const r = resolveParticipantRemoval({ actorId: 'u1', targetUserId: '' });
    assert.equal(r.mode, 'self-leave');
    assert.equal(r.targetUserId, 'u1');
  });

  it('kick when actor targets another user', () => {
    const r = resolveParticipantRemoval({ actorId: 'host', targetUserId: 'guest' });
    assert.equal(r.mode, 'kick');
    assert.equal(r.targetUserId, 'guest');
  });

  it('unauthorized without actor', () => {
    assert.throws(
      () => resolveParticipantRemoval({ actorId: '', targetUserId: 'x' }),
      (err) => err.statusCode === 401
    );
  });
});

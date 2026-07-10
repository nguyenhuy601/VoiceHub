const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Pure helper mirror — peers filter used by ensureAcceptedWithPeers.
 */
function normalizePeers(userId, peerUserIds) {
  const uid = String(userId || '').trim();
  return [
    ...new Set(
      (Array.isArray(peerUserIds) ? peerUserIds : [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== uid)
    ),
  ];
}

describe('department auto-friend peer normalize', () => {
  it('dedupes and drops self / empty', () => {
    assert.deepEqual(normalizePeers('u1', ['u2', 'u1', 'u2', '', null, 'u3']), ['u2', 'u3']);
  });

  it('returns empty when only self', () => {
    assert.deepEqual(normalizePeers('u1', ['u1']), []);
  });
});

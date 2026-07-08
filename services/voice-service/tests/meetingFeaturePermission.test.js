const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const FEATURE_TYPES = new Set(['recording', 'ai_summary']);

function userCanUseFeature({ userId, hostId, grantedTypes = [] }) {
  const uid = String(userId);
  if (hostId && String(hostId) === uid) return true;
  return grantedTypes.includes('recording') || grantedTypes.includes('ai_summary');
}

function canUseSpecific({ userId, hostId, type, grantedTypes = [] }) {
  const uid = String(userId);
  if (hostId && String(hostId) === uid) return true;
  return grantedTypes.includes(type);
}

describe('meeting feature permission logic', () => {
  it('host has implicit recording permission', () => {
    assert.equal(
      canUseSpecific({ userId: 'h1', hostId: 'h1', type: 'recording', grantedTypes: [] }),
      true
    );
  });

  it('participant denied without grant', () => {
    assert.equal(
      canUseSpecific({ userId: 'p1', hostId: 'h1', type: 'recording', grantedTypes: [] }),
      false
    );
  });

  it('participant allowed after grant', () => {
    assert.equal(
      canUseSpecific({
        userId: 'p1',
        hostId: 'h1',
        type: 'recording',
        grantedTypes: ['recording'],
      }),
      true
    );
  });

  it('feature types are fixed set', () => {
    assert.equal(FEATURE_TYPES.has('recording'), true);
    assert.equal(FEATURE_TYPES.has('ai_summary'), true);
  });
});

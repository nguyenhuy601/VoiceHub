const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  FEATURE_TYPES,
  userCanUseFeature,
} = require('../src/services/meetingFeaturePermission.service');

describe('meeting feature permission (recording removed)', () => {
  it('FEATURE_TYPES no longer includes recording or ai_summary', () => {
    assert.equal(FEATURE_TYPES.has('recording'), false);
    assert.equal(FEATURE_TYPES.has('ai_summary'), false);
    assert.equal(FEATURE_TYPES.size, 0);
  });

  it('userCanUseFeature rejects recording and ai_summary types', async () => {
    assert.equal(
      await userCanUseFeature({
        roomId: 'room1',
        userId: 'h1',
        type: 'recording',
        hostId: 'h1',
      }),
      false
    );
    assert.equal(
      await userCanUseFeature({
        roomId: 'room1',
        userId: 'h1',
        type: 'ai_summary',
        hostId: 'h1',
      }),
      false
    );
  });
});

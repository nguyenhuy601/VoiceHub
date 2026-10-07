const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { toPublicSummary, FAILED_ERROR_CODE } = require('../src/utils/summaryDto');

function buildDoc(overrides = {}) {
  return {
    _id: '64b0000000000000000000aa',
    generatedBy: '64b000000000000000000009',
    organizationId: '64b000000000000000000001',
    roomId: '64b000000000000000000002',
    scope: 'org_channel',
    status: 'ready',
    error: '',
    threadKey: 'org:1:2',
    sourceMeta: { messageCount: 3, firstMessageId: 'a', lastMessageId: 'b', exportedAt: null },
    options: { unreadOnly: true, sinceMessageId: '', maxMessages: 200 },
    result: {
      overview: 'Tổng quan',
      keyPoints: ['k1'],
      actionItems: [{ title: 't', assigneeHint: 'a', dueDateHint: 'd', secret: 'x' }],
      participants: ['p'],
      language: 'vi',
      messageRange: { fromMessageId: 'a', toMessageId: 'b', count: 3 },
      injected: '<script>',
    },
    modelMeta: { provider: 'ollama', model: 'llama3', promptTokensApprox: 10 },
    rawModelOutput: { text: 'raw' },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    expiresAt: new Date(1),
    ...overrides,
  };
}

describe('toPublicSummary', () => {
  it('omits internal fields', () => {
    const out = toPublicSummary(buildDoc());
    for (const key of ['modelMeta', 'rawModelOutput', 'generatedBy', 'threadKey']) {
      assert.equal(key in out, false, key);
    }
  });

  it('whitelists result keys and nested action item keys', () => {
    const out = toPublicSummary(buildDoc());
    assert.deepEqual(Object.keys(out.result).sort(), [
      'actionItems',
      'keyPoints',
      'language',
      'messageRange',
      'overview',
      'participants',
    ]);
    assert.deepEqual(out.result.actionItems[0], { title: 't', assigneeHint: 'a', dueDateHint: 'd' });
    assert.equal(out.result.overview, 'Tổng quan');
  });

  it('failed summary hides raw worker error and adds errorCode', () => {
    const out = toPublicSummary(buildDoc({ status: 'failed', error: 'ECONNREFUSED ollama:11434' }));
    assert.equal(out.error, '');
    assert.equal(out.errorCode, FAILED_ERROR_CODE);
  });

  it('ready summary has no errorCode; null doc -> null', () => {
    assert.equal('errorCode' in toPublicSummary(buildDoc()), false);
    assert.equal(toPublicSummary(null), null);
  });

  it('supports mongoose documents via toObject', () => {
    const doc = buildDoc();
    const out = toPublicSummary({ toObject: () => doc });
    assert.equal(out.summaryId, String(doc._id));
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { toPublicExtraction, toPublicDraft } = require('../src/utils/extractionDto');

describe('toPublicExtraction', () => {
  it('omits rawModelOutput and confirmIdempotencyKey', () => {
    const out = toPublicExtraction({
      _id: '1',
      status: 'ready',
      rawModelOutput: { secret: true },
      confirmIdempotencyKey: 'k',
      error: 'Cast to ObjectId at foo.js:1',
      draft: { title: 'T' },
    });
    assert.equal(out.rawModelOutput, undefined);
    assert.equal(out.confirmIdempotencyKey, undefined);
    assert.equal(out.error, undefined);
    assert.equal(out.hasError, true);
    assert.equal(out.draft.title, 'T');
  });

  it('hasError false when no error', () => {
    const out = toPublicExtraction({ status: 'ready', error: '' });
    assert.equal(out.hasError, false);
  });

  it('returns null for null input', () => {
    assert.equal(toPublicExtraction(null), null);
  });
});

describe('toPublicDraft', () => {
  it('omits error string', () => {
    const out = toPublicDraft({ _id: 'd1', status: 'ready', error: 'ECONNREFUSED host:27017', payload: {} });
    assert.equal(out.error, undefined);
    assert.equal(out.hasError, true);
    assert.equal(out.status, 'ready');
  });
});

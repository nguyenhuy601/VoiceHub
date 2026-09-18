import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatActorRef, isSrsDraftEmpty } from './srsEmptyAudit.js';

describe('srsEmptyAudit (Wave 5)', () => {
  it('detects empty SRS draft when no approved artifacts', () => {
    assert.equal(isSrsDraftEmpty({ artifactCount: 0 }), true);
    assert.equal(isSrsDraftEmpty({ artifactCount: 3 }), false);
    assert.equal(isSrsDraftEmpty(null), true);
    assert.equal(isSrsDraftEmpty({ artifactCount: 0 }, { loading: true }), false);
  });

  it('shortens actor ObjectId for audit line', () => {
    assert.equal(formatActorRef(''), '');
    assert.equal(formatActorRef('abc'), 'abc');
    assert.equal(formatActorRef('6aac0dff3abf58fe11346c70'), '…11346c70');
  });
});

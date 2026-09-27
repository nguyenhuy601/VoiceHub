const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { allocateBpmExternalKey } = require('../src/utils/requirement/bpmSeedKey');

describe('allocateBpmExternalKey', () => {
  it('giữ key chuẩn khi bước không trùng trong cùng pack', () => {
    const used = new Set();
    assert.equal(allocateBpmExternalKey('BPM-001', '1', used, 2), 'BPM-001-S1');
    assert.equal(allocateBpmExternalKey('BPM-001', '2', used, 3), 'BPM-001-S2');
  });

  it('gắn hậu tố khi Excel trùng ID và Step', () => {
    const used = new Set();
    assert.equal(allocateBpmExternalKey('BPM-002', '1', used, 4), 'BPM-002-S1');
    assert.equal(allocateBpmExternalKey('BPM-002', '1', used, 9), 'BPM-002-S1-9');
  });
});

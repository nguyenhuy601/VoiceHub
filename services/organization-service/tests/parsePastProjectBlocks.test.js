const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePastProjectBlocks,
  validatePastProjectBlock,
} = require('../src/utils/parsePastProjectBlocks');

describe('parsePastProjectBlocks', () => {
  it('returns only non-empty blocks (2 filled + 3 blank)', () => {
    const blocks = parsePastProjectBlocks({
      pastProject1Name: 'DA A',
      pastProject1Role: 'BE',
      pastProject1Work: 'API',
      pastProject1Year: 2024,
      pastProject2Name: 'DA B',
      pastProject2Role: 'Lead',
      pastProject2Work: 'Chia module',
      pastProject3Name: '',
      pastProject3Role: '',
      pastProject3Work: '',
    });
    assert.equal(blocks.length, 2);
    assert.equal(blocks[0].name, 'DA A');
    assert.equal(blocks[1].name, 'DA B');
  });

  it('keeps incomplete block for validator', () => {
    const blocks = parsePastProjectBlocks({
      pastProject1Name: 'Chỉ tên',
    });
    assert.equal(blocks.length, 1);
    assert.equal(validatePastProjectBlock(blocks[0]).ok, false);
  });
});

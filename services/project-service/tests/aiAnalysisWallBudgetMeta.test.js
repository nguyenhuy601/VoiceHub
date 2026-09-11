/**
 * Wall-budget skip meta — remaining input counts.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  countRemainingChunkInputs,
  buildWallBudgetSkipMeta,
} = require('../src/utils/aiAnalysis/aiAnalysisWallBudgetMeta');

describe('aiAnalysisWallBudgetMeta', () => {
  it('counts remaining FR slices from break index', () => {
    const chunks = [
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'c' }],
      [{ id: 'd' }, { id: 'e' }],
    ];
    const count = countRemainingChunkInputs(chunks, 1, (c) => (Array.isArray(c) ? c.length : 0));
    assert.equal(count, 3);
  });

  it('returns 0 when fromIndex is past the end', () => {
    const chunks = [[{ id: 'a' }]];
    assert.equal(
      countRemainingChunkInputs(chunks, 5, (c) => (Array.isArray(c) ? c.length : 0)),
      0
    );
  });

  it('buildWallBudgetSkipMeta includes kind and count', () => {
    const chunks = [
      { modules: [{ id: 'M1' }], features: [{ id: 'F1' }] },
      { modules: [], features: [{ id: 'F2' }, { id: 'F3' }] },
    ];
    const meta = buildWallBudgetSkipMeta({
      chunks,
      fromIndex: 1,
      countInputs: (chunk) =>
        (chunk.modules?.length || 0) + (chunk.features?.length || 0),
      kind: 'parent',
    });
    assert.equal(meta.wallBudgetSkippedInputCount, 2);
    assert.equal(meta.wallBudgetSkippedInputKind, 'parent');
  });
});

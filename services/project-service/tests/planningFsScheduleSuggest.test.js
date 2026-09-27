const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { suggestFsPredecessorRevisions } = require('../src/utils/planning/planningFsScheduleSuggest');
const { applyDecisionsToRows } = require('../src/utils/planning/planningImportFieldSuggest');

function wbs(externalKey, startDate, endDate) {
  return {
    kind: 'WBS',
    externalKey,
    _sheet: 'WBS',
    _row: 2,
    structured: { startDate, endDate },
  };
}

function dep(fromKey, toKey, dependencyType) {
  return {
    kind: 'DEPENDENCY',
    externalKey: `${fromKey}-${toKey}`,
    structured: { fromKey, toKey, dependencyType },
  };
}

describe('planningFsScheduleSuggest', () => {
  it('FS lệch → một revise startDate, suggestedValue rỗng', () => {
    const rows = suggestFsPredecessorRevisions([
      wbs('A', '2026-10-01', '2026-10-15'),
      wbs('B', '2026-10-10', '2026-10-20'),
      dep('A', 'B', 'FS'),
    ]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].field, 'startDate');
    assert.equal(rows[0].verdict, 'revise');
    assert.equal(rows[0].basis, 'fs_predecessor');
    assert.equal(rows[0].suggestedValue, '');
    assert.equal(rows[0].subjectKey, 'B');
    assert.equal(rows[0].externalKey, 'B');
  });

  it('loại để trống hiểu là FS', () => {
    const rows = suggestFsPredecessorRevisions([
      wbs('A', '2026-10-01', '2026-10-15'),
      wbs('B', '2026-10-10', '2026-10-20'),
      dep('A', 'B', ''),
    ]);
    assert.equal(rows.length, 1);
  });

  it('SS hoặc thiếu ngày → không suggestion', () => {
    const ss = suggestFsPredecessorRevisions([
      wbs('A', '2026-10-01', '2026-10-15'),
      wbs('B', '2026-10-10', '2026-10-20'),
      dep('A', 'B', 'SS'),
    ]);
    const missing = suggestFsPredecessorRevisions([
      wbs('A', '2026-10-01', ''),
      wbs('B', '2026-10-10', '2026-10-20'),
      dep('A', 'B', 'FS'),
    ]);
    assert.equal(ss.length, 0);
    assert.equal(missing.length, 0);
  });

  it('decision apply startDate không đổi Start Date Excel', () => {
    const rows = [wbs('B', '2026-10-10', '2026-10-20')];
    const suggestions = [
      {
        kind: 'WBS',
        externalKey: 'B',
        field: 'startDate',
        verdict: 'revise',
        suggestedValue: '',
        basis: 'fs_predecessor',
      },
    ];
    applyDecisionsToRows(rows, suggestions, [
      { kind: 'WBS', externalKey: 'B', field: 'startDate', apply: true },
    ]);
    assert.equal(rows[0].structured.startDate, '2026-10-10');
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  paginatePhase1Rows,
  phase1SortKey,
  sortPhase1Rows,
  splitPhase1KeyList,
  PHASE1_TABLE_PAGE_SIZE,
} from './phase1ClientTable.js';

describe('phase1ClientTable', () => {
  it('phase1SortKey normalizes arrays and case', () => {
    assert.equal(phase1SortKey(['CR-002', 'CR-001']), 'cr-002, cr-001');
    assert.equal(phase1SortKey(null), '');
  });

  it('sortPhase1Rows sorts asc/desc by column', () => {
    const rows = [
      { id: 'b', title: 'Beta' },
      { id: 'a', title: 'Alpha' },
      { id: 'c', title: 'alpha' },
    ];
    const getValue = (row, colId) => row[colId];
    const asc = sortPhase1Rows(rows, { sortId: 'title', sortDir: 'asc', getValue });
    assert.deepEqual(
      asc.map((r) => r.id),
      ['a', 'c', 'b']
    );
    const desc = sortPhase1Rows(rows, { sortId: 'title', sortDir: 'desc', getValue });
    assert.deepEqual(
      desc.map((r) => r.id),
      ['b', 'a', 'c']
    );
  });

  it('paginatePhase1Rows clamps page and slices', () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ i }));
    const p1 = paginatePhase1Rows(rows, { page: 1, pageSize: 10 });
    assert.equal(p1.pageRows.length, 10);
    assert.equal(p1.pageCount, 3);
    assert.equal(p1.total, 23);
    assert.equal(PHASE1_TABLE_PAGE_SIZE, 10);

    const p3 = paginatePhase1Rows(rows, { page: 99, pageSize: 10 });
    assert.equal(p3.page, 3);
    assert.equal(p3.pageRows.length, 3);

    const empty = paginatePhase1Rows([], { page: 1 });
    assert.equal(empty.pageCount, 1);
    assert.equal(empty.pageRows.length, 0);
  });

  it('splitPhase1KeyList splits CR/FR lists', () => {
    assert.deepEqual(splitPhase1KeyList('CR-001, CR-002; FR-1'), ['CR-001', 'CR-002', 'FR-1']);
    assert.deepEqual(splitPhase1KeyList(''), []);
  });
});

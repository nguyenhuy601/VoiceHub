/**
 * Unit — Resource Allocation overlap / overallocated (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAllocationSegments,
  computeAllocationStatus,
  flattenSegments,
  isOverallocatedFromSegments,
} = require('../src/utils/allocationOverlap');

describe('normalizeAllocationSegments', () => {
  it('accepts dated segments', () => {
    const r = normalizeAllocationSegments([
      { startDate: '2026-01-01', endDate: '2026-06-30', allocationPct: 60 },
      { startDate: '2026-03-01', endDate: '2026-08-31', allocationPct: 40 },
    ]);
    assert.equal(r.ok, true);
    assert.equal(r.segments.length, 2);
    assert.equal(r.segments[0].allocationPct, 60);
  });

  it('rejects end before start', () => {
    const r = normalizeAllocationSegments([
      { startDate: '2026-06-01', endDate: '2026-01-01', allocationPct: 50 },
    ]);
    assert.equal(r.ok, false);
  });

  it('rejects non-array', () => {
    const r = normalizeAllocationSegments('60');
    assert.equal(r.ok, false);
  });
});

describe('computeAllocationStatus', () => {
  it('ok when total 100 on overlap Jan-Jun / Mar-Aug', () => {
    const status = computeAllocationStatus([
      {
        allocations: [{ startDate: '2026-01-01', endDate: '2026-06-30', allocationPct: 60 }],
      },
      {
        allocations: [{ startDate: '2026-03-01', endDate: '2026-08-31', allocationPct: 40 }],
      },
    ]);
    assert.equal(status, 'ok');
  });

  it('overallocated when overlap exceeds 100', () => {
    const status = computeAllocationStatus([
      {
        allocations: [{ startDate: '2026-01-01', endDate: '2026-06-30', allocationPct: 60 }],
      },
      {
        allocations: [{ startDate: '2026-03-01', endDate: '2026-08-31', allocationPct: 50 }],
      },
    ]);
    assert.equal(status, 'overallocated');
  });

  it('ok when sequential non-overlapping', () => {
    const status = computeAllocationStatus([
      {
        allocations: [{ startDate: '2026-01-01', endDate: '2026-03-31', allocationPct: 80 }],
      },
      {
        allocations: [{ startDate: '2026-04-01', endDate: '2026-06-30', allocationPct: 90 }],
      },
    ]);
    assert.equal(status, 'ok');
  });

  it('ok when empty', () => {
    assert.equal(computeAllocationStatus([]), 'ok');
  });
});

describe('flattenSegments / sweep', () => {
  it('open-ended endDate counts as infinity', () => {
    const flat = flattenSegments([
      { allocations: [{ startDate: '2026-01-01', endDate: null, allocationPct: 50 }] },
      { allocations: [{ startDate: '2026-01-01', endDate: null, allocationPct: 60 }] },
    ]);
    assert.equal(isOverallocatedFromSegments(flat), true);
  });
});

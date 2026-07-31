const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  flattenSegments,
  isOverallocatedFromSegments,
  computeAllocationStatus,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeDepartmentCapacityRow,
  toDayMs,
  filterUsersToRelatedDepartments,
} = require('../src/utils/allocationOverlap');

describe('resourceCapacity math (T1)', () => {
  it('capacity row: headcount / allocated / available FTE%', () => {
    const row = computeDepartmentCapacityRow({
      departmentId: 'd1',
      name: 'Backend',
      memberUserIds: ['u1', 'u2', 'u3'],
      allocatedPctByUserId: { u1: 100, u2: 50, u3: 0 },
    });
    assert.equal(row.headcount, 3);
    assert.equal(row.capacityFtePct, 300);
    assert.equal(row.allocatedFtePct, 150);
    assert.equal(row.availableFtePct, 150);
    assert.equal(row.availablePeople, 1);
    // 100% và 50% đều là partial (chưa >100)
    assert.equal(row.partialPeople, 2);
    assert.equal(row.overallocatedPeople, 0);
    assert.equal(row.approx, true);
  });

  it('allocatedPctOnDay sums overlapping segments', () => {
    const day = toDayMs('2026-07-15');
    const flat = flattenSegments([
      {
        allocations: [
          { startDate: '2026-07-01', endDate: '2026-07-31', allocationPct: 40 },
          { startDate: '2026-07-10', endDate: null, allocationPct: 30 },
        ],
      },
    ]);
    assert.equal(allocatedPctOnDay(flat, day), 70);
    assert.equal(availablePctOnDay(flat, day), 30);
    assert.equal(classifyAvailability(70), 'partial');
  });
});

describe('overallocation (T2)', () => {
  it('overlap >100% → overallocated', () => {
    const rows = [
      {
        allocations: [{ startDate: '2026-07-01', endDate: '2026-07-31', allocationPct: 60 }],
      },
      {
        allocations: [{ startDate: '2026-07-10', endDate: '2026-07-20', allocationPct: 50 }],
      },
    ];
    assert.equal(computeAllocationStatus(rows), 'overallocated');
    assert.equal(isOverallocatedFromSegments(flattenSegments(rows)), true);
    assert.equal(classifyAvailability(110), 'overallocated');
  });

  it('non-overlapping segments stay ok', () => {
    const rows = [
      {
        allocations: [
          { startDate: '2026-07-01', endDate: '2026-07-10', allocationPct: 80 },
          { startDate: '2026-07-11', endDate: '2026-07-20', allocationPct: 80 },
        ],
      },
    ];
    assert.equal(computeAllocationStatus(rows), 'ok');
  });
});

describe('related department filter (T3/T4)', () => {
  it('planner/candidates chỉ giữ user thuộc related depts', () => {
    const related = new Set(['u1', 'u2']);
    const filtered = filterUsersToRelatedDepartments(['u1', 'u3', 'u2', 'u9'], related, {
      isOrgAdmin: false,
    });
    assert.deepEqual(filtered, ['u1', 'u2']);
  });

  it('org admin không bị filter related', () => {
    const related = new Set(['u1']);
    const filtered = filterUsersToRelatedDepartments(['u1', 'u3'], related, { isOrgAdmin: true });
    assert.deepEqual(filtered, ['u1', 'u3']);
  });
});

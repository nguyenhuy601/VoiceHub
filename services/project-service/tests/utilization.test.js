const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  plannedAvailableHoursInRange,
  utilizationPct,
} = require('../src/utils/utilizationMath');
const { DEFAULT_HOURS_PER_DAY } = require('../src/utils/timeTracking');
const { toDayMs, flattenSegments } = require('../src/utils/allocationOverlap');

describe('utilization math (W6)', () => {
  it('50% planned × 1 day × 8h = 4h available; actual 2h → 50%', () => {
    const day = toDayMs('2026-08-06');
    const flat = flattenSegments([
      {
        allocations: [
          { startDate: '2026-08-01', endDate: '2026-08-31', allocationPct: 50 },
        ],
      },
    ]);
    const planned = plannedAvailableHoursInRange({
      flatSegments: flat,
      fromMs: day,
      toMs: day,
      hoursPerDay: DEFAULT_HOURS_PER_DAY,
    });
    assert.equal(planned, 4);
    assert.equal(utilizationPct(2, planned), 50);
  });

  it('plannedAvailable 0 → utilization null', () => {
    assert.equal(utilizationPct(2, 0), null);
  });
});

describe('W8 — utilization reuses P3 org capacity gate', () => {
  it('calls assertCanViewOrgCapacity (member thường → 403)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.join(__dirname, '../src/services/utilization.service.js'),
      'utf8'
    );
    assert.match(src, /assertCanViewOrgCapacity/);
    assert.equal(src.includes('ProjectMember.update'), false);
    assert.equal(src.includes('allocations'), true); // read-only for planned
  });
});

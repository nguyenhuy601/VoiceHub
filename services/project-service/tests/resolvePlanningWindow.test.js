const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_WINDOW_DAYS,
  assertValidWindow,
  datesFromPack,
  resolvePlanningWindow,
  inclusiveDaySpan,
} = require('../src/utils/resolvePlanningWindow');
const { toDayMs, DAY_MS } = require('../src/utils/allocationOverlap');

describe('resolvePlanningWindow', () => {
  it('returns null when no dates and no pack', async () => {
    assert.equal(await resolvePlanningWindow({}), null);
  });

  it('resolves explicit fromDate/toDate', async () => {
    const w = await resolvePlanningWindow({
      fromDate: '2026-08-01',
      toDate: '2026-08-07',
    });
    assert.equal(w.from, '2026-08-01');
    assert.equal(w.to, '2026-08-07');
    assert.equal(w.source, 'explicit');
    assert.equal(w.fromMs, toDayMs('2026-08-01'));
  });

  it('rejects only one of fromDate/toDate', async () => {
    await assert.rejects(
      () => resolvePlanningWindow({ fromDate: '2026-08-01' }),
      (err) => err.errorCode === 'PLANNING_WINDOW_INVALID'
    );
  });

  it('rejects to < from', async () => {
    await assert.rejects(
      () => resolvePlanningWindow({ fromDate: '2026-08-10', toDate: '2026-08-01' }),
      (err) => err.errorCode === 'PLANNING_WINDOW_INVALID'
    );
  });

  it('rejects window longer than 366 days', async () => {
    await assert.rejects(
      () =>
        resolvePlanningWindow({
          fromDate: '2025-01-01',
          toDate: '2026-01-03',
        }),
      (err) => err.errorCode === 'PLANNING_WINDOW_TOO_LONG'
    );
    assert.equal(MAX_WINDOW_DAYS, 366);
  });

  it('T5: pack missing deadline → PLANNING_WINDOW_INCOMPLETE', async () => {
    await assert.rejects(
      () =>
        resolvePlanningWindow({
          requirementPackId: 'pack1',
          packDoc: {
            staffingPlan: { startDate: '2026-08-01' },
            overview: { startDate: '2026-08-01', deadline: null },
          },
        }),
      (err) => {
        assert.equal(err.statusCode, 400);
        assert.equal(err.errorCode, 'PLANNING_WINDOW_INCOMPLETE');
        return true;
      }
    );
  });

  it('resolves pack: staffingPlan.startDate then overview.deadline', async () => {
    const w = await resolvePlanningWindow({
      requirementPackId: 'pack1',
      packDoc: {
        staffingPlan: { startDate: '2026-09-01' },
        overview: { startDate: '2026-08-01', deadline: '2026-09-30' },
      },
    });
    assert.equal(w.from, '2026-09-01');
    assert.equal(w.to, '2026-09-30');
    assert.equal(w.source, 'pack');
  });

  it('pack falls back to overview.startDate', async () => {
    const w = await resolvePlanningWindow({
      requirementPackId: 'pack1',
      packDoc: {
        staffingPlan: {},
        overview: { startDate: '2026-08-15', deadline: '2026-08-20' },
      },
    });
    assert.equal(w.from, '2026-08-15');
    assert.equal(w.to, '2026-08-20');
  });

  it('explicit dates win over pack', async () => {
    const w = await resolvePlanningWindow({
      fromDate: '2026-01-01',
      toDate: '2026-01-05',
      requirementPackId: 'pack1',
      packDoc: {
        overview: { startDate: '2026-08-01', deadline: '2026-08-31' },
      },
    });
    assert.equal(w.from, '2026-01-01');
    assert.equal(w.source, 'explicit');
  });

  it('datesFromPack + assertValidWindow helpers', () => {
    const { fromMs, toMs } = datesFromPack({
      overview: { startDate: '2026-08-01', deadline: '2026-08-03' },
    });
    const w = assertValidWindow(fromMs, toMs);
    assert.equal(inclusiveDaySpan(w.fromMs, w.toMs), 3);
    assert.equal(w.toMs - w.fromMs, 2 * DAY_MS);
  });

  it('loadPack callback when packDoc missing', async () => {
    const w = await resolvePlanningWindow({
      requirementPackId: '507f1f77bcf86cd799439011',
      organizationId: '507f1f77bcf86cd799439012',
      loadPack: async () => ({
        overview: { startDate: '2026-08-01', deadline: '2026-08-10' },
      }),
    });
    assert.equal(w.from, '2026-08-01');
    assert.equal(w.to, '2026-08-10');
  });

  it('404 when pack not found via loadPack', async () => {
    await assert.rejects(
      () =>
        resolvePlanningWindow({
          requirementPackId: '507f1f77bcf86cd799439011',
          loadPack: async () => null,
        }),
      (err) => err.statusCode === 404 && err.errorCode === 'REQUIREMENT_PACK_NOT_FOUND'
    );
  });
});

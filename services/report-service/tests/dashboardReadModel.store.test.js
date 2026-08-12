const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  emptyDashboardSummary,
  upsertDashboardSummary,
  applyTaskFactPatch,
  toPublicDashboardSummary,
} = require('../src/services/dashboardReadModel.store');
const { isUsableDashboardSummary } = require('@enterprise/shared/utils/dashboardReadModelShape');

describe('dashboardReadModel.store', () => {
  it('upserts snapshot and is idempotent on same eventId', () => {
    const empty = emptyDashboardSummary('u1');
    const first = upsertDashboardSummary(empty, {
      eventId: 'e1',
      userId: 'u1',
      patch: { orgCount: 2, friendsTotal: 3, asOf: '2026-08-09T00:00:00.000Z' },
    });
    assert.equal(first.applied, true);
    assert.equal(first.next.orgCount, 2);

    const second = upsertDashboardSummary(first.next, {
      eventId: 'e1',
      userId: 'u1',
      patch: { orgCount: 99 },
    });
    assert.equal(second.applied, false);
    assert.equal(second.next.orgCount, 2);
  });

  it('applyTaskFactPatch increments doneDelta', () => {
    const base = emptyDashboardSummary('u1');
    base.taskDone = 4;
    const next = applyTaskFactPatch(base, { doneDelta: 1 });
    assert.equal(next.taskDone, 5);
  });

  it('public summary + usable requires asOf', () => {
    const withoutAsOf = toPublicDashboardSummary(emptyDashboardSummary('u1'));
    assert.equal(isUsableDashboardSummary(withoutAsOf), false);
    const withAsOf = toPublicDashboardSummary({
      ...emptyDashboardSummary('u1'),
      asOf: '2026-08-09T00:00:00.000Z',
      orgCount: 1,
    });
    assert.equal(isUsableDashboardSummary(withAsOf), true);
  });
});

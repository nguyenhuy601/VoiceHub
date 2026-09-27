/**
 * Pure mapper: RA seed maps → planning draft rows. No DB, no xlsx.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSeedMapsFromRa,
  draftRowsFromRaSeed,
} = require('../src/utils/planning/planningWorkbookBuilder');

function seedFromFr(existingKeys) {
  return buildSeedMapsFromRa({
    frs: [{ externalKey: 'FR-1', title: 'Đặt tour', summary: 'Giữ chỗ trong ngày' }],
    nfrs: [],
    assumptions: [],
    existingKeys,
  });
}

describe('draftRowsFromRaSeed', () => {
  it('maps an approved FR to a WBS row with suggestion and PM fields blank', () => {
    const rows = draftRowsFromRaSeed(seedFromFr(new Set()), new Set());
    const wbs = rows.find((row) => row.kind === 'WBS');
    assert.equal(wbs.externalKey, 'WBS-FR-1');
    assert.equal(wbs.title, 'Đặt tour');
    assert.equal(wbs.summary, 'Giữ chỗ trong ngày');
    assert.equal(wbs.structured.sourceFrKey, 'FR-1');
    for (const key of [
      'effortHours',
      'roleKey',
      'startDate',
      'endDate',
      'assigneeEmail',
      'assigneeName',
    ]) {
      assert.equal(wbs.structured[key], '');
    }
  });

  it('keeps schedule and milestone dates empty', () => {
    const rows = draftRowsFromRaSeed(seedFromFr(new Set()), new Set());
    const schedule = rows.find((row) => row.externalKey === 'SCH-DELIVERY');
    const milestone = rows.find((row) => row.externalKey === 'MS-PHASE2');
    assert.equal(schedule.kind, 'SCHEDULE');
    assert.equal(schedule.structured.startDate, '');
    assert.equal(schedule.structured.endDate, '');
    assert.equal(milestone.kind, 'MILESTONE');
    assert.equal(milestone.structured.targetDate, '');
  });

  it('skips a WBS key that already exists', () => {
    const rows = draftRowsFromRaSeed(seedFromFr(new Set(['WBS:WBS-FR-1'])), new Set(['WBS:WBS-FR-1']));
    assert.equal(
      rows.some((row) => row.externalKey === 'WBS-FR-1'),
      false
    );
  });

  it('stores the sample Developer role on RES-PLAN.structured.roles', () => {
    const rows = draftRowsFromRaSeed(seedFromFr(new Set()), new Set());
    const resource = rows.find((row) => row.externalKey === 'RES-PLAN');
    assert.equal(resource.kind, 'RESOURCE');
    assert.equal(
      resource.structured.roles.some((role) => role.roleKey === 'dev'),
      true
    );
    assert.equal(
      rows.some((row) => row.kind === 'RESOURCE_ROLES'),
      false
    );
  });
});

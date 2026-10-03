const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hydrateToolDataFromSnapshot,
} = require('../src/knowledge/hydrateToolDataFromSnapshot');

describe('hydrateToolDataFromSnapshot', () => {
  it('backfills employees from snapshot.projected when toolData lacks array', () => {
    const out = hydrateToolDataFromSnapshot(
      {},
      {
        snapshotId: 'SNAP-1',
        projected: {
          employees: [{ userId: 'u1', skills: ['React'] }],
          calendar: { holidays: ['2026-09-02'] },
          srs: { overview: { startDate: '2026-01-01', deadline: '2026-06-01' } },
        },
      }
    );
    assert.equal(out.employees.length, 1);
    assert.equal(out.employees[0].userId, 'u1');
    assert.deepEqual(out.calendar.holidays, ['2026-09-02']);
    assert.equal(out.overview.startDate, '2026-01-01');
    assert.equal(out.filterMeta.hydrate, 'aps_soft_backfill');
  });

  it('prefers commonFiltered employees over projected', () => {
    const out = hydrateToolDataFromSnapshot(
      { snapshotId: 'S' },
      {
        commonFiltered: { employees: [{ userId: 'kept' }], calendar: { holidays: [] } },
        projected: { employees: [{ userId: 'ignored' }] },
      }
    );
    assert.deepEqual(
      out.employees.map((e) => e.userId),
      ['kept']
    );
  });

  it('does not overwrite existing employees array (RULE-HT-04)', () => {
    const out = hydrateToolDataFromSnapshot(
      { employees: [{ userId: 'pinned' }] },
      { projected: { employees: [{ userId: 'other' }] } }
    );
    assert.deepEqual(
      out.employees.map((e) => e.userId),
      ['pinned']
    );
    assert.equal(out.filterMeta, undefined);
  });

  it('keeps empty employees array without backfill', () => {
    const out = hydrateToolDataFromSnapshot(
      { employees: [] },
      { projected: { employees: [{ userId: 'u1' }] } }
    );
    assert.deepEqual(out.employees, []);
  });
});

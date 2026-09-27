/**
 * Unit tests for Phase 2 Manual staging row whitelist (no DB).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  whitelistRow,
  leafEstimateHours,
  stagingDisplayFromWbs,
  overlayStagingRowsFromWbs,
  summarizeStaging,
  stagingSubmitterStamp,
} = require('../src/utils/phase2ManualStagingUtils');

describe('phase2ManualStaging whitelistRow', () => {
  it('maps from_wbs row with sourceArtifactId', () => {
    const row = whitelistRow(
      {
        sourceArtifactId: 'abc',
        externalKey: 'WBS-1',
        title: 'Login',
        estimateHours: 3,
        changeType: 'from_wbs',
      },
      0
    );
    assert.equal(row.externalKey, 'WBS-1');
    assert.equal(row.title, 'Login');
    assert.equal(row.estimateHours, 3);
    assert.equal(row.changeType, 'from_wbs');
    assert.equal(row.sourceArtifactId, 'abc');
  });

  it('defaults added when no source', () => {
    const row = whitelistRow({ title: 'New' }, 1);
    assert.equal(row.changeType, 'added');
    assert.ok(row.localId);
  });

  it('strips nested junk and caps title', () => {
    const row = whitelistRow({
      title: 'x'.repeat(600),
      nested: { a: 1 },
      structured: { assigneeUserId: 'hidden' },
      estimateHours: -1,
      assigneeEmail: ' lead@voicehub.local ',
      assigneeName: ' Trần Minh Quân ',
      startDate: '2026-10-26T00:00:00.000Z',
    });
    assert.equal(row.title.length, 500);
    assert.equal(row.estimateHours, null);
    assert.equal(row.nested, undefined);
    assert.equal(row.structured, undefined);
    assert.equal(row.assigneeEmail, 'lead@voicehub.local');
    assert.equal(row.assigneeName, 'Trần Minh Quân');
    assert.equal(row.startDate, '2026-10-26');
  });
});

describe('phase2ManualStaging stagingDisplayFromWbs', () => {
  it('reads person and start date from structured, ignoring a top-level assigneeUserId', () => {
    const display = stagingDisplayFromWbs({
      assigneeUserId: 'top-level-ignored',
      structured: {
        assigneeUserId: 'user-1',
        assigneeEmail: ' nv.be.lead@voicehub.local ',
        assigneeName: ' Trần Minh Quân ',
        startDate: '2026-10-26T00:00:00.000Z',
      },
    });
    assert.equal(display.assigneeUserId, 'user-1');
    assert.equal(display.assigneeEmail, 'nv.be.lead@voicehub.local');
    assert.equal(display.assigneeName, 'Trần Minh Quân');
    assert.equal(display.startDate, '2026-10-26');
    assert.equal(display.structured, undefined);
  });

  it('returns empty person and start date when structured is missing', () => {
    const display = stagingDisplayFromWbs({ assigneeUserId: 'nope' });
    assert.equal(display.assigneeUserId, null);
    assert.equal(display.assigneeEmail, '');
    assert.equal(display.assigneeName, '');
    assert.equal(display.startDate, '');
  });
});

describe('phase2ManualStaging overlayStagingRowsFromWbs', () => {
  it('replaces a saved draft person with the current WBS structured fields', () => {
    const rows = overlayStagingRowsFromWbs(
      [
        {
          sourceArtifactId: 'a1',
          title: 'Keep',
          assigneeEmail: 'stale@x',
          assigneeUserId: 'old',
          startDate: '2020-01-01',
        },
        { sourceArtifactId: null, title: 'Added', assigneeEmail: 'typed@x', changeType: 'added' },
      ],
      [
        {
          _id: 'a1',
          assigneeUserId: null,
          structured: {
            assigneeUserId: 'user-1',
            assigneeEmail: 'nv.be.lead@voicehub.local',
            assigneeName: 'Trần Minh Quân',
            startDate: '2026-10-26',
          },
        },
      ]
    );
    assert.equal(rows[0].title, 'Keep');
    assert.equal(rows[0].assigneeUserId, 'user-1');
    assert.equal(rows[0].assigneeEmail, 'nv.be.lead@voicehub.local');
    assert.equal(rows[0].startDate, '2026-10-26');
    assert.equal(rows[1].assigneeUserId, null);
    assert.equal(rows[1].assigneeEmail, '');
    assert.equal(rows[1].startDate, '');
  });
});

describe('phase2ManualStaging leafEstimateHours', () => {
  it('reads structured.effortHours when estimateHours is empty', () => {
    assert.equal(
      leafEstimateHours({ structured: { effortHours: 16 } }),
      16
    );
    assert.equal(leafEstimateHours({ estimateHours: 8, structured: { effortHours: 16 } }), 8);
    assert.equal(leafEstimateHours({ structured: {} }), null);
  });
});

describe('phase2ManualStaging summarizeStaging', () => {
  it('returns null when missing', () => {
    assert.equal(summarizeStaging(null), null);
    assert.equal(summarizeStaging({}), null);
  });

  it('summarizes po_review', () => {
    const s = summarizeStaging({
      phase2ManualStaging: {
        status: 'po_review',
        methodology: 'scrum',
        rows: [{ a: 1 }, { b: 2 }],
        submittedBy: 'u1',
      },
    });
    assert.equal(s.status, 'po_review');
    assert.equal(s.rowCount, 2);
    assert.equal(s.methodology, 'scrum');
    assert.equal(s.submittedBy, 'u1');
    assert.equal(s.note, '');
    assert.equal(s.reviewNote, '');
  });

  it('keeps the PO change request separate from the PM note', () => {
    const s = summarizeStaging({
      phase2ManualStaging: {
        status: 'changes_requested',
        note: 'PM gửi bảng',
        reviewNote: 'Thiếu giờ trên WBS-FR-001',
        rows: [{ a: 1 }],
      },
    });
    assert.equal(s.note, 'PM gửi bảng');
    assert.equal(s.reviewNote, 'Thiếu giờ trên WBS-FR-001');
  });
});

describe('phase2ManualStaging stagingSubmitterStamp', () => {
  it('returns the submitter as the prior SoD stamp', () => {
    assert.deepEqual(stagingSubmitterStamp('pm-1'), [{ userId: 'pm-1' }]);
  });

  it('returns no stamp when staging has no submitter', () => {
    assert.deepEqual(stagingSubmitterStamp(null), []);
    assert.deepEqual(stagingSubmitterStamp('  '), []);
  });
});

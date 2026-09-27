const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestPlanningImportFields,
  suggestionsForConfirm,
  applyDecisionsToRows,
} = require('../src/utils/planning/planningImportFieldSuggest');

const members = [
  { userId: 'u1', email: 'a@voicehub.local', displayName: 'A' },
  { userId: 'u2', email: 'b@voicehub.local', displayName: 'B' },
];

function leaf(structured) {
  return {
    kind: 'WBS',
    externalKey: 'WBS-FR-1',
    title: 'From FR',
    parentExternalKey: '',
    _sheet: 'WBS',
    _row: 2,
    structured: { roleKey: 'dev', ...structured },
  };
}

function options(availableHours) {
  return {
    members,
    resourceRoleKeys: ['dev'],
    hasProjectWindow: true,
    candidatesByRole: {
      dev: [
        {
          userId: 'u1',
          email: 'a@voicehub.local',
          displayName: 'A',
          availableHours,
          score: 9,
          suggestReasons: ['position_preferred'],
          jobTitle: 'hidden',
        },
      ],
    },
  };
}

describe('planning bulk dump suggestion decisions', () => {
  it('leaves due date and assignee empty when confirm sends no decisions', () => {
    const rows = [leaf({ startDate: '2026-09-25', effortHours: 8 })];
    const suggestions = suggestPlanningImportFields(rows, options(40));
    applyDecisionsToRows(rows, suggestions, undefined);
    assert.equal(rows[0].structured.endDate, undefined);
    assert.equal(rows[0].structured.assigneeUserId, undefined);
    assert.equal(rows[0].structured.assigneeEmail, undefined);
  });

  it('writes endDate and assigneeUserId from the server result when apply is true', () => {
    const rows = [leaf({ startDate: '2026-09-25', effortHours: 8 })];
    const suggestions = suggestionsForConfirm(rows, options(40), [
      { kind: 'WBS', externalKey: 'WBS-FR-1', field: 'endDate', apply: true, userId: 'spoof' },
      { kind: 'WBS', externalKey: 'WBS-FR-1', field: 'assignee', apply: true, userId: 'spoof' },
    ]);
    applyDecisionsToRows(rows, suggestions, [
      { kind: 'WBS', externalKey: 'WBS-FR-1', field: 'endDate', apply: true, userId: 'spoof' },
      { kind: 'WBS', externalKey: 'WBS-FR-1', field: 'assignee', apply: true, userId: 'spoof' },
    ]);
    assert.equal(rows[0].structured.endDate, '2026-09-28');
    assert.equal(rows[0].structured.assigneeUserId, 'u1');
    assert.equal(rows[0].structured.assigneeEmail, 'a@voicehub.local');
    assert.equal(rows[0].structured.assigneeName, 'A');
    const assignee = suggestions.find((item) => item.field === 'assignee');
    assert.equal(assignee.assignee.jobTitle, undefined);
    assert.equal(assignee.byRole, undefined);
    assert.equal(assignee.memberships, undefined);
  });

  it('drops an assignee decision when the recomputed person no longer has enough hours', () => {
    const rows = [leaf({ startDate: '2026-09-25', effortHours: 8 })];
    const preview = suggestPlanningImportFields(rows, options(40));
    assert.equal(preview.find((item) => item.field === 'assignee').verdict, 'blank_suggest');
    const again = suggestPlanningImportFields(rows, options(4));
    applyDecisionsToRows(rows, again, [
      { kind: 'WBS', externalKey: 'WBS-FR-1', field: 'assignee', apply: true },
    ]);
    assert.equal(rows[0].structured.assigneeUserId, undefined);
    assert.equal(rows[0].structured.assigneeEmail, undefined);
  });
});

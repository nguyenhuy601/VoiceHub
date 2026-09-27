const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { suggestEndDateFromEffort } = require('../src/utils/planning/suggestEndDateFromEffort');
const { suggestPlanningImportFields } = require('../src/utils/planning/planningImportFieldSuggest');

function wbs(externalKey, structured, extra = {}) {
  return {
    kind: 'WBS',
    externalKey,
    title: externalKey,
    parentExternalKey: extra.parentExternalKey || '',
    _sheet: 'WBS',
    _row: extra.row || 2,
    structured,
  };
}

const members = [
  { userId: 'u1', email: 'a@voicehub.local', displayName: 'A' },
  { userId: 'u2', email: 'b@voicehub.local', displayName: 'B' },
];

const candidatesByRole = {
  dev: [
    {
      userId: 'u1',
      email: 'a@voicehub.local',
      displayName: 'A',
      availableHours: 40,
      score: 10,
      suggestReasons: ['position_preferred'],
    },
    {
      userId: 'u2',
      email: 'b@voicehub.local',
      displayName: 'B',
      availableHours: 40,
      score: 5,
      suggestReasons: ['cv_verified'],
    },
  ],
};

function scan(rows, extra = {}) {
  return suggestPlanningImportFields(rows, {
    members,
    candidatesByRole,
    resourceRoleKeys: ['dev'],
    hasProjectWindow: true,
    ...extra,
  });
}

function one(rows, field, externalKey = 'WBS-1') {
  const hits = scan(rows).filter((item) => item.field === field && item.externalKey === externalKey);
  assert.equal(hits.length, 1);
  return hits[0];
}

describe('suggestEndDateFromEffort', () => {
  it('matches the weekday 8h example', () => {
    assert.equal(suggestEndDateFromEffort('2026-09-25', 8), '2026-09-28');
  });
});

describe('planningImportFieldSuggest due date', () => {
  it('suggests a blank due date from start and effort', () => {
    const hit = one([
      wbs('WBS-1', { startDate: '2026-09-25', effortHours: 8, roleKey: 'dev' }),
    ], 'endDate');
    assert.equal(hit.verdict, 'blank_suggest');
    assert.equal(hit.suggestedValue, '2026-09-28');
    assert.equal(hit.basis, 'weekday_effort_8h');
    assert.equal(hit.assignee, null);
  });

  it('keeps a due date that is on time or later', () => {
    const same = one([
      wbs('WBS-1', { startDate: '2026-09-25', endDate: '2026-09-28', effortHours: 8, roleKey: 'dev' }),
    ], 'endDate');
    assert.equal(same.verdict, 'keep');
    const later = one([
      wbs('WBS-1', { startDate: '2026-09-25', endDate: '2026-09-30', effortHours: 8, roleKey: 'dev' }),
    ], 'endDate');
    assert.equal(later.verdict, 'keep');
  });

  it('revises a due date that is earlier than the formula', () => {
    const hit = one([
      wbs('WBS-1', { startDate: '2026-09-25', endDate: '2026-09-26', effortHours: 8, roleKey: 'dev' }),
    ], 'endDate');
    assert.equal(hit.verdict, 'revise');
    assert.equal(hit.suggestedValue, '2026-09-28');
  });

  it('does not invent a due date without start or effort', () => {
    const hit = one([wbs('WBS-1', { effortHours: 8, roleKey: 'dev' })], 'endDate');
    assert.equal(hit.verdict, 'missing_start_or_effort');
    assert.equal(hit.suggestedValue, '');
  });
});

describe('planningImportFieldSuggest assignee', () => {
  it('suggests one assignee row when the cell is blank', () => {
    const rows = [wbs('WBS-1', { startDate: '2026-09-25', effortHours: 8, roleKey: 'dev' })];
    const hits = scan(rows).filter((item) => item.externalKey === 'WBS-1' && item.field === 'assignee');
    assert.equal(hits.length, 1);
    const hit = hits[0];
    assert.equal(hit.verdict, 'blank_suggest');
    assert.equal(hit.suggestedValue, 'a@voicehub.local');
    assert.equal(hit.assignee.userId, 'u1');
    assert.equal(hit.assignee.email, 'a@voicehub.local');
    assert.equal(hit.assignee.displayName, 'A');
    assert.deepEqual(hit.assignee.reasonCodes, ['position_preferred']);
    assert.equal(hit.assignee.remainingHoursAfter, 32);
    assert.equal(hit.assignee.score, undefined);
  });

  it('keeps a mapped assignee who still has enough hours', () => {
    const hit = one([
      wbs('WBS-1', {
        startDate: '2026-09-25',
        effortHours: 8,
        roleKey: 'dev',
        assigneeEmail: 'a@voicehub.local',
      }),
    ], 'assignee');
    assert.equal(hit.verdict, 'keep');
    assert.equal(hit.assignee, null);
  });

  it('revises an assignee who does not have enough hours', () => {
    const rows = scan([
      wbs('WBS-1', { effortHours: 8, roleKey: 'dev', assigneeEmail: 'a@voicehub.local' }, { row: 2 }),
      wbs('WBS-2', { effortHours: 40, roleKey: 'dev', assigneeEmail: 'a@voicehub.local' }, { row: 3 }),
    ]);
    const kept = rows.find((item) => item.externalKey === 'WBS-2' && item.field === 'assignee');
    const short = rows.find((item) => item.externalKey === 'WBS-1' && item.field === 'assignee');
    assert.equal(kept.verdict, 'keep');
    assert.equal(short.verdict, 'revise');
    assert.equal(short.suggestedValue, 'b@voicehub.local');
  });

  it('revises an email that is not in the org and still suggests someone', () => {
    const hit = one([
      wbs('WBS-1', { effortHours: 8, roleKey: 'dev', assigneeEmail: 'missing@voicehub.local' }),
    ], 'assignee');
    assert.equal(hit.verdict, 'revise');
    assert.equal(hit.assignee.userId, 'u1');
  });

  it('does not invent a person when Role Key is missing', () => {
    const hit = one([wbs('WBS-1', { effortHours: 8, skillKeys: ['qa'] })], 'assignee');
    assert.equal(hit.verdict, 'missing_role');
    assert.equal(hit.assignee, null);
    assert.equal(hit.suggestedValue, '');
  });

  it('uses a Skills token that matches a RESOURCE_ROLES key', () => {
    const hit = one([wbs('WBS-1', { effortHours: 8, skillKeys: ['dev'] })], 'assignee');
    assert.equal(hit.verdict, 'blank_suggest');
    assert.equal(hit.assignee.userId, 'u1');
  });

  it('reserves keep and revise hours before suggesting a blank row', () => {
    const hits = scan([
      wbs('WBS-KEEP', { effortHours: 30, roleKey: 'dev', assigneeEmail: 'a@voicehub.local' }, { row: 2 }),
      wbs('WBS-REVISE', { effortHours: 20, roleKey: 'dev', assigneeEmail: 'a@voicehub.local' }, { row: 3 }),
      wbs('WBS-BLANK', { effortHours: 8, roleKey: 'dev' }, { row: 4 }),
    ]);
    const revise = hits.find((item) => item.externalKey === 'WBS-REVISE' && item.field === 'assignee');
    const blank = hits.find((item) => item.externalKey === 'WBS-BLANK' && item.field === 'assignee');
    assert.equal(revise.verdict, 'revise');
    assert.equal(blank.verdict, 'blank_suggest');
    assert.equal(blank.assignee.userId, 'u2');
  });

  it('does not scan parent rows', () => {
    const hits = scan([
      wbs('WBS-P', { effortHours: 8, roleKey: 'dev', startDate: '2026-09-25' }, { row: 2 }),
      wbs('WBS-C', { effortHours: 8, roleKey: 'dev', startDate: '2026-09-25' }, { parentExternalKey: 'WBS-P', row: 3 }),
    ]);
    assert.equal(hits.some((item) => item.externalKey === 'WBS-P'), false);
    assert.ok(hits.some((item) => item.externalKey === 'WBS-C' && item.field === 'assignee'));
  });

  it('keeps a matched email when the project has no hour window', () => {
    const hit = scan(
      [wbs('WBS-1', { effortHours: 80, roleKey: 'dev', assigneeEmail: 'a@voicehub.local' })],
      { hasProjectWindow: false }
    ).find((item) => item.field === 'assignee');
    assert.equal(hit.verdict, 'keep');
    assert.equal(hit.basis, 'no_project_window');
  });

  it('does not invent a person when the pool is unavailable', () => {
    const hit = scan(
      [wbs('WBS-1', { effortHours: 8, roleKey: 'dev' })],
      { poolUnavailable: true, candidatesByRole: {} }
    ).find((item) => item.field === 'assignee');
    assert.equal(hit.verdict, 'revise');
    assert.equal(hit.basis, 'pool_unavailable');
    assert.equal(hit.assignee, null);
  });
});

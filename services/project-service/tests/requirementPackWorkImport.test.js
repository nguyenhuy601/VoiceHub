const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLeafAssigneeMap,
  listFrRowsWithAssignee,
  planningTypeForLevel,
  cardIssueTypeForLevel,
  normalizeCreatePackLeafAssignments,
} = require('../src/utils/requirementPackWorkImport.utils');

function frTreeFixture() {
  return [
    { externalId: 'E-1', level: 'Epic', name: 'Auth', sortOrder: 1, parentExternalId: '' },
    {
      externalId: 'F-1',
      level: 'Feature',
      name: 'Login',
      sortOrder: 2,
      parentExternalId: 'E-1',
    },
    {
      externalId: 'S-1',
      level: 'Story',
      name: 'User login',
      sortOrder: 3,
      parentExternalId: 'F-1',
      suggestedRoleKey: 'frontend_developer',
      suggestedSkills: ['React'],
      estimateHours: 8,
    },
    {
      externalId: 'T-1',
      level: 'Task',
      name: 'Build form',
      sortOrder: 4,
      parentExternalId: 'S-1',
      suggestedRoleKey: 'frontend_developer',
      suggestedSkills: ['React'],
      estimateHours: 4,
    },
    {
      externalId: 'ST-1',
      level: 'Subtask',
      name: 'Validate fields',
      sortOrder: 5,
      parentExternalId: 'T-1',
      suggestedRoleKey: 'frontend_developer',
      estimateHours: 2,
    },
  ];
}

describe('requirementPackWorkImport helpers', () => {
  it('maps FR levels to planning and card issue types', () => {
    assert.equal(planningTypeForLevel('Epic'), 'epic');
    assert.equal(planningTypeForLevel('Feature'), 'feature');
    assert.equal(cardIssueTypeForLevel('Story'), 'story');
    assert.equal(cardIssueTypeForLevel('Task'), 'task');
    assert.equal(cardIssueTypeForLevel('Subtask'), 'task');
  });

  it('buildLeafAssigneeMap merges overlay suggestions with body overrides', () => {
    const overlay = [
      { externalId: 'T-1', suggestedUserId: 'u-a' },
      { externalId: 'ST-1', suggestedUserId: 'u-b' },
    ];
    const body = [{ externalId: 'ST-1', userId: 'u-c' }];
    const map = buildLeafAssigneeMap(body, overlay);
    assert.equal(map.get('T-1'), 'u-a');
    assert.equal(map.get('ST-1'), 'u-c');
  });

  it('listFrRowsWithAssignee only includes execution leaves with assignee', () => {
    const frList = frTreeFixture();
    const map = buildLeafAssigneeMap(
      [
        { externalId: 'S-1', userId: 'u-1' },
        { externalId: 'T-1', userId: null },
        { externalId: 'ST-1', userId: 'u-2' },
      ],
      []
    );
    const rows = listFrRowsWithAssignee(frList, map);
    assert.equal(rows.length, 1);
    assert.ok(rows.some((r) => r.externalId === 'ST-1'));
    assert.ok(!rows.some((r) => r.externalId === 'E-1'));
    assert.ok(!rows.some((r) => r.externalId === 'S-1'));
  });

  it('normalizeCreatePackLeafAssignments keeps null userId', () => {
    const rows = normalizeCreatePackLeafAssignments([
      { externalId: 'A', userId: 'u1' },
      { externalId: 'B', userId: null },
      { externalId: '', userId: 'u2' },
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].userId, 'u1');
    assert.equal(rows[1].userId, null);
  });
});

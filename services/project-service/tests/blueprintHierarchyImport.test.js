/**
 * Blueprint hierarchy import — level mapping + parent links (no DB).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  planningTypeForLevel,
  cardIssueTypeForLevel,
  isCardLevel,
  resolveBlueprintImportLevel,
  resolveBlueprintParentLinks,
} = require('../src/utils/requirement/requirementPackWorkImport.utils');
const {
  mapBlueprintTasksToImportPlan,
  sortBlueprintTasksParentsFirst,
} = require('../src/utils/aiAnalysis/aiAnalysisBlueprintImport');
const { createEmptyAiAnalysisContainer } = require('../src/utils/aiAnalysis/aiAnalysisContainer');

describe('blueprint hierarchy level helpers', () => {
  it('maps HOW lowercase and FR Title Case to planning/card types', () => {
    assert.equal(planningTypeForLevel('epic'), 'epic');
    assert.equal(planningTypeForLevel('Epic'), 'epic');
    assert.equal(planningTypeForLevel('feature'), 'feature');
    assert.equal(planningTypeForLevel('Feature'), 'feature');
    assert.equal(planningTypeForLevel('story'), null);
    assert.equal(isCardLevel('story'), true);
    assert.equal(isCardLevel('Story'), true);
    assert.equal(isCardLevel('task'), true);
    assert.equal(cardIssueTypeForLevel('story'), 'story');
    assert.equal(cardIssueTypeForLevel('task'), 'task');
  });

  it('falls back to legacy flatten when level missing', () => {
    assert.equal(resolveBlueprintImportLevel({}), 'Story');
    assert.equal(resolveBlueprintImportLevel({ parentBlueprintTaskId: 'E1' }), 'Task');
    assert.equal(resolveBlueprintImportLevel({ level: 'epic' }), 'epic');
  });

  it('resolves epic→feature→story→task parent links', () => {
    const epic = {
      kind: 'planning',
      id: 'epic-oid',
      planningType: 'epic',
      level: 'epic',
      epicId: 'epic-oid',
    };
    const underEpic = resolveBlueprintParentLinks(epic);
    assert.equal(underEpic.epicId, 'epic-oid');
    assert.equal(underEpic.featureId, null);
    assert.equal(underEpic.parentPlanningMeta.planningType, 'epic');

    const feature = {
      kind: 'planning',
      id: 'feat-oid',
      planningType: 'feature',
      level: 'feature',
      epicId: 'epic-oid',
      featureId: 'feat-oid',
    };
    const underFeature = resolveBlueprintParentLinks(feature);
    assert.equal(underFeature.featureId, 'feat-oid');
    assert.equal(underFeature.epicId, 'epic-oid');
    assert.equal(underFeature.parentTaskId, null);

    const story = {
      kind: 'task',
      id: 'story-oid',
      issueType: 'story',
      epicId: 'epic-oid',
      featureId: 'feat-oid',
    };
    const underStory = resolveBlueprintParentLinks(story);
    assert.equal(underStory.parentTaskId, 'story-oid');
    assert.equal(underStory.epicId, 'epic-oid');
    assert.equal(underStory.featureId, 'feat-oid');
    assert.equal(underStory.parentTaskMeta.issueType, 'story');
  });
});

describe('mapBlueprintTasksToImportPlan hierarchy', () => {
  it('preserves level and sorts parents before children', () => {
    const base = createEmptyAiAnalysisContainer();
    base.planning.tasks = [
      {
        id: 'T1',
        name: 'Leaf',
        level: 'task',
        parentId: 'S1',
        effortHours: 8,
        startDate: '2026-09-10',
        dueDate: '2026-09-10',
      },
      { id: 'E1', name: 'Epic A', level: 'epic', parentId: null, effortHours: 0 },
      {
        id: 'S1',
        name: 'Story',
        level: 'story',
        parentId: 'F1',
        effortHours: 0,
      },
      {
        id: 'F1',
        name: 'Feature',
        level: 'feature',
        parentId: 'E1',
        effortHours: 0,
      },
    ];
    base.resource.assignments = [{ taskId: 'T1', userId: 'u1' }];

    const sorted = sortBlueprintTasksParentsFirst(base.planning.tasks);
    assert.deepEqual(
      sorted.map((t) => t.id),
      ['E1', 'F1', 'S1', 'T1']
    );

    const { rows } = mapBlueprintTasksToImportPlan(base);
    assert.deepEqual(
      rows.map((r) => ({ id: r.blueprintTaskId, level: r.level, parent: r.parentBlueprintTaskId })),
      [
        { id: 'E1', level: 'epic', parent: null },
        { id: 'F1', level: 'feature', parent: 'E1' },
        { id: 'S1', level: 'story', parent: 'F1' },
        { id: 'T1', level: 'task', parent: 'S1' },
      ]
    );
    assert.equal(rows.find((r) => r.blueprintTaskId === 'T1').assigneeUserId, 'u1');
    assert.equal(rows.find((r) => r.blueprintTaskId === 'T1').effortHours, 8);
  });
});

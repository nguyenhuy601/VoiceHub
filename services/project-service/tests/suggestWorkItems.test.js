/**
 * Unit — suggestWorkItems pure heuristics (no DB).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  suggestWorkItemsFromWbs,
  suggestWorkItemsFromUcGap,
  suggestWorkItems,
} = require('../src/utils/planning/suggestWorkItems');

describe('suggestWorkItemsFromWbs', () => {
  it('suggests one story per published approved WBS with epic', () => {
    const wbsId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const epicId = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const result = suggestWorkItemsFromWbs({
      wbsArtifacts: [
        {
          _id: wbsId,
          title: 'Enroll flow',
          status: 'approved',
          publishedWorkItemId: epicId,
          structured: { sourceFrKey: 'FR-001' },
          summary: 'WBS summary',
        },
      ],
      epics: [{ _id: epicId, title: 'Epic Enroll', type: 'epic', sourceArtifactId: wbsId }],
      frByKey: { 'FR-001': { externalKey: 'FR-001', title: 'Student enrolls', summary: 'FR text' } },
      existingTasks: [],
    });
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].epicId, epicId);
    assert.equal(result.suggestions[0].sourceWbsArtifactId, wbsId);
    assert.equal(result.suggestions[0].sourceFrKey, 'FR-001');
    assert.equal(result.suggestions[0].title, 'Student enrolls');
    assert.equal(result.suggestions[0].reason, 'from_wbs_with_fr');
  });

  it('skips unpublished WBS and existing tasks', () => {
    const wbsOpen = 'cccccccccccccccccccccccc';
    const wbsDone = 'dddddddddddddddddddddddd';
    const result = suggestWorkItemsFromWbs({
      wbsArtifacts: [
        { _id: wbsOpen, title: 'Open', status: 'approved', publishedWorkItemId: null },
        {
          _id: wbsDone,
          title: 'Done',
          status: 'approved',
          publishedWorkItemId: 'eeeeeeeeeeeeeeeeeeeeeeee',
        },
      ],
      epics: [
        {
          _id: 'eeeeeeeeeeeeeeeeeeeeeeee',
          title: 'E',
          type: 'epic',
          sourceArtifactId: wbsDone,
        },
      ],
      existingTasks: [{ sourceWbsArtifactId: wbsDone }],
    });
    assert.equal(result.suggestions.length, 0);
    assert.ok(result.skippedHints.some((h) => h.reason === 'wbs_not_published'));
    assert.ok(result.skippedHints.some((h) => h.reason === 'task_already_exists'));
  });
});

describe('suggestWorkItemsFromUcGap', () => {
  it('suggests UC without task and maps epic via FR→WBS', () => {
    const wbsId = 'ffffffffffffffffffffffff';
    const epicId = '111111111111111111111111';
    const result = suggestWorkItemsFromUcGap({
      useCases: [
        {
          externalKey: 'UC-001',
          title: 'Register',
          status: 'approved',
          structured: { relatedFrKeys: ['FR-001'], mainFlow: '1. Open' },
        },
      ],
      wbsArtifacts: [
        {
          _id: wbsId,
          status: 'approved',
          publishedWorkItemId: epicId,
          structured: { sourceFrKey: 'FR-001' },
        },
      ],
      epics: [{ _id: epicId, title: 'Epic', type: 'epic', sourceArtifactId: wbsId }],
      existingTasks: [],
      frByKey: {},
    });
    assert.equal(result.suggestions.length, 1);
    assert.equal(result.suggestions[0].sourceUcKey, 'UC-001');
    assert.equal(result.suggestions[0].epicId, epicId);
    assert.equal(result.suggestions[0].reason, 'from_uc_gap_via_fr');
  });

  it('uses unscoped_epic when no FR map', () => {
    const epicId = '222222222222222222222222';
    const result = suggestWorkItemsFromUcGap({
      useCases: [{ externalKey: 'UC-009', title: 'Orphan', status: 'approved', structured: {} }],
      wbsArtifacts: [],
      epics: [{ _id: epicId, title: 'Default', type: 'epic' }],
      existingTasks: [],
    });
    assert.equal(result.suggestions[0].reason, 'unscoped_epic');
    assert.equal(result.suggestions[0].epicId, epicId);
  });

  it('skips UC that already has a task', () => {
    const result = suggestWorkItemsFromUcGap({
      useCases: [{ externalKey: 'UC-001', title: 'X', status: 'approved' }],
      epics: [{ _id: '333333333333333333333333', type: 'epic', title: 'E' }],
      existingTasks: [{ sourceUcKey: 'UC-001' }],
    });
    assert.equal(result.suggestions.length, 0);
    assert.ok(result.skippedHints.some((h) => h.reason === 'task_already_exists'));
  });
});

describe('suggestWorkItems router', () => {
  it('routes view from_uc_gap', () => {
    const r = suggestWorkItems({
      view: 'from_uc_gap',
      useCases: [],
      epics: [],
    });
    assert.equal(r.view, 'from_uc_gap');
  });
});

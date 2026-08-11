import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildIssueOverlay,
  classifyListStatusBucket,
  countCardsByIssueType,
  countIssuesByStatusBucket,
  displayIssueKey,
  dueDateTone,
  mergeIssueWithOverlay,
  normalizeIssueType,
} from './projectHubUtils.js';

test('countCardsByIssueType nhóm story / task / bug', () => {
  const counts = countCardsByIssueType([
    { issueType: 'story' },
    { issueType: 'Story' },
    { issueType: 'bug' },
    { type: 'task' },
    { title: 'no type' },
    { issueType: 'epic' },
  ]);
  assert.equal(counts.story, 2);
  assert.equal(counts.bug, 1);
  assert.equal(counts.task, 2);
  assert.equal(counts.other, 1);
});

test('normalizeIssueType: feature → story', () => {
  assert.equal(normalizeIssueType('feature'), 'story');
  assert.equal(normalizeIssueType('Story'), 'story');
  assert.equal(normalizeIssueType('bug'), 'bug');
  assert.equal(normalizeIssueType(''), 'task');
});

test('displayIssueKey dùng projectCode + 4 ký tự id', () => {
  assert.equal(displayIssueKey('HKT', '64f0abc12345'), 'HKT-2345');
  assert.equal(displayIssueKey('', 'xyz'), 'VH-0000');
});

test('mergeIssueWithOverlay bổ sung type/epic/estimate khi board DTO thiếu', () => {
  const overlay = buildIssueOverlay([
    { _id: 'a1', issueType: 'story', epicId: 'e1', estimateHours: 3 },
  ]);
  const merged = mergeIssueWithOverlay({ _id: 'a1', title: 'T1' }, overlay);
  assert.equal(merged.issueType, 'story');
  assert.equal(String(merged.epicId), 'e1');
  assert.equal(merged.estimateHours, 3);
  const keep = mergeIssueWithOverlay(
    { _id: 'a1', issueType: 'bug', title: 'T1' },
    overlay
  );
  assert.equal(keep.issueType, 'bug');
});

test('countIssuesByStatusBucket todo / progress / done', () => {
  const lists = [
    { _id: 'l1', statusKey: 'todo', title: 'To Do' },
    { _id: 'l2', statusKey: 'in_progress', title: 'In Progress' },
    { _id: 'l3', statusKey: 'done', title: 'Done' },
  ];
  const counts = countIssuesByStatusBucket(
    [
      { listId: 'l1' },
      { listId: 'l2' },
      { listId: 'l3' },
      { status: 'complete' },
    ],
    lists
  );
  assert.equal(counts.todo, 1);
  assert.equal(counts.progress, 1);
  assert.equal(counts.done, 2);
});

test('classifyListStatusBucket và dueDateTone', () => {
  assert.equal(classifyListStatusBucket('In Review'), 'progress');
  assert.equal(classifyListStatusBucket({ statusKey: 'done' }), 'done');
  const past = new Date(Date.now() - 86400000).toISOString();
  const soon = new Date(Date.now() + 3600000).toISOString();
  assert.equal(dueDateTone(past, 'todo'), 'overdue');
  assert.equal(dueDateTone(soon, 'todo'), 'soon');
  assert.equal(dueDateTone(past, 'done'), 'none');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeMessageRefs,
  contextCallTargetFromMessage,
  previewCacheKey,
} from './chatContextRefs.js';

test('normalizeMessageRefs keeps task/CR and drops unknown kind', () => {
  const refs = normalizeMessageRefs({
    refs: [
      { kind: 'task', id: 'a1', projectId: 'p1', label: 'HKT-A1B2' },
      { kind: 'sprint', id: 's1', projectId: 'p1' },
      { kind: 'change_request', id: 'c1', projectId: 'p1' },
    ],
  });
  assert.equal(refs.length, 2);
  assert.equal(refs[0].kind, 'task');
  assert.equal(refs[1].kind, 'change_request');
});

test('contextCallTargetFromMessage reads visibility project', () => {
  const t = contextCallTargetFromMessage({
    visibility: { mode: 'project_intersection', projectId: 'p1', projectName: 'Alpha' },
  });
  assert.equal(t.kind, 'project');
  assert.equal(t.projectId, 'p1');
  assert.equal(t.label, 'Alpha');
  assert.equal(contextCallTargetFromMessage({}), null);
});

test('previewCacheKey is stable', () => {
  assert.equal(
    previewCacheKey({ projectId: 'p1', kind: 'task', id: 'w1' }),
    'p1:task:w1'
  );
});

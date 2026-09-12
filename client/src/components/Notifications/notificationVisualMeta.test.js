import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getPrimaryFilterVisual,
  getTypeFilterVisual,
  resolveNotificationVisual,
} from './notificationVisualMeta.js';

describe('notificationVisualMeta', () => {
  it('primary tabs có icon + màu semantic khác nhau', () => {
    const needs = getPrimaryFilterVisual('needsAction');
    const all = getPrimaryFilterVisual('all');
    const unread = getPrimaryFilterVisual('unread');
    assert.notEqual(needs.accent, all.accent);
    assert.notEqual(unread.accent, needs.accent);
    assert.ok(needs.Icon);
    assert.ok(all.Icon);
    assert.ok(unread.Icon);
  });

  it('type filters map đúng ngữ cảnh', () => {
    assert.match(getTypeFilterVisual('mention').color, /destructive/);
    assert.match(getTypeFilterVisual('deadline').color, /error/);
    assert.match(getTypeFilterVisual('friend').color, /success/);
    assert.match(getTypeFilterVisual('meeting').color, /warning/);
    assert.match(getTypeFilterVisual('task').color, /primary/);
  });

  it('resolve item: DM message vs mention vs deadline', () => {
    const dm = resolveNotificationVisual({ type: 'message', rawType: 'message' });
    const mention = resolveNotificationVisual({
      type: 'mention',
      rawType: 'message',
      data: { kind: 'project_mention' },
    });
    const due = resolveNotificationVisual({
      type: 'deadline',
      rawType: 'system',
      data: { kind: 'task_overdue' },
    });
    assert.match(dm.color, /success/);
    assert.match(mention.color, /destructive/);
    assert.match(due.color, /error/);
  });
});

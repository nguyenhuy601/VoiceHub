import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAllowedPriority,
  normalizePriorityConfig,
  slugPriorityKey,
} from '../src/utils/priorityConfig.js';

test('normalizePriorityConfig: rỗng → default 4 mức', () => {
  const cfg = normalizePriorityConfig(null);
  assert.deepEqual(
    cfg.items.map((i) => i.key),
    ['low', 'medium', 'high', 'urgent']
  );
});

test('normalizePriorityConfig: bỏ key trùng / rỗng', () => {
  const cfg = normalizePriorityConfig({
    items: [
      { key: 'Low', label: 'Thấp' },
      { key: 'low', label: 'dup' },
      { key: '!!!', label: 'bad' },
      { key: 'blocker', label: 'Blocker', order: 9 },
    ],
  });
  assert.deepEqual(
    cfg.items.map((i) => i.key),
    ['low', 'blocker']
  );
  assert.equal(cfg.items[0].label, 'Thấp');
});

test('isAllowedPriority + slug', () => {
  assert.equal(slugPriorityKey('  High '), 'high');
  const cfg = normalizePriorityConfig({ items: [{ key: 'blocker', label: 'Blocker' }] });
  assert.equal(isAllowedPriority('blocker', cfg), true);
  assert.equal(isAllowedPriority('urgent', cfg), false);
});

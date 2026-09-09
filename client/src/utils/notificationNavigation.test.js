import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeAppPath, resolveNotificationAppPath } from './notificationNavigation.js';

describe('parseSafeAppPath', () => {
  it('giữ path /app kèm query, bỏ /tasks legacy', () => {
    assert.equal(
      parseSafeAppPath('/app/collaborate/projects/abc?boardId=b1'),
      '/app/collaborate/projects/abc?boardId=b1'
    );
    assert.equal(parseSafeAppPath('/tasks/xyz'), null);
    assert.equal(parseSafeAppPath('https://evil.example/app/me'), null);
  });
});

describe('resolveNotificationAppPath', () => {
  it('ưu tiên actionUrl rồi mới projectId', () => {
    assert.equal(
      resolveNotificationAppPath({
        actionUrl: '/app/collaborate/projects/p1',
        data: { projectId: 'p2' },
      }),
      '/app/collaborate/projects/p1'
    );
    assert.equal(
      resolveNotificationAppPath({
        data: { projectId: 'p9', organizationId: 'o1', boardId: 'b1' },
      }),
      '/app/collaborate/projects/p9?organizationId=o1&boardId=b1'
    );
  });
});

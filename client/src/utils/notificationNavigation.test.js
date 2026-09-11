import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSafeAppPath,
  resolveNotificationAppPath,
  normalizeLegacyAppPath,
} from './notificationNavigation.js';

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
  it('ưu tiên actionUrl rồi mới projectId; map collaborate → projects', () => {
    assert.equal(
      resolveNotificationAppPath({
        actionUrl: '/app/collaborate/projects/p1',
        data: { projectId: 'p2' },
      }),
      '/app/projects/p1/overview'
    );
    assert.equal(
      resolveNotificationAppPath({
        data: { projectId: 'p9', organizationId: 'o1', boardId: 'b1' },
      }),
      '/app/projects/p9/overview?organizationId=o1&boardId=b1'
    );
  });
});

describe('normalizeLegacyAppPath', () => {
  it('maps collaborate hub and legacy voice', () => {
    assert.equal(
      normalizeLegacyAppPath('/app/collaborate/projects/p1', '?boardId=b1'),
      '/app/projects/p1/overview?boardId=b1'
    );
    assert.equal(
      normalizeLegacyAppPath('/voice/room99', '?x=1'),
      '/app/communicate/voice/room99?x=1'
    );
  });
});

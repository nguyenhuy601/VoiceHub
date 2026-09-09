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
  });

  it('map legacy /chat /voice /documents /organizations và absolute /app', () => {
    assert.equal(
      parseSafeAppPath('/chat/friends?openDmUserId=u1'),
      '/app/communicate/chat/friends?openDmUserId=u1'
    );
    assert.equal(
      parseSafeAppPath('/voice/room1'),
      '/app/communicate/voice/room1'
    );
    assert.equal(
      parseSafeAppPath('/documents/doc1'),
      '/app/collaborate/documents/doc1'
    );
    assert.equal(
      parseSafeAppPath('https://voicehub.local/app/collaborate/documents?organizationId=o1'),
      '/app/collaborate/documents?organizationId=o1'
    );
    assert.equal(
      parseSafeAppPath('https://evil.example/app/me'),
      '/app/me'
    );
  });
});

describe('normalizeLegacyAppPath', () => {
  it('org settings → collaborate', () => {
    assert.equal(
      normalizeLegacyAppPath('/organizations/o1/settings', '?tab=join'),
      '/app/collaborate/organizations/o1/settings?tab=join'
    );
  });
});

describe('resolveNotificationAppPath', () => {
  it('ưu tiên actionUrl rồi mới projectId', () => {
    assert.equal(
      resolveNotificationAppPath({
        actionUrl: '/app/collaborate/projects/p1',
        data: { projectId: 'other' },
      }),
      '/app/collaborate/projects/p1'
    );
    assert.equal(
      resolveNotificationAppPath({
        data: { projectId: 'p2', organizationId: 'o1' },
      }),
      '/app/collaborate/projects/p2?organizationId=o1'
    );
  });

  it('project_mention fallback channel URL', () => {
    assert.equal(
      resolveNotificationAppPath({
        data: {
          kind: 'project_mention',
          organizationId: 'o1',
          roomId: 'r1',
        },
      }),
      '/app/collaborate/organizations/o1/channels?channelId=r1'
    );
  });
});

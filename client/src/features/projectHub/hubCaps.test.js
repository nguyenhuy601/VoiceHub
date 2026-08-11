import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveHubCapabilities } from './hubCaps.js';

test('ẩn Members khi matrix không có members:view / members:manage', () => {
  const caps = resolveHubCapabilities({
    capabilities: {
      canManageMembers: false,
      canViewMembers: false,
      canManageSettings: false,
      canManagePlanning: true,
      canManageSprints: false,
      permissions: ['project:view', 'files:view'],
    },
  });
  assert.equal(caps.canViewMembers, false);
  assert.equal(caps.canManageMembers, false);
});

test('suy ra canViewMembers từ permissions[] khi BE cũ chưa gửi flag', () => {
  const hidden = resolveHubCapabilities({
    capabilities: {
      canManageMembers: false,
      permissions: ['project:view', 'task:view'],
    },
  });
  assert.equal(hidden.canViewMembers, false);

  const visible = resolveHubCapabilities({
    capabilities: {
      canManageMembers: false,
      permissions: ['project:view', 'members:view'],
    },
  });
  assert.equal(visible.canViewMembers, true);
});

test('không có capabilities → giữ tab Members (legacy / đang load)', () => {
  const caps = resolveHubCapabilities(null, { canManageFallback: false });
  assert.equal(caps.canViewMembers, true);
});

test('PO permissions → epic/story, không task:create', () => {
  const caps = resolveHubCapabilities({
    capabilities: {
      canCreateEpic: true,
      canCreateStory: true,
      canCreateTask: false,
      canCreateBug: false,
      permissions: ['epic:create', 'story:create', 'backlog:prioritize', 'project:view'],
    },
  });
  assert.equal(caps.canCreateEpic, true);
  assert.equal(caps.canCreateStory, true);
  assert.equal(caps.canCreateTask, false);
  assert.deepEqual(caps.allowedIssueTypes, ['story']);
});

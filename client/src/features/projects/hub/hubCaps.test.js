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

test('không có capabilities → fail-closed; canManageFallback bật quyền xem', () => {
  const caps = resolveHubCapabilities(null, { canManageFallback: false });
  assert.equal(caps.canViewMembers, false);
  assert.equal(caps.canViewChangeRequests, false);

  const manage = resolveHubCapabilities(null, { canManageFallback: true });
  assert.equal(manage.canViewMembers, true);
  assert.equal(manage.canViewChangeRequests, true);
});

test('canViewChangeRequests từ change_request:view', () => {
  const hidden = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'task:view'],
    },
  });
  assert.equal(hidden.canViewChangeRequests, false);

  const visible = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'change_request:view'],
    },
  });
  assert.equal(visible.canViewChangeRequests, true);
});

test('canCreateChangeRequest / canUpdateChangeRequest từ change_request:create|update', () => {
  const viewOnly = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'change_request:view'],
    },
  });
  assert.equal(viewOnly.canViewChangeRequests, true);
  assert.equal(viewOnly.canCreateChangeRequest, false);
  assert.equal(viewOnly.canUpdateChangeRequest, false);
  assert.equal(viewOnly.canDeleteChangeRequest, false);

  const canCreate = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'change_request:view', 'change_request:create'],
    },
  });
  assert.equal(canCreate.canCreateChangeRequest, true);
  assert.equal(canCreate.canUpdateChangeRequest, false);

  const canUpdate = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'change_request:update'],
    },
  });
  assert.equal(canUpdate.canUpdateChangeRequest, true);
  assert.equal(canUpdate.canCreateChangeRequest, false);

  const canDelete = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'change_request:delete'],
    },
  });
  assert.equal(canDelete.canDeleteChangeRequest, true);
  assert.equal(canDelete.canUpdateChangeRequest, false);
});

test('legacy không capabilities → canCreate/canUpdate CR theo canManageFallback', () => {
  const noManage = resolveHubCapabilities(null, { canManageFallback: false });
  assert.equal(noManage.canCreateChangeRequest, false);
  assert.equal(noManage.canUpdateChangeRequest, false);
  assert.equal(noManage.canDeleteChangeRequest, false);

  const manage = resolveHubCapabilities(null, { canManageFallback: true });
  assert.equal(manage.canCreateChangeRequest, true);
  assert.equal(manage.canUpdateChangeRequest, true);
  assert.equal(manage.canDeleteChangeRequest, true);
});

test('canDeleteSprint từ sprint:delete, không gộp với canManageSprints', () => {
  const noDelete = resolveHubCapabilities({
    capabilities: {
      canManageSprints: true,
      canDeleteSprint: false,
      permissions: ['sprint:create', 'sprint:close'],
    },
  });
  assert.equal(noDelete.canManageSprints, true);
  assert.equal(noDelete.canDeleteSprint, false);

  const flagFalseButPerm = resolveHubCapabilities({
    capabilities: {
      canManageSprints: true,
      canDeleteSprint: false,
      permissions: ['sprint:delete'],
    },
  });
  assert.equal(flagFalseButPerm.canDeleteSprint, true);

  const canDelete = resolveHubCapabilities({
    capabilities: {
      canManageSprints: true,
      permissions: ['sprint:delete'],
    },
  });
  assert.equal(canDelete.canDeleteSprint, true);
});

test('status closed → Hub read-only, giữ view', () => {
  const caps = resolveHubCapabilities({
    status: 'closed',
    capabilities: {
      canManagePlanning: true,
      canManageSprints: true,
      canCreateTask: true,
      canCreateChangeRequest: true,
      canViewMembers: true,
      canViewChangeRequests: true,
      canManageBoard: true,
      permissions: ['task:create', 'sprint:close', 'change_request:create', 'members:view', 'project:archive'],
    },
  });
  assert.equal(caps.readOnly, true);
  assert.equal(caps.canCreateTask, false);
  assert.equal(caps.canManageSprints, false);
  assert.equal(caps.canCreateChangeRequest, false);
  assert.equal(caps.canCompleteProject, false);
  assert.equal(caps.canViewMembers, true);
  assert.equal(caps.canViewChangeRequests, true);
  assert.deepEqual(caps.allowedIssueTypes, []);
});

test('canCompleteProject từ project:archive / project:edit / canManageBoard', () => {
  const noPerm = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'task:view'],
    },
  });
  assert.equal(noPerm.canCompleteProject, false);

  const archive = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'project:archive'],
    },
  });
  assert.equal(archive.canCompleteProject, true);

  const edit = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'project:edit'],
    },
  });
  assert.equal(edit.canCompleteProject, true);

  const boardFlag = resolveHubCapabilities({
    capabilities: {
      canManageBoard: true,
      permissions: ['project:view'],
    },
  });
  assert.equal(boardFlag.canCompleteProject, true);
});

test('legacy không capabilities → canCompleteProject theo canManageFallback', () => {
  const noManage = resolveHubCapabilities(null, { canManageFallback: false });
  assert.equal(noManage.canCompleteProject, false);

  const manage = resolveHubCapabilities(null, { canManageFallback: true });
  assert.equal(manage.canCompleteProject, true);
});

test('canManageDelivery từ delivery:manage; tắt khi project closed', () => {
  const noPerm = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'settings:update'],
    },
  });
  assert.equal(noPerm.canManageDelivery, false);

  const withPerm = resolveHubCapabilities({
    capabilities: {
      permissions: ['project:view', 'delivery:manage'],
    },
  });
  assert.equal(withPerm.canManageDelivery, true);

  const closed = resolveHubCapabilities({
    status: 'closed',
    capabilities: {
      permissions: ['delivery:manage', 'project:view'],
    },
  });
  assert.equal(closed.readOnly, true);
  assert.equal(closed.canManageDelivery, false);
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

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildRoleRemovedNotification,
  notifyRoleRemoved,
} = require('../src/clients/notification.client');

describe('buildRoleRemovedNotification', () => {
  it('báo user bị gỡ role với type system', () => {
    const payload = buildRoleRemovedNotification({
      userId: 'u1',
      roleName: 'Manager',
      serverId: 's1',
      serverName: 'Acme',
      removedBy: null,
      organizationId: 'o1',
    });
    assert.deepEqual(payload, {
      userIds: ['u1'],
      type: 'system',
      title: 'Role Removed',
      content: "The role 'Manager' has been removed from you in Acme",
      data: {
        roleName: 'Manager',
        serverId: 's1',
        serverName: 'Acme',
        removedBy: null,
        organizationId: 'o1',
      },
      actionUrl: '/servers/s1/roles',
    });
  });

  it('fallback Role / Server khi thiếu tên', () => {
    const payload = buildRoleRemovedNotification({ userId: 'u1', serverId: 's1' });
    assert.equal(payload.content, "The role 'Role' has been removed from you in Server");
    assert.equal(payload.data.organizationId, null);
  });

  it('trả null khi thiếu userId', () => {
    assert.equal(buildRoleRemovedNotification({ roleName: 'Manager' }), null);
  });
});

describe('notifyRoleRemoved', () => {
  it('trả false thay vì throw khi chưa cấu hình notification-service', async () => {
    const sent = await notifyRoleRemoved({
      userId: 'u1',
      roleName: 'Manager',
      serverId: 's1',
      serverName: 'Acme',
    });
    assert.equal(sent, false);
  });
});

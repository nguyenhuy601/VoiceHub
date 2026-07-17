const test = require('node:test');
const assert = require('node:assert/strict');

const Role = require('../src/models/Role');

test('Role schema accepts fine-grained permission actions', async () => {
  const role = new Role({
    name: '__test_fine_grained__',
    serverId: '507f1f77bcf86cd799439011',
    organizationId: '507f1f77bcf86cd799439011',
    permissions: [
      {
        resource: 'channel',
        actions: ['view', 'create', 'delete_message', 'pin_message'],
      },
      {
        resource: 'voice',
        actions: ['create_room', 'manage_room', 'kick', 'mute'],
      },
      {
        resource: 'meeting',
        actions: ['create', 'view_recording', 'view_ai_summary'],
      },
    ],
  });

  const err = role.validateSync();
  assert.equal(err, undefined);
});

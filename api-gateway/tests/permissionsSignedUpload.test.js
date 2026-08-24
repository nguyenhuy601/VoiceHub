const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyPermissionRoute, isNoPermissionRoute } = require('../src/config/permissions');

describe('signed-upload gateway permission', () => {
  it('task attachment upload không yêu cầu chat:write tại gateway', () => {
    assert.equal(isNoPermissionRoute('/api/messages/storage/signed-upload'), true);
    assert.equal(isNoPermissionRoute('/api/chat/messages/storage/signed-upload'), true);
    assert.equal(isNoPermissionRoute('/api/messages/storage/upload'), true);
    assert.equal(isNoPermissionRoute('/api/chat/messages/storage/upload'), true);
    assert.equal(classifyPermissionRoute('POST', '/api/messages/storage/signed-upload'), 'no_permission');
    assert.equal(isNoPermissionRoute('/api/messages/storage/object'), true);
    assert.equal(isNoPermissionRoute('/api/chat/messages/storage/object'), true);
    assert.equal(classifyPermissionRoute('GET', '/api/messages/storage/object'), 'no_permission');
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyPermissionRoute } = require('../src/config/permissions');

describe('gateway admin bypass routes', () => {
  it('T1: classifies /api/users/admin as admin_bypass', () => {
    assert.equal(classifyPermissionRoute('GET', '/api/users/admin/u123'), 'admin_bypass');
    assert.equal(classifyPermissionRoute('PATCH', '/api/users/admin/u123'), 'admin_bypass');
  });

  it('also bypasses auth admin endpoints', () => {
    assert.equal(
      classifyPermissionRoute('POST', '/api/auth/admin/users/u123/lock'),
      'admin_bypass'
    );
  });
});

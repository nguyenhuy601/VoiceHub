const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classifyPermissionRoute } = require('../src/config/permissions');

describe('gateway admin bypass routes', () => {
  it('removed /api/users/admin alias is not admin_bypass', () => {
    assert.notEqual(classifyPermissionRoute('GET', '/api/users/admin/u123'), 'admin_bypass');
    assert.notEqual(classifyPermissionRoute('PATCH', '/api/users/admin/u123'), 'admin_bypass');
  });

  it('canonical PATCH /api/users/:id is mapped (user-service actor-auth)', () => {
    assert.notEqual(classifyPermissionRoute('PATCH', '/api/users/u123'), 'unmapped');
    assert.equal(classifyPermissionRoute('GET', '/api/users/u123'), 'action');
  });

  it('removed /api/auth/admin alias is not admin_bypass', () => {
    assert.notEqual(
      classifyPermissionRoute('POST', '/api/auth/admin/users/u123/lock'),
      'admin_bypass'
    );
  });

  it('canonical /api/auth/users/:id actions bypass (auth-service companyAdminAuth)', () => {
    assert.equal(
      classifyPermissionRoute('GET', '/api/auth/users/u123/summary'),
      'admin_bypass'
    );
    assert.equal(
      classifyPermissionRoute('POST', '/api/auth/users/u123/lock'),
      'admin_bypass'
    );
  });

  it('does not treat login/me as admin_bypass', () => {
    assert.notEqual(classifyPermissionRoute('POST', '/api/auth/login'), 'admin_bypass');
    assert.notEqual(classifyPermissionRoute('GET', '/api/auth/me'), 'admin_bypass');
  });

  it('project role catalog CRUD is task_bypass not /admin prefix', () => {
    assert.equal(classifyPermissionRoute('GET', '/api/projects/roles'), 'task_bypass');
    assert.notEqual(classifyPermissionRoute('GET', '/api/projects/admin/roles'), 'admin_bypass');
  });
});

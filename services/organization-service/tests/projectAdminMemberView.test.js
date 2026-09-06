/**
 * Wave P — projectAdminMemberView allowlist.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeView,
  projectMemberForView,
  projectMembersForView,
} = require('../src/services/projectAdminMemberView');

function fatMember() {
  return {
    _id: 'mem1',
    organization: 'org1',
    user: { _id: 'u1', passwordHash: 'secret', email: 'x@y.com' },
    role: 'hr',
    permissions: ['a', 'b', 'c'],
    joinedAt: '2020-01-01',
    __v: 0,
    userId: 'u1',
    email: 'x@y.com',
    displayName: 'X Y',
    employeeCode: 'VH-001',
    username: 'xy',
    avatar: null,
    jobTitle: 'QA',
    isActive: true,
    mustChangePassword: false,
    isLocked: false,
    lastLoginAt: '2026-01-01T00:00:00.000Z',
    systemRole: 'employee',
    capabilityStatus: 'verified',
    departmentId: 'd1',
    departmentName: 'Eng',
    teamId: 't1',
    team: 't1',
    department: 'd1',
    rbacRoles: [
      { _id: 'r1', name: 'Developer', role: { name: 'Developer', permissions: ['*'] }, extra: true },
    ],
  };
}

describe('projectAdminMemberView', () => {
  it('normalizeView only accepts directory|admin_table', () => {
    assert.equal(normalizeView('directory'), 'directory');
    assert.equal(normalizeView('admin_table'), 'admin_table');
    assert.equal(normalizeView(''), '');
    assert.equal(normalizeView('other'), '');
  });

  it('no view / empty view returns original member reference shape keys', () => {
    const src = fatMember();
    const out = projectMemberForView(src, '');
    assert.equal(out, src);
    assert.ok(out.passwordHash === undefined);
    assert.ok(out.user?.passwordHash === 'secret');
    assert.ok(out.permissions);
  });

  it('directory allowlist drops nested user / membership junk and rbacRoles', () => {
    const out = projectMemberForView(fatMember(), 'directory');
    assert.equal(out.userId, 'u1');
    assert.equal(out.displayName, 'X Y');
    assert.equal(out.role, 'hr');
    assert.equal(out.departmentId, 'd1');
    assert.equal(out.departmentName, 'Eng');
    assert.equal(out.teamId, 't1');
    assert.equal(out.capabilityStatus, 'verified');
    assert.equal(out.rbacRoles, undefined);
    assert.equal(out.user, undefined);
    assert.equal(out.permissions, undefined);
    assert.equal(out._id, undefined);
    assert.equal(out.organization, undefined);
  });

  it('admin_table includes slim rbacRoles', () => {
    const out = projectMemberForView(fatMember(), 'admin_table');
    assert.ok(Array.isArray(out.rbacRoles));
    assert.equal(out.rbacRoles.length, 1);
    assert.equal(out.rbacRoles[0].name, 'Developer');
    assert.equal(out.rbacRoles[0]._id, 'r1');
    assert.equal(out.rbacRoles[0].extra, undefined);
    assert.equal(out.rbacRoles[0].role?.name, 'Developer');
    assert.equal(out.rbacRoles[0].role?.permissions, undefined);
    assert.equal(out.user, undefined);
  });

  it('projectMembersForView no-ops without view', () => {
    const list = [fatMember()];
    const out = projectMembersForView(list, '');
    assert.equal(out, list);
  });
});

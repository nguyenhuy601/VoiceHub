/**
 * Wave P / Wave 1 — projectAdminMemberView allowlist.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeView,
  projectMemberForView,
  projectMembersForView,
  VIEW_ADMIN_TABLE,
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

  it('directory omits auth flags (mustChangePassword, isLocked, lastLoginAt, systemRole)', () => {
    const out = projectMemberForView(fatMember(), 'directory');
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'mustChangePassword'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'isLocked'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'lastLoginAt'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'systemRole'), false);
    assert.equal(out.mustChangePassword, undefined);
    assert.equal(out.isLocked, undefined);
    assert.equal(out.lastLoginAt, undefined);
    assert.equal(out.systemRole, undefined);
    assert.equal(out.isActive, true);
  });

  it('admin_table includes slim rbacRoles and auth flags', () => {
    const out = projectMemberForView(fatMember(), 'admin_table');
    assert.ok(Array.isArray(out.rbacRoles));
    assert.equal(out.rbacRoles.length, 1);
    assert.equal(out.rbacRoles[0].name, 'Developer');
    assert.equal(out.rbacRoles[0]._id, 'r1');
    assert.equal(out.rbacRoles[0].extra, undefined);
    assert.equal(out.rbacRoles[0].role?.name, 'Developer');
    assert.equal(out.rbacRoles[0].role?.permissions, undefined);
    assert.equal(out.user, undefined);
    assert.equal(out.mustChangePassword, false);
    assert.equal(out.isLocked, false);
    assert.equal(out.lastLoginAt, '2026-01-01T00:00:00.000Z');
    assert.equal(out.systemRole, 'employee');
    assert.equal(out.capabilityStatus, 'verified');
  });

  it('controller no-view path: projectMembersForView(..., admin_table) keeps flags', () => {
    const list = [fatMember()];
    const out = projectMembersForView(list, VIEW_ADMIN_TABLE);
    assert.equal(out.length, 1);
    assert.equal(out[0].mustChangePassword, false);
    assert.equal(out[0].isLocked, false);
    assert.ok(Array.isArray(out[0].rbacRoles));
    assert.equal(out[0].user, undefined);
    assert.equal(out[0].permissions, undefined);
  });

  it('projectMembersForView no-ops without view', () => {
    const list = [fatMember()];
    const out = projectMembersForView(list, '');
    assert.equal(out, list);
  });

  it('directory list never leaks auth flags across members', () => {
    const out = projectMembersForView([fatMember(), fatMember()], 'directory');
    for (const row of out) {
      assert.equal(row.mustChangePassword, undefined);
      assert.equal(row.isLocked, undefined);
      assert.equal(row.lastLoginAt, undefined);
      assert.equal(row.systemRole, undefined);
      assert.equal(row.rbacRoles, undefined);
    }
  });

  it('directory + restrictContact: masks email, omits employeeCode/isActive', () => {
    const out = projectMemberForView(fatMember(), 'directory', { restrictContact: true });
    assert.equal(out.email, 'x***@y.com');
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'employeeCode'), false);
    assert.equal(Object.prototype.hasOwnProperty.call(out, 'isActive'), false);
    assert.equal(out.displayName, 'X Y');
    assert.equal(out.userId, 'u1');
    assert.equal(out.departmentId, 'd1');
  });

  it('directory + restrictContact keeps null email as null', () => {
    const out = projectMemberForView({ ...fatMember(), email: null }, 'directory', { restrictContact: true });
    assert.equal(out.email, null);
  });

  it('directory without restrictContact is unchanged (admin directory)', () => {
    const plain = projectMemberForView(fatMember(), 'directory');
    const explicit = projectMemberForView(fatMember(), 'directory', { restrictContact: false });
    assert.deepEqual(explicit, plain);
    assert.equal(plain.email, 'x@y.com');
    assert.equal(plain.employeeCode, 'VH-001');
  });

  it('restrictContact is ignored for admin_table', () => {
    const out = projectMemberForView(fatMember(), 'admin_table', { restrictContact: true });
    assert.equal(out.email, 'x@y.com');
    assert.equal(out.employeeCode, 'VH-001');
    assert.equal(out.isActive, true);
  });

  it('projectMembersForView forwards restrictContact to every row', () => {
    const out = projectMembersForView([fatMember(), fatMember()], 'directory', { restrictContact: true });
    for (const row of out) {
      assert.equal(row.email, 'x***@y.com');
      assert.equal(row.employeeCode, undefined);
    }
  });

  it('memberController no longer leaks invite secret config in responses', () => {
    const src = require('node:fs').readFileSync(
      require.resolve('../src/controllers/memberController'),
      'utf8'
    );
    assert.equal(src.includes('INVITE_LINK_SECRET is not configured'), false);
    assert.ok(src.includes("'ORG_INVITE_LINK_UNAVAILABLE'"));
    assert.ok(src.includes('projectMembersForView(withPlacement, view, { restrictContact })'));
  });
});

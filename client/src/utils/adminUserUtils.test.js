import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRbacRoleLabels,
  memberIsUnplaced,
  memberIsWithoutRbacRole,
  memberMatchesQuery,
  normalizeSearchText,
} from './adminUserUtils.js';
import {
  TIER_EXEC,
  TIER_DEPARTMENT,
  TIER_TEAM,
  TIER_EMPLOYEE,
  groupRolesByTier,
  groupRolesByPriority,
  moveRoleInColumns,
  prioritiesFromColumns,
} from '../components/Organization/roleRbacUtils.js';

test('normalizeSearchText strips Vietnamese accents', () => {
  assert.equal(normalizeSearchText('Trần Lan'), 'tran lan');
});

test('memberMatchesQuery finds by email local and accent-free name', () => {
  const m = {
    displayName: 'Trần Lan',
    email: 'tl.pa@voicehub.local',
    username: 'tranlan',
    role: 'member',
    userId: 'abc123',
  };
  assert.equal(memberMatchesQuery(m, 'Lan'), true);
  assert.equal(memberMatchesQuery(m, 'tl.pa'), true);
  assert.equal(memberMatchesQuery(m, 'tranlan'), true);
  assert.equal(memberMatchesQuery(m, 'zzz'), false);
});

test('memberIsUnplaced requires empty department and team', () => {
  assert.equal(memberIsUnplaced({}), true);
  assert.equal(memberIsUnplaced({ departmentId: '', teamId: '' }), true);
  assert.equal(memberIsUnplaced({ departmentId: 'd1' }), false);
  assert.equal(memberIsUnplaced({ teamId: 't1' }), false);
  assert.equal(memberIsUnplaced({ department: 'd1', team: 't1' }), false);
});

test('memberIsWithoutRbacRole uses assignment map or rbac fields', () => {
  const m = { userId: 'u1' };
  assert.equal(memberIsWithoutRbacRole(m), false);
  assert.equal(memberIsWithoutRbacRole(m, { u1: [] }), true);
  assert.equal(memberIsWithoutRbacRole(m, { u1: [{ _id: 'r1' }] }), false);
  assert.equal(memberIsWithoutRbacRole(m, {}), false);
  assert.equal(memberIsWithoutRbacRole({ userId: 'u2', rbacRoles: [] }), true);
  assert.equal(memberIsWithoutRbacRole({ userId: 'u3', rbacRoleIds: ['r1'] }), false);
});

test('formatRbacRoleLabels maps role names', () => {
  assert.deepEqual(formatRbacRoleLabels([{ name: 'Thành viên' }, { role: { name: 'HR' } }]), [
    'Thành viên',
    'HR',
  ]);
  assert.deepEqual(formatRbacRoleLabels([]), []);
});

test('moveRoleInColumns and prioritiesFromColumns update hierarchy', () => {
  const roles = [
    { _id: 'a', name: 'Quản trị viên', priority: 200 },
    { _id: 'b', name: 'Custom', priority: 20 },
  ];
  const cols = groupRolesByTier(roles);
  assert.ok((cols[TIER_EXEC] || []).some((r) => r.id === 'a'));
  const next = moveRoleInColumns(cols, 'b', TIER_EXEC);
  assert.ok(next);
  assert.ok((next[TIER_EXEC] || []).some((r) => r.id === 'b'));
  assert.ok(!(next[TIER_TEAM] || []).some((r) => r.id === 'b'));
  const updates = prioritiesFromColumns(next);
  const bUpdate = updates.find((u) => u.id === 'b');
  assert.ok(bUpdate);
  assert.ok(Number(bUpdate.priority) >= 200);
});

test('Thành viên maps to Nhân viên (lowest tier)', () => {
  const cols = groupRolesByTier([{ _id: 'm', name: 'Thành viên', priority: 20 }]);
  assert.ok((cols[TIER_EMPLOYEE] || []).some((r) => r.id === 'm'));
  assert.ok(!(cols[TIER_TEAM] || []).some((r) => r.id === 'm'));
});

test('groupRolesByPriority follows priority not role name', () => {
  const cols = groupRolesByPriority([
    { _id: 'hr', name: 'Nhân sự', priority: 5 },
    { _id: 'admin', name: 'Quản trị viên', priority: 80 },
  ]);
  assert.ok((cols[TIER_EMPLOYEE] || []).some((r) => r.id === 'hr'));
  assert.ok((cols[TIER_DEPARTMENT] || []).some((r) => r.id === 'admin'));
  assert.ok(!(cols[TIER_EXEC] || []).some((r) => r.id === 'hr'));
});

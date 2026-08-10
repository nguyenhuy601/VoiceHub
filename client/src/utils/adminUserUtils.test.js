import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  compareMembersForAdminList,
  formatRbacRoleLabels,
  memberEmployeeCode,
  memberNeedsOnboardingAssignment,
  memberIsUnplaced,
  memberEligibleForDeptHead,
  memberDisplayName,
  memberLabelById,
  memberDepartmentId,
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

test('memberLabelById resolves map or falls back to userId', () => {
  const map = new Map([['u1', { displayName: 'Lan', userId: 'u1' }]]);
  assert.equal(memberLabelById(map, 'u1'), 'Lan');
  assert.equal(memberLabelById(map, 'missing', 'fallback'), 'fallback');
  assert.equal(memberLabelById(null, '', '—'), '—');
});

test('memberMatchesQuery finds by email local and accent-free name', () => {
  const m = {
    displayName: 'Trần Lan',
    email: 'tl.pa@voicehub.local',
    username: 'tranlan',
    role: 'member',
    userId: 'abc123',
    employeeCode: 'VH-012',
  };
  assert.equal(memberMatchesQuery(m, 'Lan'), true);
  assert.equal(memberMatchesQuery(m, 'tl.pa'), true);
  assert.equal(memberMatchesQuery(m, 'tranlan'), true);
  assert.equal(memberMatchesQuery(m, 'vh-012'), true);
  assert.equal(memberMatchesQuery(m, 'zzz'), false);

test('memberNeedsOnboardingAssignment khi thiếu phòng ban hoặc RBAC', () => {
  const rbac = { u1: [], u2: [{ name: 'Member' }] };

  assert.equal(
    memberNeedsOnboardingAssignment(
      { userId: 'u1', role: 'member', departmentId: 'd1' },
      rbac
    ),
    true
  );
  assert.equal(
    memberNeedsOnboardingAssignment(
      { userId: 'u2', role: 'member', departmentId: '' },
      rbac
    ),
    true
  );
  assert.equal(
    memberNeedsOnboardingAssignment(
      { userId: 'u2', role: 'member', departmentId: 'd1' },
      rbac
    ),
    false
  );
  assert.equal(
    memberNeedsOnboardingAssignment(
      { userId: 'u3', role: 'admin', departmentId: '' },
      rbac
    ),
    false
  );
});

test('compareMembersForAdminList sorts name A–Z and employeeCode numeric with blanks last', () => {
  const an = { displayName: 'An', employeeCode: 'VH-010', email: 'an@x.com' };
  const binh = { displayName: 'Bình', employeeCode: 'VH-002', email: 'b@x.com' };
  const cuong = { displayName: 'Cường', employeeCode: '', email: 'c@x.com' };
  const nameAsc = [cuong, binh, an].sort((a, b) => compareMembersForAdminList(a, b, 'name', 'asc'));
  assert.deepEqual(
    nameAsc.map((m) => m.displayName),
    ['An', 'Bình', 'Cường']
  );
  const codeAsc = [an, cuong, binh].sort((a, b) =>
    compareMembersForAdminList(a, b, 'employeeCode', 'asc')
  );
  assert.deepEqual(
    codeAsc.map((m) => memberEmployeeCode(m) || '—'),
    ['VH-002', 'VH-010', '—']
  );
  const codeDesc = [an, cuong, binh].sort((a, b) =>
    compareMembersForAdminList(a, b, 'employeeCode', 'desc')
  );
  assert.equal(memberEmployeeCode(codeDesc[0]), 'VH-010');
  assert.equal(memberEmployeeCode(codeDesc[codeDesc.length - 1]), '');
});

test('memberIsUnplaced true khi chưa gán phòng ban và team', () => {
  assert.equal(memberIsUnplaced({ departmentId: '', teamId: '' }), true);
  assert.equal(memberIsUnplaced({ departmentId: 'd1' }), false);
});

test('memberEligibleForDeptHead: đã có phòng ban và chưa là head', () => {
  const heads = new Set(['h1']);
  assert.equal(
    memberEligibleForDeptHead({ userId: 'u1', departmentId: 'd1' }, { headUserIds: heads }),
    true
  );
  assert.equal(
    memberEligibleForDeptHead({ userId: 'u1', departmentId: '' }, { headUserIds: heads }),
    false
  );
  assert.equal(
    memberEligibleForDeptHead({ userId: 'h1', departmentId: 'd1' }, { headUserIds: heads }),
    false
  );
  assert.equal(
    memberEligibleForDeptHead(
      { userId: 'u1', departmentId: 'd2' },
      { headUserIds: heads, departmentId: 'd1' }
    ),
    false
  );
  assert.equal(
    memberEligibleForDeptHead(
      { userId: 'u1', departmentId: 'd1' },
      { headUserIds: heads, departmentId: 'd1' }
    ),
    true
  );
});

test('memberDepartmentId unwrap object department', () => {
  assert.equal(memberDepartmentId({ department: { _id: 'd1', name: 'BE' } }), 'd1');
  assert.equal(memberDepartmentId({ departmentId: 'd2' }), 'd2');
});

test('memberDisplayName đọc profile lồng user.*', () => {
  assert.equal(
    memberDisplayName({ user: { fullName: 'Phạm Minh', _id: 'u1' } }),
    'Phạm Minh'
  );
  const map = new Map([['u2', { displayName: 'Lan', userId: 'u2' }]]);
  assert.equal(memberLabelById(map, 'u2'), 'Lan');
  assert.equal(memberLabelById(map, 'abc123xyz'), '123xyz');
});

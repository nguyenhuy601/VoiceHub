import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  memberNeedsOnboardingAssignment,
  memberIsUnplaced,
  memberEligibleForDeptHead,
  memberDisplayName,
  memberLabelById,
  memberDepartmentId,
} from './adminUserUtils.js';

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

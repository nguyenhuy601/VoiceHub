import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slotsToSeedMembers, intakeSlotsFromSeedMembers, mergeRoleSuggestItems } from './projectWizardIntakeRoles.js';

test('T3 kiêm nhiệm 1 user 2 roles → 1 row 2 keys', () => {
  const members = slotsToSeedMembers({
    product_owner: { userId: 'u1', displayName: 'Lan' },
    project_manager: { userId: 'u1', displayName: 'Lan' },
    business_analyst: { userId: 'u2', displayName: 'Hà' },
  });
  assert.equal(members.length, 2);
  const dual = members.find((m) => m.userId === 'u1');
  assert.ok(dual);
  assert.deepEqual(dual.projectRoleKeys.sort(), ['product_owner', 'project_manager']);
  assert.equal(dual.displayName, 'Lan');
});

test('T3 đủ 3 user khác nhau → 3 rows', () => {
  const members = slotsToSeedMembers({
    product_owner: { userId: 'a' },
    project_manager: { userId: 'b' },
    business_analyst: { userId: 'c' },
  });
  assert.equal(members.length, 3);
});

test('T3 round-trip seed → slots giữ 3 cột', () => {
  const slots = intakeSlotsFromSeedMembers([
    { userId: 'u1', projectRoleKeys: ['product_owner', 'project_manager'], displayName: 'Lan' },
    { userId: 'u2', projectRoleKeys: ['business_analyst'], displayName: 'Hà' },
  ]);
  assert.equal(slots.product_owner.userId, 'u1');
  assert.equal(slots.project_manager.userId, 'u1');
  assert.equal(slots.business_analyst.userId, 'u2');
});

test('T3 merge append trùng userId không nhân đôi', () => {
  const merged = mergeRoleSuggestItems(
    [{ userId: 'u1', displayName: 'A' }, { userId: 'u2', displayName: 'B' }],
    [{ userId: 'u2', displayName: 'B-dup' }, { userId: 'u3', displayName: 'C' }]
  );
  assert.equal(merged.length, 3);
  assert.deepEqual(
    merged.map((r) => r.userId),
    ['u1', 'u2', 'u3']
  );
  assert.equal(merged[1].displayName, 'B');
});

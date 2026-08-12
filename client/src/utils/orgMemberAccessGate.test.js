import assert from 'node:assert/strict';
import test from 'node:test';
import { isOrgMemberAccessIncomplete } from './orgMemberAccessGate.js';

test('elevated roles always complete', () => {
  assert.equal(isOrgMemberAccessIncomplete('owner', {}), false);
  assert.equal(isOrgMemberAccessIncomplete('admin', {}), false);
  assert.equal(isOrgMemberAccessIncomplete('hr', {}), false);
});

test('member without placement is incomplete', () => {
  assert.equal(isOrgMemberAccessIncomplete('member', {}), true);
  assert.equal(
    isOrgMemberAccessIncomplete('member', {
      canSeeAllStructure: false,
      departmentId: null,
      teamId: null,
      scopedDepartmentIds: [],
      scopedTeamIds: [],
    }),
    true
  );
});

test('member with department or team is complete', () => {
  assert.equal(isOrgMemberAccessIncomplete('member', { departmentId: 'd1' }), false);
  assert.equal(isOrgMemberAccessIncomplete('member', { teamId: 't1' }), false);
  assert.equal(
    isOrgMemberAccessIncomplete('member', { scopedDepartmentIds: ['d1'] }),
    false
  );
  assert.equal(isOrgMemberAccessIncomplete('member', { scopedTeamIds: ['t1'] }), false);
});

test('canSeeAllStructure bypasses gate', () => {
  assert.equal(
    isOrgMemberAccessIncomplete('member', { canSeeAllStructure: true }),
    false
  );
});

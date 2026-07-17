import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  getMyAssignedDepartmentIds,
  getMyAssignedTeamIds,
  hasMyOrgStructureAssignment,
  resolveMyMeetingNotifyUnits,
} from './orgMemberStructureScope.js';

test('resolveMyMeetingNotifyUnits chỉ trả phòng ban / team user được gán', () => {
  const structureSummary = {
    branches: [
      {
        divisions: [
          {
            departments: [
              { _id: 'd1', name: 'Dev', teams: [{ _id: 't1', name: 'Team Dev' }] },
              { _id: 'd2', name: 'Sale', teams: [{ _id: 't2', name: 'Team Sale' }] },
            ],
          },
        ],
      },
    ],
  };

  const result = resolveMyMeetingNotifyUnits({
    structureSummary,
    membershipScope: {
      departmentId: 'd1',
      teamId: 't1',
      scopedDepartmentIds: [],
      scopedTeamIds: ['t1'],
    },
  });

  assert.equal(result.departments.length, 1);
  assert.equal(result.departments[0]._id, 'd1');
  assert.equal(result.teams.length, 1);
  assert.equal(result.teams[0]._id, 't1');
  assert.equal(result.hasAnyAssignment, true);
});

test('hasMyOrgStructureAssignment false khi chưa gán phòng ban hoặc team', () => {
  assert.equal(hasMyOrgStructureAssignment(null), false);
  assert.equal(
    hasMyOrgStructureAssignment({ departmentId: null, teamId: null, scopedDepartmentIds: [], scopedTeamIds: [] }),
    false
  );
  assert.equal(getMyAssignedDepartmentIds({ departmentId: 'd1' }).join(','), 'd1');
  assert.equal(getMyAssignedTeamIds({ teamId: 't1', scopedTeamIds: ['t2'] }).sort().join(','), 't1,t2');
});

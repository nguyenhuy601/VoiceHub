const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  shouldGrantDefaultMemberOrgChannelAccess,
} = require('../src/utils/defaultMemberOrgChannelAccess');

describe('shouldGrantDefaultMemberOrgChannelAccess', () => {
  const visibility = {
    mode: 'team',
    divisionIds: new Set(),
    departmentIds: new Set(['dept1']),
    teamIds: new Set(['team-be1']),
  };
  const teamDept = new Map([['team-be1', 'dept1']]);

  it('grants team #general when user is on that team', () => {
    assert.equal(
      shouldGrantDefaultMemberOrgChannelAccess(
        { department: 'dept1', team: 'team-be1', type: 'chat', name: 'general' },
        visibility,
        teamDept
      ),
      true
    );
  });

  it('denies another team channel', () => {
    assert.equal(
      shouldGrantDefaultMemberOrgChannelAccess(
        { department: 'dept1', team: 'team-be2', type: 'chat', name: 'general' },
        visibility,
        teamDept
      ),
      false
    );
  });

  it('grants department-only channel when user is in that department', () => {
    assert.equal(
      shouldGrantDefaultMemberOrgChannelAccess(
        { department: 'dept1', team: null, type: 'announcement', name: 'announcements' },
        visibility,
        teamDept
      ),
      true
    );
  });
});

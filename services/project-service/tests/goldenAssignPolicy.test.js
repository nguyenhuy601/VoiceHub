const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { assertCanSetCardAssignee } = require('../src/services/goldenAssignPolicy');

describe('goldenAssignPolicy assertCanSetCardAssignee', () => {
  const teamA = '6a4e1f3c0e89d4e25c7bdcac';
  const teamB = '6a4e1f3c0e89d4e25c7bdcad';

  it('owner/admin luôn được gán NV', () => {
    assert.equal(assertCanSetCardAssignee({ membershipRole: 'owner' }, teamA).ok, true);
    assert.equal(assertCanSetCardAssignee({ membershipRole: 'admin' }, null).ok, true);
  });

  it('PM/head không được gán NV khi thẻ đã có team', () => {
    const scope = {
      membershipRole: 'member',
      visibility: 'department',
      ledTeamIds: [],
      teamIds: [teamA, teamB],
    };
    const r = assertCanSetCardAssignee(scope, teamA);
    assert.equal(r.ok, false);
    assert.match(r.message, /Trưởng team/i);
  });

  it('TL được gán NV trên team mình lead', () => {
    const scope = {
      membershipRole: 'member',
      visibility: 'team',
      ledTeamIds: [teamA],
      teamIds: [teamA],
    };
    assert.equal(assertCanSetCardAssignee(scope, teamA).ok, true);
    assert.equal(assertCanSetCardAssignee(scope, teamB).ok, false);
  });

  it('chưa gắn team → từ chối gán NV (ép PM gắn team trước)', () => {
    const scope = {
      membershipRole: 'member',
      visibility: 'department',
      ledTeamIds: [],
    };
    const r = assertCanSetCardAssignee(scope, null);
    assert.equal(r.ok, false);
    assert.match(r.message, /Gắn team/i);
  });
});

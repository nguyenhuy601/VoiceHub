const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  canAssignOwnerTeam,
  normalizeOwnerTeamId,
} = require('../src/services/ownerTeamId');

describe('ownerTeamId / swimlane helpers', () => {
  it('normalizeOwnerTeamId accepts ObjectId or empty', () => {
    assert.equal(normalizeOwnerTeamId(null), null);
    assert.equal(normalizeOwnerTeamId(''), null);
    assert.equal(normalizeOwnerTeamId('bad'), null);
    assert.equal(normalizeOwnerTeamId('6a4e1f3c0e89d4e25c7bdcac'), '6a4e1f3c0e89d4e25c7bdcac');
  });

  it('canAssignOwnerTeam allows null and org visibility', () => {
    assert.equal(canAssignOwnerTeam({ visibility: 'org' }, null), true);
    assert.equal(canAssignOwnerTeam({ visibility: 'org' }, '6a4e1f3c0e89d4e25c7bdcac'), true);
  });

  it('canAssignOwnerTeam checks scope.teamIds when present', () => {
    const scope = {
      visibility: 'department',
      teamIds: ['6a4e1f3c0e89d4e25c7bdcac', '6a4e1f3c0e89d4e25c7bdcad'],
    };
    assert.equal(canAssignOwnerTeam(scope, '6a4e1f3c0e89d4e25c7bdcac'), true);
    assert.equal(canAssignOwnerTeam(scope, '6a4e1f3c0e89d4e25c7bdfff'), false);
    assert.equal(canAssignOwnerTeam(scope, null), true);
  });
});

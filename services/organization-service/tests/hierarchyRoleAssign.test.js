const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

process.env.ROLE_PERMISSION_SERVICE_URL = 'http://role-permission-service:3000';
process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';

const {
  diffDepartmentHierarchyRoleChanges,
  diffTeamHierarchyRoleChanges,
  syncDepartmentHierarchyRolesFromPatches,
  syncTeamHierarchyRolesFromMemberChange,
} = require('../src/clients/hierarchyRoleAssign.client');

function stubAxiosForHierarchyTests() {
  const axios = require('axios');
  const originalPost = axios.post;
  const originalGet = axios.get;
  const calls = { post: [], get: [] };
  axios.post = async (url, body) => {
    calls.post.push({ url, body });
    return { status: 200, data: { success: true } };
  };
  axios.get = async (url) => {
    calls.get.push({ url });
    return {
      status: 200,
      data: {
        data: [{ _id: 'role1', name: 'Phòng ban: FE · dep_depA01' }],
      },
    };
  };
  process.env.ROLE_PERMISSION_SERVICE_URL = 'http://role-permission-service:3000';
  process.env.GATEWAY_INTERNAL_TOKEN = 'test-token';
  return {
    calls,
    restore: () => {
      axios.post = originalPost;
      axios.get = originalGet;
    },
  };
}

describe('hierarchyRoleAssign decouple', () => {
  it('T1: diffDepartment detects adds and removes', () => {
    const before = [{ _id: 'depA', members: ['u1', 'u2'] }];
    const patches = [{ deptId: 'depA', members: ['u2', 'u3'] }];
    const { assigns, revokes } = diffDepartmentHierarchyRoleChanges(before, patches);
    assert.deepEqual(assigns, [{ userId: 'u3', departmentId: 'depA' }]);
    assert.deepEqual(revokes, [{ userId: 'u1', departmentId: 'depA' }]);
  });

  it('T1b: membersAdd does not POST assign/remove to role-service', async () => {
    const { calls, restore } = stubAxiosForHierarchyTests();
    try {
      const before = [{ _id: 'depA', members: ['u1'] }];
      const patches = [{ deptId: 'depA', members: ['u1', 'u-new'] }];
      await syncDepartmentHierarchyRolesFromPatches('org1', before, patches);
      assert.equal(calls.post.length, 0);
      assert.equal(calls.get.length, 0);
    } finally {
      restore();
    }
  });

  it('T4: member remove triggers hierarchy role revoke', async () => {
    const { calls, restore } = stubAxiosForHierarchyTests();
    try {
      const before = [{ _id: 'depA01', members: ['u1', 'u2'] }];
      const patches = [{ deptId: 'depA01', members: ['u2'] }];
      await syncDepartmentHierarchyRolesFromPatches('org1', before, patches);
      assert.equal(calls.post.length, 1);
      assert.match(calls.post[0].url, /\/remove$/);
      assert.equal(calls.post[0].body.userId, 'u1');
    } finally {
      restore();
    }
  });

  it('T-team: diffTeam detects added/removed', () => {
    const { added, removed } = diffTeamHierarchyRoleChanges(['u1', 'u2'], ['u2', 'u3']);
    assert.deepEqual(added, ['u3']);
    assert.deepEqual(removed, ['u1']);
  });

  it('T-team: syncTeam only revokes removed members', async () => {
    const axios = require('axios');
    const originalPost = axios.post;
    const originalGet = axios.get;
    const postCalls = [];
    axios.post = async (url, body) => {
      postCalls.push({ url, body });
      return { status: 200, data: { success: true } };
    };
    axios.get = async () => ({
      status: 200,
      data: {
        data: [{ _id: 'roleT', name: 'Team: API · team_team01' }],
      },
    });

    try {
      await syncTeamHierarchyRolesFromMemberChange(
        'org1',
        'team01',
        'API',
        ['u1', 'u2'],
        ['u2', 'u3']
      );
      assert.equal(postCalls.length, 1);
      assert.equal(postCalls[0].body.userId, 'u1');
    } finally {
      axios.post = originalPost;
      axios.get = originalGet;
    }
  });
});

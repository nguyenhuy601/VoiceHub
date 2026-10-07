const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const USER_ID = '507f1f77bcf86cd799439011';
const ORG_ID = '507f1f77bcf86cd799439012';

const Membership = require('../src/models/Membership');

const orgRolesPath = require.resolve('../src/utils/orgRoles');
const orgAccessPath = require.resolve('../src/utils/orgAccess');

let activeMembership = null;
let suspended = false;
let roles = [];
let resolveOrgAccess;
const original = {};
let savedOrgRolesEntry;

describe('resolveOrgAccess — suspended membership (W-Collab-1 D2.1)', () => {
  before(() => {
    original.findOne = Membership.findOne;
    original.exists = Membership.exists;
    Membership.findOne = () => ({ lean: async () => activeMembership });
    Membership.exists = async (query) => (suspended && query.status === 'suspended' ? { _id: 'm1' } : null);

    const realOrgRoles = require(orgRolesPath);
    savedOrgRolesEntry = require.cache[orgRolesPath];
    require.cache[orgRolesPath] = {
      id: orgRolesPath,
      filename: orgRolesPath,
      loaded: true,
      exports: { ...realOrgRoles, fetchUserRolesInOrg: async () => roles },
    };
    delete require.cache[orgAccessPath];
    ({ resolveOrgAccess } = require(orgAccessPath));
  });

  after(() => {
    Membership.findOne = original.findOne;
    Membership.exists = original.exists;
    require.cache[orgRolesPath] = savedOrgRolesEntry;
    delete require.cache[orgAccessPath];
  });

  beforeEach(() => {
    activeMembership = null;
    suspended = false;
    roles = [];
  });

  it('active membership → ok', async () => {
    activeMembership = { _id: 'm1', role: 'member', status: 'active' };
    const access = await resolveOrgAccess(USER_ID, ORG_ID);
    assert.equal(access.ok, true);
    assert.equal(access.rolesOnly, false);
  });

  it('suspended membership with leftover roles → denied', async () => {
    suspended = true;
    roles = [{ name: 'Department Head' }];
    const access = await resolveOrgAccess(USER_ID, ORG_ID);
    assert.equal(access.ok, false);
    assert.deepEqual(access.roles, []);
  });

  it('roles only, no membership row → still ok (unchanged)', async () => {
    roles = [{ name: 'Auditor' }];
    const access = await resolveOrgAccess(USER_ID, ORG_ID);
    assert.equal(access.ok, true);
    assert.equal(access.rolesOnly, true);
  });

  it('no membership and no roles → denied', async () => {
    const access = await resolveOrgAccess(USER_ID, ORG_ID);
    assert.equal(access.ok, false);
  });
});

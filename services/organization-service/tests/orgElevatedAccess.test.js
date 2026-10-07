const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const USER_ID = '507f1f77bcf86cd799439011';
const ORG_ID = '507f1f77bcf86cd799439012';

const Membership = require('../src/models/Membership');
const Branch = require('../src/models/Branch');

const rbacClientPath = require.resolve('../src/clients/rbacPermission.client');
const elevatedPath = require.resolve('../src/utils/orgElevatedAccess');
const hierarchyControllerPath = require.resolve('../src/controllers/hierarchyController');

let membershipRole = null;
let grantAllowed = false;
let grantCalls = [];
let branchFilter = null;
const original = {};
let savedRbacEntry;
let elevated;
let hierarchyController;

function makeReq(query = {}) {
  return { user: { id: USER_ID }, params: { orgId: ORG_ID }, query };
}

function makeRes() {
  return {
    body: null,
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

describe('orgElevatedAccess + includeInactive gate (W-Collab-1 D2.2)', () => {
  before(() => {
    original.findOne = Membership.findOne;
    original.branchFind = Branch.find;
    Membership.findOne = () => {
      const chain = {
        select: () => chain,
        lean: async () => (membershipRole ? { role: membershipRole, status: 'active' } : null),
      };
      return chain;
    };
    Branch.find = (filter) => {
      branchFilter = filter;
      return { sort: async () => [] };
    };

    const realRbac = require(rbacClientPath);
    savedRbacEntry = require.cache[rbacClientPath];
    require.cache[rbacClientPath] = {
      id: rbacClientPath,
      filename: rbacClientPath,
      loaded: true,
      exports: {
        ...realRbac,
        checkMasterGrant: async (userId, orgId, action) => {
          grantCalls.push(action);
          return grantAllowed;
        },
      },
    };
    delete require.cache[elevatedPath];
    delete require.cache[hierarchyControllerPath];
    elevated = require(elevatedPath);
    hierarchyController = require(hierarchyControllerPath);
  });

  after(() => {
    Membership.findOne = original.findOne;
    Branch.find = original.branchFind;
    require.cache[rbacClientPath] = savedRbacEntry;
    delete require.cache[elevatedPath];
    delete require.cache[hierarchyControllerPath];
  });

  beforeEach(() => {
    membershipRole = null;
    grantAllowed = false;
    grantCalls = [];
    branchFilter = null;
  });

  it('hasElevatedOrgAccess: role in list → true without grant call', async () => {
    membershipRole = 'admin';
    const ok = await elevated.hasElevatedOrgAccess({
      userId: USER_ID,
      orgId: ORG_ID,
      roles: ['owner', 'admin'],
      grantKey: 'organization.structure.view',
    });
    assert.equal(ok, true);
    assert.deepEqual(grantCalls, []);
  });

  it('hasElevatedOrgAccess: member falls back to grant', async () => {
    membershipRole = 'member';
    grantAllowed = true;
    const ok = await elevated.hasElevatedOrgAccess({
      userId: USER_ID,
      orgId: ORG_ID,
      roles: ['owner', 'admin'],
      grantKey: 'organization.structure.view',
    });
    assert.equal(ok, true);
    assert.deepEqual(grantCalls, ['organization.structure.view']);
  });

  it('hasElevatedOrgAccess: missing ids → false', async () => {
    assert.equal(await elevated.hasElevatedOrgAccess({ userId: '', orgId: ORG_ID }), false);
  });

  it('canIncludeInactiveStructure: not requested → false, no lookups', async () => {
    membershipRole = 'owner';
    assert.equal(await elevated.canIncludeInactiveStructure(makeReq()), false);
    assert.deepEqual(grantCalls, []);
  });

  it('canIncludeInactiveStructure: member without grant → false', async () => {
    membershipRole = 'member';
    assert.equal(await elevated.canIncludeInactiveStructure(makeReq({ includeInactive: '1' })), false);
  });

  it('listBranches: member includeInactive=1 still filters active only', async () => {
    membershipRole = 'member';
    const res = makeRes();
    await hierarchyController.listBranches(makeReq({ includeInactive: '1' }), res, (err) => {
      throw err;
    });
    assert.equal(branchFilter.isActive, true);
    assert.equal(res.body.status, 'success');
  });

  it('listBranches: owner includeInactive=1 includes inactive', async () => {
    membershipRole = 'owner';
    await hierarchyController.listBranches(makeReq({ includeInactive: '1' }), makeRes(), (err) => {
      throw err;
    });
    assert.equal(Object.prototype.hasOwnProperty.call(branchFilter, 'isActive'), false);
  });

  it('getOrganizationStructure uses the shared gate', () => {
    const src = require('node:fs').readFileSync(
      require.resolve('../src/controllers/organizationController'),
      'utf8'
    );
    assert.ok(src.includes('await canIncludeInactiveStructure(req)'));
    assert.equal(src.includes("String(req.query?.includeInactive || '') === '1'"), false);
  });
});

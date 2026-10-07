const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const ORG_ID = '507f1f77bcf86cd799439012';
const JOINER_ID = '507f1f77bcf86cd799439021';
const INVITER_ID = '507f1f77bcf86cd799439031';
const INVITE_SECRET = 'test-invite-secret-wcollab1b';

const savedEnv = {
  ROLE_PERMISSION_SERVICE_URL: process.env.ROLE_PERMISSION_SERVICE_URL,
  INVITE_LINK_SECRET: process.env.INVITE_LINK_SECRET,
};
process.env.ROLE_PERMISSION_SERVICE_URL = process.env.ROLE_PERMISSION_SERVICE_URL || 'http://rps.test';
process.env.INVITE_LINK_SECRET = INVITE_SECRET;

const Membership = require('../src/models/Membership');
const Organization = require('../src/models/Organization');

const controllerPath = require.resolve('../src/controllers/memberController');
const elevatedPath = require.resolve('../src/utils/orgElevatedAccess');
const mockedModules = {
  rbac: require.resolve('../src/clients/rbacPermission.client'),
  realtime: require.resolve('../src/clients/realtime.client'),
  roleSync: require.resolve('../src/services/rolePermissionOrgSync'),
  readCache: require.resolve('../src/services/orgReadCache.service'),
};

let inviterRole = null;
let grantAllowed = false;
let joinerMembership = null;
let upsertCalls = [];
let emitCalls = [];
let syncCalls = [];
const original = {};
const savedCache = {};
let controller;

function mockModule(path, overrides) {
  const real = require(path);
  savedCache[path] = require.cache[path];
  require.cache[path] = { id: path, filename: path, loaded: true, exports: { ...real, ...overrides } };
}

function signInvite(payload = {}) {
  return jwt.sign(
    { type: 'organization_invite', orgId: ORG_ID, createdBy: INVITER_ID, inviteContext: {}, ...payload },
    INVITE_SECRET
  );
}

function makeReq(token) {
  return { user: { id: JOINER_ID }, params: { orgId: ORG_ID }, body: { token }, headers: {} };
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

async function join(token) {
  const res = makeRes();
  await controller.joinViaLink(makeReq(token), res, (err) => {
    throw err;
  });
  return res;
}

describe('joinViaLink hardening (W-Collab-1b RULE-01..03)', () => {
  before(() => {
    original.findOne = Membership.findOne;
    original.findOneAndUpdate = Membership.findOneAndUpdate;
    original.distinct = Membership.distinct;
    original.orgFindById = Organization.findById;

    Membership.findOne = (filter) => {
      const isInviterLookup = String(filter.user) === INVITER_ID;
      const result = isInviterLookup
        ? inviterRole
          ? { role: inviterRole, status: 'active' }
          : null
        : joinerMembership;
      const chain = { select: () => chain, lean: async () => result };
      return chain;
    };
    Membership.findOneAndUpdate = async (filter, update) => {
      upsertCalls.push({ filter, update });
      return { _id: 'm1', ...joinerMembership, ...update.$set };
    };
    Membership.distinct = async () => [JOINER_ID];
    Organization.findById = () => ({ lean: async () => ({ _id: ORG_ID, isActive: true }) });

    mockModule(mockedModules.rbac, { checkMasterGrant: async () => grantAllowed });
    mockModule(mockedModules.realtime, {
      emitRealtimeEvent: async (evt) => {
        emitCalls.push(evt.event);
      },
    });
    mockModule(mockedModules.roleSync, {
      ensureDefaultOrgRoles: async () => {},
      syncUserOrgRole: async (userId, orgId, role) => {
        syncCalls.push(role);
      },
    });
    mockModule(mockedModules.readCache, { invalidateOrgReadCache: async () => {} });

    delete require.cache[elevatedPath];
    delete require.cache[controllerPath];
    controller = require(controllerPath);
  });

  after(() => {
    Membership.findOne = original.findOne;
    Membership.findOneAndUpdate = original.findOneAndUpdate;
    Membership.distinct = original.distinct;
    Organization.findById = original.orgFindById;
    Object.values(mockedModules).forEach((path) => {
      require.cache[path] = savedCache[path];
    });
    delete require.cache[elevatedPath];
    delete require.cache[controllerPath];
    Object.entries(savedEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  });

  beforeEach(() => {
    inviterRole = 'admin';
    grantAllowed = false;
    joinerMembership = null;
    upsertCalls = [];
    emitCalls = [];
    syncCalls = [];
  });

  it('new user joins as member when inviter still has invite role', async () => {
    const res = await join(signInvite());
    assert.equal(res.statusCode, 200);
    assert.equal(upsertCalls.length, 1);
    assert.equal(upsertCalls[0].update.$set.role, 'member');
    assert.equal(upsertCalls[0].update.$set.status, 'active');
    assert.ok(upsertCalls[0].update.$set.joinedAt instanceof Date);
    assert.deepEqual(syncCalls, ['member']);
    assert.deepEqual(emitCalls, ['organization:member_joined']);
  });

  it('pending admin invitation is activated as member (SC-1)', async () => {
    joinerMembership = { role: 'admin', status: 'pending' };
    const res = await join(signInvite());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.membership.role, 'member');
    assert.equal(res.body.data.membership.status, 'active');
    assert.equal(upsertCalls[0].update.$setOnInsert.role, undefined);
  });

  it('inviter without role and grant → 403 ORG_INVITE_LINK_REVOKED, no write (SC-2)', async () => {
    inviterRole = 'member';
    const res = await join(signInvite());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'ORG_INVITE_LINK_REVOKED');
    assert.equal(upsertCalls.length, 0);
    assert.deepEqual(emitCalls, []);
  });

  it('inviter who left the org (no active membership) → 403', async () => {
    inviterRole = null;
    const res = await join(signInvite());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'ORG_INVITE_LINK_REVOKED');
  });

  it('inviter with invite grant only is still accepted', async () => {
    inviterRole = 'member';
    grantAllowed = true;
    const res = await join(signInvite());
    assert.equal(res.statusCode, 200);
  });

  it('already active member: idempotent, role kept, no emit (SC-3)', async () => {
    joinerMembership = { role: 'hr', status: 'active' };
    const res = await join(signInvite());
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.membership.role, 'hr');
    assert.equal(upsertCalls.length, 0);
    assert.deepEqual(emitCalls, []);
    assert.deepEqual(syncCalls, []);
  });

  it('suspended member stays blocked', async () => {
    joinerMembership = { role: 'member', status: 'suspended' };
    const res = await join(signInvite());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.errorCode, 'ORG_MEMBERSHIP_SUSPENDED');
    assert.equal(upsertCalls.length, 0);
  });

  it('wrong token type or org → 400 without inviter lookup side effects', async () => {
    const wrongType = await join(signInvite({ type: 'other' }));
    assert.equal(wrongType.statusCode, 400);
    const wrongOrg = await join(signInvite({ orgId: '507f1f77bcf86cd799439099' }));
    assert.equal(wrongOrg.statusCode, 400);
    assert.equal(upsertCalls.length, 0);
  });
});

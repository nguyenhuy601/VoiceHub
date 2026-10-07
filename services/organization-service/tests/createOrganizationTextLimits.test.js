const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const USER_ID = '507f1f77bcf86cd799439011';
const STOP_AFTER_CREATE = 'STOP_AFTER_CREATE';

const Organization = require('../src/models/Organization');
const Membership = require('../src/models/Membership');
const { createOrganization } = require('../src/controllers/organizationController');

const original = {};
const savedSingleOrgMode = process.env.SINGLE_ORG_MODE;
let createCalls = 0;

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

async function callCreate(body) {
  let nextError = null;
  const res = makeRes();
  await createOrganization({ user: { id: USER_ID }, body, headers: {} }, res, (err) => {
    nextError = err;
  });
  return { res, nextError };
}

function blueprintWith({ branchName = 'HQ', location = '', teamName = 'Team A' } = {}) {
  return {
    branches: [
      {
        name: branchName,
        location,
        divisions: [{ name: 'Khối A', departments: [{ name: 'Phòng A', teams: [{ name: teamName }] }] }],
      },
    ],
  };
}

describe('createOrganization text limits (W-Collab-1b RULE-04)', () => {
  before(() => {
    delete process.env.SINGLE_ORG_MODE;
    original.countDocuments = Membership.countDocuments;
    original.exists = Organization.exists;
    original.create = Organization.create;
    Membership.countDocuments = async () => 0;
    Organization.exists = async () => null;
    Organization.create = async () => {
      createCalls += 1;
      throw new Error(STOP_AFTER_CREATE);
    };
  });

  after(() => {
    Membership.countDocuments = original.countDocuments;
    Organization.exists = original.exists;
    Organization.create = original.create;
    if (savedSingleOrgMode === undefined) delete process.env.SINGLE_ORG_MODE;
    else process.env.SINGLE_ORG_MODE = savedSingleOrgMode;
  });

  beforeEach(() => {
    createCalls = 0;
  });

  it('rejects name longer than 120 chars before create', async () => {
    const { nextError } = await callCreate({ name: 'a'.repeat(121), slug: 'acme' });
    assert.equal(nextError?.statusCode, 400);
    assert.equal(nextError?.errorCode, 'ORG_TEXT_TOO_LONG');
    assert.equal(createCalls, 0);
  });

  it('rejects description longer than 1000 chars', async () => {
    const { nextError } = await callCreate({ name: 'Acme', slug: 'acme', description: 'd'.repeat(1001) });
    assert.equal(nextError?.errorCode, 'ORG_TEXT_TOO_LONG');
    assert.equal(createCalls, 0);
  });

  it('rejects blueprint team name longer than 120 chars', async () => {
    const { nextError } = await callCreate({
      name: 'Acme',
      slug: 'acme',
      structureBlueprint: blueprintWith({ teamName: 't'.repeat(121) }),
    });
    assert.equal(nextError?.errorCode, 'ORG_TEXT_TOO_LONG');
    assert.equal(createCalls, 0);
  });

  it('rejects blueprint branch location longer than 1000 chars', async () => {
    const { nextError } = await callCreate({
      name: 'Acme',
      slug: 'acme',
      structureBlueprint: blueprintWith({ location: 'l'.repeat(1001) }),
    });
    assert.equal(nextError?.errorCode, 'ORG_TEXT_TOO_LONG');
    assert.equal(createCalls, 0);
  });

  it('valid payload reaches Organization.create', async () => {
    const { nextError } = await callCreate({
      name: 'a'.repeat(120),
      slug: 'acme',
      structureBlueprint: blueprintWith({ teamName: 't'.repeat(120) }),
    });
    assert.equal(createCalls, 1);
    assert.equal(nextError?.message, STOP_AFTER_CREATE);
  });
});

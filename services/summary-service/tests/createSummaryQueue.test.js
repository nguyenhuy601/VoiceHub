const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { createSummaryController } = require('../src/controllers/summary.controller');
const { SummaryError } = require('../src/utils/summaryErrors');
const { MAX_JOBS_PER_MINUTE } = require('../src/utils/summaryThrottle');

const USER = '64b000000000000000000009';
const ORG = '64b000000000000000000001';
const ROOM = '64b000000000000000000002';

function chain(value) {
  return { sort: () => ({ lean: async () => value }), lean: async () => value };
}

function createFakeModel({ cached = null, inflight = null, recentJobs = 0, byId = null } = {}) {
  const calls = { create: [], updateOne: [], findOne: [] };
  return {
    calls,
    findOne(filter) {
      calls.findOne.push(filter);
      if (filter.status === 'ready') return chain(cached);
      return chain(inflight);
    },
    async countDocuments() {
      return recentJobs;
    },
    async create(doc) {
      calls.create.push(doc);
      return { _id: '64b0000000000000000000aa', ...doc };
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
      return { acknowledged: true };
    },
    findById() {
      return chain(byId);
    },
  };
}

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function buildController(model, overrides = {}) {
  const published = [];
  const controller = createSummaryController({
    Model: model,
    publish: async (queue, payload) => {
      published.push({ queue, payload });
    },
    verifyAccess: async () => ({}),
    exportThread: async () => ({ messageCount: 4, firstMessageId: 'm1', lastMessageId: 'm4' }),
    now: () => 1_700_000_000_000,
    ...overrides,
  });
  return { controller, published };
}

const createReq = () => ({
  user: { id: USER },
  body: { scope: 'org_channel', organizationId: ORG, roomId: ROOM, options: { unreadOnly: true } },
});

async function expectSummaryError(promise, code) {
  await assert.rejects(promise, (err) => err instanceof SummaryError && err.code === code);
}

describe('createSummary queue + throttle', () => {
  it('happy path creates doc, publishes once, returns 202', async () => {
    const model = createFakeModel();
    const { controller, published } = buildController(model);
    const res = createRes();
    await controller.createSummary(createReq(), res);
    assert.equal(res.statusCode, 202);
    assert.equal(model.calls.create.length, 1);
    assert.equal(published.length, 1);
    assert.equal(res.body.data.status, 'queued');
  });

  it('publish failure marks doc failed once and throws 503 queue code', async () => {
    const model = createFakeModel();
    const { controller } = buildController(model, {
      publish: async () => {
        throw new Error('Channel closed');
      },
    });
    await expectSummaryError(controller.createSummary(createReq(), createRes()), 'SUMMARY_QUEUE_UNAVAILABLE');
    assert.equal(model.calls.updateOne.length, 1);
    assert.equal(model.calls.updateOne[0].update.$set.status, 'failed');
  });

  it('in-flight job for same user/thread/lastMessage is reused without publishing', async () => {
    const model = createFakeModel({ inflight: { _id: 'existing-id', status: 'processing' } });
    const { controller, published } = buildController(model);
    const res = createRes();
    await controller.createSummary(createReq(), res);
    assert.equal(res.statusCode, 202);
    assert.equal(res.body.data.summaryId, 'existing-id');
    assert.equal(published.length, 0);
    assert.equal(model.calls.create.length, 0);
  });

  it('rate limit reached -> 429 code, no doc created', async () => {
    const model = createFakeModel({ recentJobs: MAX_JOBS_PER_MINUTE });
    const { controller, published } = buildController(model);
    await expectSummaryError(controller.createSummary(createReq(), createRes()), 'SUMMARY_RATE_LIMITED');
    assert.equal(model.calls.create.length, 0);
    assert.equal(published.length, 0);
  });

  it('cached ready summary returns 200 with whitelisted payload', async () => {
    const model = createFakeModel({
      cached: { _id: 'c1', status: 'ready', organizationId: ORG, roomId: ROOM, modelMeta: { model: 'x' } },
    });
    const { controller } = buildController(model);
    const res = createRes();
    await controller.createSummary(createReq(), res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.cached, true);
    assert.equal('modelMeta' in res.body.data, false);
  });

  it('no messages -> 422 code', async () => {
    const { controller } = buildController(createFakeModel(), { exportThread: async () => ({ messageCount: 0 }) });
    await expectSummaryError(controller.createSummary(createReq(), createRes()), 'SUMMARY_NO_MESSAGES');
  });

  it('ignores raw x-user-id header when req.user is missing', async () => {
    const { controller } = buildController(createFakeModel());
    const req = { headers: { 'x-user-id': USER }, body: createReq().body };
    await expectSummaryError(controller.createSummary(req, createRes()), 'SUMMARY_USER_CONTEXT_MISSING');
  });

  it('verify network failure surfaces as code only (no raw message)', async () => {
    const { controller } = buildController(createFakeModel(), {
      verifyAccess: async () => {
        throw new SummaryError('SUMMARY_VERIFY_UNAVAILABLE', { cause: new Error('ECONNREFUSED 10.0.0.5:3013') });
      },
    });
    await expectSummaryError(controller.createSummary(createReq(), createRes()), 'SUMMARY_VERIFY_UNAVAILABLE');
  });
});

describe('getSummaryById', () => {
  it('forbids other users (IDOR)', async () => {
    const model = createFakeModel({ byId: { _id: 'x', generatedBy: '64b0000000000000000000ff' } });
    const { controller } = buildController(model);
    await expectSummaryError(
      controller.getSummaryById({ user: { id: USER }, params: { id: 'x' } }, createRes()),
      'SUMMARY_FORBIDDEN'
    );
  });

  it('missing doc -> not found', async () => {
    const { controller } = buildController(createFakeModel());
    await expectSummaryError(
      controller.getSummaryById({ user: { id: USER }, params: { id: 'x' } }, createRes()),
      'SUMMARY_NOT_FOUND'
    );
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  assertProjectWriteAllowed,
  shouldLimitProjectWrite,
  PROJECT_RATE_LIMITED,
  LIMIT_MESSAGE,
} = require('../src/utils/projectWriteLimit');
const projectWriteLimit = require('../src/middleware/projectWriteLimit');
const { sendServiceError } = require('../src/middleware/sendServiceError');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    headersSent: false,
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

describe('assertProjectWriteAllowed', () => {
  it('rejects the 121st counted write and lets the 120th through', async () => {
    let n = 0;
    const check = async () => {
      n += 1;
      return { allowed: n <= 120, remaining: Math.max(0, 120 - n) };
    };
    for (let i = 0; i < 120; i += 1) {
      await assertProjectWriteAllowed({ userId: 'actor-1', checkRateLimit: check });
    }
    await assert.rejects(
      () => assertProjectWriteAllowed({ userId: 'actor-1', checkRateLimit: check }),
      (err) => err.statusCode === 429 && err.errorCode === PROJECT_RATE_LIMITED && err.message === LIMIT_MESSAGE
    );
  });

  it('does not throw when Redis fails open or the count is allowed', async () => {
    await assertProjectWriteAllowed({
      userId: 'actor-1',
      checkRateLimit: async () => ({ allowed: true, remaining: 120, failOpen: true }),
    });
    await assertProjectWriteAllowed({
      userId: 'actor-1',
      checkRateLimit: async () => ({ allowed: true, remaining: 3 }),
    });
  });

  it('does not call checkRateLimit when the actor id is empty or only present on the body', async () => {
    let calls = 0;
    const check = async () => {
      calls += 1;
      return { allowed: false, remaining: 0 };
    };
    await assertProjectWriteAllowed({ userId: '', checkRateLimit: check });
    await assertProjectWriteAllowed({ userId: '   ', checkRateLimit: check });
    await assertProjectWriteAllowed({ req: { body: { userId: 'from-body' } }, checkRateLimit: check });
    assert.equal(calls, 0);
  });

  it('keys the bucket from the session user, with the default 120 per 60 seconds', async () => {
    const prevLimit = process.env.PROJECT_WRITE_RATE_LIMIT;
    const prevWindow = process.env.PROJECT_WRITE_WINDOW_SEC;
    delete process.env.PROJECT_WRITE_RATE_LIMIT;
    delete process.env.PROJECT_WRITE_WINDOW_SEC;
    try {
      let seen = '';
      await assertProjectWriteAllowed({
        req: { user: { id: 'actor-1' }, body: { userId: 'victim' } },
        checkRateLimit: async ({ key, limit, windowSec }) => {
          seen = `${key}|${limit}|${windowSec}`;
          return { allowed: true, remaining: 1 };
        },
      });
      assert.equal(seen, 'project:write:actor-1|120|60');
    } finally {
      if (prevLimit === undefined) delete process.env.PROJECT_WRITE_RATE_LIMIT;
      else process.env.PROJECT_WRITE_RATE_LIMIT = prevLimit;
      if (prevWindow === undefined) delete process.env.PROJECT_WRITE_WINDOW_SEC;
      else process.env.PROJECT_WRITE_WINDOW_SEC = prevWindow;
    }
  });
});

describe('shouldLimitProjectWrite', () => {
  it('skips reads and internal routes, and counts board writes', () => {
    assert.equal(shouldLimitProjectWrite({ method: 'GET', originalUrl: '/api/projects' }), false);
    assert.equal(shouldLimitProjectWrite({ method: 'HEAD', originalUrl: '/api/tasks' }), false);
    assert.equal(shouldLimitProjectWrite({ method: 'OPTIONS', originalUrl: '/api/tasks/boards' }), false);
    for (const originalUrl of [
      '/api/projects/internal/audit-events',
      '/api/projects/internal/ai-planning/job-result',
      '/api/tasks/internal/purge-organization/abc',
    ]) {
      assert.equal(shouldLimitProjectWrite({ method: 'POST', originalUrl }), false, originalUrl);
    }
    assert.equal(
      shouldLimitProjectWrite({ method: 'POST', originalUrl: '/api/tasks/boards/board-1/cards' }),
      true
    );
    assert.equal(
      shouldLimitProjectWrite({
        method: 'PATCH',
        originalUrl: '/api/workspaces/acme/task-boards/cards/card-1/move',
      }),
      true
    );
  });

  it('calls next without counting when the method or path is excluded', async () => {
    for (const req of [
      { method: 'GET', originalUrl: '/api/projects', user: { id: 'actor-1' } },
      { method: 'POST', originalUrl: '/api/projects/internal/audit-events', user: { id: 'actor-1' } },
    ]) {
      let continued = false;
      await projectWriteLimit(req, mockRes(), () => {
        continued = true;
      });
      assert.equal(continued, true);
    }
  });
});

describe('project write limit mount', () => {
  it('registers projectWriteLimit after gateway user trust and before project routes', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/app.js'), 'utf8').replace(/\r\n/g, '\n');
    const trust = src.indexOf('app.use(gatewayUserMiddleware);');
    const limit = src.indexOf('app.use(projectWriteLimit);');
    const projects = src.indexOf("app.use('/api/projects'");
    assert.ok(trust >= 0 && limit > trust && projects > limit);
  });
});

describe('PROJECT_RATE_LIMITED response', () => {
  it('sendServiceError 429 keeps the Vietnamese sentence and omits mongo, stack, and password', () => {
    const res = mockRes();
    sendServiceError(res, 429, {
      errorCode: PROJECT_RATE_LIMITED,
      messageUser: LIMIT_MESSAGE,
      message: LIMIT_MESSAGE,
    });
    const blob = JSON.stringify(res.body);
    assert.equal(res.statusCode, 429);
    assert.equal(res.body.errorCode, PROJECT_RATE_LIMITED);
    assert.equal(res.body.messageUser, LIMIT_MESSAGE);
    assert.equal(/Mongo|stack|password/i.test(blob), false);
  });
});

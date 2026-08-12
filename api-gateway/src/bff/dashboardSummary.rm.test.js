const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const SERVICE_PATH = path.join(__dirname, 'dashboardSummary.service.js');
const CLIENT_PATH = path.join(__dirname, 'dashboardReadModel.client.js');
const HD_PATH = path.join(__dirname, 'httpDownstream.js');
const FLAGS_PATH = require.resolve('@enterprise/shared/config/reportServiceFlags');

function stubModule(absPath, exports) {
  require.cache[absPath] = {
    id: absPath,
    filename: absPath,
    loaded: true,
    exports,
  };
}

describe('BFF dashboard read model (ADR-005)', () => {
  const saved = {};

  beforeEach(() => {
    saved.DASHBOARD_READ_MODEL = process.env.DASHBOARD_READ_MODEL;
    saved.REPORT_SERVICE_URL = process.env.REPORT_SERVICE_URL;
    delete require.cache[SERVICE_PATH];
    delete require.cache[CLIENT_PATH];
    delete require.cache[HD_PATH];
    delete require.cache[FLAGS_PATH];
  });

  afterEach(() => {
    if (saved.DASHBOARD_READ_MODEL === undefined) delete process.env.DASHBOARD_READ_MODEL;
    else process.env.DASHBOARD_READ_MODEL = saved.DASHBOARD_READ_MODEL;
    if (saved.REPORT_SERVICE_URL === undefined) delete process.env.REPORT_SERVICE_URL;
    else process.env.REPORT_SERVICE_URL = saved.REPORT_SERVICE_URL;
    delete require.cache[SERVICE_PATH];
    delete require.cache[CLIENT_PATH];
    delete require.cache[HD_PATH];
    delete require.cache[FLAGS_PATH];
  });

  it('RM hit does not call fan-out fetchJson', async () => {
    process.env.DASHBOARD_READ_MODEL = 'fallback';
    process.env.REPORT_SERVICE_URL = 'http://report-service:3025';
    delete require.cache[FLAGS_PATH];

    stubModule(CLIENT_PATH, {
      fetchDashboardReadModel: async () => ({
        ok: true,
        data: {
          orgCount: 1,
          friendsTotal: 2,
          pendingCount: 0,
          unread: 3,
          taskDone: 9,
          upcomingMeetings: [],
          asOf: '2026-08-09T00:00:00.000Z',
          partial: {},
        },
      }),
    });
    stubModule(HD_PATH, {
      services: {},
      buildTrustedHeaders: () => ({}),
      fetchJson: async () => {
        throw new Error('fanout should not run');
      },
      unwrapPayload: (b) => b,
    });

    const { buildDashboardSummary } = require(SERVICE_PATH);
    const data = await buildDashboardSummary('u1', 'a@b.c');
    assert.equal(data._rm, 'HIT');
    assert.equal(data.taskDone, 9);
  });

  it('RM miss + fallback uses fan-out', async () => {
    process.env.DASHBOARD_READ_MODEL = 'fallback';
    process.env.REPORT_SERVICE_URL = 'http://report-service:3025';
    delete require.cache[FLAGS_PATH];

    stubModule(CLIENT_PATH, {
      fetchDashboardReadModel: async () => ({ ok: false }),
    });
    stubModule(HD_PATH, {
      services: {
        organization: { url: 'http://org' },
        friend: { url: 'http://friend' },
        notification: { url: 'http://notif' },
        voice: { url: 'http://voice' },
        task: { url: 'http://task' },
      },
      buildTrustedHeaders: () => ({}),
      unwrapPayload: (body) => (body && body.data !== undefined ? body.data : body),
      fetchJson: async (url) => {
        if (url.includes('/organizations/my')) {
          return { ok: true, data: { success: true, data: [{ _id: '507f1f77bcf86cd799439011' }] } };
        }
        if (url.includes('/friends/pending')) {
          return { ok: true, data: { success: true, data: [] } };
        }
        if (url.includes('/friends')) {
          return { ok: true, data: { success: true, data: [] } };
        }
        if (url.includes('/notifications')) {
          return { ok: true, data: { success: true, data: { unreadCount: 0 } } };
        }
        if (url.includes('/meetings')) {
          return { ok: true, data: { success: true, data: { meetings: [] } } };
        }
        if (url.includes('/statistics')) {
          return { ok: true, data: { success: true, data: { done: 7 } } };
        }
        return { ok: false };
      },
    });

    const { buildDashboardSummary } = require(SERVICE_PATH);
    const data = await buildDashboardSummary('u1', 'a@b.c');
    assert.equal(data._rm, 'MISS');
    assert.equal(data.orgCount, 1);
    assert.equal(data.taskDone, 7);
  });
});

describe('bootstrap does not import dashboard RM client', () => {
  it('bootstrap.service source has no dashboardReadModel', () => {
    const src = fs.readFileSync(path.join(__dirname, 'bootstrap.service.js'), 'utf8');
    assert.equal(src.includes('dashboardReadModel'), false);
    assert.equal(src.includes('DASHBOARD_READ_MODEL'), false);
  });
});

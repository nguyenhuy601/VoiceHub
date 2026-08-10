const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  DASHBOARD_PROJECTION_EVENT_TYPES,
  isKnownDashboardProjectionEventType,
  buildDashboardProjectionEnvelope,
  dashboardReadModelKey,
} = require('../messaging/dashboardProjectionEvents');
const { ANALYTICS_EVENT_TYPES } = require('../messaging/analyticsEvents');

describe('dashboardProjectionEvents', () => {
  it('reuses analytics task_fact type', () => {
    assert.equal(
      DASHBOARD_PROJECTION_EVENT_TYPES.TASK_FACT,
      ANALYTICS_EVENT_TYPES.TASK_FACT
    );
    assert.equal(isKnownDashboardProjectionEventType('dashboard.v1.refresh_requested'), true);
  });

  it('builds envelope', () => {
    const env = buildDashboardProjectionEnvelope({
      type: DASHBOARD_PROJECTION_EVENT_TYPES.REFRESH_REQUESTED,
      eventId: 'd1',
      userId: 'u1',
      payload: { reason: 'task_fact' },
    });
    assert.equal(env.schemaVersion, 1);
    assert.equal(env.userId, 'u1');
  });

  it('rm key', () => {
    assert.equal(dashboardReadModelKey('u1'), 'dash:rm:user:u1');
  });
});

describe('dashboard read model flags', () => {
  const saved = {};

  beforeEach(() => {
    saved.DASHBOARD_READ_MODEL = process.env.DASHBOARD_READ_MODEL;
  });

  afterEach(() => {
    if (saved.DASHBOARD_READ_MODEL === undefined) delete process.env.DASHBOARD_READ_MODEL;
    else process.env.DASHBOARD_READ_MODEL = saved.DASHBOARD_READ_MODEL;
    delete require.cache[require.resolve('../config/reportServiceFlags')];
  });

  it('defaults off', () => {
    delete process.env.DASHBOARD_READ_MODEL;
    delete require.cache[require.resolve('../config/reportServiceFlags')];
    const { getDashboardReadModelMode, isDashboardReadModelEnabled } = require('../config/reportServiceFlags');
    assert.equal(getDashboardReadModelMode(), 'off');
    assert.equal(isDashboardReadModelEnabled(), false);
  });

  it('fallback mode', () => {
    process.env.DASHBOARD_READ_MODEL = 'fallback';
    delete require.cache[require.resolve('../config/reportServiceFlags')];
    const { getDashboardReadModelMode } = require('../config/reportServiceFlags');
    assert.equal(getDashboardReadModelMode(), 'fallback');
  });
});

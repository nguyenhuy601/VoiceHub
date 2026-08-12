const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

describe('taskServiceStrangler', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of [
      'TASK_SERVICE_STRANGLER_MODE',
      'TASK_SERVICE_URL',
      'PROJECT_SERVICE_URL',
    ]) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve('../config/taskServiceStrangler')];
  });

  function load() {
    delete require.cache[require.resolve('../config/taskServiceStrangler')];
    return require('../config/taskServiceStrangler');
  }

  it('defaults to off', () => {
    delete process.env.TASK_SERVICE_STRANGLER_MODE;
    const { getTaskServiceStranglerMode, isTaskServiceCutover } = load();
    assert.equal(getTaskServiceStranglerMode(), 'off');
    assert.equal(isTaskServiceCutover(), false);
  });

  it('resolves task url preferring TASK_SERVICE_URL', () => {
    const { resolveTaskProxyUrl, resolveProjectProxyUrl } = load();
    assert.equal(
      resolveTaskProxyUrl({
        taskServiceUrl: 'http://task-service:3019',
        projectServiceUrl: 'http://project-service:3009',
      }),
      'http://task-service:3019'
    );
    assert.equal(
      resolveProjectProxyUrl({
        taskServiceUrl: 'http://task-service:3019',
        projectServiceUrl: 'http://project-service:3009',
      }),
      'http://project-service:3009'
    );
  });
});

describe('reportServiceFlags', () => {
  const saved = {};

  beforeEach(() => {
    for (const key of ['REPORT_AGGREGATOR_MODE', 'REPORT_SERVICE_URL', 'ANALYTICS_MONGODB_URI']) {
      saved[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    delete require.cache[require.resolve('../config/reportServiceFlags')];
  });

  function load() {
    delete require.cache[require.resolve('../config/reportServiceFlags')];
    return require('../config/reportServiceFlags');
  }

  it('disabled by default', () => {
    delete process.env.REPORT_SERVICE_URL;
    delete process.env.REPORT_AGGREGATOR_MODE;
    const { isReportServiceEnabled, getReportAggregatorMode } = load();
    assert.equal(getReportAggregatorMode(), 'off');
    assert.equal(isReportServiceEnabled(), false);
  });

  it('enabled when url + mode c4', () => {
    process.env.REPORT_SERVICE_URL = 'http://report-service:3025';
    process.env.REPORT_AGGREGATOR_MODE = 'c4_warehouse';
    const { isReportServiceEnabled, getReportAggregatorMode } = load();
    assert.equal(getReportAggregatorMode(), 'c4_warehouse');
    assert.equal(isReportServiceEnabled(), true);
  });
});

describe('analyticsEvents', () => {
  it('builds warehouse feed envelope', () => {
    const {
      ANALYTICS_EVENT_TYPES,
      buildAnalyticsEnvelope,
    } = require('../messaging/analyticsEvents');
    const env = buildAnalyticsEnvelope({
      type: ANALYTICS_EVENT_TYPES.WORKLOG_FACT,
      eventId: 'a1',
      organizationId: 'o1',
      asOf: '2026-01-01T00:00:00.000Z',
      payload: { hours: 1 },
    });
    assert.equal(env.schemaVersion, 1);
    assert.equal(env.asOf, '2026-01-01T00:00:00.000Z');
  });
});

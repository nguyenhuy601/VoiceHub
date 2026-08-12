const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

/**
 * Gateway strangler: project vs task URL tách khi cả hai env được set.
 * Không boot full app — chỉ kiểm tra helper + services map logic mirror.
 */
describe('gateway task/project URL split (ADR-001)', () => {
  it('resolve helpers prefer dedicated URLs', () => {
    const {
      resolveTaskProxyUrl,
      resolveProjectProxyUrl,
    } = require('../../../shared/config/taskServiceStrangler');
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

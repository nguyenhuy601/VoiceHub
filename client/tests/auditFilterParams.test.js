import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildAuditFilterParams,
  hasAuditFilterErrors,
} from '../src/features/adminAudit/auditFilterParams.js';

describe('buildAuditFilterParams', () => {
  it('drops empty values', () => {
    const { params, errors } = buildAuditFilterParams({ resourceType: '', action: '  ', resourceId: '' });
    assert.deepEqual(params, {});
    assert.equal(hasAuditFilterErrors(errors), false);
  });

  it('keeps valid action, resourceId and resourceType', () => {
    const { params, errors } = buildAuditFilterParams({
      resourceType: 'task',
      action: ' Governance.Retention_Updated ',
      resourceId: '64f0c2a1b2c3d4e5f6a7b8c9',
    });
    assert.deepEqual(params, {
      resourceType: 'task',
      action: 'governance.retention_updated',
      resourceId: '64f0c2a1b2c3d4e5f6a7b8c9',
    });
    assert.equal(hasAuditFilterErrors(errors), false);
  });

  it('accepts action with colon and dash', () => {
    const { params } = buildAuditFilterParams({ action: 'task:status-changed' });
    assert.equal(params.action, 'task:status-changed');
  });

  it('rejects action with spaces or operators', () => {
    for (const bad of ['task updated', '{"$ne":1}', 'a*b', 'x'.repeat(65)]) {
      const { params, errors } = buildAuditFilterParams({ action: bad });
      assert.equal(params.action, undefined, bad);
      assert.equal(errors.action, true, bad);
    }
  });

  it('rejects resourceId outside [A-Za-z0-9_-]{1,64}', () => {
    for (const bad of ['abc.def', 'id with space', '../etc', 'a'.repeat(65)]) {
      const { params, errors } = buildAuditFilterParams({ resourceId: bad });
      assert.equal(params.resourceId, undefined, bad);
      assert.equal(errors.resourceId, true, bad);
    }
  });

  it('accepts 64-char boundary', () => {
    const { params, errors } = buildAuditFilterParams({ action: 'a'.repeat(64), resourceId: 'B'.repeat(64) });
    assert.equal(params.action.length, 64);
    assert.equal(params.resourceId.length, 64);
    assert.equal(hasAuditFilterErrors(errors), false);
  });
});

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

describe('orgCatalogAccess (Hub Settings catalog ACL)', () => {
  it('exports assertCanReadOrgCatalog', () => {
    const mod = require('../src/services/orgCatalogAccess.service');
    assert.equal(typeof mod.assertCanReadOrgCatalog, 'function');
  });

  it('list APIs accept projectId option in source', () => {
    const approvalSrc = fs.readFileSync(
      path.join(__dirname, '../src/services/approval.service.js'),
      'utf8'
    );
    const workflowSrc = fs.readFileSync(
      path.join(__dirname, '../src/services/workflow.service.js'),
      'utf8'
    );
    assert.match(approvalSrc, /assertCanReadOrgCatalog/);
    assert.match(workflowSrc, /assertCanReadOrgCatalog/);
    assert.match(approvalSrc, /projectId/);
    assert.match(workflowSrc, /listWorkflowTemplates\(organizationId, userId, \{ projectId/);
  });
});

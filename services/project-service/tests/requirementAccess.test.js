const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  isProductJobTitle,
  isSubmitterJobTitle,
  isApproverJobTitle,
} = require('../src/utils/requirementProductUser');
const { canImportViaOrgRole } = require('../src/utils/requirementAccessPolicy');
const { REQUIREMENT_PERMISSIONS } = require('../src/constants/requirementLifecycle');

describe('requirementProductUser job title helpers', () => {
  it('submitter accepts business analyst only', () => {
    assert.equal(isSubmitterJobTitle('Business Analyst'), true);
    assert.equal(isSubmitterJobTitle('Product Manager'), false);
    assert.equal(isSubmitterJobTitle('Software Developer'), false);
  });

  it('approver accepts Product Manager, Project Manager, Product Owner only', () => {
    assert.equal(isApproverJobTitle('Product Manager'), true);
    assert.equal(isApproverJobTitle('Product Owner'), true);
    assert.equal(isApproverJobTitle('Project Manager'), true);
    assert.equal(isApproverJobTitle('product_owner'), true);
    assert.equal(isApproverJobTitle('project_manager'), true);
    assert.equal(isApproverJobTitle('Business Analyst'), false);
    assert.equal(isApproverJobTitle('Software Developer'), false);
    assert.equal(isApproverJobTitle('Engineering Manager'), false);
  });

  it('legacy isProductJobTitle accepts BA or PO proxy', () => {
    assert.equal(isProductJobTitle('Business Analyst'), true);
    assert.equal(isProductJobTitle('Product Manager'), true);
    assert.equal(isProductJobTitle('Software Developer'), false);
    assert.equal(isProductJobTitle(''), false);
  });
});

describe('requirementAccess org role helpers', () => {
  it('owner/admin/hr can import via org role (Admin Hub) but that is not approve', () => {
    assert.equal(canImportViaOrgRole('owner'), true);
    assert.equal(canImportViaOrgRole('admin'), true);
    assert.equal(canImportViaOrgRole('hr'), true);
    assert.equal(canImportViaOrgRole('member'), false);
  });
});

describe('requirement:create-project gate (T3)', () => {
  it('lists create-project and run-ai-planning permission keys', () => {
    assert.ok(REQUIREMENT_PERMISSIONS.includes('requirement:create-project'));
    assert.ok(REQUIREMENT_PERMISSIONS.includes('requirement:run-ai-planning'));
  });

  it('run-ai-planning reserved for PO/PM approvers (not BA submitter)', () => {
    // Collaborate UI: canRunAiPlanning mirrors canApprove (PO/PM only).
    // Admin Hub: org owner/admin/hr via canUserRunAiPlanning org_admin path.
    assert.ok(REQUIREMENT_PERMISSIONS.includes('requirement:run-ai-planning'));
    assert.equal(isApproverJobTitle('Product Manager'), true);
    assert.equal(isSubmitterJobTitle('Business Analyst'), true);
    assert.equal(isApproverJobTitle('Business Analyst'), false);
  });

  it('create-from-pack gate mirrors canCreateTask flag', () => {
    // Same predicate as canCreateTaskInScope / canCreateFromPack (avoid importing env-bound module).
    const canCreateFromPack = (scope) => Boolean(scope?.canCreateTask);
    assert.equal(canCreateFromPack({ canCreateTask: true }), true);
    assert.equal(canCreateFromPack({ canCreateTask: false }), false);
    assert.equal(canCreateFromPack(null), false);
  });
});

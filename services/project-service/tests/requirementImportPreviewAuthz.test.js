/**
 * T1 — Customer Raw preview authz vs Analysis/SRS confirm (RULE-01/02).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  canPreviewCustomerRawRequirement,
} = require('../src/utils/requirement/customerRawPreviewAuthz');

describe('canPreviewCustomerRawRequirement (RULE-01)', () => {
  it('allows when persona has import even without create-project scope', () => {
    assert.equal(
      canPreviewCustomerRawRequirement({
        actions: { import: true },
        scope: { canCreateProject: false, canCreateTask: false },
      }),
      true
    );
  });

  it('allows create-project scope without import (wizard PM/PO path)', () => {
    assert.equal(
      canPreviewCustomerRawRequirement({
        actions: { import: false },
        scope: { canCreateProject: true },
      }),
      true
    );
  });

  it('allows legacy canCreateTask when canCreateProject absent (compat)', () => {
    assert.equal(
      canPreviewCustomerRawRequirement({
        actions: { import: false },
        scope: { canCreateTask: true },
      }),
      true
    );
  });

  it('denies member without import and without create scope', () => {
    assert.equal(
      canPreviewCustomerRawRequirement({
        actions: { import: false, view: true },
        scope: { canCreateProject: false, canCreateTask: false },
      }),
      false
    );
  });

  it('denies when scope missing and import false', () => {
    assert.equal(
      canPreviewCustomerRawRequirement({
        actions: { import: false },
        scope: null,
      }),
      false
    );
  });
});

describe('previewRequirementImport / confirmImport wiring (RULE-01/02)', () => {
  const importSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/requirementImport.service.js'),
    'utf8'
  );
  const accessSrc = fs.readFileSync(
    path.join(__dirname, '../src/services/requirementAccess.service.js'),
    'utf8'
  );

  it('peeks template before authz and uses widened gate for Customer Raw only', () => {
    assert.match(importSrc, /peekWorkbookTemplateType/);
    assert.match(importSrc, /isCustomerRawTemplateType\(peekedType\)/);
    assert.match(importSrc, /assertRequirementImportOrCreateProjectScope/);
    const rawBlock = importSrc.indexOf('isCustomerRawTemplateType(peekedType)');
    const widened = importSrc.indexOf('assertRequirementImportOrCreateProjectScope', rawBlock);
    const importOnly = importSrc.indexOf(
      "assertRequirementPermission({ userId, organizationId, permission: 'requirement:import' })",
      rawBlock
    );
    assert.ok(widened > rawBlock, 'Customer Raw uses widened assert after peek');
    assert.ok(importOnly > widened, 'Analysis/SRS path keeps import-only after Customer Raw branch');
  });

  it('confirmImport stays requirement:import only', () => {
    const confirmIdx = importSrc.indexOf('async function confirmRequirementImport');
    assert.ok(confirmIdx > 0);
    const confirmSlice = importSrc.slice(confirmIdx, confirmIdx + 400);
    assert.match(
      confirmSlice,
      /assertRequirementPermission\(\{\s*userId,\s*organizationId,\s*permission:\s*'requirement:import'\s*\}\)/
    );
    assert.doesNotMatch(confirmSlice, /assertRequirementImportOrCreateProjectScope/);
  });

  it('widened helper uses create-project scope not project roles', () => {
    assert.match(accessSrc, /assertRequirementImportOrCreateProjectScope/);
    assert.match(accessSrc, /canPreviewCustomerRawRequirement/);
    assert.match(accessSrc, /customerRawPreviewAuthz/);
    const helperSlice = accessSrc.slice(
      accessSrc.indexOf('assertRequirementImportOrCreateProjectScope'),
      accessSrc.indexOf('assertRequirementImportOrCreateProjectScope') + 900
    );
    assert.doesNotMatch(helperSlice, /projectRole|ProjectMembership/);
  });
});

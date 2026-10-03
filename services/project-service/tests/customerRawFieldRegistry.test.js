const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
} = require('../src/constants/customerRawTemplate.constants');
const {
  REGISTRY_VERSION,
  ROLES,
  lookupFieldBinding,
  assertRegistryCoversTemplateColumns,
} = require('../src/constants/customerRawFieldRegistry');

describe('customerRawFieldRegistry', () => {
  it('pins registry version', () => {
    assert.equal(REGISTRY_VERSION, 'raw-sem-v1');
  });

  it('covers every template column / context field', () => {
    const { ok, missing } = assertRegistryCoversTemplateColumns();
    assert.equal(ok, true, `missing: ${missing.join(', ')}`);
  });

  it('maps 03 Requirement to functional_behavior content role', () => {
    const b = lookupFieldBinding(CUSTOMER_RAW_SHEETS.REQUIREMENT, 'Requirement');
    assert.equal(b.semantic, 'functional_behavior');
    assert.equal(b.role, ROLES.CONTENT);
  });

  it('maps provenance columns separately from content', () => {
    const src = lookupFieldBinding(CUSTOMER_RAW_SHEETS.REQUIREMENT, 'Source');
    const detail = lookupFieldBinding(CUSTOMER_RAW_SHEETS.REQUIREMENT, 'Source Detail');
    assert.equal(src.role, ROLES.PROVENANCE);
    assert.equal(detail.role, ROLES.PROVENANCE);
    assert.notEqual(src.semantic, 'functional_behavior');
  });

  it('maps NFR Category/Requirement/Target as distinct semantics', () => {
    assert.equal(
      lookupFieldBinding(CUSTOMER_RAW_SHEETS.NFR, 'Category').semantic,
      'quality_attribute'
    );
    assert.equal(
      lookupFieldBinding(CUSTOMER_RAW_SHEETS.NFR, 'Customer Requirement').semantic,
      'quality_requirement'
    );
    assert.equal(
      lookupFieldBinding(CUSTOMER_RAW_SHEETS.NFR, 'Target').semantic,
      'quality_target'
    );
  });

  it('Meta and README are policy/metadata roles only', () => {
    const meta = lookupFieldBinding(CUSTOMER_RAW_SHEETS.META, 'TemplateVersion');
    const readme = lookupFieldBinding(CUSTOMER_RAW_SHEETS.README, 'Forbidden');
    assert.equal(meta.role, ROLES.IMPORT_METADATA);
    assert.equal(readme.role, ROLES.TEMPLATE_POLICY);
  });

  it('lists expected sheet column counts', () => {
    assert.ok(CUSTOMER_RAW_CONTEXT_FIELDS.length >= 18);
    assert.equal(
      CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REQUIREMENT].length,
      14
    );
  });
});

describe('packNeedsCanonicalRawBackfill', () => {
  const {
    packNeedsCanonicalRawBackfill,
  } = require('../src/utils/requirement/workbookDiagnostic');

  it('true for customer_raw pack missing registryVersion', () => {
    assert.equal(
      packNeedsCanonicalRawBackfill({
        aiAnalysis: {
          workbookDiagnostic: { intakeKind: 'customer_raw' },
          customerRawRows: { businessRequests: [{ requestId: 'BRQ-1' }] },
        },
      }),
      true
    );
  });

  it('false when canonicalRaw.registryVersion present', () => {
    assert.equal(
      packNeedsCanonicalRawBackfill({
        aiAnalysis: {
          workbookDiagnostic: { intakeKind: 'customer_raw' },
          canonicalRaw: { registryVersion: 'raw-sem-v1' },
        },
      }),
      false
    );
  });

  it('false for non-raw pack', () => {
    assert.equal(packNeedsCanonicalRawBackfill({ aiAnalysis: {} }), false);
  });
});

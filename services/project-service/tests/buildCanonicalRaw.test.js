const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCustomerRawTemplateBuffer,
} = require('../src/utils/requirement/customerRawTemplateBuilder');
const {
  buildCanonicalRaw,
  REGISTRY_VERSION,
} = require('../src/utils/requirement/buildCanonicalRaw');
const { ROLES } = require('../src/constants/customerRawFieldRegistry');
const { parseCustomerRawContext } = require('../src/utils/requirement/customerRawContextParse');

describe('buildCanonicalRaw', () => {
  it('builds canonicalRaw from Customer Raw template with content/provenance split', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const canonical = buildCanonicalRaw(buf, { fileName: 'Customer_Requirement_Raw.xlsx' });
    assert.ok(canonical);
    assert.equal(canonical.registryVersion, REGISTRY_VERSION);
    assert.ok(canonical.counts.requirements >= 1);
    assert.ok(canonical.content.functionalBehaviors.length >= 1);

    const fr = canonical.content.functionalBehaviors[0];
    assert.ok(fr.functional_behavior);
    assert.equal(
      String(fr.functional_behavior).toLowerCase().includes('system shall'),
      false
    );

    // README / policy must not appear as functional content
    const joined = JSON.stringify(canonical.content.functionalBehaviors);
    assert.equal(joined.includes('Forbidden'), false);
    assert.ok(Array.isArray(canonical.policy.readme));
    assert.ok(
      canonical.policy.readme.every((r) => r.role === ROLES.TEMPLATE_POLICY)
    );

    // NFR keeps attribute / requirement / target distinct when present
    if (canonical.records.nfrs.length) {
      const n = canonical.records.nfrs[0];
      assert.ok('quality_attribute' in n);
      assert.ok('quality_requirement' in n);
      assert.ok('quality_target' in n);
    }
  });

  it('parseCustomerRawContext attaches canonicalRaw for Customer Raw', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const parsed = parseCustomerRawContext(buf);
    assert.equal(parsed.isCustomerRaw, true);
    assert.ok(parsed.canonicalRaw);
    assert.equal(parsed.canonicalRaw.registryVersion, REGISTRY_VERSION);
  });

  it('returns null for non-Customer-Raw workbook', () => {
    const XLSX = require('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['Requirement ID', 'Requirement'],
      ['FR-1', 'Do something'],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    assert.equal(buildCanonicalRaw(wb), null);
  });
});

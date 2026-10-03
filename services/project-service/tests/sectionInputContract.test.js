const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSectionInput,
  frSectionToPackRows,
  nfrSectionToPackRows,
} = require('../src/utils/requirement/sectionInputContract');
const {
  buildCustomerRawTemplateBuffer,
} = require('../src/utils/requirement/customerRawTemplateBuilder');
const { buildCanonicalRaw } = require('../src/utils/requirement/buildCanonicalRaw');

describe('sectionInputContract', () => {
  it('builds fr/nfr/bg/scope from canonicalRaw whitelist', async () => {
    const buf = Buffer.from(await buildCustomerRawTemplateBuffer());
    const canonical = buildCanonicalRaw(buf);
    assert.ok(canonical);

    const fr = buildSectionInput('fr', canonical);
    assert.equal(fr.ok, true);
    assert.ok(fr.items[0].functional_behavior);
    assert.ok(!('source_type' in fr.items[0]) || fr.items[0].provenance);

    const packFr = frSectionToPackRows(fr);
    assert.equal(packFr[0].name, fr.items[0].functional_behavior);

    const nfr = buildSectionInput('nfr', canonical);
    if (nfr.items.length) {
      assert.ok('quality_requirement' in nfr.items[0]);
      assert.ok('quality_target' in nfr.items[0]);
      const packNfr = nfrSectionToPackRows(nfr);
      assert.equal(packNfr[0].requirement, nfr.items[0].quality_requirement);
      assert.equal(packNfr[0].target, nfr.items[0].quality_target);
    }
    // Context constraints must not be NFR items
    assert.ok(nfr.impliedContext);
    assert.equal(
      nfr.items.some((i) => i.quality_requirement === nfr.impliedContext.platform_constraint),
      false
    );

    const bg = buildSectionInput('bg', canonical);
    assert.ok(bg.scalars || bg.items);
    const scope = buildSectionInput('scope', canonical);
    assert.ok(Array.isArray(scope.items));
  });

  it('marks incomplete when canonicalRaw missing', () => {
    const fr = buildSectionInput('fr', null);
    assert.equal(fr.incomplete, true);
    assert.ok(fr.missing.includes('canonical_raw'));
  });
});

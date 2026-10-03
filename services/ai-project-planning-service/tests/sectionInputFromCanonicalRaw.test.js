const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSectionInput,
  resolveFrListForG4,
  nfrSectionToPackRows,
} = require('../src/semantic/sectionInputContract');

function sampleCanonicalRaw() {
  return {
    registryVersion: 'raw-sem-v1',
    templateVersion: '1.1-raw',
    content: {
      functionalBehaviors: [
        {
          id: 'FR-001',
          functional_behavior: 'Employee can check in',
          actor: 'Employee',
          priority: 'High',
          acceptance_condition: 'Check-in recorded',
          functional_scope: 'Attendance',
          business_request_reference: 'BRQ-001',
          provenance: { source_type: 'customer_raw', sheet: '03' },
        },
      ],
      qualityRequirements: [
        {
          id: 'NFR-001',
          quality_attribute: 'Performance',
          quality_requirement: 'Response under 2s',
          quality_target: '2s',
          priority: 'High',
        },
      ],
      businessObjectives: ['Improve attendance'],
      businessGoals: ['Track attendance accurately'],
      businessProblems: ['Manual timesheets'],
      scopes: ['HR attendance'],
      scopeIn: ['Check-in/out'],
      scopeOut: ['Payroll calculation'],
    },
    records: {
      businessRequests: [
        {
          business_request_identity: 'BRQ-001',
          business_request_title: 'Attendance',
          business_goal: 'Improve attendance management',
          business_problem: 'Manual timesheets',
          customer_statement: 'Need digital attendance',
          classification: { priority: 'High' },
          stakeholder: 'HR',
        },
      ],
    },
    constraints: {
      platform_constraint: 'Web only',
      business_constraint: 'Budget limited',
    },
  };
}

describe('sectionInputFromCanonicalRaw (APS)', () => {
  it('buildSectionInput fr/nfr/bg/scope whitelist', () => {
    const cr = sampleCanonicalRaw();
    const fr = buildSectionInput('fr', cr);
    assert.equal(fr.ok, true);
    assert.equal(fr.items[0].functional_behavior, 'Employee can check in');
    assert.ok(!String(JSON.stringify(fr.items[0])).includes('Web only'));

    const nfr = buildSectionInput('nfr', cr);
    assert.equal(nfr.items[0].quality_target, '2s');
    assert.equal(nfr.impliedContext.platform_constraint, 'Web only');
    const packNfr = nfrSectionToPackRows(nfr);
    assert.equal(packNfr[0].target, '2s');
    assert.equal(packNfr[0].requirement, 'Response under 2s');
    assert.ok(!packNfr.some((r) => r.requirement === 'Web only'));

    const bg = buildSectionInput('bg', cr);
    assert.equal(bg.ok, true);
    assert.equal(bg.items[0].business_goal, 'Improve attendance management');

    const scope = buildSectionInput('scope', cr);
    assert.ok(scope.items.some((i) => i.type === 'in'));
    assert.ok(scope.items.some((i) => i.type === 'out'));
  });

  it('resolveFrListForG4 prefers canonicalRaw', () => {
    const cr = sampleCanonicalRaw();
    const rows = resolveFrListForG4({ canonicalRaw: cr }, {
      functionalRequirements: [{ externalId: 'FR-OLD', name: 'Old' }],
    });
    assert.equal(rows[0].externalId, 'FR-001');
    assert.equal(rows[0].name, 'Employee can check in');
  });

  it('marks incomplete without canonicalRaw', () => {
    const fr = buildSectionInput('fr', null);
    assert.equal(fr.incomplete, true);
    assert.ok(fr.missing.includes('canonical_raw'));
  });
});

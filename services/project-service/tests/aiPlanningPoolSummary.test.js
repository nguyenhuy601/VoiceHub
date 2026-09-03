const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { buildOrgPoolSummary } = require('../src/utils/aiPlanningPoolSummary');

describe('aiPlanningPoolSummary', () => {
  it('returns safe defaults for empty pool', () => {
    const summary = buildOrgPoolSummary([]);
    assert.equal(summary.headcount, 0);
    assert.equal(summary.avgAvailablePct, null);
    assert.equal(summary.avgAvailableHours, null);
    assert.deepEqual(summary.topSkills, []);
    assert.deepEqual(summary.seniorityBands, { senior: 0, mid: 0, junior: 0, other: 0 });
    assert.deepEqual(summary.roleHeadcount, []);
  });

  it('aggregates roleHeadcount from job titles without PII', () => {
    const summary = buildOrgPoolSummary([
      { jobTitle: 'Software Developer', capability: { skills: [] } },
      { jobTitle: 'Software Developer', capability: { skills: [] } },
      { jobTitle: 'QA Engineer', capability: { skills: [] } },
    ]);
    const fe = summary.roleHeadcount.find((r) => r.roleKey === 'frontend_developer');
    assert.ok(fe);
    assert.equal(fe.count, 2);
    const qa = summary.roleHeadcount.find((r) => r.roleKey === 'qa_engineer');
    assert.ok(qa);
    assert.equal(qa.count, 1);
    assert.ok(!JSON.stringify(summary).includes('@'));
  });

  it('aggregates skills, seniority, and availability without PII', () => {
    const summary = buildOrgPoolSummary([
      {
        availability: 'available',
        availablePct: 80,
        capacityRange: { availableHours: 120 },
        capability: {
          seniorityBand: 'senior',
          skills: [{ name: 'React' }, { name: 'TypeScript' }],
        },
        email: 'secret@example.com',
        displayName: 'Alice',
      },
      {
        availability: 'partial',
        availablePct: 40,
        capacityRange: { availableHours: 80 },
        capability: {
          seniorityBand: 'mid',
          skills: [{ name: 'React' }],
        },
      },
    ]);

    assert.equal(summary.headcount, 2);
    assert.equal(summary.avgAvailablePct, 60);
    assert.equal(summary.avgAvailableHours, 100);
    assert.equal(summary.availabilityBreakdown.available, 1);
    assert.equal(summary.availabilityBreakdown.partial, 1);
    assert.equal(summary.seniorityBands.senior, 1);
    assert.equal(summary.seniorityBands.mid, 1);
    assert.equal(summary.topSkills[0].name, 'React');
    assert.equal(summary.topSkills[0].count, 2);
    assert.ok(!JSON.stringify(summary).includes('secret@example.com'));
    assert.ok(!JSON.stringify(summary).includes('Alice'));
  });

  it('handles single-person pool without divide-by-zero', () => {
    const summary = buildOrgPoolSummary([
      {
        availability: 'available',
        availablePct: 100,
        capability: { seniorityBand: 'junior', skills: [] },
      },
    ]);
    assert.equal(summary.headcount, 1);
    assert.equal(summary.avgAvailablePct, 100);
    assert.equal(summary.avgAvailableHours, null);
  });
});

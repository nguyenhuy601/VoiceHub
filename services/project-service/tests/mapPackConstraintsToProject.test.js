const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  mapPackConstraintsToProject,
  DEFAULT_TITLE,
} = require('../src/utils/mapPackConstraintsToProject');

describe('mapPackConstraintsToProject', () => {
  it('maps roles, budget, and dates (T1)', () => {
    const start = new Date('2026-03-01T00:00:00.000Z');
    const deadline = new Date('2026-06-30T00:00:00.000Z');
    const mapped = mapPackConstraintsToProject({
      overview: {
        requirementName: 'CRM Revamp',
        projectObjective: 'Modernize CRM',
        budget: 150000000,
        budgetCurrency: 'VND',
        startDate: start,
        deadline,
      },
      staffingPlan: {
        requiredRoles: [
          { roleKey: 'backend_developer', requiredCount: 2, source: 'excel' },
          { roleKey: 'qa_engineer', requiredCount: 1, source: 'rollup' },
        ],
      },
    });

    assert.equal(mapped.title, 'CRM Revamp');
    assert.equal(mapped.description, 'Modernize CRM');
    assert.deepEqual(mapped.requiredProjectRoles, [
      { roleKey: 'backend_developer', requiredCount: 2 },
      { roleKey: 'qa_engineer', requiredCount: 1 },
    ]);
    assert.deepEqual(mapped.budgetStub, {
      amount: 150000000,
      currency: 'VND',
      note: '',
    });
    assert.equal(mapped.startDate, start);
    assert.equal(mapped.expectedEndDate, deadline);
    assert.equal(mapped.dueDate, deadline);
  });

  it('returns null budgetStub when budget missing (T1)', () => {
    const mapped = mapPackConstraintsToProject({
      overview: { requirementName: 'No budget' },
      staffingPlan: { requiredRoles: [] },
    });
    assert.equal(mapped.budgetStub, null);
    assert.deepEqual(mapped.requiredProjectRoles, []);
  });

  it('prefers staffing startDate and currency fallbacks', () => {
    const staffingStart = new Date('2026-04-01T00:00:00.000Z');
    const mapped = mapPackConstraintsToProject({
      overview: { budget: 10 },
      staffingPlan: {
        startDate: staffingStart,
        budgetCurrency: 'USD',
        requiredRoles: [{ roleKey: 'Developer', requiredCount: 1 }],
      },
    });
    assert.equal(mapped.startDate, staffingStart);
    assert.equal(mapped.budgetStub.currency, 'USD');
    assert.deepEqual(mapped.requiredProjectRoles, [
      { roleKey: 'developer', requiredCount: 1 },
    ]);
  });

  it('falls back title when overview name missing (T2)', () => {
    assert.equal(
      mapPackConstraintsToProject({ sourceFileName: 'req.xlsx' }).title,
      'req.xlsx'
    );
    assert.equal(mapPackConstraintsToProject({}).title, DEFAULT_TITLE);
    assert.equal(
      mapPackConstraintsToProject(
        { overview: { requirementName: 'Ignored' } },
        { titleOverride: '  Custom Title  ' }
      ).title,
      'Custom Title'
    );
  });
});

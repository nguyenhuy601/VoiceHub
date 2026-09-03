const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAiPlanningPhase } = require('../src/utils/aiPlanningPhase');

describe('normalizeAiPlanningPhase', () => {
  it('accepts staffing, enrich, full', () => {
    assert.equal(normalizeAiPlanningPhase('staffing'), 'staffing');
    assert.equal(normalizeAiPlanningPhase('ENRICH'), 'enrich');
    assert.equal(normalizeAiPlanningPhase('full'), 'full');
  });

  it('defaults invalid or missing to full', () => {
    assert.equal(normalizeAiPlanningPhase(undefined), 'full');
    assert.equal(normalizeAiPlanningPhase(null), 'full');
    assert.equal(normalizeAiPlanningPhase(''), 'full');
    assert.equal(normalizeAiPlanningPhase('nope'), 'full');
  });
});

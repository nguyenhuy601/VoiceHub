const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { historyOverlapBonus } = require('../src/engines/matchingFit');
const { SOFT_SCORERS } = require('../src/engines/assignmentCriteria');

describe('matching tech overlap bonus (IO reuse)', () => {
  const task = { suggestedRoleKey: 'backend_dev' };
  const needSkills = new Set(['nodejs', 'mongodb']);

  it('historyOverlapBonus increases when history technologies overlap needSkills', () => {
    const withoutTech = {
      history: [{ role: 'backend_dev', domain: 'finance', technologies: [] }],
    };
    const withTech = {
      history: [{ role: 'backend_dev', domain: 'finance', technologies: ['Node.js', 'MongoDB'] }],
    };
    const base = historyOverlapBonus(withoutTech, task, needSkills);
    const boosted = historyOverlapBonus(withTech, task, needSkills);
    assert.ok(boosted > base, `expected ${boosted} > ${base}`);
    assert.ok(boosted <= 0.1);
  });

  it('similarExperience scores techHit against needNames', () => {
    const ctxNoTech = {
      item: {
        history: [{ role: 'other', domain: '', work: '', technologies: [] }],
      },
      task: { suggestedRoleKey: 'frontend_dev' },
      needNames: new Set(['react']),
    };
    const ctxTech = {
      item: {
        history: [{ role: 'other', domain: '', work: '', technologies: ['React', 'TypeScript'] }],
      },
      task: { suggestedRoleKey: 'frontend_dev' },
      needNames: new Set(['react']),
    };
    const zero = SOFT_SCORERS.similarExperience(ctxNoTech);
    const hit = SOFT_SCORERS.similarExperience(ctxTech);
    assert.equal(zero.available, true);
    assert.equal(zero.score, 0);
    assert.equal(hit.available, true);
    assert.ok(hit.score > 0);
    assert.ok(hit.score >= 0.15);
  });
});

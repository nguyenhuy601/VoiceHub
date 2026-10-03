/**
 * RULE-G1-MEM — enrich does not persist PlanningRun.input
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  enrichRunInputWithG1Catalogs,
} = require('../src/knowledge/enrichRunInputWithG1Catalogs');

describe('enrichRunInputWithG1Catalogs in-memory', () => {
  it('returns enriched run without Mongo write', async () => {
    const run = {
      _id: 'ffffffffffffffffffffffff',
      input: {
        pack: {
          staffingPlan: { requiredSkills: [{ name: 'React' }] },
          requirementSkills: [],
        },
        snapshot: { projected: { employees: [] } },
      },
    };
    const before = JSON.stringify(run.input);
    const enriched = await enrichRunInputWithG1Catalogs(run);
    assert.ok(enriched.snapshot);
    assert.ok(enriched.run.input.g1Catalogs || enriched.g1Catalogs);
    // Original object input reference not required immutable; Mongo must not be required
    assert.equal(typeof enriched.run.input, 'object');
    assert.notEqual(JSON.stringify(enriched.run.input), before);
  });
});

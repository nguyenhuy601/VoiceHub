/**
 * Tool registry — reject unknown / wrong mode / missing dependsOn.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequirementToolsRegistry,
  createFactStore,
  projectCanonicalBundle,
} = require('../../src/utils/tools');

describe('toolRegistry', () => {
  it('rejects unknown tool', () => {
    const registry = createRequirementToolsRegistry();
    assert.throws(
      () => registry.execute('unknown_tool', {}, { allowedModes: ['recipe'] }),
      (err) => err.code === 'UNKNOWN_TOOL'
    );
  });

  it('rejects on_demand tool when only recipe allowed', () => {
    const registry = createRequirementToolsRegistry();
    assert.throws(
      () =>
        registry.execute(
          'ambiguity_detection',
          { fr: [] },
          { allowedModes: ['recipe'], factStore: createFactStore() }
        ),
      (err) => err.code === 'MODE_NOT_ALLOWED'
    );
  });

  it('rejects coverage without dependsOn facts', () => {
    const registry = createRequirementToolsRegistry();
    assert.throws(
      () =>
        registry.execute(
          'requirement_coverage',
          { fr: [], graph: { edges: [] } },
          { allowedModes: ['recipe'], factStore: createFactStore() }
        ),
      (err) => err.code === 'MISSING_DEPENDS_ON'
    );
  });

  it('projects pack into canonical bundle', () => {
    const bundle = projectCanonicalBundle({
      pack: {
        functionalRequirements: [
          {
            externalId: 'FR-01',
            level: 'Requirement',
            name: 'Login',
            priority: 'High',
            acceptanceCriteria: 'Given user When login Then ok',
            customerRequirementIds: ['CR-01'],
          },
        ],
        nonFunctionalRequirements: [
          { externalId: 'NFR-01', category: 'Performance', requirement: 'API fast', priority: 'High' },
        ],
        useCases: [{ externalId: 'UC-01', frIds: ['FR-01'], name: 'Login UC' }],
      },
    });
    assert.equal(bundle.fr.length, 1);
    assert.equal(bundle.fr[0].id, 'FR-01');
    assert.ok(bundle.traceLinks.some((e) => e.from === 'UC-01' && e.to === 'FR-01'));
  });
});

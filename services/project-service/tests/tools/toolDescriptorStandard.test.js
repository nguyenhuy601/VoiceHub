/**
 * Standard ToolDescriptor + input envelope
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeToolDescriptor } = require('../../src/utils/tools/toolDescriptor');
const { normalizeToolInput } = require('../../src/utils/tools/normalizeToolInput');
const {
  createRequirementToolsRegistry,
  createFactStore,
} = require('../../src/utils/tools');

describe('toolDescriptorStandard', () => {
  it('rejects descriptor without purpose', () => {
    assert.throws(
      () =>
        normalizeToolDescriptor({
          name: 'x',
          algorithm: ['a'],
          run: () => ({}),
        }),
      (err) => err.code === 'INVALID_DESCRIPTOR'
    );
  });

  it('normalizes legacy flat input into data/context/policy', () => {
    const n = normalizeToolInput(
      { fr: [{ id: 'FR-1' }], context: { objective: 'ship' }, policy: { version: 'p1' } },
      { phase: 'ra' }
    );
    assert.equal(n.data.fr[0].id, 'FR-1');
    assert.equal(n.context.objective, 'ship');
    assert.equal(n.context.phase, 'ra');
    assert.equal(n.policy.version, 'p1');
  });

  it('registry list exposes purpose and algorithm', () => {
    const registry = createRequirementToolsRegistry();
    const items = registry.list();
    assert.ok(items.length >= 12);
    for (const item of items) {
      assert.ok(item.purpose, item.name);
      assert.ok(Array.isArray(item.algorithm) && item.algorithm.length > 0, item.name);
    }
  });

  it('execute attaches evidence.toolVersion', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const result = registry.execute(
      'requirement_completeness',
      { data: { fr: [{ id: 'FR-1', level: 'requirement', name: 'X', priority: 'High' }] }, policy: { version: 'pol-1' } },
      { factStore: store, allowedModes: ['recipe'] }
    );
    assert.equal(result.evidence.toolVersion, 'v1');
    assert.equal(result.evidence.policyVersion, 'pol-1');
  });

  it('envelope and legacy flat produce same completeness score', () => {
    const registry = createRequirementToolsRegistry();
    const fr = [
      {
        id: 'FR-1',
        level: 'requirement',
        name: 'Login',
        actor: 'User',
        priority: 'High',
        ac: 'Given When Then',
        input: 'u',
        output: 's',
        businessRules: 'r',
        exceptionFlow: 'e',
        dependency: 'd',
        constraint: 'c',
        mainFlow: 'm',
      },
    ];
    const a = registry.execute(
      'requirement_completeness',
      { fr },
      { factStore: createFactStore(), allowedModes: ['recipe'] }
    );
    const b = registry.execute(
      'requirement_completeness',
      { data: { fr }, context: {}, policy: {} },
      { factStore: createFactStore(), allowedModes: ['recipe'] }
    );
    assert.equal(a.data.overall, b.data.overall);
  });
});

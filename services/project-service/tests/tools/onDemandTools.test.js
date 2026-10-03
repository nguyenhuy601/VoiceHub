/**
 * On-demand A5–A10
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequirementToolsRegistry,
  createFactStore,
  runRecipeWave,
  runOnDemandTool,
} = require('../../src/utils/tools');

describe('onDemandTools', () => {
  it('A5 flags possible duplicate without merge', () => {
    const registry = createRequirementToolsRegistry();
    const result = runOnDemandTool(
      registry,
      'requirement_similarity_duplicate',
      {
        fr: [
          {
            id: 'FR-021',
            level: 'requirement',
            name: 'Employee check in',
            description: 'Employee can check-in at office',
            ac: 'Given employee When check-in Then ok',
            actor: 'Employee',
            input: 'qr',
            output: 'status',
          },
          {
            id: 'FR-084',
            level: 'requirement',
            name: 'Employee check in',
            description: 'Employee can check-in at office',
            ac: 'Given employee When check-in Then ok',
            actor: 'Employee',
            input: 'qr',
            output: 'status',
          },
        ],
        threshold: 0.8,
      },
      createFactStore()
    );
    assert.equal(result.data.mergePerformed, false);
    assert.ok(result.data.pairs.length >= 1);
    assert.equal(result.data.pairs[0].merge, false);
  });

  it('A6 detects vague language', () => {
    const registry = createRequirementToolsRegistry();
    const result = runOnDemandTool(
      registry,
      'ambiguity_detection',
      {
        fr: [
          {
            id: 'FR-01',
            level: 'requirement',
            name: 'Manage things quickly',
            description: 'System should manage data quickly',
            ac: '',
            actor: '',
          },
        ],
      },
      createFactStore()
    );
    assert.ok(result.data.items[0].ambiguity >= 0.6);
    assert.ok(result.data.items[0].signals.includes('quickly'));
  });

  it('A9 returns unknown without historical benchmarks', () => {
    const registry = createRequirementToolsRegistry();
    const result = runOnDemandTool(
      registry,
      'nfr_feasibility',
      {
        nfr: [
          {
            id: 'NFR-01',
            category: 'Performance',
            requirement: 'API response',
            target: 'Response < 2s',
          },
        ],
        technology: [],
        perfBenchmarks: [],
      },
      createFactStore()
    );
    assert.equal(result.data.items[0].verdict, 'unknown');
    assert.ok(result.warnings.some((w) => w.code === 'MISSING_HISTORICAL_PERF'));
  });

  it('A10 planning relevance uses complexity facts', () => {
    const registry = createRequirementToolsRegistry();
    const bundle = {
      fr: [
        {
          id: 'FR-021',
          level: 'requirement',
          name: 'Integrations',
          description: 'Connect four systems',
          priority: 'critical',
          ac: 'Given When Then',
          integrationRefs: ['A', 'B', 'C', 'D'],
          nfrRefs: ['NFR-1', 'NFR-2'],
          brIds: ['BR-1'],
          bpmIds: ['BPM-1'],
          dataEntityIds: [],
          crRefs: [],
          parentId: '',
        },
      ],
      nfr: [],
      uc: [],
      bg: [],
      br: [],
      bpm: [],
      capabilities: [],
      tasks: [],
      traceLinks: [],
      dependencyDegree: { 'FR-021': 3 },
      context: {},
      snapshotMeta: {},
    };
    const store = createFactStore();
    runRecipeWave(registry, bundle, { runGateA: false, factStore: store });
    const result = runOnDemandTool(
      registry,
      'planning_relevance',
      { fr: bundle.fr, dependencyDegree: bundle.dependencyDegree },
      store
    );
    assert.equal(result.data.items[0].planningRelevance, 'HIGH');
  });

  it('A7 and A8 run via registry', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const fr = [
      {
        id: 'FR-01',
        level: 'requirement',
        name: 'Login with password',
        description: 'Auth security login',
        priority: 'high',
        ac: '',
        actor: '',
        exceptionFlow: '',
        businessRules: '',
        input: '',
        output: '',
        dependency: '',
        constraint: '',
        brIds: [],
        bpmIds: [],
        parentId: '',
      },
    ];
    registry.execute(
      'requirement_completeness',
      { fr },
      { factStore: store, allowedModes: ['recipe'] }
    );
    const gap = runOnDemandTool(
      registry,
      'gap_detection',
      { completenessItems: store.get('completeness.items').value },
      store
    );
    assert.ok(gap.data.items.length >= 1);

    const cls = runOnDemandTool(registry, 'requirement_classification', { fr, nfr: [] }, store);
    assert.equal(cls.data.items[0].category, 'Security');
  });
});

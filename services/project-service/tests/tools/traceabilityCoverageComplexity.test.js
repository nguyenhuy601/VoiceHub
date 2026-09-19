/**
 * A1 traceability + A2 coverage + T3 complexity
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequirementToolsRegistry,
  createFactStore,
  runRecipeWave,
} = require('../../src/utils/tools');

function miniBundle() {
  return {
    fr: [
      {
        id: 'FR-01',
        level: 'requirement',
        parentId: 'FE-01',
        name: 'Login',
        description: 'User login',
        priority: 'high',
        ac: 'Given user When login Then session',
        crRefs: ['CR-01'],
        nfrRefs: [],
        integrationRefs: ['SYS-AUTH'],
        dataEntityIds: ['User', 'Session'],
        brIds: [],
        bpmIds: [],
      },
      {
        id: 'FR-02',
        level: 'requirement',
        parentId: 'FE-01',
        name: 'Logout',
        description: 'User logout',
        priority: 'medium',
        ac: 'Given session When logout Then cleared',
        crRefs: ['CR-01'],
        nfrRefs: [],
        integrationRefs: [],
        dataEntityIds: [],
        brIds: [],
        bpmIds: [],
      },
      {
        id: 'FR-03',
        level: 'requirement',
        parentId: 'FE-01',
        name: 'Profile',
        description: 'View profile',
        priority: 'high',
        ac: '',
        crRefs: [],
        nfrRefs: [],
        integrationRefs: [],
        dataEntityIds: [],
        brIds: [],
        bpmIds: [],
      },
      {
        id: 'FE-01',
        level: 'feature',
        parentId: 'MO-01',
        name: 'Auth feature',
        description: '',
        priority: 'medium',
        ac: '',
        crRefs: [],
        nfrRefs: [],
        integrationRefs: [],
        dataEntityIds: [],
        brIds: [],
        bpmIds: [],
      },
      {
        id: 'MO-01',
        level: 'module',
        parentId: '',
        name: 'Auth module',
        description: '',
        priority: 'medium',
        ac: '',
        crRefs: [],
        nfrRefs: [],
        integrationRefs: [],
        dataEntityIds: [],
        brIds: [],
        bpmIds: [],
      },
    ],
    nfr: [{ id: 'NFR-01', category: 'Performance', requirement: 'OK', target: '', priority: 'high' }],
    uc: [{ id: 'UC-01', frIds: ['FR-01'], title: 'Login UC' }],
    bg: [],
    br: [],
    bpm: [],
    capabilities: [
      { id: 'CAP-01', frIds: ['FR-01', 'FR-02'], name: 'Auth cap' },
    ],
    tasks: [],
    traceLinks: [
      { from: 'CR-01', to: 'FR-01', type: 'derives' },
      { from: 'CR-01', to: 'FR-02', type: 'derives' },
      { from: 'UC-01', to: 'FR-01', type: 'covers' },
      { from: 'CAP-01', to: 'FR-01', type: 'covers' },
      { from: 'CAP-01', to: 'FR-02', type: 'covers' },
    ],
    dependencyDegree: { 'FR-01': 2 },
    context: {},
    snapshotMeta: { packContentHash: 'abc' },
  };
}

describe('traceabilityGraph', () => {
  it('builds nodes/edges and dangling', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const bundle = miniBundle();
    bundle.traceLinks.push({ from: 'UC-01', to: 'FR-MISSING', type: 'covers' });
    const result = registry.execute(
      'traceability_graph',
      {
        fr: bundle.fr,
        nfr: bundle.nfr,
        uc: bundle.uc,
        capabilities: bundle.capabilities,
        traceLinks: bundle.traceLinks,
      },
      { factStore: store, allowedModes: ['recipe'] }
    );
    assert.ok(result.data.nodeCount || result.data.stats.nodeCount >= 3);
    assert.ok(result.data.dangling.some((d) => d.ref === 'FR-MISSING'));
    assert.equal(store.get('trace.danglingCount').value, result.data.dangling.length);
  });
});

describe('requirementCoverage', () => {
  it('weightedCoverage = 0.625 on 3-leaf worked example', () => {
    const registry = createRequirementToolsRegistry();
    const wave = runRecipeWave(registry, miniBundle(), { runGateA: false });
    assert.equal(wave.recipe.coverage.weightedCoverage, 0.625);
    assert.equal(wave.recipe.coverage.passed, false);
    assert.ok(wave.recipe.coverage.uncovered.some((u) => u.frId === 'FR-03'));
  });
});

describe('requirementComplexity', () => {
  it('scores band from rubric factors not length-only', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const bundle = miniBundle();
    // Long text alone should not force high if other factors low
    bundle.fr = [
      {
        id: 'FR-L',
        level: 'requirement',
        parentId: '',
        name: 'X',
        description: 'x'.repeat(500),
        priority: 'medium',
        ac: '',
        crRefs: [],
        nfrRefs: [],
        integrationRefs: [],
        dataEntityIds: [],
        brIds: [],
        bpmIds: [],
      },
    ];
    const result = registry.execute(
      'requirement_complexity',
      { fr: bundle.fr, dependencyDegree: {} },
      { factStore: store, allowedModes: ['recipe'] }
    );
    const item = result.data.items[0];
    assert.ok(item.factors.textSize === 1);
    assert.ok(item.factors.integrationCount === 0);
    // text alone weight 0.15 → score ~15 → low band
    assert.equal(item.band, 'low');
  });
});

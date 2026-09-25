/**
 * Group B — scope_analysis, scope_change_impact, constraint_validation
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequirementToolsRegistry,
  createFactStore,
  runRecipeWave,
  runOnDemandTool,
} = require('../../src/utils/tools');

describe('groupB_scope_analysis', () => {
  it('classifies optional wording and baseline expansion', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const result = registry.execute(
      'scope_analysis',
      {
        fr: [
          {
            id: 'FR-NEW',
            level: 'requirement',
            name: 'Export',
            description: 'User may optionally export reports if needed',
            actor: 'User',
            priority: 'Medium',
            ac: 'Given When Then',
          },
          {
            id: 'FR-OLD',
            level: 'requirement',
            name: 'Login',
            description: 'User login',
            actor: 'User',
            priority: 'Critical',
            ac: 'Given When Then',
          },
        ],
        baseline: { frIds: ['FR-OLD'] },
        context: { constraints: [], technology: [] },
        policy: { version: 'scope-v1' },
      },
      { factStore: store, allowedModes: ['recipe'] }
    );
    const byId = Object.fromEntries(result.data.classified.map((c) => [c.frId, c.scopeClass]));
    assert.equal(byId['FR-NEW'], 'optional');
    assert.equal(byId['FR-OLD'], 'mandatory');
    assert.ok(result.data.signals.expansion.some((e) => e.frId === 'FR-NEW'));
    assert.ok(store.get('scope.ambiguousCount'));
  });

  it('recipe wave includes scope analysis facts for Gate A', () => {
    const registry = createRequirementToolsRegistry();
    const wave = runRecipeWave(
      registry,
      {
        fr: [
          {
            id: 'FR-1',
            level: 'requirement',
            name: 'A',
            priority: 'high',
            ac: 'ok',
            actor: 'U',
            crRefs: [],
            nfrRefs: [],
            integrationRefs: [],
            dataEntityIds: [],
            brIds: [],
            bpmIds: [],
            parentId: '',
            description: 'desc',
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
        scope: [],
        dependencyDegree: {},
        context: {},
        snapshotMeta: {},
      },
      { runGateA: true, thresholds: { minWeightedCoverage: 0, minCompleteness: 0, maxConflictCount: 99 } }
    );
    assert.ok(wave.recipe.scope);
    assert.ok(wave.facts['scope.counts']);
  });
});

describe('groupB_scope_change_impact', () => {
  it('counts affected tasks and employees', () => {
    const registry = createRequirementToolsRegistry();
    const result = runOnDemandTool(
      registry,
      'scope_change_impact',
      {
        changedFrIds: ['FR-1', 'FR-2'],
        tasks: [
          { id: 'T1', sourceFrIds: ['FR-1'] },
          { id: 'T2', sourceFrIds: ['FR-2'] },
          { id: 'T3', sourceFrIds: ['FR-9'] },
        ],
        edges: [{ from: 'T2', to: 'T1' }],
        assignments: [
          { taskId: 'T1', employeeId: 'E1' },
          { taskId: 'T2', employeeId: 'E2' },
        ],
        milestones: [{ id: 'M1', taskIds: ['T1'] }],
      },
      createFactStore()
    );
    assert.equal(result.data.tasksAffected, 2);
    assert.equal(result.data.employeesAffected, 2);
    assert.equal(result.data.milestonesAffected, 1);
    assert.equal(result.data.scheduleDeltaDays, null);
    assert.ok(result.warnings.some((w) => w.code === 'MISSING_SCHEDULE_FACTS'));
  });
});

describe('groupB_constraint_validation', () => {
  it('capacity FAIL yields canPublish false', () => {
    const registry = createRequirementToolsRegistry();
    const result = registry.execute(
      'constraint_validation',
      {
        data: {
          deadline: '2030-01-01',
          planEnd: '2029-12-01',
          budget: 100,
          estimateCost: 80,
          technology: ['React'],
          approvedTechnology: ['React'],
          capacitySummary: { availableHours: 40, requiredHours: 80 },
          skillsRequired: [{ name: 'PostgreSQL' }],
          skillsAvailable: [{ name: 'PostgreSQL' }],
        },
        policy: { version: 'c-v1' },
      },
      { allowedModes: ['validation'], factStore: createFactStore() }
    );
    assert.equal(result.data.canPublish, false);
    assert.ok(result.data.results.some((r) => r.id === 'capacity' && r.status === 'FAIL'));
    assert.equal(result.facts.find((f) => f.key === 'constraints.canPublish').value, false);
  });
});

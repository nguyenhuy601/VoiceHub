/**
 * A3 completeness, A4 consistency, Gate A
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createRequirementToolsRegistry,
  createFactStore,
  runRecipeWave,
} = require('../../src/utils/tools');

describe('completenessConsistencyGate', () => {
  it('scores completeness on core FR fields only', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const result = registry.execute(
      'requirement_completeness',
      {
        fr: [
          {
            id: 'FR-021',
            level: 'requirement',
            name: 'Check-in',
            description: 'Employee check-in',
            actor: 'Employee',
            priority: 'High',
            ac: 'Given employee When check-in Then recorded',
            // Detail FR sheet fields ignored by Gate A Completeness
            input: '',
            output: '',
            businessRules: '',
            exceptionFlow: '',
            dependency: '',
            constraint: '',
            brIds: [],
            bpmIds: [],
            mainFlow: 'scan QR',
          },
        ],
      },
      { factStore: store, allowedModes: ['recipe'] }
    );
    assert.equal(result.data.checklistSize, 5);
    assert.equal(result.data.overall, 1);
    assert.deepEqual(result.data.items[0].missing, []);
    assert.equal(store.get('completeness.score').value, result.data.overall);
  });

  it('flags missing core field (AC)', () => {
    const registry = createRequirementToolsRegistry();
    const result = registry.execute(
      'requirement_completeness',
      {
        fr: [
          {
            id: 'FR-022',
            level: 'requirement',
            name: 'Check-out',
            description: 'Employee check-out',
            actor: 'Employee',
            priority: 'High',
            ac: '',
            mainFlow: 'scan QR',
          },
        ],
      },
      { allowedModes: ['recipe'] }
    );
    assert.ok(result.data.overall > 0 && result.data.overall < 1);
    assert.ok(result.data.items[0].missing.includes('Acceptance criteria'));
    assert.equal(result.data.items[0].missing.length, 1);
  });

  it('detects latency conflict FR vs NFR', () => {
    const registry = createRequirementToolsRegistry();
    const store = createFactStore();
    const result = registry.execute(
      'requirement_consistency',
      {
        fr: [
          {
            id: 'FR-021',
            level: 'requirement',
            name: 'API',
            description: 'Response < 2s',
            priority: 'High',
            ac: '',
          },
        ],
        nfr: [
          {
            id: 'NFR-008',
            category: 'Performance',
            requirement: 'API response time',
            target: 'Response < 5s',
            priority: 'High',
          },
        ],
        uc: [],
        br: [],
      },
      { factStore: store, allowedModes: ['recipe'] }
    );
    assert.ok(result.data.conflictCount >= 1);
    assert.ok(
      result.data.conflicts.some(
        (c) => c.left === 'FR-021' && c.right === 'NFR-008'
      )
    );
  });

  it('does not treat px / percent / bare counts as latency', () => {
    const { parseLatencySeconds } = require('../../src/utils/tools/recipe/requirementConsistency');
    assert.equal(parseLatencySeconds('chiều rộng ≥768px'), null);
    assert.equal(parseLatencySeconds('99.5% trong giờ 07:00–19:00'), null);
    assert.equal(parseLatencySeconds('0 hoặc 1 trưởng phòng'), null);
    assert.equal(parseLatencySeconds('Giữ audit tối thiểu 12 tháng'), null);
    assert.equal(parseLatencySeconds('Response < 2s'), 2);
    assert.equal(parseLatencySeconds('< 2 giây cho danh sách'), 2);
  });

  it('Gate A fails when coverage below threshold', () => {
    const registry = createRequirementToolsRegistry();
    const bundle = {
      fr: [
        {
          id: 'FR-01',
          level: 'requirement',
          name: 'A',
          priority: 'high',
          ac: 'ok',
          crRefs: [],
          nfrRefs: [],
          integrationRefs: [],
          dataEntityIds: [],
          brIds: [],
          bpmIds: [],
          parentId: '',
          description: '',
        },
        {
          id: 'FR-02',
          level: 'requirement',
          name: 'B',
          priority: 'high',
          ac: '',
          crRefs: [],
          nfrRefs: [],
          integrationRefs: [],
          dataEntityIds: [],
          brIds: [],
          bpmIds: [],
          parentId: '',
          description: '',
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
      dependencyDegree: {},
      context: {},
      snapshotMeta: {},
    };
    const wave = runRecipeWave(registry, bundle, {
      runGateA: true,
      thresholds: { minWeightedCoverage: 0.8, minCompleteness: 0, maxConflictCount: 99 },
    });
    assert.equal(wave.gateA.passed, false);
    assert.equal(wave.facts['gateA.passed'], false);
  });
});

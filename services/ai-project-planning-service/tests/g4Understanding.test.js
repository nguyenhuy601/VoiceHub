const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  runG4Understanding,
  projectWhatSnapshot,
} = require('../src/engines/g4Understanding');
const { clearRegistry } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');
const { _resetEvidenceSeqForTests } = require('../src/evidence/evidence');

describe('g4Understanding', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
    _resetEvidenceSeqForTests();
  });

  it('projectWhatSnapshot omits employees and calendars', () => {
    const projected = projectWhatSnapshot({
      overview: { requirementName: 'Demo' },
      functionalRequirements: [{ id: 'FR-1', title: 'Login', description: 'User can login' }],
      employees: [{ userId: 'u1' }],
      calendar: { days: [] },
    });
    assert.equal(projected.overview.requirementName, 'Demo');
    assert.equal(projected.functionalRequirements.length, 1);
    assert.equal(projected.employees, undefined);
    assert.equal(projected.calendar, undefined);
  });

  it('runG4Understanding returns G4 shape with tool relationships (heuristic LLM)', async () => {
    const snapshot = {
      snapshotId: 'SNAP-1',
      packId: 'PACK-1',
      overview: { requirementName: 'Demo Pack' },
      functionalRequirements: [
        {
          id: 'FR-1',
          title: 'Login',
          description: 'User logs in',
          ac: 'Given valid credentials',
          priority: 'Must',
          parentId: 'FEAT-1',
        },
        {
          id: 'FEAT-1',
          title: 'Auth',
          level: 'Feature',
          description: 'Auth module',
        },
        {
          id: 'FR-2',
          title: 'Logout',
          description: 'User logs out',
          dependency: 'FR-1',
        },
      ],
    };

    const mockGenerate = async () => ({
      ok: true,
      model: 'mock',
      data: {
        relationships: [{ from: 'FR-2', to: 'FR-1', type: 'depends_on', note: 'llm' }],
        ambiguities: [{ requirementId: 'FR-2', kind: 'vague', message: 'Logout scope unclear' }],
        assumptions: [],
      },
      usage: { promptEvalCount: 10, evalCount: 5 },
    });

    const out = await runG4Understanding({
      snapshot,
      forceHeuristic: false,
      generateJsonFn: mockGenerate,
      env: { AI_PLANNING_LLM: '1', LLM_PROVIDER: 'ollama' },
    });

    const g4 = out.g4Understanding;
    assert.ok(Array.isArray(g4.requirements));
    assert.ok(g4.requirements.length >= 2);
    assert.ok(Array.isArray(g4.relationships));
    assert.ok(g4.relationships.length >= 1);
    assert.ok(Array.isArray(g4.ambiguities));
    assert.ok(Array.isArray(g4.assumptions));
    assert.ok(Array.isArray(g4.evidence));
    assert.ok(g4.evidence.length >= 1);
    assert.equal(g4.meta.skillId, 'requirementUnderstanding');
    assert.ok(g4.meta.promptVersion);
    assert.ok(g4.meta.llmCalls >= 1);
    for (const rel of g4.relationships) {
      assert.ok(Array.isArray(rel.evidence) && rel.evidence.length > 0);
    }
  });

  it('forceHeuristic still yields requirements via tool', async () => {
    const out = await runG4Understanding({
      snapshot: {
        functionalRequirements: [{ id: 'A', title: 'A', description: 'desc' }],
      },
      forceHeuristic: true,
    });
    assert.equal(out.g4Understanding.requirements.length, 1);
    assert.equal(out.g4Understanding.meta.llmCalls, 0);
  });
});

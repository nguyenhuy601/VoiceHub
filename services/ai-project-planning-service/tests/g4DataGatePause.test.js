const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runG4Pipeline } = require('../src/engines/g4/runG4Pipeline');
const { buildGatePreview, FLAGGED_CAP } = require('../src/engines/g4/pipelineProgress');
const { toPublicRun } = require('../src/run/runStore');

function ambiguousSnapshot() {
  return {
    snapshotId: 'snap-gate',
    packId: 'pack-gate',
    functionalRequirements: [
      {
        id: 'FR-2',
        title: 'Unclear status',
        description: 'TBD ??? chưa rõ actor for course status ACTIVE',
        ac: '',
        module: 'A',
      },
    ],
  };
}

describe('data gate removed (RULE-R01/R07)', () => {
  it('never pauses when pauseAtDataGate=true — quality continues to semantic', async () => {
    let calls = 0;
    const steps = [];
    const out = await runG4Pipeline({
      snapshot: ambiguousSnapshot(),
      pauseAtDataGate: true,
      env: {
        AI_G4_PIPELINE: '1',
        AI_PLANNING_LLM: '1',
        AI_G4_CONFLICT_ENABLED: '0',
        AI_G4_SYNTHESIS_ENABLED: '0',
      },
      onProgress: async (evt) => {
        steps.push(evt.substep);
      },
      generateJsonFn: async () => {
        calls += 1;
        return { ok: false, error: 'ollama_timeout' };
      },
    });
    assert.equal(out.paused, undefined);
    assert.notEqual(out.gate, 'data_review');
    assert.ok(out.g4Understanding);
    assert.ok(steps.indexOf('quality') >= 0);
    assert.ok(steps.indexOf('semantic') >= 0);
    assert.equal(steps.includes('gate_preview'), false);
    assert.ok(calls >= 1);
  });

  it('runs semantic from priorPartial without creating data_review pause', async () => {
    let calls = 0;
    const priorPartial = {
      functionalRequirements: [{ id: 'FR-9', title: 'Resume FR', description: 'actor missing' }],
      duplicates: [],
      signals: [{ frId: 'FR-9', flags: ['ambiguous'], text: 'actor missing' }],
      selection: {
        candidates: [
          {
            frId: 'FR-9',
            text: 'actor missing',
            reasons: ['ambiguous'],
            flags: ['ambiguous'],
            actors: [],
            actions: [],
            objects: [],
            fields: [],
          },
        ],
        clear: [],
        counts: { total: 1, candidates: 1, clear: 0 },
      },
      projected: { snapshotId: 'snap-resume', packId: 'pack-resume', functionalRequirements: [] },
      toolResult: { requirements: [], relationships: [], ambiguities: [], assumptions: [], facts: {} },
      toolEvidence: [],
    };
    const out = await runG4Pipeline({
      priorPartial,
      pauseAtDataGate: true,
      env: {
        AI_G4_PIPELINE: '1',
        AI_PLANNING_LLM: '1',
        AI_G4_CONFLICT_ENABLED: '0',
        AI_G4_SYNTHESIS_ENABLED: '0',
      },
      generateJsonFn: async () => {
        calls += 1;
        return { ok: false, error: 'ollama_timeout' };
      },
    });
    assert.equal(calls, 1);
    assert.equal(out.paused, undefined);
    assert.equal(out.g4Understanding.meta.llm.calls, 1);
    assert.equal(out.g4Understanding.requirements.length >= 0, true);
  });

  it('buildGatePreview still caps flagged rows (helper retained, not HITL)', () => {
    const signals = Array.from({ length: 35 }, (_, i) => ({
      frId: `FR-${i}`,
      text: `flagged ${i}`,
      flags: ['missing_actor'],
    }));
    const preview = buildGatePreview({
      functionalRequirements: signals.map((s) => ({ id: s.frId, title: s.text })),
      signals,
      duplicates: ['FR-1'],
      selection: { counts: { candidates: 35, clear: 0 }, candidates: signals, clear: [] },
    });
    assert.equal(preview.flagged.length, FLAGGED_CAP);
    assert.equal(preview.frCount, 35);
    assert.equal(preview.quality.missingActor, 35);
  });

  it('toPublicRun still omits checkpoint/input for legacy waiting_human docs', () => {
    const flagged = Array.from({ length: 40 }, (_, i) => ({
      frId: `FR-${i}`,
      title: `t${i}`,
      flags: ['thin_text'],
    }));
    const rows = Array.from({ length: 25 }, (_, i) => ({
      frId: `FR-${i}`,
      title: `t${i}`,
      actors: ['BA'],
      signals: { text: 'secret' },
      text: 'raw',
    }));
    const doc = {
      _id: 'run1',
      status: 'waiting_human',
      pipelineStep: 2,
      pipelineSubstep: 'gate_preview',
      gate: 'data_review',
      gatePreview: {
        frCount: 25,
        rowTotal: 25,
        rows,
        flagged,
        quality: { thinText: 40 },
        signals: [{ text: 'secret' }],
      },
      checkpoint: { state: { corpus: 'nope' } },
      input: { snapshot: { raw: true } },
      currentNode: 'gate:data_review',
    };
    const pub = toPublicRun(doc);
    assert.equal(pub.pipelineStep, 2);
    assert.equal(pub.pipelineSubstep, 'gate_preview');
    assert.equal(pub.gate, 'data_review');
    assert.equal(pub.gatePreview.flagged.length, FLAGGED_CAP);
    assert.equal(pub.checkpoint, undefined);
    assert.equal(pub.input, undefined);
  });
});

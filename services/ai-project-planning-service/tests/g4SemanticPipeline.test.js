const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { resolveAiG4Policy } = require('../src/config/aiG4Policy');
const { selectCandidates, needsSemanticLlm } = require('../src/engines/g4/candidateSelector');
const { extractFrSignals } = require('../src/engines/g4/extractSignals');
const { packByTokenBudget } = require('../src/engines/g4/tokenPack');
const { runG4Pipeline } = require('../src/engines/g4/runG4Pipeline');
const {
  deriveComputeStatus,
  deriveCallbackStatus,
} = require('../src/run/runStatusDerive');

describe('aiG4Policy', () => {
  it('defaults semantic timeout 60s and pipeline on', () => {
    const p = resolveAiG4Policy({});
    assert.equal(p.pipelineEnabled, true);
    assert.equal(p.llm.semanticProjection.timeoutMs, 60_000);
    assert.equal(p.llm.semanticProjection.maxCalls, 3);
  });

  it('AI_G4_PIPELINE=0 disables pipeline flag', () => {
    const p = resolveAiG4Policy({ AI_G4_PIPELINE: '0' });
    assert.equal(p.pipelineEnabled, false);
  });
});

describe('candidateSelector + signals', () => {
  it('extracts signals from Vietnamese course FR', () => {
    const fr = {
      id: 'FR-023',
      description:
        'Hệ thống cho phép giảng viên tạo học phần, nhập mã học phần, tên học phần, số tín chỉ và trạng thái hoạt động.',
      ac: 'AC1',
      module: 'Course Management',
    };
    const s = extractFrSignals(fr);
    assert.equal(s.frId, 'FR-023');
    assert.ok(s.actors.some((a) => /giảng viên|giang vien/i.test(a)));
    assert.ok(s.objects.includes('Course'));
  });

  it('selects ambiguous and leaves clear aside', () => {
    const signals = [
      { frId: 'FR-1', flags: [], actors: ['a'], objects: [], fields: [], text: 'x'.repeat(50) },
      { frId: 'FR-2', flags: ['ambiguous'], actors: [], objects: [], fields: [], text: '???' },
    ];
    const sel = selectCandidates(signals);
    assert.equal(sel.counts.clear, 1);
    assert.equal(sel.counts.candidates, 1);
    assert.equal(needsSemanticLlm(sel), true);
    assert.equal(needsSemanticLlm({ candidates: [] }), false);
  });

  it('packs by token budget not fixed 16', () => {
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      frId: `FR-${i}`,
      text: 'word '.repeat(50),
      actors: [],
      actions: [],
      objects: [],
      fields: [],
      reasons: ['ambiguous'],
    }));
    const batches = packByTokenBudget(candidates, { maxInputTokens: 800, maxCalls: 3 });
    assert.ok(batches.length >= 1);
    assert.ok(batches.length <= 3);
  });
});

describe('runG4Pipeline', () => {
  it('continues without LLM when no candidates (wave 5)', async () => {
    const snapshot = {
      snapshotId: 'snap1',
      packId: 'p1',
      functionalRequirements: [
        {
          id: 'FR-1',
          title: 'Clear FR',
          description:
            'Admin can view user list with name and email for audit purposes in reporting module.',
          ac: 'Given admin When open users Then see list',
          module: 'Admin',
        },
      ],
    };
    const out = await runG4Pipeline({
      snapshot,
      env: {
        AI_G4_PIPELINE: '1',
        AI_PLANNING_LLM: '0',
      },
      forceHeuristic: false,
      generateJsonFn: async () => {
        throw new Error('LLM should not be called');
      },
    });
    assert.ok(out.g4Understanding);
    assert.equal(out.g4Understanding.meta.llm.calls, 0);
    assert.ok(Array.isArray(out.g4Understanding.requirements));
  });

  it('partial continue when semantic LLM fails', async () => {
    const snapshot = {
      snapshotId: 'snap1',
      functionalRequirements: [
        {
          id: 'FR-2',
          description: 'TBD ??? chưa rõ actor for course status ACTIVE',
          ac: '',
          module: 'A',
        },
      ],
    };
    const out = await runG4Pipeline({
      snapshot,
      env: {
        AI_G4_PIPELINE: '1',
        AI_G4_CONTINUE_ON_TIMEOUT: '1',
        AI_PLANNING_LLM: '1',
        OLLAMA_BASE_URL: 'http://127.0.0.1:9',
      },
      generateJsonFn: async () => ({
        ok: false,
        skipped: false,
        error: 'ollama_timeout',
        data: null,
      }),
    });
    assert.equal(out.g4Understanding.meta.llm.status, 'partial');
    assert.ok(out.g4Understanding.meta.partial);
    assert.ok(out.g4Understanding.facts != null || out.g4Understanding.requirements);
  });
});

describe('runStatusDerive', () => {
  it('splits compute and callback', () => {
    assert.equal(deriveComputeStatus({ status: 'callback_pending' }), 'completed');
    assert.equal(deriveCallbackStatus({ status: 'callback_pending' }), 'pending');
  });
});

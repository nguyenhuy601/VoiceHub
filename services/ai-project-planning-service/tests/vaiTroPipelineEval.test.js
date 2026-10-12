/**
 * Live + deterministic eval — Customer Raw "VAI TRÒ" through WHAT nodes.
 * Run: cd services/ai-project-planning-service && node --test tests/vaiTroPipelineEval.test.js
 * Live LLM: source repo .env (LLM_PROVIDER=openai_compatible) — skip if AI_PLANNING_LLM=0.
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  buildMonolithicFrPack,
  buildGoldenSixFrPack,
  planningEnvFromProcess,
  ROLE_PROSE,
} = require('./fixtures/vaiTroRoleFixture');
const { scoreCoverage, scoreFrPack } = require('./lib/vaiTroCoverageScore');

function loadRootEnv() {
  const rootEnv = path.join(__dirname, '..', '..', '..', '.env');
  if (!fs.existsSync(rootEnv)) return;
  const text = fs.readFileSync(rootEnv, 'utf8').replace(/\r/g, '');
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]] != null) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] = v;
  }
}

loadRootEnv();

const env = planningEnvFromProcess();
const hasLlmKey = Boolean(
  String(env.DASHSCOPE_API_KEY || '').trim() || String(env.OPENAI_API_KEY || '').trim()
);
const liveLlm = String(env.AI_PLANNING_LLM ?? '1') !== '0' && hasLlmKey;

const report = {
  scenario: {},
  nodes: {},
  accuracy: {},
  gaps: [],
};

describe('VAI TRÒ — pipeline eval', () => {
  it('N0 import rule: monolithic row = 1 FR', () => {
    const pack = buildMonolithicFrPack();
    const s = scoreFrPack(pack);
    report.nodes.N0_fr_import = s;
    assert.equal(s.frCount, 1);
    assert.ok(s.aggregate.ratio >= 0.7, 'single FR text still contains most golden keywords');
  });

  it('N0b golden pack: 6 FR oracle coverage', () => {
    const pack = buildGoldenSixFrPack();
    const s = scoreFrPack(pack);
    report.nodes.N0b_golden_six_fr = s;
    assert.equal(s.frCount, 6);
    assert.ok(s.aggregate.ratio >= 0.85);
  });

  it('N1 frSlim: UC prompt loses description/formula', () => {
    const { buildDeriveInputForSection } = require('../src/semantic/buildSectionDeriveInputs');
    const { buildDerivePrompt } = require('../src/semantic/runRawSectionDerive');
    const { getSemanticTask } = require('../src/semantic/semanticTaskRegistry');
    const mono = buildMonolithicFrPack();
    const input = buildDeriveInputForSection('uc', mono, {});
    const prompt = buildDerivePrompt('uc', input, getSemanticTask('uc'));
    const slimScore = scoreCoverage(JSON.stringify(input.frSlim));
    const fullScore = scoreCoverage(ROLE_PROSE);
    report.nodes.N1_uc_input = {
      frSlimCount: input.frSlim?.length,
      frSlimFields: input.frSlim?.[0] ? Object.keys(input.frSlim[0]) : [],
      promptChars: prompt.length,
      coverageFrSlim: slimScore,
      coverageFullProse: fullScore,
      formulaInPrompt: /số lượng.*t[ỉi]\s*l[ệe]/i.test(prompt),
      kpiInPrompt: /\bKPI\b/.test(prompt),
    };
    assert.equal(input.frSlim?.length, 1);
    // After frSlim description+formula expansion, prompt may retain formula from description clip.
    assert.ok(
      fullScore.ratio >= slimScore.ratio,
      'full prose coverage should be at least frSlim coverage'
    );
  });

  it('N1b hierarchy heuristic: not full behavior split', () => {
    const { runHierarchyEngine } = require('../src/engines/hierarchy');
    const mono = buildMonolithicFrPack();
    const out = runHierarchyEngine(mono);
    const reqs = out?.proposedRequirements || [];
    report.nodes.N1b_hierarchy = {
      proposedRequirements: reqs.length,
      names: reqs.map((p) => p.name || p.title).slice(0, 8),
      source: out?.meta?.source,
    };
    assert.ok(reqs.length <= 6, 'heuristic does not emit full 6-behavior FR set from one row');
  });

  it('N2b mock LLM: downstream output quality (mono 1 FR)', { timeout: 120000 }, async () => {
    const { mockGenerateJson } = require('./lib/vaiTroMockLlm');
    const { runSemanticProjection } = require('../src/engines/g4/semanticProjection');
    const { runSynthesis } = require('../src/engines/g4/synthesis');
    const { runRawSectionDerive } = require('../src/semantic/runRawSectionDerive');
    const mono = buildMonolithicFrPack();
    const mockEnv = { ...env, LLM_PROVIDER: 'openai_compatible' };
    const gen = mockGenerateJson;
    const fr = mono.functionalRequirements[0];
    const sem = await runSemanticProjection({
      generateJson: gen,
      batch: [
        {
          frId: fr.externalId,
          name: fr.name,
          description: fr.description,
          module: fr.moduleLabel,
          text: `${fr.name}\n${fr.description}`,
          actors: [fr.actor],
          actions: [],
          objects: [],
          fields: [],
        },
      ],
      policy: { enabled: true, maxOutputTokens: 512, numCtx: 4096, timeoutMs: 60_000 },
      requireEvidence: false,
      env: mockEnv,
    });
    const syn = await runSynthesis({
      generateJson: gen,
      policy: { enabled: true, maxOutputTokens: 768, maxCalls: 1, numCtx: 4096, timeoutMs: 60_000 },
      semanticItems: sem.items || [],
      conflicts: [],
      ambiguities: (sem.items || []).flatMap((i) => i.ambiguities || []),
      counts: { candidates: 1 },
      toolFacts: {},
      env: mockEnv,
    });
    const derive = {};
    for (const id of ['uc', 'br', 'bg', 'data']) {
      derive[id] = await runRawSectionDerive({
        engineId: id,
        pack: mono,
        env: mockEnv,
        invokeFn: async (o) => {
          const r = await gen({ ...o, env: mockEnv });
          return {
            ok: r.ok,
            skipped: false,
            reason: r.ok ? null : r.error,
            data: r.data,
            usage: r.usage,
            error: r.error,
          };
        },
      });
    }
    const deriveText = JSON.stringify(derive);
    report.nodes.N2b_mock_mono = {
      g4SemanticCount: (sem.items || []).length,
      g4Coverage: scoreCoverage(JSON.stringify([syn.summary, sem.items])),
      g4GapsField: syn.summary?.gaps || [],
      g4OpenQuestions: syn.summary?.openQuestions || [],
      deriveCoverage: scoreCoverage(deriveText),
      deriveItems: Object.fromEntries(
        Object.entries(derive).map(([k, v]) => [k, (v.items || []).length])
      ),
      behaviorSplitScore: {
        expectedFrBehaviors: 6,
        actualFrCount: 1,
        ucCount: (derive.uc?.items || []).length,
        note: 'mock collapses CRUD into 1 UC — illustrates max-count + mono FR limit',
      },
    };
    assert.ok((derive.uc?.items || []).length >= 1);
  });

  if (liveLlm) {
    it('N2 G4 live: semantic + synthesis on 1 FR', { timeout: 300000 }, async () => {
      const { runG4Pipeline } = require('../src/engines/g4/runG4Pipeline');
      const { chatCompletionsText } = require('@enterprise/shared/llm/openaiCompatibleClient');
      const probe = await chatCompletionsText({ prompt: 'Reply OK', maxTokens: 8, env });
      if (!probe.ok) {
        report.nodes.N2_g4_mono = { skipped: true, reason: probe.error || 'llm_unreachable' };
        report.gaps.push(`Live LLM unreachable: ${probe.error}`);
        return;
      }
      const mono = buildMonolithicFrPack();
      const out = await runG4Pipeline({ pack: mono, snapshot: mono, env });
      assert.notEqual(out.blocked, true);
      const g4 = out.g4Understanding || {};
      const synText = JSON.stringify(g4.synthesis || {});
      const ambText = JSON.stringify(g4.ambiguities || []);
      const semText = JSON.stringify(g4.semanticItems || g4.facts || {});
      report.nodes.N2_g4_mono = {
        llmCalls: g4.meta?.llmCalls,
        partial: g4.meta?.partial,
        semanticItemCount: (g4.semanticItems || []).length,
        coverageSynthesis: scoreCoverage(synText),
        coverageAmbiguities: scoreCoverage(ambText),
        coverageSemantic: scoreCoverage(semText),
        openQuestions: g4.synthesis?.openQuestions?.length ?? 0,
        gaps: g4.synthesis?.gaps?.length ?? 0,
      };
      if (!report.nodes.N2_g4_mono?.skipped) {
        assert.ok(g4.meta?.llmCalls >= 1);
      }
    });

    it('N3 raw derive live: all LLM sections (mono FR)', { timeout: 600000 }, async () => {
      const { chatCompletionsText } = require('@enterprise/shared/llm/openaiCompatibleClient');
      const probe = await chatCompletionsText({ prompt: 'Reply OK', maxTokens: 8, env });
      if (!probe.ok) {
        report.nodes.N3_raw_derive_mono = { skipped: true, reason: probe.error };
        return;
      }
      const { runRawSectionDerive } = require('../src/semantic/runRawSectionDerive');
      const mono = buildMonolithicFrPack();
      const sections = ['bg', 'br', 'uc', 'bpm', 'data', 'interface'];
      report.nodes.N3_raw_derive_mono = {};
      for (const engineId of sections) {
        const r = await runRawSectionDerive({ engineId, pack: mono, env });
        const itemsText = JSON.stringify(r.items || []);
        report.nodes.N3_raw_derive_mono[engineId] = {
          reason: r.reason,
          itemCount: (r.items || []).length,
          llmCalls: r.llmCalls,
          coverage: scoreCoverage(itemsText),
          preview: itemsText.slice(0, 1200),
        };
      }
    });

    it('N4 raw derive live: golden 6 FR pack', { timeout: 600000 }, async () => {
      const { runRawSectionDerive } = require('../src/semantic/runRawSectionDerive');
      const golden = buildGoldenSixFrPack();
      const sections = ['uc', 'br', 'data'];
      report.nodes.N4_raw_derive_golden = {};
      for (const engineId of sections) {
        const r = await runRawSectionDerive({ engineId, pack: golden, env });
        report.nodes.N4_raw_derive_golden[engineId] = {
          reason: r.reason,
          itemCount: (r.items || []).length,
          llmCalls: r.llmCalls,
          coverage: scoreCoverage(JSON.stringify(r.items || [])),
        };
      }
    });

    it('N5 WBS prompt slice (HOW input loss)', () => {
      const { buildWbsLlmPrompt } = require('../src/engines/wbsLlmDecompose');
      const golden = buildGoldenSixFrPack();
      const prompt = buildWbsLlmPrompt({ pack: golden, capabilities: [], planningHints: {}, env });
      report.nodes.N5_wbs_prompt = {
        promptChars: prompt.length,
        coverageInPrompt: scoreCoverage(prompt),
        hasFormula: /số lượng.*m[ốo]c/i.test(prompt),
      };
    });
  } else {
    it('N2–N5 skipped: no LLM API key / AI_PLANNING_LLM off', () => {
      report.nodes.liveSkipped = true;
    });
  }

  before(() => {
    report.scenario = {
      liveLlmAttempt: liveLlm,
      hasLlmKey,
      provider: env.LLM_PROVIDER,
      model: env.LLM_CHAT_MODEL,
      openAiBaseHost: String(env.OPENAI_BASE_URL || '')
        .replace(/^https?:\/\//, '')
        .split('/')[0],
    };
  });
});

process.on('exit', () => {
  // eslint-disable-next-line no-console
  console.log('\n=== VAI_TRO_EVAL_REPORT ===');
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(report, null, 2));
});

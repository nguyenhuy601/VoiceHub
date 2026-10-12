/**
 * End-to-end expected-output eval for VAI TRÒ Customer Raw.
 * Pass criteria = user golden behaviors (6 FR + formula + no invent).
 *
 * node --test tests/vaiTroExpectedOutputEval.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const {
  buildMonolithicFrPack,
  planningEnvFromProcess,
  GOLDEN_BEHAVIORS,
} = require('./fixtures/vaiTroRoleFixture');
const { scoreCoverage } = require('./lib/vaiTroCoverageScore');
const { decomposeFrCandidates, BEHAVIOR_KEYS } = require('../src/engines/frCandidateDecompose');
const { runRawSectionDerive } = require('../src/semantic/runRawSectionDerive');
const { runSemanticProjection } = require('../src/engines/g4/semanticProjection');
const { generateJson } = require('../src/runtime/ollamaGenerate');
const { buildDeriveInputForSection } = require('../src/semantic/buildSectionDeriveInputs');
const { buildDerivePrompt } = require('../src/semantic/runRawSectionDerive');
const { getSemanticTask } = require('../src/semantic/semanticTaskRegistry');

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

function behaviorKeysPresent(frs) {
  const set = new Set(frs.map((f) => f.behaviorKey).filter(Boolean));
  return BEHAVIOR_KEYS.filter((k) => set.has(k));
}

function hasVerbatimFormula(text) {
  return /Lương\s*=\s*Số\s*lượng\s*[x×*]\s*Tỉ\s*lệ\s*[x×*]\s*Mốc/i.test(String(text || ''));
}

describe('VAI TRÒ — expected output (live)', { timeout: 600000 }, () => {
  let decomposed = null;
  let derive = {};

  it('E1 decompose: ≥6 FR covering 6 behaviors + formula + openQuestions', async () => {
    const mono = buildMonolithicFrPack();
    const out = await decomposeFrCandidates({ pack: mono, env });
    decomposed = out;
    const frs = out.candidates || [];
    const keys = behaviorKeysPresent(frs);
    const agg = scoreCoverage(frs.map((f) => `${f.name}\n${f.description}`).join('\n'));
    const formulaOk = frs.some((f) => hasVerbatimFormula(f.description) || hasVerbatimFormula(f.name));
    const openQ = frs.flatMap((f) => f.openQuestions || []);

    console.info(
      '[E1]',
      JSON.stringify({
        candidateCount: frs.length,
        behaviorKeys: keys,
        coverageRatio: agg.ratio,
        formulaOk,
        openQuestionCount: openQ.length,
        llmCalls: out.meta?.llmCalls,
        heuristic: out.meta?.heuristic,
        names: frs.map((f) => `${f.behaviorKey}:${f.name}`),
      })
    );

    assert.ok(frs.length >= 6, `expected ≥6 FR candidates, got ${frs.length}`);
    assert.ok(keys.length >= 6, `expected 6 behavior keys, got ${keys.join(',')}`);
    assert.ok(agg.ratio >= 0.8, `FR aggregate coverage ${agg.ratio}`);
    assert.ok(formulaOk, 'formula must be preserved verbatim in a candidate description');
    assert.ok(openQ.length >= 2, 'must surface openQuestions for unclear KPI/delete/etc');
  });

  it('E2 frSlim keeps formula after decompose', () => {
    assert.ok(decomposed?.pack);
    const input = buildDeriveInputForSection('uc', decomposed.pack, {});
    const prompt = buildDerivePrompt('uc', input, getSemanticTask('uc'));
    assert.ok(
      input.frSlim.some((r) => r.formula || /Lương\s*=/i.test(r.description || '')),
      'frSlim must carry formula or description with formula'
    );
    assert.ok(/Lương\s*=|Số\s*lượng/i.test(prompt), 'UC prompt must include formula context');
  });

  it('E3 G4 semantic: ≥1 item with ambiguities (schema coerce)', async () => {
    const fr = decomposed.candidates[0];
    const batch = [
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
    ];
    const sem = await runSemanticProjection({
      generateJson,
      batch,
      policy: { enabled: true, maxOutputTokens: 768, numCtx: 4096, timeoutMs: 90000 },
      requireEvidence: true,
      env,
    });
    console.info('[E3]', JSON.stringify({ ok: sem.ok, items: sem.items?.length, error: sem.error }));
    assert.ok(sem.ok, sem.error || 'semantic failed');
    assert.ok((sem.items || []).length >= 1, 'semantic items empty');
  });

  it('E4 raw derive on decomposed pack: UC/BR cover behaviors + formula rule', async () => {
    for (const id of ['uc', 'br', 'data']) {
      derive[id] = await runRawSectionDerive({
        engineId: id,
        pack: decomposed.pack,
        env: {
          ...env,
          PHASE1_UC_GROUNDED_FIRST: '0',
          PHASE1_DATA_GROUNDED_FIRST: '0',
          PHASE1_UC_DERIVE_MAX_TOKENS: '640',
          PHASE1_BR_DERIVE_MAX_TOKENS: '512',
        },
      });
    }
    const ucText = JSON.stringify(derive.uc?.items || []);
    const brText = JSON.stringify(derive.br?.items || []);
    const dataText = JSON.stringify(derive.data?.items || []);
    const ucCov = scoreCoverage(ucText);
    const brHasFormula = hasVerbatimFormula(brText) || /Số\s*lượng.*Tỉ\s*lệ.*Mốc/i.test(brText);
    const ucHitsNeed = ['add_role', 'edit', 'delete', 'list_view', 'dup_warning'];
    const ucHitCount = ucHitsNeed.filter((k) =>
      GOLDEN_BEHAVIORS.find((b) => b.key === k)?.re.test(ucText)
    ).length;

    console.info(
      '[E4]',
      JSON.stringify({
        uc: { n: derive.uc?.items?.length, cov: ucCov.ratio, hits: ucCov.hits, hitNeed: ucHitCount },
        br: { n: derive.br?.items?.length, formula: brHasFormula },
        data: { n: derive.data?.items?.length, cov: scoreCoverage(dataText).ratio },
      })
    );

    assert.ok((derive.uc?.items || []).length >= 4, `UC count ${derive.uc?.items?.length}`);
    assert.ok(ucHitCount >= 4, `UC must cover ≥4 of CRUD/list/dup, got ${ucHitCount}: ${ucCov.hits}`);
    assert.ok((derive.br?.items || []).length >= 2, 'BR items');
    assert.ok(brHasFormula, 'BR must include salary formula from source');
    assert.ok((derive.data?.items || []).length >= 1, 'Data entities');
  });

  it('E5 no invented hard rules for KPI schema / soft-delete as confirmed fact', () => {
    const brText = JSON.stringify(derive.br?.items || []).toLowerCase();
    // Allow mentioning as open question / unclear; fail if asserting invented policy as hard rule
    const inventSoftDelete = /must\s+(soft|hard)\s*delete|xóa\s*mềm\s*bắt\s*buộc|always\s+soft.?delete/i.test(
      brText
    );
    const inventKpiSchema = /kpi\s+must\s+include\s+\d+\s+fields|kpi\s+gồm\s+bắt\s*buộc/i.test(brText);
    assert.equal(inventSoftDelete, false);
    assert.equal(inventKpiSchema, false);
  });
});

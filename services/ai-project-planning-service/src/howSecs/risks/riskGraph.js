/**
 * Risks sec — Semantic→Fact→Propose→Accept via LangGraph (real triggers only).
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { applyRiskToContainer, bandFromScore, scoreFromPi } = require('../../engines/risk');

function field() {
  return Annotation();
}
function clip(s, max = 160) {
  const t = String(s || '').trim().replace(/\s+/g, ' ');
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Integer 1–5 only. Missing or out-of-range scores are not coerced to a midpoint. */
function integerScore1To5(value) {
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value < 1 || value > 5) return null;
  return value;
}

async function buildRiskSemantic({ pack = {}, container = {}, env = process.env, contextPackage = null, snapshot = null, snapshotId = null } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const layer = await assembleHowToolContext({
    purpose: 'RISK',
    pack,
    container,
    env,
    contextPackage,
    snapshot,
    snapshotId,
  });
  const frBrief = (layer.requiredData?.functionalRequirements || [])
    .map((row) => ({ id: row.id, title: row.title, statement: row.statement }))
    .filter((row) => row.id);
  const triggers = layer.requiredData?.triggers || [];
  const byKind = (kind) => triggers.filter((row) => row.kind === kind);
  const hasTrigger = triggers.length > 0;
  const missingSlots = missingSlotsFor('RISK', layer);
  if (!locale) missingSlots.push('business.locale');
  return {
    ok: contextAllowsWork(layer) && Boolean(locale) && (hasTrigger || frBrief.length > 0),
    missingSlots,
    openQuestions: hasTrigger
      ? []
      : [{ code: 'RISK_NO_TRIGGERS', message: 'Không có trigger rủi ro thật (cap/gap/arch/dep).' }],
    allowLists: { frIds: frBrief.map((row) => row.id) },
    semantic: {
      business: { locale, frBrief, projectName: clip(pack.overview?.name || pack.name, 80) },
      system: {},
      upstream: {
        highCapabilities: byKind('highCapability'),
        gaps: byKind('gap'),
        archHigh: byKind('archHigh'),
        blockingDeps: byKind('blockingDep'),
      },
      layer: slimLayer(layer),
    },
  };
}

function buildRiskFacts(semOut) {
  return {
    triggers: semOut.semantic?.upstream || {},
    allowLists: semOut.allowLists,
    meta: { inventForbidden: true },
  };
}

/** Map allowlist FR ids for exact + compact (FR-41 / FR41) + case-insensitive match. */
function buildFrAllowIndex(frIds) {
  const byKey = new Map();
  for (const id of frIds || []) {
    const raw = String(id || '').trim();
    if (!raw) continue;
    byKey.set(raw, raw);
    byKey.set(raw.toUpperCase(), raw);
    const compact = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (compact) byKey.set(compact, raw);
  }
  return byKey;
}

function resolveAllowedFrId(frAllow, candidate) {
  const frId = String(candidate || '').trim();
  if (!frId) return null;
  return (
    frAllow.get(frId) ||
    frAllow.get(frId.toUpperCase()) ||
    frAllow.get(frId.toUpperCase().replace(/[^A-Z0-9]/g, '')) ||
    null
  );
}

async function proposeRisk({ semantic, facts, env, generateJsonFn }) {
  if (!semantic) return { ok: false, skipped: true, meta: { fallbackReason: 'missing_SEMANTIC' } };
  if (!isLlmEnabled(env)) return { ok: false, skipped: true, meta: { fallbackReason: 'LLM_off' } };
  const { languageInstruction } = require('../../semantic/buildSemanticDeriveContext');
  const allowFrIds = Array.isArray(facts?.allowLists?.frIds) ? facts.allowLists.frIds : [];
  const system = [
    'You are a project risk analyst. Return JSON only.',
    'Report only risks with a concrete trigger present in SEMANTIC or FACTS. Do not invent generic risks.',
    'trigger states the condition. impactDescription states the business consequence. mitigation states an actionable response.',
    'relatedFrIds MUST be a non-empty list copied verbatim from ALLOW_FR_IDS only — never invent FR ids, Story ids, or free-text labels.',
    'If none of ALLOW_FR_IDS apply to a trigger, omit that risk (or return risks: []).',
    'probability and impact must be integers from 1 to 5.',
    'If the input is too thin to judge probability or impact, say that uncertainty in impactDescription instead of presenting an unsupported score as a measured fact.',
    'If no evidence-supported risk exists, return risks: [].',
    'Output: {"risks":[{"title":"...","trigger":"...","impactDescription":"...","relatedFrIds":["FR-id"],"probability":1,"impact":1,"mitigation":"..."}]}.',
    languageInstruction(semantic.business?.locale || 'vi'),
  ].join(' ');
  const user = [
    `SEMANTIC=${JSON.stringify(semantic)}`,
    `FACTS=${JSON.stringify(facts.triggers)}`,
    `ALLOW=${JSON.stringify(facts.allowLists)}`,
    `ALLOW_FR_IDS=${JSON.stringify(allowFrIds)}`,
    `SHAPE={"risks":[{"title":"","trigger":"","impactDescription":"","relatedFrIds":[],"probability":1,"impact":1,"mitigation":""}]}`,
  ].join('\n');
  const { resolveHowSecAttemptTimeoutMs } = require('../howSecAttemptTimeout');
  const llm = await invokeHowSemanticLlm({
    system,
    user,
    env,
    generateJsonFn,
    timeoutMs: resolveHowSecAttemptTimeoutMs(env),
  });
  return llm.ok
    ? { ok: true, data: llm.data, meta: { llmCalls: 1, model: llm.meta?.model } }
    : { ok: false, data: null, meta: { ...llm.meta, llmCalls: 1 } };
}

function acceptRisk({ raw, facts, openQuestionsIn = [] }) {
  const frAllow = buildFrAllowIndex(facts?.allowLists?.frIds || []);
  const frAllowSize = frAllow.size > 0 ? new Set(frAllow.values()).size : 0;
  const rejectedInvent = [];
  const openQuestions = [...openQuestionsIn];
  for (const q of raw?.openQuestions || []) {
    if (q?.message) openQuestions.push({ code: q.code || 'RISK_OQ', message: clip(q.message) });
  }
  const risks = [];
  let idx = 0;
  for (const row of raw?.risks || []) {
    const title = clip(row.title, 160);
    if (!title) continue;
    if (!Array.isArray(row.relatedFrIds)) {
      rejectedInvent.push({ reason: 'fr_not_in_allow', title });
      continue;
    }
    // Keep only allowlisted FR ids (drop invent / typos); reject row only if none remain.
    const relatedFrIds = [];
    for (const id of row.relatedFrIds) {
      const canon = resolveAllowedFrId(frAllow, id);
      if (!canon) continue;
      if (relatedFrIds.includes(canon)) continue;
      relatedFrIds.push(canon);
      if (relatedFrIds.length > 12) break;
    }
    if (frAllowSize && !relatedFrIds.length) {
      rejectedInvent.push({ reason: 'fr_not_in_allow', title });
      continue;
    }
    if (!frAllowSize && !relatedFrIds.length) {
      // Empty allowlist: require at least one non-empty raw id (legacy thin packs).
      for (const id of row.relatedFrIds) {
        const frId = String(id || '').trim();
        if (!frId || relatedFrIds.includes(frId)) continue;
        relatedFrIds.push(frId);
        if (relatedFrIds.length > 12) break;
      }
      if (!relatedFrIds.length) {
        rejectedInvent.push({ reason: 'fr_not_in_allow', title });
        continue;
      }
    }
    const trigger = clip(row.trigger, 200);
    const impactDescription = clip(row.impactDescription, 200);
    const mitigation = clip(row.mitigation, 240);
    if (!trigger || !impactDescription || !mitigation) {
      rejectedInvent.push({ reason: 'risk_fields_missing', title });
      continue;
    }
    const probability = integerScore1To5(row.probability);
    const impact = integerScore1To5(row.impact);
    if (probability == null || impact == null) {
      openQuestions.push({
        code: 'RISK_SCORE_INVALID',
        message: clip(`Bỏ qua "${title}": probability và impact phải là số nguyên từ 1 đến 5.`),
      });
      continue;
    }
    const score = scoreFromPi(probability, impact);
    idx += 1;
    risks.push({
      riskId: `RSK-${String(idx).padStart(3, '0')}`,
      title,
      trigger,
      impactDescription,
      summary: clip(`${trigger} — ${impactDescription}`, 240),
      relatedFrIds,
      probability,
      impact,
      score,
      band: bandFromScore(score),
      mitigation,
      provenance: { type: 'AI', source: 'risk_sec_tool_llm' },
      source: 'fact_llm',
    });
  }

  if (!risks.length && !openQuestions.length) {
    const frRejects = rejectedInvent.filter((r) => r.reason === 'fr_not_in_allow');
    if (frRejects.length) {
      openQuestions.push({
        code: 'RISK_FR_NOT_IN_ALLOW',
        message: clip(
          `LLM đề xuất rủi ro nhưng relatedFrIds không thuộc ALLOW (${frRejects
            .map((r) => r.title)
            .slice(0, 3)
            .join('; ')}).`
        ),
      });
    } else {
      openQuestions.push({ code: 'RISK_EMPTY', message: 'Không có rủi ro từ dữ liệu thật.' });
    }
  }

  const maxSeverity = risks.reduce((max, r) => {
    const rank = { low: 1, medium: 2, high: 3, critical: 4 };
    return (rank[r.band] || 0) > (rank[max] || 0) ? r.band : max;
  }, null);

  return {
    status: risks.length ? 'ready' : 'partial',
    model: null,
    generatedAt: new Date().toISOString(),
    items: risks,
    risks,
    maxSeverity,
    openQuestions,
    meta: {
      source: risks.length ? 'fact_llm' : 'empty',
      riskCount: risks.length,
      rejectedInvent,
      stub: false,
    },
  };
}

const RiskSecState = Annotation.Root({
  pack: field(),
  container: field(),
  env: field(),
  generateJsonFn: field(),
  contextPackage: field(),
  snapshot: field(),
  snapshotId: field(),
  semanticOut: field(),
  facts: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildRiskSecGraph() {
  const graph = new StateGraph(RiskSecState);
  graph.addNode('semantic', async (s) => ({
    semanticOut: await buildRiskSemantic({
      pack: s.pack,
      container: s.container,
      env: s.env,
      contextPackage: s.contextPackage,
      snapshot: s.snapshot,
      snapshotId: s.snapshotId,
    }),
  }));
  graph.addNode('fact', async (s) => ({ facts: buildRiskFacts(s.semanticOut || {}) }));
  graph.addNode('propose', async (s) => {
    if (!s.semanticOut?.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    return {
      proposed: await proposeRisk({
        semantic: s.semanticOut.semantic,
        facts: s.facts,
        env: s.env,
        generateJsonFn: s.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (s) => {
    const sem = s.semanticOut || {};
    const proposed = s.proposed || {};
    const result = acceptRisk({
      raw: proposed.ok ? proposed.data : { risks: [] },
      facts: s.facts,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok ? [] : [{ code: 'RISK_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(',') }]),
        ...(proposed.ok ? [] : [{ code: 'RISK_LLM_SKIP', message: proposed.meta?.fallbackReason || 'llm' }]),
      ],
    });
    result.model = proposed.meta?.model || null;
    result.meta.llmCalls = proposed.meta?.llmCalls || 0;
    return { result, containerPatch: applyRiskToContainer(s.container || {}, result) };
  });
  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let _c = null;
async function runRiskSecGraph(input = {}) {
  if (!_c) _c = buildRiskSecGraph();
  const out = await _c.invoke({
    pack: input.pack || {},
    container: input.container || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshot: input.snapshot || null,
    snapshotId: input.snapshotId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = {
  buildRiskSecGraph,
  runRiskSecGraph,
  buildRiskSemantic,
  buildRiskFacts,
  proposeRisk,
  acceptRisk,
};

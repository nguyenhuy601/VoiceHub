/**
 * Architecture impact — LLM enrich over heuristic (fallback heuristic).
 */

const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
const { invokeHowSemanticLlm, packBrief, clip } = require('./howSemanticLlm');

const LAYERS = new Set([
  'frontend',
  'backend',
  'api',
  'database',
  'external',
  'infrastructure',
]);

function normalizeImpactLevel(raw) {
  const v = String(raw || '').toLowerCase();
  if (v === 'high' || v === 'low' || v === 'medium') return v;
  return 'medium';
}

function normalizeLlmItems(rawItems, heuristicItems = []) {
  if (!Array.isArray(rawItems) || !rawItems.length) return null;
  const out = [];
  for (let i = 0; i < Math.min(rawItems.length, 40); i += 1) {
    const row = rawItems[i];
    if (!row || typeof row !== 'object') continue;
    const component = clip(row.component || row.name, 120);
    if (!component) continue;
    const layerRaw = String(row.layer || 'backend').toLowerCase();
    const layer = LAYERS.has(layerRaw) ? layerRaw : 'backend';
    out.push({
      impactId: String(row.impactId || `IMP-LLM-${i + 1}`).slice(0, 64),
      sourceFrIds: Array.isArray(row.sourceFrIds) ? row.sourceFrIds.map(String).slice(0, 12) : [],
      capabilityIds: Array.isArray(row.capabilityIds)
        ? row.capabilityIds.map(String).slice(0, 12)
        : [],
      component,
      layer,
      apis: Array.isArray(row.apis) ? row.apis.map((a) => clip(a, 80)).filter(Boolean).slice(0, 8) : [],
      databases: Array.isArray(row.databases)
        ? row.databases.map((a) => clip(a, 80)).filter(Boolean).slice(0, 8)
        : [],
      externalSystems: Array.isArray(row.externalSystems)
        ? row.externalSystems.map((a) => clip(a, 80)).filter(Boolean).slice(0, 8)
        : [],
      impactLevel: normalizeImpactLevel(row.impactLevel),
    });
  }
  if (!out.length) return null;
  // Prefer LLM list when non-empty; keep heuristic if LLM thinner than half
  if (heuristicItems.length >= 4 && out.length < Math.ceil(heuristicItems.length / 2)) {
    return null;
  }
  return out;
}

async function enrichArchitectureWithLlm(heuristicResult, {
  pack = {},
  container = {},
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!isHowSemanticSectionLlmOn('architecture', env)) {
    return heuristicResult;
  }

  const caps = (container?.analyses?.capability?.items || []).slice(0, 20).map((c) => ({
    id: c.capabilityId,
    name: clip(c.name, 80),
    complexity: c.complexity,
  }));

  const {
    normalizeDeriveLocale,
    languageInstruction,
  } = require('../semantic/buildSemanticDeriveContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );

  const llm = await invokeHowSemanticLlm({
    env,
    generateJsonFn,
    system:
      'You are a software architect. Return JSON only: {"items":[{"impactId","component","layer","impactLevel","sourceFrIds","apis","databases","externalSystems"}]}. Layers: frontend|backend|api|database|external|infrastructure. impactLevel: high|medium|low.',
    user: JSON.stringify({
      brief: packBrief(pack),
      capabilities: caps,
      heuristicHint: (heuristicResult.items || []).slice(0, 15).map((it) => ({
        component: it.component,
        layer: it.layer,
        impactLevel: it.impactLevel,
      })),
      languageInstruction: languageInstruction(locale),
      instruction:
        'Refine architecture impact for this project. Prefer concrete components over vague labels.',
    }),
  });

  if (!llm.ok) {
    return {
      ...heuristicResult,
      meta: {
        ...heuristicResult.meta,
        source: 'heuristic',
        llmAttempted: true,
        llmFallback: llm.meta?.fallbackReason || 'llm_failed',
      },
    };
  }

  const items = normalizeLlmItems(llm.data.items, heuristicResult.items || []);
  if (!items) {
    return {
      ...heuristicResult,
      meta: {
        ...heuristicResult.meta,
        source: 'heuristic',
        llmAttempted: true,
        llmFallback: 'invalid_or_thin_items',
      },
    };
  }

  const { buildHeuristicChains } = require('./architecture');
  const chains = buildHeuristicChains(items);
  return {
    ...heuristicResult,
    items,
    chains,
    components: items.map((it) => ({
      id: it.impactId,
      name: it.component,
      layer: it.layer,
      impactLevel: it.impactLevel,
    })),
    dependencies: chains.flatMap((c) =>
      (c.nodes || []).slice(1).map((to, i) => ({ from: c.nodes[i], to }))
    ),
    model: llm.meta?.model || null,
    meta: {
      ...heuristicResult.meta,
      source: 'llm+heuristic',
      llmCalls: llm.meta?.llmCalls || 1,
      itemCount: items.length,
      stub: false,
    },
  };
}

module.exports = { enrichArchitectureWithLlm, normalizeLlmItems };

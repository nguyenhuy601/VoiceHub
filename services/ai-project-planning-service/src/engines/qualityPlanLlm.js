/**
 * Quality plan — LLM proposes extra catalog entries; merge with deterministic plan.
 */

const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
const { invokeHowSemanticLlm, packBrief, clip } = require('./howSemanticLlm');

function normalizeCatalog(rawRows) {
  if (!Array.isArray(rawRows)) return [];
  const out = [];
  for (const row of rawRows.slice(0, 40)) {
    if (!row || typeof row !== 'object') continue;
    const title = clip(row.title || row.name || row.scenario, 160);
    if (!title) continue;
    out.push({
      key: String(row.key || row.id || `TC-LLM-${out.length + 1}`).slice(0, 64),
      title,
      sourceUcKey: row.sourceUcKey ? String(row.sourceUcKey).slice(0, 64) : undefined,
      level: clip(row.level || 'functional', 32),
      priority: clip(row.priority || 'medium', 16),
      source: 'llm',
    });
  }
  return out;
}

async function enrichQualityPlanWithLlm(heuristicResult, {
  pack = {},
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!isHowSemanticSectionLlmOn('quality', env)) {
    return heuristicResult;
  }

  const plan = heuristicResult.qualityPlan || {};
  const llm = await invokeHowSemanticLlm({
    env,
    generateJsonFn,
    system:
      'You are a QA lead. Return JSON only: {"catalogPlan":[{"key","title","sourceUcKey","level","priority"}]}. Suggest additional test scenarios for gaps.',
    user: JSON.stringify({
      brief: packBrief(pack, { maxFr: 10, maxUc: 10 }),
      existing: (plan.catalogPlan || []).slice(0, 20).map((c) => ({
        key: c.key,
        title: c.title,
        sourceUcKey: c.sourceUcKey,
      })),
      instruction: 'Add missing edge/negative/security cases. Do not duplicate titles.',
    }),
  });

  if (!llm.ok) {
    return {
      ...heuristicResult,
      meta: {
        ...(heuristicResult.meta || {}),
        llmAttempted: true,
        llmFallback: llm.meta?.fallbackReason || 'llm_failed',
      },
    };
  }

  const catalog = Array.isArray(plan.catalogPlan) ? [...plan.catalogPlan] : [];
  const seen = new Set(catalog.map((c) => String(c.title || '').toLowerCase()));
  let added = 0;
  for (const row of normalizeCatalog(llm.data.catalogPlan || llm.data.items)) {
    const key = row.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    catalog.push(row);
    added += 1;
  }

  const nextPlan = { ...plan, catalogPlan: catalog.slice(0, 120) };
  return {
    ...heuristicResult,
    qualityPlan: nextPlan,
    meta: {
      ...(heuristicResult.meta || {}),
      source: added ? 'heuristic+llm' : heuristicResult.meta?.source || 'heuristic',
      llmCalls: (heuristicResult.meta?.llmCalls || 0) + (llm.meta?.llmCalls || 0),
      llmCatalogAdded: added,
    },
  };
}

module.exports = { enrichQualityPlanWithLlm, normalizeCatalog };

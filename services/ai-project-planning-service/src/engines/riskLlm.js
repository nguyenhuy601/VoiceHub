/**
 * Risk — LLM proposes additional risks; merge with heuristic (dedupe by title).
 */

const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
const { invokeHowSemanticLlm, packBrief, clip } = require('./howSemanticLlm');
const { bandFromScore, scoreFromPi } = require('./risk');

function clampPi(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
}

function normalizeLlmRisks(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  const out = [];
  let idx = 0;
  for (const row of rawItems.slice(0, 25)) {
    if (!row || typeof row !== 'object') continue;
    const title = clip(row.title || row.name, 160);
    if (!title) continue;
    const probability = clampPi(row.probability);
    const impact = clampPi(row.impact);
    if (probability == null || impact == null) continue;
    idx += 1;
    const score = scoreFromPi(probability, impact);
    out.push({
      riskId: String(row.riskId || `RSK-LLM-${String(idx).padStart(3, '0')}`).slice(0, 80),
      title,
      relatedFrIds: Array.isArray(row.relatedFrIds)
        ? row.relatedFrIds.map(String).slice(0, 12)
        : [],
      probability,
      impact,
      score,
      band: bandFromScore(score),
      mitigation: row.mitigation ? clip(row.mitigation, 240) : undefined,
      source: 'llm',
    });
  }
  return out;
}

async function enrichRiskWithLlm(heuristicResult, {
  pack = {},
  container = {},
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!isHowSemanticSectionLlmOn('risk', env)) {
    return heuristicResult;
  }

  const llm = await invokeHowSemanticLlm({
    env,
    generateJsonFn,
    system:
      'You are a delivery risk analyst. Return JSON only: {"risks":[{"title","probability","impact","mitigation","relatedFrIds"}]}. probability/impact integers 1-5.',
    user: JSON.stringify({
      brief: packBrief(pack),
      heuristic: (heuristicResult.items || heuristicResult.risks || []).slice(0, 12).map((r) => ({
        title: r.title,
        band: r.band,
      })),
      archHigh: (container?.analyses?.architectureImpact?.items || [])
        .filter((a) => String(a.impactLevel).toLowerCase() === 'high')
        .slice(0, 8)
        .map((a) => a.component),
      instruction: 'Propose project-specific risks not already listed. Be concrete.',
    }),
  });

  if (!llm.ok) {
    return {
      ...heuristicResult,
      meta: {
        ...heuristicResult.meta,
        llmAttempted: true,
        llmFallback: llm.meta?.fallbackReason || 'llm_failed',
      },
    };
  }

  const base = [...(heuristicResult.items || heuristicResult.risks || [])];
  const seen = new Set(base.map((r) => String(r.title || '').toLowerCase()));
  let added = 0;
  for (const risk of normalizeLlmRisks(llm.data.risks || llm.data.items)) {
    const key = risk.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    base.push(risk);
    added += 1;
  }

  const maxSeverity = base.reduce((max, r) => {
    const rank = { low: 1, medium: 2, high: 3, critical: 4 };
    return (rank[r.band] || 0) > (rank[max] || 0) ? r.band : max;
  }, null);

  return {
    ...heuristicResult,
    items: base,
    risks: base,
    maxSeverity,
    model: added ? llm.meta?.model || null : heuristicResult.model,
    meta: {
      ...heuristicResult.meta,
      source: added ? 'heuristic+llm' : heuristicResult.meta?.source || 'heuristic',
      llmCalls: (heuristicResult.meta?.llmCalls || 0) + (llm.meta?.llmCalls || 0),
      llmRisksAdded: added,
      riskCount: base.length,
    },
  };
}

module.exports = { enrichRiskWithLlm, normalizeLlmRisks };

/**
 * Dependency edges — LLM proposes extra edges; merge with SRS/explicit/heuristic (never drop).
 */

const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
const { invokeHowSemanticLlm, packBrief, leafTaskBrief, clip } = require('./howSemanticLlm');

function edgeKey(e) {
  return `${e.from}->${e.to}`;
}

function normalizeLlmEdges(rawEdges, knownIds) {
  if (!Array.isArray(rawEdges)) return [];
  const out = [];
  let idx = 0;
  for (const row of rawEdges.slice(0, 60)) {
    if (!row || typeof row !== 'object') continue;
    const from = String(row.from || row.source || '').trim();
    const to = String(row.to || row.target || '').trim();
    if (!from || !to || from === to) continue;
    if (!knownIds.has(from) || !knownIds.has(to)) continue;
    idx += 1;
    out.push({
      edgeId: String(row.edgeId || `DEP-LLM-${idx}`).slice(0, 80),
      from,
      to,
      kind: 'depends_on',
      type: 'internal',
      critical: Boolean(row.critical),
      blocking: row.blocking !== false,
      evidence: clip(row.evidence || row.reason || 'llm_semantic', 120),
      source: 'llm',
    });
  }
  return out;
}

async function enrichDependencyWithLlm(heuristicResult, {
  pack = {},
  container = {},
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!isHowSemanticSectionLlmOn('dependency', env)) {
    return heuristicResult;
  }

  const leaves = leafTaskBrief(container, 36);
  if (leaves.length < 2) return heuristicResult;

  const knownIds = new Set(leaves.map((t) => t.id));
  const llm = await invokeHowSemanticLlm({
    env,
    generateJsonFn,
    system:
      'You are a tech lead. Return JSON only: {"edges":[{"from","to","blocking","critical","evidence"}]}. from/to must be task ids from input. Prefer finish-to-start technical prerequisites.',
    user: JSON.stringify({
      brief: packBrief(pack, { maxFr: 8, maxUc: 4 }),
      tasks: leaves,
      existing: (heuristicResult.edges || []).slice(0, 30).map((e) => ({
        from: e.from,
        to: e.to,
        source: e.source,
      })),
      instruction: 'Add missing technical dependencies not already listed. Do not invent task ids.',
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

  const proposed = normalizeLlmEdges(llm.data.edges, knownIds);
  const keys = new Set((heuristicResult.edges || []).map(edgeKey));
  const merged = [...(heuristicResult.edges || [])];
  let added = 0;
  for (const edge of proposed) {
    if (keys.has(edgeKey(edge))) continue;
    keys.add(edgeKey(edge));
    merged.push(edge);
    added += 1;
  }

  const { buildOrderHint } = require('./dependency');
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const orderHint = buildOrderHint(tasks, merged);

  return {
    ...heuristicResult,
    edges: merged,
    orderHint,
    model: added ? llm.meta?.model || null : heuristicResult.model,
    meta: {
      ...heuristicResult.meta,
      source: added ? 'srs_heuristic_llm' : heuristicResult.meta?.source || 'heuristic',
      llmCalls: (heuristicResult.meta?.llmCalls || 0) + (llm.meta?.llmCalls || 0),
      llmEdgesAdded: added,
      edgeCount: merged.length,
    },
  };
}

module.exports = { enrichDependencyWithLlm, normalizeLlmEdges };

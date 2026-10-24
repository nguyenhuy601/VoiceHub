/**
 * Architecture Accept — whitelist vs SEMANTIC ∪ FACTS; drop invent; no synthetic API/DB.
 */

const { clip, LAYERS, IMPACT_LEVELS, assertArchitectureProposeItem } = require('./architectureSchema');

function normalizeImpactLevel(raw) {
  const v = String(raw || '').toLowerCase();
  if (IMPACT_LEVELS.includes(v)) return v;
  return 'medium';
}

function filterIds(rawList, allowSet) {
  if (!allowSet || !allowSet.size) return [];
  return (Array.isArray(rawList) ? rawList : [])
    .map(String)
    .filter((id) => allowSet.has(id))
    .slice(0, 12);
}

/**
 * @returns {{ items: object[], openQuestions: object[], rejectedInvent: object[], meta: object }}
 */
function acceptArchitectureProposal({
  raw = null,
  semantic = null,
  facts = null,
  openQuestionsIn = [],
} = {}) {
  const allow = facts?.allowLists || {};
  const frSet = new Set(allow.frIds || []);
  const capSet = new Set(allow.capabilityIds || []);
  const catalogSet = new Set(
    (allow.catalogNames || []).map((n) => String(n).trim().toLowerCase())
  );

  const rejectedInvent = [];
  const openQuestions = [...(openQuestionsIn || [])];
  const rawItems = Array.isArray(raw?.items) ? raw.items : [];
  const rawOq = Array.isArray(raw?.openQuestions) ? raw.openQuestions : [];
  for (const q of rawOq) {
    if (q && (q.message || q.code)) {
      openQuestions.push({
        code: String(q.code || 'ARCH_LLM_OQ').slice(0, 64),
        message: clip(q.message, 240),
      });
    }
  }

  const items = [];
  for (let i = 0; i < Math.min(rawItems.length, 40); i += 1) {
    const row = rawItems[i];
    const check = assertArchitectureProposeItem(row);
    if (!check.ok) {
      rejectedInvent.push({ index: i, reason: check.reason });
      continue;
    }

    let sourceFrIds = filterIds(row.sourceFrIds, frSet);
    const capabilityIds = filterIds(row.capabilityIds, capSet);
    // Soft cite: if LLM omitted FR but cited a real capability, inherit that cap's FR allow-list.
    if (!sourceFrIds.length && capabilityIds.length && Array.isArray(facts?.capabilityFacts)) {
      const inherited = [];
      for (const capId of capabilityIds) {
        const cap = facts.capabilityFacts.find((c) => String(c.capabilityId) === String(capId));
        for (const fid of cap?.sourceFrIds || []) {
          if (frSet.size && !frSet.has(String(fid))) continue;
          inherited.push(String(fid));
        }
      }
      sourceFrIds = [...new Set(inherited)].slice(0, 12);
    }
    const needsCite = frSet.size > 0 || capSet.size > 0;
    if (needsCite && !sourceFrIds.length && !capabilityIds.length) {
      rejectedInvent.push({ index: i, reason: 'no_whitelisted_cite' });
      continue;
    }

    const layerRaw = String(row.layer || '').toLowerCase();
    const layer = LAYERS.includes(layerRaw) ? layerRaw : null;
    if (!layer) {
      rejectedInvent.push({ index: i, reason: 'layer_not_allowed' });
      continue;
    }

    const title = clip(row.title || row.component, 120);
    const component = clip(row.component || row.title, 120);
    const summary = clip(row.summary, 240);

    // Drop invented API/DB arrays — only keep names that appear in real catalog (optional soft)
    const apis = [];
    const databases = [];
    const externalSystems = [];
    for (const a of Array.isArray(row.apis) ? row.apis : []) {
      const name = clip(a, 80);
      if (!name) continue;
      if (catalogSet.size && !catalogSet.has(name.toLowerCase())) {
        rejectedInvent.push({ index: i, reason: 'api_not_in_catalog', value: name });
        continue;
      }
      if (catalogSet.size) apis.push(name);
    }
    for (const a of Array.isArray(row.databases) ? row.databases : []) {
      const name = clip(a, 80);
      if (!name) continue;
      if (catalogSet.size && !catalogSet.has(name.toLowerCase())) {
        rejectedInvent.push({ index: i, reason: 'db_not_in_catalog', value: name });
        continue;
      }
      if (catalogSet.size) databases.push(name);
    }

    items.push({
      impactId: String(row.impactId || `IMP-ARCH-${i + 1}`).slice(0, 64),
      title,
      summary,
      component,
      layer,
      impactLevel: normalizeImpactLevel(row.impactLevel),
      sourceFrIds,
      capabilityIds,
      apis,
      databases,
      externalSystems,
      provenance: { type: 'AI', source: 'architecture_sec_tool_llm' },
      source: 'fact_llm',
    });
  }

  if (!items.length && !openQuestions.length) {
    openQuestions.push({
      code: 'ARCH_EMPTY_AFTER_ACCEPT',
      message: 'Không có mục kiến trúc hợp lệ từ LLM.',
    });
  }

  const chains = [];
  return {
    items,
    chains,
    openQuestions,
    rejectedInvent,
    meta: {
      source: items.some((i) => i.source === 'fact_llm') ? 'fact_llm' : 'catalog_or_empty',
      itemCount: items.length,
      rejectedCount: rejectedInvent.length,
      llmCalls: 0,
      stub: false,
    },
  };
}

function toArchitectureEngineResult(accepted, { model = null, llmCalls = 0 } = {}) {
  const items = accepted.items || [];
  const chains = accepted.chains || [];
  return {
    status: items.length ? 'ready' : 'partial',
    model,
    generatedAt: new Date().toISOString(),
    items,
    chains,
    components: items.map((it) => ({
      id: it.impactId,
      name: it.component || it.title,
      layer: it.layer,
      impactLevel: it.impactLevel,
      summary: it.summary,
    })),
    dependencies: chains.flatMap((c) =>
      (c.nodes || []).slice(1).map((to, i) => ({ from: c.nodes[i], to }))
    ),
    constraints: [],
    openQuestions: accepted.openQuestions || [],
    meta: {
      ...(accepted.meta || {}),
      llmCalls,
      rejectedInvent: accepted.rejectedInvent || [],
    },
  };
}

module.exports = {
  acceptArchitectureProposal,
  toArchitectureEngineResult,
};

/**
 * Job4 Architecture Impact (W3e) — components/layers/API/DB; top-N; optional chains.
 * Consumes Cap + Data + WBS/effort + tech/integration compact — no full workbook / no FR Excel write.
 */

const {
  generateJson,
  planningTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normKey, normProse } = require('../requirement/requirementTemplateTextNorm');
const {
  buildFrIdSet,
  buildProjectContextSlice,
  truncate,
} = require('./aiAnalysisFrSlice');
const { FR_LANGUAGE_CUE, inferLayerLocale } = require('./aiAnalysisLocaleText');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');

const ARCH_LAYERS = Object.freeze([
  'frontend',
  'backend',
  'database',
  'api',
  'auth',
  'infrastructure',
  'external',
  'security',
  'deployment',
]);

const IMPACT_LEVELS = Object.freeze(['low', 'medium', 'high']);

const TOP_N_DEFAULT = 25;
const LIST_MAX = 8;
const NAME_MAX = 120;
const ARCH_WALL_MS = resolveJobWallMs('architectureRiskAnalysis');
const ARCH_NUM_PREDICT = 768;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeLayer(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (ARCH_LAYERS.includes(t)) return t;
  if (t === 'fe' || t === 'ui' || t === 'client' || t === 'react') return 'frontend';
  if (t === 'be' || t === 'server' || t === 'service') return 'backend';
  if (t === 'db' || t === 'data' || t === 'persistence') return 'database';
  if (t === 'rest' || t === 'graphql' || t === 'gateway') return 'api';
  if (t === 'authentication' || t === 'authorization' || t === 'iam') return 'auth';
  if (t === 'infra' || t === 'ops' || t === 'devops') return 'infrastructure';
  if (t === '3rd' || t === 'third_party' || t === 'vendor') return 'external';
  if (t === 'sec' || t === 'crypto') return 'security';
  if (t === 'ci' || t === 'cd' || t === 'release') return 'deployment';
  return '';
}

function normalizeImpactLevel(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'med') return 'medium';
  if (IMPACT_LEVELS.includes(t)) return t;
  return '';
}

function complexityToImpact(complexity) {
  const t = String(complexity || '')
    .trim()
    .toLowerCase();
  if (t === 'high') return 'high';
  if (t === 'medium' || t === 'med') return 'medium';
  if (t === 'low') return 'low';
  return 'medium';
}

function impactRank(level) {
  if (level === 'high') return 3;
  if (level === 'medium') return 2;
  if (level === 'low') return 1;
  return 0;
}

function normalizeStringList(raw, max = LIST_MAX) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (out.length >= max) break;
    const s = truncate(entry, 80);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function normalizeIdList(raw, knownIds, max = 16) {
  if (!Array.isArray(raw)) return [];
  let ids = raw.map((id) => normId(id) || normProse(id)).filter(Boolean);
  if (knownIds) ids = ids.filter((id) => knownIds.has(id));
  return [...new Set(ids)].slice(0, max);
}

/**
 * Compact inputs for arch impact — Cap + Data + WBS/effort + tech sheets.
 */
function buildArchitectureInputSlices(pack, container) {
  const frIdSet = buildFrIdSet(pack?.functionalRequirements || []);
  const capabilities = (container?.analyses?.capability?.items || [])
    .slice(0, 80)
    .map((c) => ({
      capabilityId: c.capabilityId,
      name: truncate(c.name || '', 80),
      module: truncate(c.module || '', 64),
      sourceFrIds: Array.isArray(c.sourceFrIds) ? c.sourceFrIds.slice(0, 8) : [],
      complexity: c.complexity || 'medium',
      requiredSkills: Array.isArray(c.requiredSkills)
        ? c.requiredSkills.slice(0, 6).map((s) => (typeof s === 'string' ? s : s.name))
        : [],
    }));

  const entities = (container?.analyses?.data?.entities || []).slice(0, 40).map((e) => ({
    entityId: e.entityId,
    name: truncate(e.name || '', 80),
    relatedFrIds: Array.isArray(e.relatedFrIds) ? e.relatedFrIds.slice(0, 6) : [],
    sensitivity: e.sensitivity,
  }));

  const tasks = (container?.planning?.tasks || []).slice(0, 60).map((t) => ({
    id: normId(t.taskId || t.id || ''),
    name: truncate(t.name || t.title || '', 80),
  })).filter((t) => t.id);

  const wbsSummary = {
    taskCount: tasks.length,
    taskIds: tasks.map((t) => t.id).slice(0, 40),
  };

  const effort = container?.planning?.effort;
  const effortSummary =
    effort == null
      ? null
      : typeof effort === 'object'
        ? {
            totalHours: effort.totalHours ?? effort.hours ?? undefined,
            totalDays: effort.totalDays ?? effort.days ?? undefined,
            band: truncate(effort.band || effort.riskBand || '', 32) || undefined,
          }
        : { value: truncate(String(effort), 64) };

  const technology = (pack?.technology || []).slice(0, 30).map((row) => ({
    category: truncate(row.category || '', 64),
    name: truncate(row.name || '', 80),
    version: truncate(row.version || '', 32) || undefined,
    mandatory: Boolean(row.mandatory),
  })).filter((r) => r.name);

  const integration = (pack?.integration || []).slice(0, 30).map((row) => ({
    system: truncate(row.system || '', 80),
    integrationType: truncate(row.integrationType || '', 40),
    direction: truncate(row.direction || '', 24),
    required: row.required !== false,
  })).filter((r) => r.system);

  const capIds = new Set(capabilities.map((c) => c.capabilityId).filter(Boolean));
  const knownFrIds = frIdSet;

  return {
    context: buildProjectContextSlice(pack),
    capabilities,
    entities,
    wbsSummary,
    effortSummary,
    technology,
    integration,
    knownFrIds,
    knownCapabilityIds: capIds,
  };
}

function inferLayerFromText(text, skills = []) {
  const blob = `${text} ${(skills || []).join(' ')}`;
  return inferLayerLocale(blob);
}

function techCategoryToLayer(category, name) {
  const blob = `${category || ''} ${name || ''}`.toLowerCase();
  const layer = inferLayerFromText(blob);
  return layer;
}

/**
 * Normalize one architecture impact item; drop if missing component/layer/impactLevel.
 */
function normalizeArchitectureImpactItem(
  raw,
  knownFrIds,
  knownCapabilityIds,
  { index = 0 } = {}
) {
  if (!raw || typeof raw !== 'object') return null;
  const component = normProse(raw.component || raw.name || raw.title || '').slice(0, NAME_MAX);
  if (!component) return null;

  const layer = normalizeLayer(raw.layer);
  if (!layer) return null;

  const impactLevel = normalizeImpactLevel(raw.impactLevel || raw.impact || raw.level);
  if (!impactLevel) return null;

  const sourceFrIds = normalizeIdList(
    raw.sourceFrIds || raw.relatedFrIds || [],
    knownFrIds
  );
  const capabilityIds = normalizeIdList(
    raw.capabilityIds || raw.relatedCapabilityIds || [],
    knownCapabilityIds
  );

  let impactId = normProse(raw.impactId || raw.id || '').slice(0, 64);
  if (!impactId) {
    impactId = `IMP-${slugPart(layer) || 'layer'}-${slugPart(component) || index + 1}`;
  }

  return {
    impactId,
    sourceFrIds,
    capabilityIds,
    component,
    layer,
    apis: normalizeStringList(raw.apis),
    databases: normalizeStringList(raw.databases),
    externalSystems: normalizeStringList(raw.externalSystems),
    impactLevel,
  };
}

function dedupeKey(item) {
  return `${item.layer}::${normKey(item.component)}`;
}

function dedupeArchitectureItems(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const key = dedupeKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        sourceFrIds: [...(item.sourceFrIds || [])],
        capabilityIds: [...(item.capabilityIds || [])],
        apis: [...(item.apis || [])],
        databases: [...(item.databases || [])],
        externalSystems: [...(item.externalSystems || [])],
      });
      continue;
    }
    existing.sourceFrIds = [
      ...new Set([...(existing.sourceFrIds || []), ...(item.sourceFrIds || [])]),
    ];
    existing.capabilityIds = [
      ...new Set([...(existing.capabilityIds || []), ...(item.capabilityIds || [])]),
    ];
    if (impactRank(item.impactLevel) > impactRank(existing.impactLevel)) {
      existing.impactLevel = item.impactLevel;
    }
    const mergeList = (a, b) => {
      const seen = new Set(a.map((x) => x.toLowerCase()));
      for (const x of b) {
        const k = x.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        a.push(x);
        if (a.length >= LIST_MAX) break;
      }
      return a;
    };
    existing.apis = mergeList(existing.apis, item.apis || []);
    existing.databases = mergeList(existing.databases, item.databases || []);
    existing.externalSystems = mergeList(
      existing.externalSystems,
      item.externalSystems || []
    );
  }
  return [...map.values()];
}

/**
 * Keep top-N by impactLevel (high first), stable by component name.
 */
function selectTopNArchitectureItems(items = [], topN = TOP_N_DEFAULT) {
  const n = Math.max(1, Number(topN) || TOP_N_DEFAULT);
  const sorted = [...items].sort((a, b) => {
    const d = impactRank(b.impactLevel) - impactRank(a.impactLevel);
    if (d !== 0) return d;
    return String(a.component || '').localeCompare(String(b.component || ''));
  });
  return sorted.slice(0, n);
}

function normalizeChain(raw, knownNodeIds) {
  if (!raw || typeof raw !== 'object') return null;
  let nodes = [];
  if (Array.isArray(raw.nodes)) nodes = raw.nodes;
  else if (Array.isArray(raw.chain)) nodes = raw.chain;
  else if (Array.isArray(raw)) nodes = raw;
  else return null;

  const ordered = [];
  const seen = new Set();
  for (const n of nodes) {
    const id =
      typeof n === 'string'
        ? truncate(n, 64)
        : truncate(n.id || n.nodeId || n.name || '', 64);
    if (!id) continue;
    if (knownNodeIds && !knownNodeIds.has(id) && !knownNodeIds.has(normId(id))) {
      // allow free-form component/layer labels in chains
      if (!/^(CAP-|FR-|IMP-|TASK-|SYS-)/i.test(id) && id.length < 3) continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(id);
    if (ordered.length >= 12) break;
  }
  if (ordered.length < 2) return null;
  const chainId = truncate(raw.chainId || raw.id || `CHAIN-${slugPart(ordered[0])}`, 64);
  return { chainId, nodes: ordered };
}

function normalizeChains(rawChains, items = []) {
  if (!Array.isArray(rawChains)) return [];
  const known = new Set();
  for (const it of items) {
    if (it.impactId) known.add(it.impactId);
    for (const id of it.capabilityIds || []) known.add(id);
    for (const id of it.sourceFrIds || []) known.add(id);
  }
  const out = [];
  const seen = new Set();
  for (const raw of rawChains) {
    const chain = normalizeChain(raw, known);
    if (!chain) continue;
    const key = chain.nodes.map((n) => n.toLowerCase()).join('>');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(chain);
    if (out.length >= 10) break;
  }
  return out;
}

function extractItemsArray(data) {
  if (Array.isArray(data)) return { items: data, chains: [] };
  if (data && typeof data === 'object') {
    const items = Array.isArray(data.items)
      ? data.items
      : Array.isArray(data.impacts)
        ? data.impacts
        : null;
    if (!items) return null;
    const chains = Array.isArray(data.chains) ? data.chains : [];
    return { items, chains };
  }
  return null;
}

function validateAndNormalizeArchitecturePayload(data, knownFrIds, knownCapabilityIds) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Architecture impact response must be JSON object or array');
    err.code = 'ARCH_NON_JSON';
    throw err;
  }
  const extracted = extractItemsArray(data);
  if (!extracted) {
    const err = new Error('Architecture JSON must include items[]');
    err.code = 'ARCH_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < extracted.items.length; i += 1) {
    const item = normalizeArchitectureImpactItem(
      extracted.items[i],
      knownFrIds,
      knownCapabilityIds,
      { index: i }
    );
    if (item) normalized.push(item);
  }
  const deduped = dedupeArchitectureItems(normalized);
  const chains = normalizeChains(extracted.chains, deduped);
  return { items: deduped, chains };
}

/** Heuristic seed from Cap + Data + tech + integration. */
function buildHeuristicArchitectureItems(input) {
  const items = [];
  let idx = 0;

  for (const cap of input.capabilities || []) {
    idx += 1;
    const layer = inferLayerFromText(
      `${cap.name} ${cap.module}`,
      cap.requiredSkills || []
    );
    const apis = layer === 'api' || layer === 'backend' ? [`${cap.name} API`] : [];
    const databases = layer === 'database' ? [`${cap.name} Store`] : [];
    items.push({
      impactId: `IMP-H-${slugPart(cap.capabilityId) || idx}`,
      sourceFrIds: [...(cap.sourceFrIds || [])],
      capabilityIds: cap.capabilityId ? [cap.capabilityId] : [],
      component: cap.name || `Capability ${idx}`,
      layer,
      apis,
      databases,
      externalSystems: [],
      impactLevel: complexityToImpact(cap.complexity),
    });
  }

  for (const ent of input.entities || []) {
    idx += 1;
    items.push({
      impactId: `IMP-H-DB-${slugPart(ent.entityId || ent.name) || idx}`,
      sourceFrIds: [...(ent.relatedFrIds || [])],
      capabilityIds: [],
      component: `${ent.name} Entity`,
      layer: 'database',
      apis: [],
      databases: [ent.name],
      externalSystems: [],
      impactLevel: ent.sensitivity === 'confidential' || ent.sensitivity === 'pii' ? 'high' : 'medium',
    });
  }

  for (const tech of input.technology || []) {
    idx += 1;
    const layer = techCategoryToLayer(tech.category, tech.name);
    items.push({
      impactId: `IMP-H-TECH-${slugPart(tech.name) || idx}`,
      sourceFrIds: [],
      capabilityIds: [],
      component: tech.name,
      layer,
      apis: layer === 'api' ? [tech.name] : [],
      databases: layer === 'database' ? [tech.name] : [],
      externalSystems: layer === 'external' ? [tech.name] : [],
      impactLevel: tech.mandatory ? 'high' : 'medium',
    });
  }

  for (const row of input.integration || []) {
    idx += 1;
    items.push({
      impactId: `IMP-H-EXT-${slugPart(row.system) || idx}`,
      sourceFrIds: [],
      capabilityIds: [],
      component: row.system,
      layer: 'external',
      apis: row.integrationType ? [row.integrationType] : [],
      databases: [],
      externalSystems: [row.system],
      impactLevel: row.required ? 'high' : 'medium',
    });
  }

  return dedupeArchitectureItems(items);
}

function buildHeuristicChains(items = []) {
  const byLayer = new Map();
  for (const it of items) {
    if (!byLayer.has(it.layer)) byLayer.set(it.layer, it);
  }
  const path = ['frontend', 'api', 'backend', 'database', 'external']
    .map((l) => byLayer.get(l)?.impactId)
    .filter(Boolean);
  if (path.length < 2) return [];
  return [{ chainId: 'CHAIN-H-request', nodes: path }];
}

function buildArchitecturePrompt({ context, inputCompact }) {
  return [
    'You are a software architect. Infer architecture impact components from inputs.',
    FR_LANGUAGE_CUE,
    'Return ONLY valid JSON: {"items":[{...}],"chains":[{"chainId","nodes":[]}]} — no markdown.',
    'Each item: impactId, sourceFrIds, capabilityIds, component, layer',
    `(${ARCH_LAYERS.join('|')}), apis[], databases[], externalSystems[], impactLevel (low|medium|high).`,
    'Use only FR/capability ids from input. Prefer grouping; keep top impacts only.',
    'chains optional: ordered node ids (impactId/capabilityId/component).',
    `Context: ${JSON.stringify(context)}`,
    `Inputs: ${JSON.stringify(inputCompact)}`,
  ].join('\n');
}

/**
 * Run architecture impact: heuristic + optional LLM; top-N by impactLevel.
 */
async function runArchitectureImpactAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const topN = opts.topN ?? TOP_N_DEFAULT;
  const input = buildArchitectureInputSlices(pack, container);
  const model = ollamaModel();

  const heuristicItems = buildHeuristicArchitectureItems(input);
  const heuristicChains = buildHeuristicChains(heuristicItems);

  if (!heuristicItems.length && !(input.capabilities || []).length && !(input.technology || []).length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items: [],
      chains: [],
      meta: { source: 'empty', llmCalls: 0, partial: false, topN },
    };
  }

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (!llmEnabled) {
    const items = selectTopNArchitectureItems(heuristicItems, topN);
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items,
      chains: normalizeChains(heuristicChains, items),
      meta: {
        source: 'heuristic',
        llmCalls: 0,
        partial: false,
        topN,
        truncated: heuristicItems.length > items.length,
        inputCounts: {
          capabilities: input.capabilities.length,
          entities: input.entities.length,
          technology: input.technology.length,
          integration: input.integration.length,
          tasks: input.wbsSummary.taskCount,
        },
      },
    };
  }

  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let collectedItems = [];
  let collectedChains = [];

  const timeoutMs =
    opts.timeoutMs ??
    opts.wallMs ??
    Math.min(planningTimeoutMs(), resolveJobWallMs('architectureRiskAnalysis'));
  const inputCompact = {
    capabilities: input.capabilities,
    entities: input.entities,
    wbsSummary: input.wbsSummary,
    effortSummary: input.effortSummary,
    technology: input.technology,
    integration: input.integration,
  };
  const prompt = buildArchitecturePrompt({
    context: input.context,
    inputCompact,
  });
  const result = await generateJson({
    prompt,
    temperature: 0.1,
    timeoutMs,
    numPredict: ARCH_NUM_PREDICT,
  });
  llmCalls += 1;

  if (result.skipped) {
    partial = true;
    lastError = result.error || 'llm_skipped';
  } else if (!result.ok || result.data == null) {
    partial = true;
    lastError = result.error || 'ollama_error';
  } else {
    try {
      const parsed = validateAndNormalizeArchitecturePayload(
        result.data,
        input.knownFrIds,
        input.knownCapabilityIds
      );
      collectedItems = parsed.items;
      collectedChains = parsed.chains;
    } catch (err) {
      partial = true;
      lastError = err.code || 'ARCH_INVALID';
    }
  }

  let items = dedupeArchitectureItems(collectedItems);
  let chains = collectedChains;
  if (!items.length) {
    items = heuristicItems;
    chains = heuristicChains;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial) {
    items = dedupeArchitectureItems([...items, ...heuristicItems]);
  }

  const topItems = selectTopNArchitectureItems(items, topN);
  const topChains = normalizeChains(chains.length ? chains : heuristicChains, topItems);

  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    items: topItems,
    chains: topChains,
    meta: {
      source: collectedItems.length ? (partial ? 'llm_partial' : 'llm') : 'heuristic',
      llmCalls,
      partial,
      error: lastError || undefined,
      topN,
      truncated: items.length > topItems.length,
      elapsedMs: Date.now() - started,
      inputCounts: {
        capabilities: input.capabilities.length,
        entities: input.entities.length,
        technology: input.technology.length,
        integration: input.integration.length,
        tasks: input.wbsSummary.taskCount,
      },
    },
  };
}

function applyArchitectureImpactToContainer(container, archResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.architectureImpact = {
    status: archResult.status || 'ready',
    model: archResult.model || null,
    generatedAt: archResult.generatedAt || new Date().toISOString(),
    items: archResult.items || [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    chains: archResult.chains || [],
    meta: archResult.meta || {},
  };
  return next;
}

module.exports = {
  ARCH_LAYERS,
  IMPACT_LEVELS,
  TOP_N_DEFAULT,
  normalizeLayer,
  normalizeImpactLevel,
  normalizeArchitectureImpactItem,
  dedupeArchitectureItems,
  selectTopNArchitectureItems,
  normalizeChains,
  validateAndNormalizeArchitecturePayload,
  buildArchitectureInputSlices,
  buildHeuristicArchitectureItems,
  buildHeuristicChains,
  runArchitectureImpactAnalysis,
  applyArchitectureImpactToContainer,
  extractItemsArray,
  impactRank,
};

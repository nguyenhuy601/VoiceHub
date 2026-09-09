/**
 * Job4 Dependency Analysis (W3c) — edges + orderHint; sheet 08 merge; cycle break.
 * Evidence required for soft/LLM links. Arch/Risk filled in W3e/W3f.
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
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');

const DEP_KINDS = Object.freeze([
  'requires',
  'depends_on',
  'blocks',
  'integrates_with',
  'precedes',
]);

const DEP_TYPES = Object.freeze([
  'internal',
  'external',
  'technical',
  'data',
  'business',
]);

const EVIDENCE_MAX = 200;
const EDGE_WALL_MS = resolveJobWallMs('dependencyAnalysis');
const EDGE_NUM_PREDICT = 768;
const SOFT_EDGE_MAX = 40;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function systemNodeId(name) {
  const slug = slugPart(name);
  return slug ? `SYS-${slug}` : '';
}

function normalizeDepKind(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (DEP_KINDS.includes(t)) return t;
  if (t === 'depend' || t === 'dependency' || t === 'depends') return 'depends_on';
  if (t === 'require' || t === 'required') return 'requires';
  if (t === 'block' || t === 'blocker') return 'blocks';
  if (t === 'integrate' || t === 'integration') return 'integrates_with';
  return 'depends_on';
}

function normalizeDepType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (DEP_TYPES.includes(t)) return t;
  if (t === 'ext' || t === '3rd' || t === 'third_party') return 'external';
  if (t === 'tech') return 'technical';
  if (t === 'biz') return 'business';
  return 'technical';
}

function impactToFlags(impact) {
  const t = String(impact || '')
    .trim()
    .toLowerCase();
  const critical = t === 'critical' || t === 'high';
  const blocking = t === 'critical' || t === 'high' || t === 'blocker' || t === 'blocking';
  return { critical, blocking };
}

function asBool(raw, fallback = false) {
  if (typeof raw === 'boolean') return raw;
  if (raw == null) return fallback;
  const t = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(t)) return true;
  if (['0', 'false', 'no', 'n'].includes(t)) return false;
  return fallback;
}

/**
 * Compact sheet 08 + integration — never dump full workbook.
 */
function buildDependencyInputSlices(pack, container) {
  const frIds = [...buildFrIdSet(pack?.functionalRequirements || [])];
  const capabilities = (container?.analyses?.capability?.items || []).slice(0, 80).map((c) => ({
    capabilityId: c.capabilityId,
    name: truncate(c.name || '', 80),
    module: truncate(c.module || '', 64),
    sourceFrIds: Array.isArray(c.sourceFrIds) ? c.sourceFrIds.slice(0, 8) : [],
  }));

  const tasks = (container?.planning?.tasks || []).slice(0, 100).map((t) => ({
    id: normId(t.taskId || t.id || ''),
    name: truncate(t.name || t.title || '', 80),
    parentId: normId(t.parentId || '') || undefined,
  })).filter((t) => t.id);

  const wbsIds = [];
  const wbs = container?.planning?.wbs;
  if (wbs && typeof wbs === 'object') {
    const rawIds = Array.isArray(wbs.ids)
      ? wbs.ids
      : Array.isArray(wbs.nodes)
        ? wbs.nodes.map((n) => n.id || n.taskId)
        : [];
    for (const id of rawIds) {
      const n = normId(id);
      if (n) wbsIds.push(n);
    }
  }
  for (const t of tasks) {
    if (!wbsIds.includes(t.id)) wbsIds.push(t.id);
  }

  const sheet08 = (pack?.dependencies || []).slice(0, 40).map((row) => ({
    id: normId(row.externalId) || undefined,
    dependency: truncate(row.dependency || '', 160),
    type: truncate(row.type || '', 32),
    impact: truncate(row.impact || '', 32),
    requiredDate: row.requiredDate ? String(row.requiredDate).slice(0, 32) : undefined,
  })).filter((r) => r.dependency);

  const integration = (pack?.integration || []).slice(0, 30).map((row) => ({
    system: truncate(row.system || '', 80),
    integrationType: truncate(row.integrationType || '', 40),
    direction: truncate(row.direction || '', 24),
    required: row.required !== false,
  })).filter((r) => r.system);

  const knownIds = new Set([
    ...frIds,
    ...capabilities.map((c) => c.capabilityId).filter(Boolean),
    ...wbsIds,
  ]);
  for (const row of sheet08) {
    const sys = systemNodeId(row.dependency);
    if (sys) knownIds.add(sys);
  }
  for (const row of integration) {
    const sys = systemNodeId(row.system);
    if (sys) knownIds.add(sys);
  }

  return {
    context: buildProjectContextSlice(pack),
    capabilities,
    wbsIds: wbsIds.slice(0, 100),
    tasks,
    sheet08,
    integration,
    frIds: frIds.slice(0, 200),
    knownIds,
  };
}

function resolveNodeId(raw, knownIds) {
  const direct = normId(raw) || normProse(raw).slice(0, 64);
  if (!direct) return '';
  if (knownIds && knownIds.has(direct)) return direct;
  const asId = normId(raw);
  if (asId && knownIds && knownIds.has(asId)) return asId;
  const sys = systemNodeId(raw);
  if (sys && (!knownIds || knownIds.has(sys))) return sys;
  // Allow system nodes even if not pre-registered (external soft target)
  if (sys && String(raw || '').length > 0 && !/^(FR-|CAP-|TASK-|WBS-)/i.test(direct)) {
    return sys;
  }
  if (knownIds && !knownIds.has(direct) && !knownIds.has(asId)) {
    // Keep FR/CAP/TASK shaped ids only if known; else drop
    if (/^(FR-|CAP-|TASK-|WBS-)/i.test(direct)) return '';
  }
  return direct || asId || sys;
}

/**
 * Normalize one edge. Soft/LLM edges require evidence; drop if missing.
 * @param {'sheet'|'integration'|'llm'|'heuristic'} source
 */
function normalizeDependencyEdge(raw, knownIds, { source = 'llm', index = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const from = resolveNodeId(raw.from || raw.source || '', knownIds);
  const to = resolveNodeId(raw.to || raw.target || '', knownIds);
  if (!from || !to || from === to) return null;

  const evidence = truncate(raw.evidence || raw.reason || raw.note || '', EVIDENCE_MAX);
  if (source === 'llm' || source === 'heuristic') {
    if (!evidence) return null;
  }

  const dependency = normalizeDepKind(raw.dependency || raw.kind || raw.relation);
  const type = normalizeDepType(raw.type);
  let critical = asBool(raw.critical, false);
  let blocking = asBool(raw.blocking, false);
  if (raw.impact != null && !critical && !blocking) {
    const flags = impactToFlags(raw.impact);
    critical = flags.critical;
    blocking = flags.blocking;
  }

  let edgeId = normProse(raw.edgeId || raw.id || '').slice(0, 64);
  if (!edgeId) {
    edgeId = `DEP-${slugPart(from) || 'f'}-${slugPart(to) || index + 1}`;
  }

  return {
    edgeId,
    from,
    to,
    dependency,
    type,
    critical,
    blocking,
    evidence: evidence || truncate(raw.dependencyText || `${from}→${to}`, EVIDENCE_MAX),
    source,
  };
}

function edgeDedupeKey(edge) {
  return `${normKey(edge.from)}→${normKey(edge.to)}::${edge.dependency}`;
}

function dedupeEdges(edges = []) {
  const map = new Map();
  for (const e of edges) {
    if (!e) continue;
    const key = edgeDedupeKey(e);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...e });
      continue;
    }
    existing.critical = existing.critical || e.critical;
    existing.blocking = existing.blocking || e.blocking;
    if (!existing.evidence && e.evidence) existing.evidence = e.evidence;
    // Prefer sheet/integration over llm
    const rank = { sheet: 3, integration: 2, heuristic: 1, llm: 0 };
    if ((rank[e.source] || 0) > (rank[existing.source] || 0)) {
      existing.source = e.source;
      existing.edgeId = e.edgeId;
      existing.type = e.type;
      if (e.evidence) existing.evidence = e.evidence;
    }
  }
  return [...map.values()];
}

/**
 * Edges from sheet 08_Dependencies. from = primary capability or PROJECT; to = system.
 */
function buildSheet08Edges(sheet08 = [], capabilities = [], knownIds) {
  const edges = [];
  const anchor =
    capabilities[0]?.capabilityId ||
    (knownIds && [...knownIds].find((id) => id.startsWith('CAP-'))) ||
    'PROJECT';

  for (let i = 0; i < sheet08.length; i += 1) {
    const row = sheet08[i];
    const to = systemNodeId(row.dependency);
    if (!to) continue;
    const flags = impactToFlags(row.impact);
    const typeRaw = String(row.type || '').toLowerCase();
    const type = DEP_TYPES.includes(typeRaw)
      ? typeRaw
      : typeRaw.includes('external') || typeRaw.includes('ext')
        ? 'external'
        : typeRaw.includes('data')
          ? 'data'
          : typeRaw.includes('business') || typeRaw.includes('biz')
            ? 'business'
            : 'external';

    // Prefer matching capability by name/module mention
    let from = anchor;
    const depLower = String(row.dependency || '').toLowerCase();
    for (const cap of capabilities) {
      const blob = `${cap.name || ''} ${cap.module || ''}`.toLowerCase();
      if (blob && depLower && (blob.includes(depLower.slice(0, 12)) || depLower.includes((cap.name || '').toLowerCase().slice(0, 12)))) {
        from = cap.capabilityId;
        break;
      }
    }

    const edge = normalizeDependencyEdge(
      {
        edgeId: row.id || `DEP-S08-${i + 1}`,
        from,
        to,
        dependency: 'depends_on',
        type,
        critical: flags.critical,
        blocking: flags.blocking,
        evidence: `sheet08:${row.dependency}${row.impact ? ` impact=${row.impact}` : ''}`,
      },
      knownIds,
      { source: 'sheet', index: i }
    );
    if (edge) edges.push(edge);
  }
  return edges;
}

function buildIntegrationEdges(integration = [], capabilities = [], knownIds) {
  const edges = [];
  const anchor = capabilities[0]?.capabilityId || 'PROJECT';
  for (let i = 0; i < integration.length; i += 1) {
    const row = integration[i];
    const to = systemNodeId(row.system);
    if (!to) continue;
    const required = row.required !== false;
    const edge = normalizeDependencyEdge(
      {
        edgeId: `DEP-INT-${slugPart(row.system) || i + 1}`,
        from: anchor,
        to,
        dependency: 'integrates_with',
        type: 'external',
        critical: required,
        blocking: required,
        evidence: `integration:${row.system}${row.integrationType ? ` via ${row.integrationType}` : ''}`,
      },
      knownIds,
      { source: 'integration', index: i }
    );
    if (edge) edges.push(edge);
  }
  return edges;
}

/**
 * Soft heuristic: capability A depends_on B when shared FR parent module order by name.
 * Always includes evidence.
 */
function buildHeuristicSoftEdges(capabilities = [], knownIds) {
  const edges = [];
  if (capabilities.length < 2) return edges;
  const byModule = new Map();
  for (const cap of capabilities) {
    const mod = normKey(cap.module || 'general');
    if (!byModule.has(mod)) byModule.set(mod, []);
    byModule.get(mod).push(cap);
  }
  for (const [, list] of byModule) {
    for (let i = 1; i < list.length; i += 1) {
      const prev = list[i - 1];
      const cur = list[i];
      if (!prev.capabilityId || !cur.capabilityId) continue;
      const edge = normalizeDependencyEdge(
        {
          edgeId: `DEP-H-${slugPart(prev.capabilityId)}-${slugPart(cur.capabilityId)}`,
          from: cur.capabilityId,
          to: prev.capabilityId,
          dependency: 'depends_on',
          type: 'internal',
          critical: false,
          blocking: false,
          evidence: `same module "${prev.module || 'General'}": ${prev.name} before ${cur.name}`,
        },
        knownIds,
        { source: 'heuristic', index: i }
      );
      if (edge) edges.push(edge);
    }
  }
  return edges.slice(0, SOFT_EDGE_MAX);
}

/**
 * Detect cycles via DFS on from→to (from depends on to).
 * @returns {string[][]} list of cycles (node id loops)
 */
function detectCycles(edges = []) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from).push(e.to);
  }
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  const parent = new Map();
  const cycles = [];

  function dfs(u, path) {
    color.set(u, GRAY);
    path.push(u);
    for (const v of adj.get(u) || []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        const idx = path.indexOf(v);
        if (idx >= 0) cycles.push([...path.slice(idx), v]);
        continue;
      }
      if (c === WHITE) {
        parent.set(v, u);
        dfs(v, path);
      }
    }
    path.pop();
    color.set(u, BLACK);
  }

  for (const e of edges) {
    if ((color.get(e.from) ?? WHITE) === WHITE) dfs(e.from, []);
    if ((color.get(e.to) ?? WHITE) === WHITE) dfs(e.to, []);
  }
  return cycles;
}

function edgePriorityScore(edge) {
  // Lower = remove first when breaking cycles
  let score = 0;
  if (edge.blocking) score += 4;
  if (edge.critical) score += 2;
  if (edge.source === 'sheet') score += 3;
  if (edge.source === 'integration') score += 2;
  if (edge.source === 'llm') score -= 1;
  return score;
}

/**
 * Break cycles by removing lowest-priority edges; return { edges, broken, warnings }.
 */
function breakCycles(edges = []) {
  let current = [...edges];
  const broken = [];
  const warnings = [];
  let guard = 0;

  while (guard < 100) {
    guard += 1;
    const cycles = detectCycles(current);
    if (!cycles.length) break;

    const cycle = cycles[0];
    // Collect edges that participate in this cycle path
    const cycleEdgeKeys = new Set();
    for (let i = 0; i < cycle.length - 1; i += 1) {
      cycleEdgeKeys.add(`${normKey(cycle[i])}→${normKey(cycle[i + 1])}`);
    }

    let victim = null;
    let victimScore = Infinity;
    for (const e of current) {
      const key = `${normKey(e.from)}→${normKey(e.to)}`;
      if (!cycleEdgeKeys.has(key)) continue;
      const score = edgePriorityScore(e);
      if (score < victimScore) {
        victimScore = score;
        victim = e;
      }
    }
    if (!victim) {
      // Fallback: drop first cycle edge by scanning
      victim = current.find((e) => {
        const key = `${normKey(e.from)}→${normKey(e.to)}`;
        return cycleEdgeKeys.has(key);
      });
    }
    if (!victim) break;

    current = current.filter((e) => e !== victim && e.edgeId !== victim.edgeId);
    broken.push(victim.edgeId);
    warnings.push(
      `cycle_broken:${victim.edgeId} (${victim.from}→${victim.to})`
    );
  }

  return { edges: current, broken, warnings };
}

/**
 * Topological orderHint from dependency edges (to before from). Acyclic assumed.
 */
function computeOrderHint(edges = [], seedIds = []) {
  const nodes = new Set(seedIds.filter(Boolean));
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
  }
  const adj = new Map();
  const indeg = new Map();
  for (const id of nodes) {
    adj.set(id, []);
    indeg.set(id, 0);
  }
  for (const e of edges) {
    // e.from depends on e.to → to precedes from
    adj.get(e.to).push(e.from);
    indeg.set(e.from, (indeg.get(e.from) || 0) + 1);
  }

  const queue = [...nodes].filter((id) => (indeg.get(id) || 0) === 0).sort();
  const order = [];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const v of adj.get(u) || []) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) {
        queue.push(v);
        queue.sort();
      }
    }
  }

  // Append leftover (should be empty if acyclic)
  for (const id of nodes) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

function extractEdgesPayload(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.edges)) return data.edges;
    if (Array.isArray(data.dependencies)) return data.dependencies;
  }
  return null;
}

function validateAndNormalizeDependencyPayload(data, knownIds, { source = 'llm' } = {}) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Dependency response must be JSON object or array');
    err.code = 'DEPENDENCY_NON_JSON';
    throw err;
  }
  const arr = extractEdgesPayload(data);
  if (!arr) {
    const err = new Error('Dependency JSON must include edges[]');
    err.code = 'DEPENDENCY_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < arr.length; i += 1) {
    const edge = normalizeDependencyEdge(arr[i], knownIds, { source, index: i });
    if (edge) normalized.push(edge);
  }
  return dedupeEdges(normalized);
}

function buildDependencyPrompt({ context, capabilities, sheet08, integration, wbsIds }) {
  return [
    'You are a software BA. Infer soft dependency edges between capabilities/FRs/systems.',
    'Return ONLY valid JSON: {"edges":[{...}]} — no markdown, no prose matrix.',
    'Each edge: edgeId, from, to, dependency (requires|depends_on|blocks|integrates_with|precedes),',
    'type (internal|external|technical|data|business), critical (bool), blocking (bool),',
    'evidence (required short string — cite FR/capability/sheet reason).',
    'from/to must be ids from input (capabilityId, FR id, SYS-* system, or WBS/task id).',
    'Do not invent ids. Prefer soft links with clear evidence. Cap ~20 edges.',
    `Context: ${JSON.stringify(context)}`,
    `Capabilities: ${JSON.stringify(capabilities)}`,
    `WbsIds: ${JSON.stringify(wbsIds.slice(0, 40))}`,
    `Sheet08: ${JSON.stringify(sheet08)}`,
    `Integration: ${JSON.stringify(integration)}`,
  ].join('\n');
}

/**
 * Merge sheet08 + integration + LLM/heuristic soft links; break cycles; orderHint.
 */
async function runDependencyAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const input = buildDependencyInputSlices(pack, container);
  const knownIds = input.knownIds;
  const model = ollamaModel();

  const sheetEdges = buildSheet08Edges(input.sheet08, input.capabilities, knownIds);
  const intEdges = buildIntegrationEdges(input.integration, input.capabilities, knownIds);
  const heuristicSoft = buildHeuristicSoftEdges(input.capabilities, knownIds);

  let softEdges = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (llmEnabled && input.capabilities.length) {
    const timeoutMs =
      opts.timeoutMs ??
      opts.wallMs ??
      Math.min(planningTimeoutMs(), resolveJobWallMs('dependencyAnalysis'));
    const prompt = buildDependencyPrompt({
      context: input.context,
      capabilities: input.capabilities,
      sheet08: input.sheet08,
      integration: input.integration,
      wbsIds: input.wbsIds,
    });
    const result = await generateJson({
      prompt,
      temperature: 0.1,
      timeoutMs,
      numPredict: EDGE_NUM_PREDICT,
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
        softEdges = validateAndNormalizeDependencyPayload(result.data, knownIds, {
          source: 'llm',
        });
      } catch (err) {
        partial = true;
        lastError = err.code || 'DEPENDENCY_INVALID';
      }
    }
  }

  if (!softEdges.length && heuristicSoft.length) {
    softEdges = heuristicSoft;
    if (llmEnabled) partial = true;
  }

  let edges = dedupeEdges([...sheetEdges, ...intEdges, ...softEdges]);
  const { edges: acyclic, broken, warnings } = breakCycles(edges);
  edges = acyclic;

  const seedIds = [
    ...input.capabilities.map((c) => c.capabilityId),
    ...input.wbsIds,
    ...input.frIds.slice(0, 50),
  ];
  const orderHint = computeOrderHint(edges, seedIds);

  const source =
    llmCalls > 0 && softEdges.some((e) => e.source === 'llm')
      ? partial
        ? 'llm_partial'
        : 'merged'
      : sheetEdges.length || intEdges.length
        ? 'sheet'
        : softEdges.length
          ? 'heuristic'
          : 'empty';

  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    edges,
    orderHint,
    meta: {
      source,
      llmCalls,
      partial,
      error: lastError || undefined,
      cycleBroken: broken,
      warnings,
      sheetEdgeCount: sheetEdges.length,
      integrationEdgeCount: intEdges.length,
      softEdgeCount: softEdges.length,
      elapsedMs: Date.now() - started,
    },
  };
}

function applyDependencyToContainer(container, depResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.dependency = {
    status: depResult.status || 'ready',
    model: depResult.model || null,
    generatedAt: depResult.generatedAt || new Date().toISOString(),
    items: [],
    entities: [],
    edges: depResult.edges || [],
    dataFlows: [],
    orderHint: depResult.orderHint || [],
    meta: depResult.meta || {},
  };
  return next;
}

module.exports = {
  DEP_KINDS,
  DEP_TYPES,
  EVIDENCE_MAX,
  systemNodeId,
  normalizeDepKind,
  normalizeDepType,
  normalizeDependencyEdge,
  dedupeEdges,
  buildDependencyInputSlices,
  buildSheet08Edges,
  buildIntegrationEdges,
  buildHeuristicSoftEdges,
  detectCycles,
  breakCycles,
  computeOrderHint,
  validateAndNormalizeDependencyPayload,
  runDependencyAnalysis,
  applyDependencyToContainer,
  extractEdgesPayload,
};

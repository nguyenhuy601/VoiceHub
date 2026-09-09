/**
 * Job4 Risk Analysis (W3f) — P×I bands + mitigation; no hard-block Job5 by default.
 * Inputs: high complexity caps, critical deps, high gaps, arch high, constraints/assumptions.
 */

const {
  generateJson,
  planningTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normKey, normProse } = require('./requirementTemplateTextNorm');
const {
  buildFrIdSet,
  buildProjectContextSlice,
  truncate,
} = require('./aiAnalysisFrSlice');

const RISK_BANDS = Object.freeze(['low', 'medium', 'high', 'critical']);
const TITLE_MAX = 160;
const MITIGATION_MAX = 280;
const RISK_TOP_N = 40;
const RISK_WALL_MS = 120000;
const RISK_NUM_PREDICT = 768;

/** Default: risks warn PM / buffer Matching — do not hard-block Job5. */
const DEFAULT_HARD_BLOCK_NEXT_JOB = false;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/** Clamp probability/impact to integer 1–5. */
function clampPi(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

/**
 * Band from score P×I:
 * 1–4 low | 5–9 medium | 10–15 high | 16–25 critical
 */
function bandFromScore(score) {
  const s = Number(score);
  if (!Number.isFinite(s) || s < 1) return '';
  if (s <= 4) return 'low';
  if (s <= 9) return 'medium';
  if (s <= 15) return 'high';
  return 'critical';
}

function scoreFromPi(probability, impact) {
  return probability * impact;
}

/**
 * Compact risk signals from prior analyses + pack sheets — no full workbook.
 */
function buildRiskInputSlices(pack, container) {
  const frIdSet = buildFrIdSet(pack?.functionalRequirements || []);

  const highComplexityCaps = (container?.analyses?.capability?.items || [])
    .filter((c) => String(c.complexity || '').toLowerCase() === 'high')
    .slice(0, 30)
    .map((c) => ({
      capabilityId: c.capabilityId,
      name: truncate(c.name || '', 80),
      module: truncate(c.module || '', 64),
      sourceFrIds: Array.isArray(c.sourceFrIds) ? c.sourceFrIds.slice(0, 8) : [],
      complexity: c.complexity,
    }));

  const criticalDeps = (container?.analyses?.dependency?.edges || [])
    .filter((e) => e.critical || e.blocking)
    .slice(0, 30)
    .map((e) => ({
      edgeId: e.edgeId,
      from: e.from,
      to: e.to,
      critical: Boolean(e.critical),
      blocking: Boolean(e.blocking),
      type: e.type,
      evidence: truncate(e.evidence || '', 120),
    }));

  const highGaps = (container?.analyses?.gap?.items || [])
    .filter((g) => g.severity === 'high' || g.severity === 'critical')
    .slice(0, 30)
    .map((g) => ({
      gapId: g.gapId,
      type: g.type,
      severity: g.severity,
      issue: truncate(g.issue || '', 160),
      relatedFrIds: Array.isArray(g.relatedFrIds) ? g.relatedFrIds.slice(0, 8) : [],
    }));

  const highArch = (container?.analyses?.architectureImpact?.items || [])
    .filter((a) => a.impactLevel === 'high')
    .slice(0, 30)
    .map((a) => ({
      impactId: a.impactId,
      component: truncate(a.component || '', 80),
      layer: a.layer,
      impactLevel: a.impactLevel,
      sourceFrIds: Array.isArray(a.sourceFrIds) ? a.sourceFrIds.slice(0, 8) : [],
      capabilityIds: Array.isArray(a.capabilityIds) ? a.capabilityIds.slice(0, 6) : [],
    }));

  const constraints = (pack?.constraints || []).slice(0, 20).map((row) => ({
    type: truncate(row.type || '', 40),
    description: truncate(row.description || '', 160),
  })).filter((r) => r.description);

  const assumptions = (pack?.assumptions || []).slice(0, 20).map((row) => ({
    id: normId(row.externalId) || undefined,
    assumption: truncate(row.assumption || '', 160),
    impactIfInvalid: truncate(row.impactIfInvalid || '', 32),
  })).filter((r) => r.assumption);

  // Fallback FR anchors when signals lack FR links
  let fallbackFrIds = [
    ...highComplexityCaps.flatMap((c) => c.sourceFrIds),
    ...highGaps.flatMap((g) => g.relatedFrIds),
    ...highArch.flatMap((a) => a.sourceFrIds),
  ]
    .map((id) => normId(id))
    .filter((id) => id && frIdSet.has(id));
  fallbackFrIds = [...new Set(fallbackFrIds)].slice(0, 40);
  if (!fallbackFrIds.length) {
    fallbackFrIds = [...frIdSet].slice(0, 8);
  }

  return {
    context: buildProjectContextSlice(pack),
    highComplexityCaps,
    criticalDeps,
    highGaps,
    highArch,
    constraints,
    assumptions,
    knownFrIds: frIdSet,
    fallbackFrIds,
  };
}

/**
 * Normalize one risk item. relatedFrIds required (non-empty after pack filter).
 */
function normalizeRiskItem(raw, packFrIds, { index = 0, fallbackFrIds = [] } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const title = normProse(raw.title || raw.name || raw.risk || '').slice(0, TITLE_MAX);
  if (!title) return null;

  let relatedFrIds = Array.isArray(raw.relatedFrIds)
    ? raw.relatedFrIds.map((id) => normId(id)).filter(Boolean)
    : [];
  if (packFrIds) {
    relatedFrIds = relatedFrIds.filter((id) => packFrIds.has(id));
  }
  relatedFrIds = [...new Set(relatedFrIds)];
  if (!relatedFrIds.length && fallbackFrIds.length) {
    relatedFrIds = fallbackFrIds.slice(0, 3);
  }
  // Plan: require relatedFrIds
  if (!relatedFrIds.length) return null;

  const probability = clampPi(raw.probability ?? raw.p ?? raw.likelihood);
  const impact = clampPi(raw.impact ?? raw.i ?? raw.severity);
  if (probability == null || impact == null) return null;

  const score = scoreFromPi(probability, impact);
  const band = bandFromScore(score);
  if (!band) return null;

  const mitigation = truncate(raw.mitigation || raw.action || raw.response || '', MITIGATION_MAX);

  let riskId = normProse(raw.riskId || raw.id || '').slice(0, 64);
  if (!riskId) {
    riskId = `RSK-${String(index + 1).padStart(3, '0')}-${slugPart(title) || 'item'}`;
  }
  if (!/^RSK-/i.test(riskId)) {
    riskId = `RSK-${riskId}`;
  }

  return {
    riskId,
    title,
    relatedFrIds,
    probability,
    impact,
    score,
    band,
    ...(mitigation ? { mitigation } : {}),
  };
}

function dedupeRiskKey(item) {
  const fr = (item.relatedFrIds || []).slice().sort().join(',');
  return `${normKey(item.title)}::${fr}`;
}

function dedupeRiskItems(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const key = dedupeRiskKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        relatedFrIds: [...(item.relatedFrIds || [])],
      });
      continue;
    }
    existing.relatedFrIds = [
      ...new Set([...(existing.relatedFrIds || []), ...(item.relatedFrIds || [])]),
    ];
    if (item.score > existing.score) {
      existing.probability = item.probability;
      existing.impact = item.impact;
      existing.score = item.score;
      existing.band = item.band;
    }
    if (!existing.mitigation && item.mitigation) {
      existing.mitigation = item.mitigation;
    }
  }
  return [...map.values()];
}

function countByBand(items = []) {
  const counts = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const item of items) {
    if (RISK_BANDS.includes(item.band)) counts[item.band] += 1;
  }
  return counts;
}

function selectTopRisks(items = [], topN = RISK_TOP_N) {
  const n = Math.max(1, Number(topN) || RISK_TOP_N);
  return [...items]
    .sort((a, b) => {
      const d = (b.score || 0) - (a.score || 0);
      if (d !== 0) return d;
      return String(a.title || '').localeCompare(String(b.title || ''));
    })
    .slice(0, n);
}

function extractRisksArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.risks)) return data.risks;
  }
  return null;
}

function validateAndNormalizeRiskPayload(data, packFrIds, { fallbackFrIds = [] } = {}) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Risk response must be JSON object or array');
    err.code = 'RISK_NON_JSON';
    throw err;
  }
  const arr = extractRisksArray(data);
  if (!arr) {
    const err = new Error('Risk JSON must include items[] or risks[]');
    err.code = 'RISK_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < arr.length; i += 1) {
    const item = normalizeRiskItem(arr[i], packFrIds, {
      index: i,
      fallbackFrIds,
    });
    if (item) normalized.push(item);
  }
  return dedupeRiskItems(normalized);
}

function pickAnchorFrIds(signalFrIds, fallbackFrIds, packFrIds) {
  let ids = (signalFrIds || []).map((id) => normId(id)).filter(Boolean);
  if (packFrIds) ids = ids.filter((id) => packFrIds.has(id));
  if (!ids.length) ids = (fallbackFrIds || []).slice(0, 3);
  return [...new Set(ids)].slice(0, 8);
}

/** Heuristic risks from signal slices — always attaches relatedFrIds when possible. */
function buildHeuristicRiskItems(input) {
  const items = [];
  let idx = 0;
  const packFrIds = input.knownFrIds;
  const fallback = input.fallbackFrIds || [];

  const push = (partial) => {
    const relatedFrIds = pickAnchorFrIds(partial.relatedFrIds, fallback, packFrIds);
    if (!relatedFrIds.length) return;
    idx += 1;
    const probability = clampPi(partial.probability);
    const impact = clampPi(partial.impact);
    if (probability == null || impact == null) return;
    const score = scoreFromPi(probability, impact);
    items.push({
      riskId: `RSK-${String(idx).padStart(3, '0')}-${slugPart(partial.title)}`,
      title: truncate(partial.title, TITLE_MAX),
      relatedFrIds,
      probability,
      impact,
      score,
      band: bandFromScore(score),
      mitigation: truncate(partial.mitigation || '', MITIGATION_MAX) || undefined,
    });
  };

  for (const cap of input.highComplexityCaps || []) {
    push({
      title: `High complexity capability: ${cap.name}`,
      relatedFrIds: cap.sourceFrIds,
      probability: 3,
      impact: 4,
      mitigation: 'Spike / POC early; assign senior owner; buffer effort',
    });
  }

  for (const dep of input.criticalDeps || []) {
    push({
      title: `Critical dependency ${dep.from} → ${dep.to}`,
      relatedFrIds: fallback,
      probability: dep.blocking ? 4 : 3,
      impact: 5,
      mitigation: 'Confirm vendor SLA; add fallback path; track as blocker',
    });
  }

  for (const gap of input.highGaps || []) {
    push({
      title: `Requirement gap (${gap.severity}): ${gap.type}`,
      relatedFrIds: gap.relatedFrIds,
      probability: gap.severity === 'critical' ? 4 : 3,
      impact: gap.severity === 'critical' ? 5 : 4,
      mitigation: gap.issue
        ? `BA resolve: ${truncate(gap.issue, 120)}`
        : 'Clarify FR with BA before Matching',
    });
  }

  for (const arch of input.highArch || []) {
    push({
      title: `High architecture impact: ${arch.component} (${arch.layer})`,
      relatedFrIds: arch.sourceFrIds,
      probability: 3,
      impact: 4,
      mitigation: 'Review integration boundaries; add tech spike if new stack',
    });
  }

  for (const c of input.constraints || []) {
    push({
      title: `Constraint risk: ${c.type || 'general'}`,
      relatedFrIds: fallback,
      probability: 3,
      impact: 3,
      mitigation: truncate(c.description, 160),
    });
  }

  for (const a of input.assumptions || []) {
    const impactRaw = String(a.impactIfInvalid || '').toLowerCase();
    const impact =
      impactRaw === 'critical' || impactRaw === 'high'
        ? 5
        : impactRaw === 'medium' || impactRaw === 'med'
          ? 3
          : 2;
    push({
      title: `Assumption may be invalid: ${truncate(a.assumption, 80)}`,
      relatedFrIds: fallback,
      probability: 3,
      impact,
      mitigation: 'Validate assumption with stakeholders; document contingency',
    });
  }

  return dedupeRiskItems(items);
}

function buildRiskPolicyMeta(items = [], { hardBlockNextJob = DEFAULT_HARD_BLOCK_NEXT_JOB } = {}) {
  const bandCounts = countByBand(items);
  const elevated = bandCounts.high + bandCounts.critical;
  return {
    hardBlockNextJob: Boolean(hardBlockNextJob),
    pmReviewRequired: elevated > 0,
    bandCounts,
    warningRiskIds: items
      .filter((r) => r.band === 'high' || r.band === 'critical')
      .map((r) => r.riskId),
  };
}

function riskAllowsNextJob(riskSection) {
  if (!riskSection || typeof riskSection !== 'object') return true;
  if (riskSection.meta?.hardBlockNextJob === true) return false;
  return true;
}

function buildRiskPrompt({ context, signals }) {
  return [
    'You are a PM/BA. Produce compact project risks from signals.',
    'Return ONLY valid JSON: {"items":[{...}]} — no markdown.',
    'Each item: riskId (RSK-xxx), title, relatedFrIds (required, from input FR ids only),',
    'probability (1-5), impact (1-5), mitigation (short).',
    'score and band are computed server-side — you may omit them.',
    'Do not invent FR ids. Prefer risks tied to high complexity, critical deps, gaps, arch.',
    `Context: ${JSON.stringify(context)}`,
    `Signals: ${JSON.stringify(signals)}`,
  ].join('\n');
}

/**
 * Run risk analysis from prior (+ Job4 sibling) analyses + constraints/assumptions.
 */
async function runRiskAnalysis(pack, container, opts = {}) {
  const started = Date.now();
  const topN = opts.topN ?? RISK_TOP_N;
  const input = buildRiskInputSlices(pack, container);
  const model = ollamaModel();
  const heuristic = buildHeuristicRiskItems(input);

  const hasSignals =
    (input.highComplexityCaps || []).length ||
    (input.criticalDeps || []).length ||
    (input.highGaps || []).length ||
    (input.highArch || []).length ||
    (input.constraints || []).length ||
    (input.assumptions || []).length;

  if (!hasSignals && !heuristic.length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items: [],
      meta: {
        source: 'empty',
        llmCalls: 0,
        partial: false,
        ...buildRiskPolicyMeta([]),
      },
    };
  }

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (!llmEnabled) {
    const items = selectTopRisks(heuristic, topN);
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items,
      meta: {
        source: 'heuristic',
        llmCalls: 0,
        partial: false,
        topN,
        ...buildRiskPolicyMeta(items),
        inputCounts: {
          highComplexityCaps: input.highComplexityCaps.length,
          criticalDeps: input.criticalDeps.length,
          highGaps: input.highGaps.length,
          highArch: input.highArch.length,
          constraints: input.constraints.length,
          assumptions: input.assumptions.length,
        },
      },
    };
  }

  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let collected = [];

  const timeoutMs = opts.timeoutMs ?? Math.min(planningTimeoutMs(), RISK_WALL_MS);
  const signals = {
    highComplexityCaps: input.highComplexityCaps,
    criticalDeps: input.criticalDeps,
    highGaps: input.highGaps,
    highArch: input.highArch,
    constraints: input.constraints,
    assumptions: input.assumptions,
    knownFrIds: [...input.knownFrIds].slice(0, 80),
  };
  const prompt = buildRiskPrompt({ context: input.context, signals });
  const result = await generateJson({
    prompt,
    temperature: 0.1,
    timeoutMs,
    numPredict: RISK_NUM_PREDICT,
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
      collected = validateAndNormalizeRiskPayload(result.data, input.knownFrIds, {
        fallbackFrIds: input.fallbackFrIds,
      });
    } catch (err) {
      partial = true;
      lastError = err.code || 'RISK_INVALID';
    }
  }

  let items = dedupeRiskItems(collected);
  if (!items.length) {
    items = heuristic;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial && heuristic.length) {
    items = dedupeRiskItems([...items, ...heuristic]);
  }

  const topItems = selectTopRisks(items, topN);
  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    items: topItems,
    meta: {
      source: collected.length ? (partial ? 'llm_partial' : 'llm') : 'heuristic',
      llmCalls,
      partial,
      error: lastError || undefined,
      topN,
      elapsedMs: Date.now() - started,
      ...buildRiskPolicyMeta(topItems),
      inputCounts: {
        highComplexityCaps: input.highComplexityCaps.length,
        criticalDeps: input.criticalDeps.length,
        highGaps: input.highGaps.length,
        highArch: input.highArch.length,
        constraints: input.constraints.length,
        assumptions: input.assumptions.length,
      },
    },
  };
}

function applyRiskToContainer(container, riskResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.risk = {
    status: riskResult.status || 'ready',
    model: riskResult.model || null,
    generatedAt: riskResult.generatedAt || new Date().toISOString(),
    items: riskResult.items || [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    chains: [],
    meta: riskResult.meta || {},
  };
  return next;
}

module.exports = {
  RISK_BANDS,
  DEFAULT_HARD_BLOCK_NEXT_JOB,
  clampPi,
  bandFromScore,
  scoreFromPi,
  normalizeRiskItem,
  dedupeRiskItems,
  countByBand,
  selectTopRisks,
  validateAndNormalizeRiskPayload,
  buildRiskInputSlices,
  buildHeuristicRiskItems,
  buildRiskPolicyMeta,
  riskAllowsNextJob,
  runRiskAnalysis,
  applyRiskToContainer,
  extractRisksArray,
};

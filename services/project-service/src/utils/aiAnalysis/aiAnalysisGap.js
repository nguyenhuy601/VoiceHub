/**
 * Job1 Gap Analysis (W3d) — GAP-* items; Preview warnings; no hard-block Job2+.
 * Does not overwrite W0 validation / importIssues.
 */

const {
  generateJson,
  analysisChunkTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normProse } = require('../requirement/requirementTemplateTextNorm');
const {
  buildFrIdSet,
  buildRequirementFrSlicesForAnalysis,
  expandFrIdSetWithSlices,
  buildProjectContextSlice,
  truncate,
} = require('./aiAnalysisFrSlice');
const {
  FR_LANGUAGE_CUE,
  hasAmbiguousLanguage,
  hasPossibleContradiction,
  hasIntegrationHint,
  hasDataHint,
} = require('./aiAnalysisLocaleText');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');

const GAP_TYPES = Object.freeze([
  'missing_requirement',
  'ambiguous',
  'incomplete',
  'contradiction',
  'missing_business_rule',
  'missing_data',
  'missing_integration',
  'missing_nfr',
]);

const GAP_SEVERITY = Object.freeze(['low', 'medium', 'high', 'critical']);

const ISSUE_MAX = 280;
const REC_MAX = 240;
const GAP_WALL_MS = resolveJobWallMs('requirementAnalysis');
const GAP_NUM_PREDICT = 768;
const GAP_CHUNK_SIZE = 16;
const GAP_MAX_CHUNKS = 6;

/** Default policy: never hard-block next jobs on gap severity alone. */
const DEFAULT_HARD_BLOCK_NEXT_JOB = false;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeGapType(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (GAP_TYPES.includes(t)) return t;
  if (t === 'missing_req' || t === 'missing') return 'missing_requirement';
  if (t === 'unclear' || t === 'vague') return 'ambiguous';
  if (t === 'partial') return 'incomplete';
  if (t === 'conflict') return 'contradiction';
  if (t === 'missing_br' || t === 'business_rule') return 'missing_business_rule';
  return '';
}

function normalizeSeverity(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'med') return 'medium';
  if (GAP_SEVERITY.includes(t)) return t;
  return '';
}

function emptySeverityCounts() {
  return { low: 0, medium: 0, high: 0, critical: 0 };
}

function countBySeverity(items = []) {
  const counts = emptySeverityCounts();
  for (const item of items) {
    const s = normalizeSeverity(item?.severity);
    if (s) counts[s] += 1;
  }
  return counts;
}

/**
 * Normalize one gap item. relatedCapabilityIds optional (Job1).
 * Does not mutate pack FR / validation.issues.
 */
function normalizeGapItem(raw, packFrIds, packCapabilityIds, { index = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const type = normalizeGapType(raw.type || raw.gapType);
  if (!type) return null;

  const issue = truncate(raw.issue || raw.description || raw.message || '', ISSUE_MAX);
  if (!issue) return null;

  const severity = normalizeSeverity(raw.severity) || 'medium';
  const recommendation = truncate(
    raw.recommendation || raw.action || raw.suggestion || '',
    REC_MAX
  );

  let relatedFrIds = Array.isArray(raw.relatedFrIds)
    ? raw.relatedFrIds.map((id) => normId(id)).filter(Boolean)
    : [];
  if (packFrIds) {
    relatedFrIds = relatedFrIds.filter((id) => packFrIds.has(id));
  }
  relatedFrIds = [...new Set(relatedFrIds)];

  let relatedCapabilityIds = Array.isArray(raw.relatedCapabilityIds)
    ? raw.relatedCapabilityIds.map((id) => normId(id) || normProse(id)).filter(Boolean)
    : [];
  if (packCapabilityIds) {
    relatedCapabilityIds = relatedCapabilityIds.filter((id) => packCapabilityIds.has(id));
  } else {
    relatedCapabilityIds = [];
  }
  relatedCapabilityIds = [...new Set(relatedCapabilityIds)].slice(0, 16);

  let gapId = normProse(raw.gapId || raw.id || '').slice(0, 64);
  if (!gapId) {
    gapId = `GAP-${String(index + 1).padStart(3, '0')}-${slugPart(type) || 'item'}`;
  }
  if (!/^GAP-/i.test(gapId)) {
    gapId = `GAP-${gapId}`;
  }

  return {
    gapId,
    type,
    relatedFrIds,
    relatedCapabilityIds,
    issue,
    severity,
    recommendation: recommendation || undefined,
  };
}

function dedupeGapKey(item) {
  const fr = (item.relatedFrIds || []).slice().sort().join(',');
  return `${item.type}::${fr}::${normProse(item.issue).toLowerCase().slice(0, 80)}`;
}

function dedupeGapItems(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const key = dedupeGapKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...item, relatedFrIds: [...(item.relatedFrIds || [])] });
      continue;
    }
    existing.relatedFrIds = [
      ...new Set([...(existing.relatedFrIds || []), ...(item.relatedFrIds || [])]),
    ];
    const rank = { low: 1, medium: 2, high: 3, critical: 4 };
    if ((rank[item.severity] || 0) > (rank[existing.severity] || 0)) {
      existing.severity = item.severity;
    }
    if (!existing.recommendation && item.recommendation) {
      existing.recommendation = item.recommendation;
    }
  }
  return [...map.values()];
}

function extractGapsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.gaps)) return data.gaps;
  }
  return null;
}

function validateAndNormalizeGapPayload(data, packFrIds, packCapabilityIds) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Gap response must be JSON object or array');
    err.code = 'GAP_NON_JSON';
    throw err;
  }
  const arr = extractGapsArray(data);
  if (!arr) {
    const err = new Error('Gap JSON must include items[] or gaps[]');
    err.code = 'GAP_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < arr.length; i += 1) {
    const item = normalizeGapItem(arr[i], packFrIds, packCapabilityIds, { index: i });
    if (item) normalized.push(item);
  }
  return dedupeGapItems(normalized);
}

/**
 * Compact presence flags — NFR/integration/FR quality signals (not W0 issues).
 * @param {object} pack
 * @param {{ hierarchy?: object, frSlices?: object[] }} [opts]
 */
function buildGapInputHints(pack, opts = {}) {
  const frSlices =
    opts.frSlices ||
    buildRequirementFrSlicesForAnalysis(pack, opts.hierarchy);
  const nfr = pack?.nonFunctionalRequirements || [];
  const integration = pack?.integration || [];
  const qualityFlags = [];

  for (const slice of frSlices) {
    const flags = [];
    if (!slice.description || String(slice.description).length < 20) flags.push('desc_short_or_empty');
    if (!slice.ac || String(slice.ac).length < 15) flags.push('ac_short_or_empty');
    const blob = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`;
    if (hasAmbiguousLanguage(blob)) flags.push('ambiguous_language');
    if (hasPossibleContradiction(blob)) {
      flags.push('possible_contradiction');
    }
    if (flags.length) {
      qualityFlags.push({
        id: slice.id,
        module: slice.module,
        title: slice.title,
        flags,
      });
    }
  }

  return {
    context: buildProjectContextSlice(pack),
    frSlices: frSlices.map((s) => ({
      id: s.id,
      module: s.module,
      feature: s.feature,
      title: s.title,
      description: s.description,
      ac: s.ac,
    })),
    qualityFlags,
    nfrPresent: nfr.length > 0,
    nfrCount: nfr.length,
    integrationPresent: integration.length > 0,
    integrationCount: integration.length,
    nfrCategories: nfr
      .slice(0, 12)
      .map((r) => truncate(r.category || '', 40))
      .filter(Boolean),
  };
}

/** Heuristic gaps from FR quality + NFR/integration presence — never writes validation.issues. */
function buildHeuristicGapItems(hints = {}) {
  const items = [];
  let idx = 0;
  const push = (partial) => {
    idx += 1;
    items.push({
      gapId: `GAP-${String(idx).padStart(3, '0')}-${slugPart(partial.type)}`,
      relatedCapabilityIds: [],
      ...partial,
    });
  };

  for (const q of hints.qualityFlags || []) {
    if (q.flags.includes('desc_short_or_empty') || q.flags.includes('ac_short_or_empty')) {
      push({
        type: 'incomplete',
        relatedFrIds: [q.id],
        issue: `Requirement ${q.id} (${q.title}) lacks sufficient description or acceptance criteria`,
        severity: 'medium',
        recommendation: 'Expand Description and Acceptance Criteria before WBS',
      });
    }
    if (q.flags.includes('ambiguous_language')) {
      push({
        type: 'ambiguous',
        relatedFrIds: [q.id],
        issue: `Requirement ${q.id} uses ambiguous language (TBD/unclear/…)`,
        severity: 'high',
        recommendation: 'Clarify wording with BA; replace TBD with concrete rules',
      });
    }
    if (q.flags.includes('possible_contradiction')) {
      push({
        type: 'contradiction',
        relatedFrIds: [q.id],
        issue: `Requirement ${q.id} may contain conflicting must/shall statements`,
        severity: 'high',
        recommendation: 'Resolve conflicting statements with stakeholders',
      });
    }
  }

  if (!hints.nfrPresent) {
    push({
      type: 'missing_nfr',
      relatedFrIds: [],
      issue: 'No non-functional requirements captured in pack',
      severity: 'high',
      recommendation: 'Add NFR rows (security, performance, availability) on sheet 04',
    });
  }

  if (!hints.integrationPresent) {
    const needsIntegration = (hints.frSlices || []).some((s) =>
      hasIntegrationHint(`${s.title || ''} ${s.description || ''}`)
    );
    if (needsIntegration) {
      const frIds = (hints.frSlices || [])
        .filter((s) => hasIntegrationHint(`${s.title || ''} ${s.description || ''}`))
        .map((s) => s.id)
        .slice(0, 8);
      push({
        type: 'missing_integration',
        relatedFrIds: frIds,
        issue: 'FRs mention external/API systems but Integration sheet is empty',
        severity: 'high',
        recommendation: 'Document external systems on sheet 06_Integration',
      });
    }
  }

  const dataHintFrs = (hints.frSlices || []).filter((s) =>
    hasDataHint(`${s.title || ''} ${s.description || ''}`)
  );
  // Soft signal only when many data FRs but no entity-ish clarity in AC
  for (const s of dataHintFrs.slice(0, 3)) {
    if (!s.ac || String(s.ac).length < 15) {
      push({
        type: 'missing_data',
        relatedFrIds: [s.id],
        issue: `Data-related FR ${s.id} lacks clear data/acceptance detail`,
        severity: 'medium',
        recommendation: 'Specify entities, fields, and retention in AC or metadata',
      });
    }
  }

  if (!(hints.frSlices || []).length) {
    push({
      type: 'missing_requirement',
      relatedFrIds: [],
      issue: 'No Requirement-level FR rows found in pack',
      severity: 'critical',
      recommendation: 'Add Module → Feature → Requirement rows on sheet 03',
    });
  }

  return dedupeGapItems(items);
}

/**
 * Policy snapshot for Preview / Job2 gate — high/critical = warning only.
 */
function buildGapPolicyMeta(items = [], { hardBlockNextJob = DEFAULT_HARD_BLOCK_NEXT_JOB } = {}) {
  const severityCounts = countBySeverity(items);
  const reviewCount = severityCounts.high + severityCounts.critical;
  return {
    hardBlockNextJob: Boolean(hardBlockNextJob),
    baReviewRequired: reviewCount > 0,
    severityCounts,
    warningGapIds: items
      .filter((g) => g.severity === 'high' || g.severity === 'critical')
      .map((g) => g.gapId),
  };
}

/** Preview DTO extras for Job1 — gaps + CTA bổ sung FR. */
function buildRequirementAnalysisGapPreview(gapSection) {
  const items = Array.isArray(gapSection?.items) ? gapSection.items : [];
  const policy = buildGapPolicyMeta(items, {
    hardBlockNextJob:
      gapSection?.meta?.hardBlockNextJob === true
        ? true
        : DEFAULT_HARD_BLOCK_NEXT_JOB,
  });
  const warnings = items
    .filter((g) => g.severity === 'high' || g.severity === 'critical')
    .map((g) => ({
      gapId: g.gapId,
      type: g.type,
      severity: g.severity,
      issue: g.issue,
      relatedFrIds: g.relatedFrIds || [],
      recommendation: g.recommendation,
    }));

  return {
    gaps: items,
    severityCounts: policy.severityCounts,
    warnings,
    baReviewRequired: policy.baReviewRequired,
    hardBlockNextJob: policy.hardBlockNextJob,
    cta: {
      action: 'supplement_fr',
      labelKey: 'requirements.aiAnalysisGapCtaSupplementFr',
      descriptionKey: 'requirements.aiAnalysisGapCtaSupplementFrHint',
    },
  };
}

function buildGapChunks(frSlices, chunkSize = GAP_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < frSlices.length; i += chunkSize) {
    chunks.push(frSlices.slice(i, i + chunkSize));
  }
  return chunks.slice(0, GAP_MAX_CHUNKS);
}

function buildGapPrompt({ context, hintsMeta, frChunk, chunkIndex, chunkTotal }) {
  return [
    'You are a software BA. Find requirement gaps (not staffing gaps).',
    FR_LANGUAGE_CUE,
    'Return ONLY valid JSON: {"items":[{...}]} — no markdown.',
    'Each item: gapId (GAP-xxx), type (missing_requirement|ambiguous|incomplete|contradiction|',
    'missing_business_rule|missing_data|missing_integration|missing_nfr),',
    'relatedFrIds (from input only), relatedCapabilityIds (optional empty),',
    'issue (short), severity (low|medium|high|critical), recommendation (short).',
    'Do not invent FR ids. Do not delete or rewrite requirements.',
    `Chunk ${chunkIndex + 1}/${chunkTotal}.`,
    `Context: ${JSON.stringify(context)}`,
    `Presence: ${JSON.stringify(hintsMeta)}`,
    `Requirements: ${JSON.stringify(frChunk)}`,
  ].join('\n');
}

function canStartChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

/**
 * Run gap analysis. Never mutates pack.importIssues / validation.issues.
 */
async function runGapAnalysis(pack, opts = {}) {
  const wallMs = opts.wallMs ?? resolveJobWallMs('requirementAnalysis');
  const started = Date.now();
  const frSlices =
    opts.frSlices ||
    buildRequirementFrSlicesForAnalysis(pack, opts.hierarchy);
  const packFrIds = expandFrIdSetWithSlices(
    buildFrIdSet(pack?.functionalRequirements || []),
    frSlices
  );
  const packCapabilityIds = opts.packCapabilityIds || null;
  const hints = buildGapInputHints(pack, { hierarchy: opts.hierarchy, frSlices });
  const model = ollamaModel();
  const heuristic = buildHeuristicGapItems(hints);

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (!llmEnabled) {
    const policy = buildGapPolicyMeta(heuristic);
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items: heuristic,
      meta: {
        source: heuristic.length ? 'heuristic' : 'empty',
        llmCalls: 0,
        partial: false,
        ...policy,
        doesNotOverwriteValidation: true,
      },
    };
  }

  const chunks = buildGapChunks(hints.frSlices, opts.chunkSize || GAP_CHUNK_SIZE);
  const collected = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  const chunkTimeout = opts.chunkTimeoutMs ?? Math.min(analysisChunkTimeoutMs(), wallMs);
  const hintsMeta = {
    nfrPresent: hints.nfrPresent,
    nfrCount: hints.nfrCount,
    integrationPresent: hints.integrationPresent,
    integrationCount: hints.integrationCount,
    qualityFlagCount: (hints.qualityFlags || []).length,
  };

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = Date.now() - started;
    if (!canStartChunk(elapsed, wallMs, chunkTimeout)) {
      partial = true;
      lastError = 'wall_budget';
      break;
    }
    const prompt = buildGapPrompt({
      context: hints.context,
      hintsMeta,
      frChunk: chunks[i],
      chunkIndex: i,
      chunkTotal: chunks.length,
    });
    const result = await generateJson({
      prompt,
      temperature: 0.1,
      timeoutMs: chunkTimeout,
      numPredict: GAP_NUM_PREDICT,
    });
    llmCalls += 1;
    if (result.skipped) {
      partial = true;
      lastError = result.error || 'llm_skipped';
      break;
    }
    if (!result.ok || result.data == null) {
      partial = true;
      lastError = result.error || 'ollama_error';
      continue;
    }
    try {
      const items = validateAndNormalizeGapPayload(
        result.data,
        packFrIds,
        packCapabilityIds
      );
      collected.push(...items);
    } catch (err) {
      partial = true;
      lastError = err.code || 'GAP_INVALID';
    }
  }

  let items = dedupeGapItems(collected);
  if (!items.length) {
    items = heuristic;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial && heuristic.length) {
    items = dedupeGapItems([...items, ...heuristic]);
  }

  const policy = buildGapPolicyMeta(items);
  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    items,
    meta: {
      source: collected.length ? (partial ? 'llm_partial' : 'llm') : 'heuristic',
      llmCalls,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      ...policy,
      doesNotOverwriteValidation: true,
    },
  };
}

function applyGapToContainer(container, gapResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.gap = {
    status: gapResult.status || 'ready',
    model: gapResult.model || null,
    generatedAt: gapResult.generatedAt || new Date().toISOString(),
    items: gapResult.items || [],
    entities: [],
    edges: [],
    dataFlows: [],
    orderHint: [],
    meta: gapResult.meta || {},
  };
  return next;
}

/**
 * Job2+ gate helper — gaps never hard-block unless explicit override in meta.
 */
function gapAllowsNextJob(gapSection) {
  if (!gapSection || typeof gapSection !== 'object') return true;
  if (gapSection.meta?.hardBlockNextJob === true) return false;
  return true;
}

module.exports = {
  GAP_TYPES,
  GAP_SEVERITY,
  DEFAULT_HARD_BLOCK_NEXT_JOB,
  normalizeGapType,
  normalizeSeverity,
  normalizeGapItem,
  dedupeGapItems,
  countBySeverity,
  validateAndNormalizeGapPayload,
  buildGapInputHints,
  buildHeuristicGapItems,
  buildGapPolicyMeta,
  buildRequirementAnalysisGapPreview,
  buildGapChunks,
  canStartChunk,
  runGapAnalysis,
  applyGapToContainer,
  gapAllowsNextJob,
  extractGapsArray,
};

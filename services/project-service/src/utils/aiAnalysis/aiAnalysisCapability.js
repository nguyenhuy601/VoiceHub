/**
 * Job2 Capability Analysis (W3a) — structured items, dedup, FR validate, LLM+heuristic.
 */

const {
  generateJson,
  analysisChunkTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normKey, normProse } = require('../requirement/requirementTemplateTextNorm');
const {
  buildFrIdSet,
  buildRequirementFrSlicesForAnalysis,
  expandFrIdSetWithSlices,
  buildProjectContextSlice,
} = require('./aiAnalysisFrSlice');
const { FR_LANGUAGE_CUE, detectSkillHints } = require('./aiAnalysisLocaleText');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');

const COMPLEXITY = Object.freeze(['low', 'medium', 'high']);
const CONFIDENCE_LABELS = Object.freeze(['low', 'med', 'high']);

const CAP_WALL_MS = resolveJobWallMs('capabilityAnalysis');
const CAP_CHUNK_SIZE = 12;
const CAP_MAX_CHUNKS = 8;
const CAP_NUM_PREDICT = 768;
const NAME_MAX = 160;
const SKILL_MAX = 8;

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeComplexity(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'med') return 'medium';
  if (COMPLEXITY.includes(t)) return t;
  return '';
}

function normalizeConfidence(raw) {
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const n = Math.max(0, Math.min(1, raw));
    return n;
  }
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'medium') return 'med';
  if (CONFIDENCE_LABELS.includes(t)) return t;
  const asNum = Number(t);
  if (Number.isFinite(asNum)) return Math.max(0, Math.min(1, asNum));
  return '';
}

function normalizeRequiredSkills(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (out.length >= SKILL_MAX) break;
    let name = '';
    let level;
    if (typeof entry === 'string') {
      name = normProse(entry);
    } else if (entry && typeof entry === 'object') {
      name = normProse(entry.name || entry.skill || '');
      if (entry.level != null && Number.isFinite(Number(entry.level))) {
        level = Math.max(1, Math.min(5, Math.round(Number(entry.level))));
      }
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(level != null ? { name, level } : { name });
  }
  return out;
}

function dedupeKey(moduleName, capabilityName) {
  return `${normKey(moduleName)}::${normKey(capabilityName)}`;
}

/**
 * Normalize one capability item; drop if missing required fields.
 * sourceFrIds filtered to packFrIds when provided.
 */
function normalizeCapabilityItem(raw, packFrIds, { index = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normProse(raw.name || raw.title || '').slice(0, NAME_MAX);
  const moduleName = normProse(raw.module || '').slice(0, 80);
  if (!name || !moduleName) return null;

  let sourceFrIds = Array.isArray(raw.sourceFrIds)
    ? raw.sourceFrIds.map((id) => normId(id)).filter(Boolean)
    : [];
  if (packFrIds) {
    sourceFrIds = sourceFrIds.filter((id) => packFrIds.has(id));
  }
  sourceFrIds = [...new Set(sourceFrIds)];
  if (!sourceFrIds.length) return null;

  const requiredSkills = normalizeRequiredSkills(raw.requiredSkills);
  if (!requiredSkills.length) return null;

  const complexity = normalizeComplexity(raw.complexity);
  if (!complexity) return null;

  const confidence = normalizeConfidence(raw.confidence);
  if (confidence === '') return null;

  const feature = normProse(raw.feature || '').slice(0, 80);
  let capabilityId = normProse(raw.capabilityId || raw.id || '').slice(0, 64);
  if (!capabilityId) {
    capabilityId = `CAP-${slugPart(moduleName) || 'mod'}-${slugPart(name) || index + 1}`;
  }

  return {
    capabilityId,
    name,
    module: moduleName,
    ...(feature ? { feature } : {}),
    sourceFrIds,
    requiredSkills,
    complexity,
    confidence,
  };
}

/**
 * Dedup by module+name (case-insensitive); merge sourceFrIds; keep first skills/complexity.
 */
function dedupeCapabilityItems(items = []) {
  const map = new Map();
  for (const item of items) {
    if (!item) continue;
    const key = dedupeKey(item.module, item.name);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...item,
        sourceFrIds: [...new Set(item.sourceFrIds || [])],
        requiredSkills: [...(item.requiredSkills || [])],
      });
      continue;
    }
    const mergedFr = new Set([...(existing.sourceFrIds || []), ...(item.sourceFrIds || [])]);
    existing.sourceFrIds = [...mergedFr];
    const skillSeen = new Set(existing.requiredSkills.map((s) => s.name.toLowerCase()));
    for (const sk of item.requiredSkills || []) {
      const k = sk.name.toLowerCase();
      if (skillSeen.has(k)) continue;
      skillSeen.add(k);
      existing.requiredSkills.push(sk);
      if (existing.requiredSkills.length >= SKILL_MAX) break;
    }
    if (
      typeof item.confidence === 'number' &&
      (typeof existing.confidence !== 'number' || item.confidence > existing.confidence)
    ) {
      existing.confidence = item.confidence;
    }
  }
  return [...map.values()];
}

function extractItemsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.items)) return data.items;
    if (Array.isArray(data.capabilities)) return data.capabilities;
  }
  return null;
}

/**
 * Reject non-JSON / wrong shape; normalize + filter invalid FR; dedupe.
 */
function validateAndNormalizeCapabilityPayload(data, packFrIds) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('Capability response must be JSON object or array');
    err.code = 'CAPABILITY_NON_JSON';
    throw err;
  }
  const arr = extractItemsArray(data);
  if (!arr) {
    const err = new Error('Capability JSON must include items[]');
    err.code = 'CAPABILITY_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < arr.length; i += 1) {
    const item = normalizeCapabilityItem(arr[i], packFrIds, { index: i });
    if (item) normalized.push(item);
  }
  return dedupeCapabilityItems(normalized);
}

function inferSkillsFromSlice(slice) {
  const text = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`;
  const skills = detectSkillHints(text).slice(0, SKILL_MAX);
  if (!skills.length) return [{ name: 'General Development', level: 2 }];
  return skills;
}

function inferComplexity(slice) {
  const descLen = String(slice.description || '').length;
  const acLen = String(slice.ac || '').length;
  if (descLen > 180 || acLen > 120) return 'high';
  if (descLen > 60 || acLen > 40) return 'medium';
  return 'low';
}

function inferConfidence(slice) {
  let score = 0.45;
  if (slice.description) score += 0.2;
  if (slice.ac) score += 0.2;
  if (slice.actor) score += 0.1;
  return Math.min(0.95, Math.round(score * 100) / 100);
}

/** Heuristic seed: one capability per Requirement FR (fallback / partial). */
function buildHeuristicCapabilityItems(frSlices = []) {
  const items = [];
  for (let i = 0; i < frSlices.length; i += 1) {
    const slice = frSlices[i];
    const name = slice.title || slice.id;
    items.push({
      capabilityId: `CAP-H-${slugPart(slice.module) || 'm'}-${slugPart(name) || i + 1}`,
      name,
      module: slice.module || 'General',
      ...(slice.feature ? { feature: slice.feature } : {}),
      sourceFrIds: [slice.id],
      requiredSkills: inferSkillsFromSlice(slice),
      complexity: inferComplexity(slice),
      confidence: inferConfidence(slice),
    });
  }
  return dedupeCapabilityItems(items);
}

function buildCapabilityChunks(frSlices, chunkSize = CAP_CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < frSlices.length; i += chunkSize) {
    chunks.push(frSlices.slice(i, i + chunkSize));
  }
  return chunks.slice(0, CAP_MAX_CHUNKS);
}

function buildCapabilityPrompt({ context, frChunk, chunkIndex, chunkTotal }) {
  return [
    'You are a software BA. Extract implementation capabilities from requirements.',
    FR_LANGUAGE_CUE,
    'Return ONLY valid JSON: {"items":[{...}]} — no markdown, no prose.',
    'Each item fields: capabilityId (string), name, module, feature (optional),',
    'sourceFrIds (array of FR ids from input only — never invent ids),',
    'requiredSkills ([{name, level?}]), complexity (low|medium|high),',
    'confidence (0-1 number or low|med|high).',
    'Prefer grouping related FRs into one capability when same module+feature.',
    `Chunk ${chunkIndex + 1}/${chunkTotal}.`,
    `Context: ${JSON.stringify(context)}`,
    `Requirements: ${JSON.stringify(frChunk)}`,
  ].join('\n');
}

function canStartChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

/**
 * Run capability analysis: LLM chunks + heuristic fill for timeout/partial/skip.
 */
async function runCapabilityAnalysis(pack, opts = {}) {
  const wallMs = opts.wallMs ?? resolveJobWallMs('capabilityAnalysis');
  const started = Date.now();
  const frSlices =
    opts.frSlices ||
    buildRequirementFrSlicesForAnalysis(pack, opts.hierarchy);
  const packFrIds = expandFrIdSetWithSlices(
    buildFrIdSet(pack?.functionalRequirements || []),
    frSlices
  );
  const context = buildProjectContextSlice(pack);
  const model = ollamaModel();

  if (!frSlices.length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items: [],
      meta: { source: 'empty', llmCalls: 0, partial: false },
    };
  }

  const heuristic = buildHeuristicCapabilityItems(frSlices);
  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (!llmEnabled) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      items: heuristic,
      meta: { source: 'heuristic', llmCalls: 0, partial: false },
    };
  }

  const chunks = buildCapabilityChunks(frSlices, opts.chunkSize || CAP_CHUNK_SIZE);
  const collected = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  const chunkTimeout = opts.chunkTimeoutMs ?? Math.min(analysisChunkTimeoutMs(), wallMs);

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = Date.now() - started;
    if (!canStartChunk(elapsed, wallMs, chunkTimeout)) {
      partial = true;
      lastError = 'wall_budget';
      break;
    }
    const prompt = buildCapabilityPrompt({
      context,
      frChunk: chunks[i],
      chunkIndex: i,
      chunkTotal: chunks.length,
    });
    const result = await generateJson({
      prompt,
      temperature: 0.1,
      timeoutMs: chunkTimeout,
      numPredict: CAP_NUM_PREDICT,
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
      if (result.error === 'ollama_timeout' || result.error === 'ollama_json_parse') {
        continue;
      }
      continue;
    }
    try {
      const items = validateAndNormalizeCapabilityPayload(result.data, packFrIds);
      collected.push(...items);
    } catch (err) {
      partial = true;
      lastError = err.code || 'CAPABILITY_INVALID';
      // reject non-JSON chunk — keep going / fall back
    }
  }

  let items = dedupeCapabilityItems(collected);
  if (!items.length) {
    items = heuristic;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial) {
    // Merge heuristic for FRs not covered
    const covered = new Set(items.flatMap((it) => it.sourceFrIds));
    const missingSlices = frSlices.filter((s) => !covered.has(s.id));
    if (missingSlices.length) {
      items = dedupeCapabilityItems([
        ...items,
        ...buildHeuristicCapabilityItems(missingSlices),
      ]);
    }
  }

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
    },
  };
}

function applyCapabilityToContainer(container, capabilityResult) {
  const next = { ...container, analyses: { ...container.analyses } };
  next.analyses.capability = {
    status: capabilityResult.status || 'ready',
    model: capabilityResult.model || null,
    generatedAt: capabilityResult.generatedAt || new Date().toISOString(),
    items: capabilityResult.items || [],
    entities: [],
    edges: [],
    meta: capabilityResult.meta || {},
  };
  return next;
}

module.exports = {
  COMPLEXITY,
  normalizeComplexity,
  normalizeConfidence,
  normalizeRequiredSkills,
  normalizeCapabilityItem,
  dedupeCapabilityItems,
  dedupeKey,
  validateAndNormalizeCapabilityPayload,
  buildHeuristicCapabilityItems,
  buildCapabilityChunks,
  canStartChunk,
  runCapabilityAnalysis,
  applyCapabilityToContainer,
  extractItemsArray,
};

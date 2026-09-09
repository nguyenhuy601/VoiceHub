/**
 * Job hierarchyDecomposition — Module→Feature / Feature→Requirement proposals.
 */

const {
  generateJson,
  ollamaModel,
  isAiPlanningLlmEnabled,
  analysisChunkTimeoutMs,
} = require('./ollamaClient');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');
const { normProse } = require('../requirement/requirementTemplateTextNorm');
const { buildModuleSlices, buildFeatureSlices } = require('./aiAnalysisFrSlice');
const { emptyHierarchySection, ensureAiAnalysisContainer } = require('./aiAnalysisContainer');

const AGILE_MAP = Object.freeze({
  Module: 'Epic',
  Feature: 'Feature',
  Requirement: 'Requirement',
});

const NAME_MAX = 160;
const DESC_MAX = 400;
const MAX_PROPOSALS_PER_PARENT = 3;
const HIERARCHY_PARENT_CHUNK = 8;
const HIERARCHY_NUM_PREDICT = 512;

function isHierarchyDecompositionEnabled() {
  const flag = String(process.env.AI_ANALYSIS_HIERARCHY_V1 ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(flag)) return false;
  return true;
}

function splitProseParts(raw) {
  const text = normProse(raw);
  if (!text) return [];
  return text
    .split(/[.;\n|/]+/)
    .map((p) => normProse(p))
    .filter((p) => p.length >= 3)
    .slice(0, MAX_PROPOSALS_PER_PARENT);
}

/**
 * Deterministic 1–3 candidate names from title + description (+ optional main flow).
 */
function deriveProposalNames(title, description, extra = '') {
  const base = normProse(title) || 'Item';
  const parts = [
    ...splitProseParts(description),
    ...splitProseParts(extra),
  ].filter((p) => p.toLowerCase() !== base.toLowerCase());

  const names = [];
  const pushUnique = (name) => {
    const n = normProse(name).slice(0, NAME_MAX);
    if (!n) return;
    if (names.some((x) => x.toLowerCase() === n.toLowerCase())) return;
    if (names.length >= MAX_PROPOSALS_PER_PARENT) return;
    names.push(n);
  };

  pushUnique(`${base} — Core`);
  for (const part of parts) {
    pushUnique(part.length > NAME_MAX ? `${part.slice(0, NAME_MAX - 1)}…` : part);
  }
  if (names.length < 2) {
    pushUnique(`${base} — Details`);
  }
  if (names.length < 3 && (description || extra)) {
    pushUnique(`${base} — Extensions`);
  }
  return names.slice(0, MAX_PROPOSALS_PER_PARENT);
}

function normalizeProposalStatus(raw) {
  const t = String(raw || 'accepted').trim().toLowerCase();
  if (t === 'rejected' || t === 'pending' || t === 'accepted') return t;
  return 'accepted';
}

function normalizeFeatureProposal(raw, fallbackParentId) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normProse(raw.name || raw.title || '').slice(0, NAME_MAX);
  if (!name) return null;
  const parentExternalId = String(raw.parentExternalId || fallbackParentId || '').trim();
  if (!parentExternalId) return null;
  const proposalId =
    String(raw.proposalId || '').trim() || `PROP-F-${parentExternalId}-x`;
  return {
    proposalId,
    parentExternalId,
    level: 'Feature',
    name,
    description: normProse(raw.description || '').slice(0, DESC_MAX) || undefined,
    moduleLabel: normProse(raw.moduleLabel || '').slice(0, NAME_MAX) || undefined,
    status: normalizeProposalStatus(raw.status),
    source: raw.source === 'llm' ? 'llm' : 'heuristic',
  };
}

function normalizeRequirementProposal(raw, fallbackParentId) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normProse(raw.name || raw.title || '').slice(0, NAME_MAX);
  if (!name) return null;
  const parentExternalId = String(raw.parentExternalId || fallbackParentId || '').trim();
  if (!parentExternalId) return null;
  const proposalId =
    String(raw.proposalId || '').trim() || `PROP-R-${parentExternalId}-x`;
  return {
    proposalId,
    parentExternalId,
    level: 'Requirement',
    name,
    description: normProse(raw.description || '').slice(0, DESC_MAX) || undefined,
    moduleLabel: normProse(raw.moduleLabel || '').slice(0, NAME_MAX) || undefined,
    featureLabel: normProse(raw.featureLabel || '').slice(0, NAME_MAX) || undefined,
    status: normalizeProposalStatus(raw.status),
    source: raw.source === 'llm' ? 'llm' : 'heuristic',
  };
}

/**
 * Modules with zero Feature children → propose 1–3 Features.
 */
function buildHeuristicFeatureProposals(moduleSlices = []) {
  const out = [];
  for (const mod of moduleSlices || []) {
    if (!mod?.id) continue;
    if ((mod.childFeatureIds || []).length > 0) continue;
    const names = deriveProposalNames(mod.title, mod.description);
    names.forEach((name, index) => {
      out.push({
        proposalId: `PROP-F-${mod.id}-${index + 1}`,
        parentExternalId: mod.id,
        level: 'Feature',
        name,
        description: mod.description || undefined,
        moduleLabel: mod.title || undefined,
        status: 'accepted',
        source: 'heuristic',
      });
    });
  }
  return out;
}

/**
 * Features with zero Requirement children → propose 1–3 Requirements.
 */
function buildHeuristicRequirementProposals(featureSlices = []) {
  const out = [];
  for (const feat of featureSlices || []) {
    if (!feat?.id) continue;
    if ((feat.childRequirementIds || []).length > 0) continue;
    const names = deriveProposalNames(feat.title, feat.description, feat.mainFlow);
    names.forEach((name, index) => {
      out.push({
        proposalId: `PROP-R-${feat.id}-${index + 1}`,
        parentExternalId: feat.id,
        level: 'Requirement',
        name,
        description: feat.description || feat.mainFlow || undefined,
        moduleLabel: feat.moduleTitle || undefined,
        featureLabel: feat.title || undefined,
        status: 'accepted',
        source: 'heuristic',
      });
    });
  }
  return out;
}

function mergeProposalLists(primary = [], secondary = [], normalizeFn) {
  const seen = new Set();
  const out = [];
  for (const raw of [...primary, ...secondary]) {
    const item = normalizeFn(raw);
    if (!item) continue;
    const key = `${item.level}::${item.parentExternalId}::${item.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/** Slim Module parent for LLM prompt (no child arrays). */
function toSlimModuleParent(mod) {
  if (!mod?.id) return null;
  const slim = {
    id: String(mod.id),
    title: normProse(mod.title || mod.id).slice(0, NAME_MAX) || String(mod.id),
  };
  const description = normProse(mod.description || '').slice(0, DESC_MAX);
  if (description) slim.description = description;
  return slim;
}

/** Slim Feature parent for LLM prompt (no child arrays). */
function toSlimFeatureParent(feat) {
  if (!feat?.id) return null;
  const slim = {
    id: String(feat.id),
    title: normProse(feat.title || feat.id).slice(0, NAME_MAX) || String(feat.id),
  };
  const description = normProse(feat.description || '').slice(0, DESC_MAX);
  if (description) slim.description = description;
  const mainFlow = normProse(feat.mainFlow || '').slice(0, DESC_MAX);
  if (mainFlow) slim.mainFlow = mainFlow;
  return slim;
}

/**
 * Batch parents needing children into chunks of total size ≤ chunkSize.
 * @returns {{ modules: object[], features: object[] }[]}
 */
function buildHierarchyParentChunks(
  needsFeatures = [],
  needsRequirements = [],
  chunkSize = HIERARCHY_PARENT_CHUNK
) {
  const size = Math.max(1, Math.round(Number(chunkSize)) || HIERARCHY_PARENT_CHUNK);
  const work = [];
  for (const mod of needsFeatures || []) {
    const slim = toSlimModuleParent(mod);
    if (slim) work.push({ kind: 'module', slim });
  }
  for (const feat of needsRequirements || []) {
    const slim = toSlimFeatureParent(feat);
    if (slim) work.push({ kind: 'feature', slim });
  }

  const chunks = [];
  for (let i = 0; i < work.length; i += size) {
    const slice = work.slice(i, i + size);
    const modules = [];
    const features = [];
    for (const item of slice) {
      if (item.kind === 'module') modules.push(item.slim);
      else features.push(item.slim);
    }
    chunks.push({ modules, features });
  }
  return chunks;
}

function canStartChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

function buildHierarchyChunkPrompt(chunk, chunkIndex, chunkTotal) {
  return [
    'You are a software BA. Decompose Module(=Epic) into Features and Features into Requirements.',
    'Return ONLY valid JSON:',
    '{"proposedFeatures":[{proposalId,parentExternalId,name,description?,moduleLabel?}],',
    '"proposedRequirements":[{proposalId,parentExternalId,name,description?,moduleLabel?,featureLabel?}]}',
    'Only propose for parents listed with empty children. Do not invent parent ids.',
    `Chunk ${chunkIndex + 1}/${chunkTotal}.`,
    `Modules needing Features: ${JSON.stringify(chunk.modules || [])}`,
    `Features needing Requirements: ${JSON.stringify(chunk.features || [])}`,
  ].join('\n');
}

function parseHierarchyLlmPayload(data) {
  const proposedFeatures = Array.isArray(data?.proposedFeatures)
    ? data.proposedFeatures
        .map((p) => normalizeFeatureProposal({ ...p, source: 'llm' }))
        .filter(Boolean)
    : [];
  const proposedRequirements = Array.isArray(data?.proposedRequirements)
    ? data.proposedRequirements
        .map((p) => normalizeRequirementProposal({ ...p, source: 'llm' }))
        .filter(Boolean)
    : [];
  return { proposedFeatures, proposedRequirements };
}

/**
 * Chunked LLM hierarchy proposals with wall-clock budget.
 */
async function tryLlmHierarchyProposals({
  moduleSlices,
  featureSlices,
  wallMs,
  chunkTimeoutMs,
  chunkSize,
  generateJsonFn,
}) {
  const needsFeatures = (moduleSlices || []).filter((m) => !(m.childFeatureIds || []).length);
  const needsRequirements = (featureSlices || []).filter(
    (f) => !(f.childRequirementIds || []).length
  );
  if (!needsFeatures.length && !needsRequirements.length) {
    return {
      proposedFeatures: [],
      proposedRequirements: [],
      llmCalls: 0,
      partial: false,
      error: null,
    };
  }

  const chunks = buildHierarchyParentChunks(needsFeatures, needsRequirements, chunkSize);
  const callGenerate = generateJsonFn || generateJson;
  const started = Date.now();
  const collectedFeatures = [];
  const collectedRequirements = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = Date.now() - started;
    if (!canStartChunk(elapsed, wallMs, chunkTimeoutMs)) {
      partial = true;
      lastError = 'wall_budget';
      break;
    }

    const prompt = buildHierarchyChunkPrompt(chunks[i], i, chunks.length);
    const result = await callGenerate({
      prompt,
      temperature: 0.1,
      timeoutMs: chunkTimeoutMs,
      numPredict: HIERARCHY_NUM_PREDICT,
    });
    llmCalls += 1;

    if (result?.skipped) {
      partial = true;
      lastError = result.error || 'llm_skipped';
      break;
    }
    if (!result?.ok || result.data == null) {
      partial = true;
      lastError = result?.error || 'ollama_error';
      if (result?.error === 'ollama_timeout' || result?.error === 'ollama_json_parse') {
        continue;
      }
      continue;
    }

    const parsed = parseHierarchyLlmPayload(result.data);
    collectedFeatures.push(...parsed.proposedFeatures);
    collectedRequirements.push(...parsed.proposedRequirements);
  }

  return {
    proposedFeatures: collectedFeatures,
    proposedRequirements: collectedRequirements,
    llmCalls,
    partial,
    error: lastError,
  };
}

/**
 * @returns {{ proposedFeatures, proposedRequirements, model, generatedAt, meta }}
 */
async function runHierarchyDecomposition(pack, opts = {}) {
  const generatedAt = new Date().toISOString();
  const started = Date.now();
  const moduleSlices = buildModuleSlices(pack);
  const featureSlices = buildFeatureSlices(pack);
  const wallMs = opts.wallMs ?? resolveJobWallMs('hierarchyDecomposition');
  const chunkTimeout =
    opts.chunkTimeoutMs != null
      ? Number(opts.chunkTimeoutMs)
      : Math.min(analysisChunkTimeoutMs(), wallMs);
  const chunkSize = opts.chunkSize ?? HIERARCHY_PARENT_CHUNK;

  if (!isHierarchyDecompositionEnabled()) {
    return {
      proposedFeatures: [],
      proposedRequirements: [],
      model: null,
      generatedAt,
      meta: {
        disabled: true,
        agileMap: { ...AGILE_MAP },
        source: 'disabled',
        llmCalls: 0,
        elapsedMs: Date.now() - started,
      },
    };
  }

  const heuristicFeatures = buildHeuristicFeatureProposals(moduleSlices);
  const heuristicRequirements = buildHeuristicRequirementProposals(featureSlices);

  let proposedFeatures = heuristicFeatures;
  let proposedRequirements = heuristicRequirements;
  let llmCalls = 0;
  let source = 'heuristic';
  let model = null;
  let partial = false;
  let error = null;

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  if (llmEnabled) {
    try {
      const llm = await tryLlmHierarchyProposals({
        moduleSlices,
        featureSlices,
        wallMs,
        chunkTimeoutMs: chunkTimeout,
        chunkSize,
        generateJsonFn: opts.generateJson,
      });
      llmCalls = llm.llmCalls;
      partial = Boolean(llm.partial);
      error = llm.error || null;
      proposedFeatures = mergeProposalLists(
        llm.proposedFeatures,
        heuristicFeatures,
        (p) => normalizeFeatureProposal(p)
      );
      proposedRequirements = mergeProposalLists(
        llm.proposedRequirements,
        heuristicRequirements,
        (p) => normalizeRequirementProposal(p)
      );
      if (llmCalls > 0 && (llm.proposedFeatures.length || llm.proposedRequirements.length)) {
        source = partial ? 'llm_partial' : 'llm+heuristic';
        model = ollamaModel();
      } else if (llmCalls > 0) {
        source = partial ? 'llm_partial' : 'heuristic';
        model = ollamaModel();
        if (!error) error = 'fallback_heuristic';
        partial = true;
      }
    } catch (err) {
      partial = true;
      error = err?.message || String(err);
      source = 'heuristic';
      proposedFeatures = heuristicFeatures;
      proposedRequirements = heuristicRequirements;
    }
  }

  return {
    proposedFeatures,
    proposedRequirements,
    model,
    generatedAt,
    meta: {
      agileMap: { ...AGILE_MAP },
      source,
      llmCalls,
      partial,
      error: error || undefined,
      moduleCount: moduleSlices.length,
      featureCount: featureSlices.length,
      elapsedMs: Date.now() - started,
    },
  };
}

function applyHierarchyToContainer(container, result) {
  const next = ensureAiAnalysisContainer(container);
  const base = emptyHierarchySection();
  next.analyses.hierarchy = {
    ...base,
    status: 'ready',
    model: result?.model ?? null,
    generatedAt: result?.generatedAt || new Date().toISOString(),
    proposedFeatures: Array.isArray(result?.proposedFeatures)
      ? result.proposedFeatures
      : [],
    proposedRequirements: Array.isArray(result?.proposedRequirements)
      ? result.proposedRequirements
      : [],
    meta: {
      ...base.meta,
      ...(result?.meta && typeof result.meta === 'object' ? result.meta : {}),
      agileMap: {
        ...AGILE_MAP,
        ...(result?.meta?.agileMap && typeof result.meta.agileMap === 'object'
          ? result.meta.agileMap
          : {}),
      },
    },
  };
  return next;
}

module.exports = {
  AGILE_MAP,
  HIERARCHY_PARENT_CHUNK,
  isHierarchyDecompositionEnabled,
  buildHeuristicFeatureProposals,
  buildHeuristicRequirementProposals,
  deriveProposalNames,
  toSlimModuleParent,
  toSlimFeatureParent,
  buildHierarchyParentChunks,
  canStartChunk,
  runHierarchyDecomposition,
  applyHierarchyToContainer,
};

/**
 * Job2 WBS/Task Generation (W5) — planning.wbs + planning.tasks from capabilities.
 * Dedup by capability/area; unique ids; no orphan parent; optional orderHint sort.
 */

const {
  generateJson,
  analysisChunkTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { normId, normKey, normProse } = require('../requirement/requirementTemplateTextNorm');
const { buildFrIdSet, truncate } = require('./aiAnalysisFrSlice');
const { FR_LANGUAGE_CUE, inferAreaLocale } = require('./aiAnalysisLocaleText');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');
const { buildWallBudgetSkipMeta } = require('./aiAnalysisWallBudgetMeta');

const MAX_TASKS_PER_CAPABILITY = 6;
const NAME_MAX = 160;
const WBS_WALL_MS = resolveJobWallMs('wbsGeneration');
const WBS_NUM_PREDICT = 768;
const WBS_CHUNK_CAPS = 6;

const AREA_ROLE_HINT = Object.freeze({
  frontend: 'frontend_developer',
  backend: 'backend_developer',
  database: 'backend_developer',
  api: 'backend_developer',
  auth: 'backend_developer',
  infrastructure: 'devops_engineer',
  external: 'backend_developer',
  security: 'backend_developer',
  deployment: 'devops_engineer',
  qa: 'qa_engineer',
  design: 'ui_ux_designer',
  management: 'project_manager',
  analysis: 'business_analyst',
});

function slugPart(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function inferAreaFromCapability(cap) {
  const blob = `${cap.name || ''} ${cap.module || ''} ${(cap.requiredSkills || [])
    .map((s) => (typeof s === 'string' ? s : s.name || ''))
    .join(' ')}`;
  return inferAreaLocale(blob);
}

function normalizeTaskId(raw, index = 0) {
  let id = normId(raw) || normProse(raw).slice(0, 64);
  if (!id) id = `TASK-${index + 1}`;
  if (!/^TASK-/i.test(id) && !/^WBS-/i.test(id)) id = `TASK-${id}`;
  return id.slice(0, 64);
}

/**
 * Normalize one task; parentId checked later against id set.
 */
function normalizeWbsTask(raw, packFrIds, knownCapIds, { index = 0 } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const name = normProse(raw.name || raw.title || '').slice(0, NAME_MAX);
  if (!name) return null;

  const id = normalizeTaskId(raw.id || raw.taskId, index);
  let parentId = raw.parentId != null && raw.parentId !== ''
    ? normalizeTaskId(raw.parentId, 0)
    : null;
  if (parentId === id) parentId = null;

  let sourceCapabilityIds = Array.isArray(raw.sourceCapabilityIds)
    ? raw.sourceCapabilityIds.map((x) => normId(x) || normProse(x)).filter(Boolean)
    : [];
  if (knownCapIds) {
    sourceCapabilityIds = sourceCapabilityIds.filter((x) => knownCapIds.has(x));
  }
  sourceCapabilityIds = [...new Set(sourceCapabilityIds)];

  let sourceFrIds = Array.isArray(raw.sourceFrIds)
    ? raw.sourceFrIds.map((x) => normId(x)).filter(Boolean)
    : [];
  if (packFrIds) sourceFrIds = sourceFrIds.filter((x) => packFrIds.has(x));
  sourceFrIds = [...new Set(sourceFrIds)];

  const area = truncate(raw.area || raw.layer || '', 40) || undefined;
  let suggestedRoleKey = String(raw.suggestedRoleKey || raw.roleKey || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  if (!suggestedRoleKey && area && AREA_ROLE_HINT[area]) {
    suggestedRoleKey = AREA_ROLE_HINT[area];
  }
  suggestedRoleKey = suggestedRoleKey || undefined;

  const sortOrder = Number.isFinite(Number(raw.sortOrder))
    ? Math.max(0, Math.round(Number(raw.sortOrder)))
    : index;

  return {
    id,
    ...(parentId ? { parentId } : {}),
    name,
    ...(area ? { area } : {}),
    sourceCapabilityIds,
    sourceFrIds,
    ...(suggestedRoleKey ? { suggestedRoleKey } : {}),
    sortOrder,
  };
}

function dedupeTaskKey(task) {
  const caps = (task.sourceCapabilityIds || []).slice().sort().join(',');
  const area = normKey(task.area || '');
  return `${caps}::${area}::${normKey(task.name)}`;
}

function dedupeWbsTasks(tasks = []) {
  const map = new Map();
  for (const t of tasks) {
    if (!t) continue;
    const key = dedupeTaskKey(t);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        ...t,
        sourceCapabilityIds: [...(t.sourceCapabilityIds || [])],
        sourceFrIds: [...(t.sourceFrIds || [])],
      });
      continue;
    }
    existing.sourceCapabilityIds = [
      ...new Set([
        ...(existing.sourceCapabilityIds || []),
        ...(t.sourceCapabilityIds || []),
      ]),
    ];
    existing.sourceFrIds = [
      ...new Set([...(existing.sourceFrIds || []), ...(t.sourceFrIds || [])]),
    ];
    if (!existing.suggestedRoleKey && t.suggestedRoleKey) {
      existing.suggestedRoleKey = t.suggestedRoleKey;
    }
    if (t.sortOrder < existing.sortOrder) existing.sortOrder = t.sortOrder;
  }
  return [...map.values()];
}

/**
 * Drop orphan parents (clear parentId) and ensure unique ids.
 */
function repairWbsTaskTree(tasks = []) {
  const byId = new Map();
  const unique = [];
  for (const t of tasks) {
    let id = t.id;
    let n = 1;
    while (byId.has(id)) {
      n += 1;
      id = `${t.id}-${n}`;
    }
    const next = { ...t, id };
    byId.set(id, next);
    unique.push(next);
  }
  const idSet = new Set(unique.map((t) => t.id));
  for (const t of unique) {
    if (t.parentId && !idSet.has(t.parentId)) {
      delete t.parentId;
    }
  }
  return unique;
}

/**
 * Sort by orderHint (capability ids) then sortOrder; rewrite sortOrder sequentially.
 */
function applyDependencyOrderHint(tasks = [], orderHint = []) {
  const hintIndex = new Map();
  (orderHint || []).forEach((id, i) => {
    const key = normId(id) || String(id);
    if (key && !hintIndex.has(key)) hintIndex.set(key, i);
  });

  const capRank = (task) => {
    let best = Number.MAX_SAFE_INTEGER;
    for (const c of task.sourceCapabilityIds || []) {
      if (hintIndex.has(c)) best = Math.min(best, hintIndex.get(c));
    }
    return best;
  };

  const sorted = [...tasks].sort((a, b) => {
    const ra = capRank(a);
    const rb = capRank(b);
    if (ra !== rb) return ra - rb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return String(a.name).localeCompare(String(b.name));
  });
  return sorted.map((t, i) => ({ ...t, sortOrder: i }));
}

function enforceMaxTasksPerCapability(tasks = [], maxPerCap = MAX_TASKS_PER_CAPABILITY) {
  const counts = new Map();
  const out = [];
  for (const t of tasks) {
    const caps = t.sourceCapabilityIds?.length
      ? t.sourceCapabilityIds
      : ['_none'];
    let allow = true;
    for (const c of caps) {
      const n = counts.get(c) || 0;
      if (n >= maxPerCap) {
        allow = false;
        break;
      }
    }
    if (!allow) continue;
    for (const c of caps) counts.set(c, (counts.get(c) || 0) + 1);
    out.push(t);
  }
  return out;
}

function extractTasksArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.tasks)) return data.tasks;
    if (Array.isArray(data.items)) return data.items;
  }
  return null;
}

function validateAndNormalizeWbsPayload(data, packFrIds, knownCapIds) {
  if (data == null || typeof data !== 'object') {
    const err = new Error('WBS response must be JSON object or array');
    err.code = 'WBS_NON_JSON';
    throw err;
  }
  const arr = extractTasksArray(data);
  if (!arr) {
    const err = new Error('WBS JSON must include tasks[]');
    err.code = 'WBS_INVALID_SHAPE';
    throw err;
  }
  const normalized = [];
  for (let i = 0; i < arr.length; i += 1) {
    const t = normalizeWbsTask(arr[i], packFrIds, knownCapIds, { index: i });
    if (t) normalized.push(t);
  }
  return repairWbsTaskTree(dedupeWbsTasks(normalized));
}

function buildHeuristicWbsTasks(capabilities = [], { maxPerCap = MAX_TASKS_PER_CAPABILITY } = {}) {
  const tasks = [];
  let idx = 0;
  for (const cap of capabilities) {
    if (!cap?.capabilityId) continue;
    const area = inferAreaFromCapability(cap);
    const role = AREA_ROLE_HINT[area] || 'backend_developer';
    const frIds = Array.isArray(cap.sourceFrIds) ? cap.sourceFrIds : [];
    const base = slugPart(cap.capabilityId) || slugPart(cap.name) || 'cap';

    const parentId = `TASK-${base}-root`;
    tasks.push({
      id: parentId,
      name: `${cap.name || cap.capabilityId} — Delivery`,
      area,
      sourceCapabilityIds: [cap.capabilityId],
      sourceFrIds: [...frIds],
      suggestedRoleKey: 'project_manager',
      sortOrder: idx,
    });
    idx += 1;

    const children = [
      { suffix: 'impl', name: `Implement ${cap.name || 'capability'}`, role },
      { suffix: 'test', name: `Test ${cap.name || 'capability'}`, role: 'qa_engineer', area: 'qa' },
    ].slice(0, Math.max(0, maxPerCap - 1));

    for (const ch of children) {
      tasks.push({
        id: `TASK-${base}-${ch.suffix}`,
        parentId,
        name: ch.name,
        area: ch.area || area,
        sourceCapabilityIds: [cap.capabilityId],
        sourceFrIds: [...frIds],
        suggestedRoleKey: ch.role,
        sortOrder: idx,
      });
      idx += 1;
    }
  }
  return repairWbsTaskTree(dedupeWbsTasks(tasks));
}

function buildWbsChunks(capabilities, chunkSize = WBS_CHUNK_CAPS) {
  const chunks = [];
  for (let i = 0; i < capabilities.length; i += chunkSize) {
    chunks.push(capabilities.slice(i, i + chunkSize));
  }
  return chunks.slice(0, 8);
}

function buildWbsPrompt({ capsChunk, chunkIndex, chunkTotal, orderHint }) {
  return [
    'You are a tech lead. Generate WBS tasks grouped by capability (not per FR silo).',
    FR_LANGUAGE_CUE,
    'Return ONLY JSON: {"tasks":[{id,parentId?,name,area,sourceCapabilityIds,sourceFrIds,suggestedRoleKey,sortOrder}]}',
    `Max ${MAX_TASKS_PER_CAPABILITY} tasks per capability. Unique ids (TASK-...). parentId must reference another task id.`,
    'suggestedRoleKey snake_case: frontend_developer, backend_developer, qa_engineer, devops_engineer, project_manager, business_analyst, ui_ux_designer.',
    `Chunk ${chunkIndex + 1}/${chunkTotal}.`,
    `OrderHint (optional): ${JSON.stringify((orderHint || []).slice(0, 40))}`,
    `Capabilities: ${JSON.stringify(capsChunk)}`,
  ].join('\n');
}

function canStartChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

function buildCapabilityCompact(container) {
  return (container?.analyses?.capability?.items || []).slice(0, 80).map((c) => ({
    capabilityId: c.capabilityId,
    name: truncate(c.name || '', 80),
    module: truncate(c.module || '', 64),
    sourceFrIds: Array.isArray(c.sourceFrIds) ? c.sourceFrIds.slice(0, 8) : [],
    complexity: c.complexity,
    requiredSkills: Array.isArray(c.requiredSkills)
      ? c.requiredSkills.slice(0, 6).map((s) => (typeof s === 'string' ? s : s.name))
      : [],
  }));
}

/**
 * Run WBS generation after capability is on container (or from result items).
 */
async function runWbsTaskGeneration(pack, container, opts = {}) {
  const wallMs = opts.wallMs ?? resolveJobWallMs('wbsGeneration');
  const started = Date.now();
  const packFrIds = buildFrIdSet(pack?.functionalRequirements || []);
  const capabilities =
    opts.capabilities ||
    buildCapabilityCompact(container);
  const knownCapIds = new Set(capabilities.map((c) => c.capabilityId).filter(Boolean));
  const orderHint =
    opts.orderHint ||
    container?.analyses?.dependency?.orderHint ||
    capabilities.map((c) => c.capabilityId);
  const model = ollamaModel();
  const maxPerCap = opts.maxTasksPerCapability || MAX_TASKS_PER_CAPABILITY;

  if (!capabilities.length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      tasks: [],
      wbs: { roots: [], taskCount: 0 },
      meta: { source: 'empty', llmCalls: 0, partial: false },
    };
  }

  const heuristic = buildHeuristicWbsTasks(capabilities, { maxPerCap });
  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;

  if (!llmEnabled) {
    let tasks = applyDependencyOrderHint(heuristic, orderHint);
    tasks = enforceMaxTasksPerCapability(tasks, maxPerCap);
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      tasks,
      wbs: {
        roots: tasks.filter((t) => !t.parentId).map((t) => t.id),
        taskCount: tasks.length,
      },
      meta: { source: 'heuristic', llmCalls: 0, partial: false },
    };
  }

  const chunks = buildWbsChunks(capabilities, opts.chunkSize || WBS_CHUNK_CAPS);
  const collected = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let wallBudgetSkipMeta = null;
  const chunkTimeout = opts.chunkTimeoutMs ?? Math.min(analysisChunkTimeoutMs(), wallMs);
  const countCapInputs = (c) => (Array.isArray(c) ? c.length : 0);

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = Date.now() - started;
    if (!canStartChunk(elapsed, wallMs, chunkTimeout)) {
      partial = true;
      lastError = 'wall_budget';
      wallBudgetSkipMeta = buildWallBudgetSkipMeta({
        chunks,
        fromIndex: i,
        countInputs: countCapInputs,
        kind: 'capability',
      });
      break;
    }
    const prompt = buildWbsPrompt({
      capsChunk: chunks[i],
      chunkIndex: i,
      chunkTotal: chunks.length,
      orderHint,
    });
    const result = await generateJson({
      prompt,
      temperature: 0.1,
      timeoutMs: chunkTimeout,
      numPredict: WBS_NUM_PREDICT,
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
      const tasks = validateAndNormalizeWbsPayload(result.data, packFrIds, knownCapIds);
      collected.push(...tasks);
    } catch (err) {
      partial = true;
      lastError = err.code || 'WBS_INVALID';
    }
  }

  let tasks = repairWbsTaskTree(dedupeWbsTasks(collected));
  if (!tasks.length) {
    tasks = heuristic;
    partial = true;
    if (!lastError) lastError = 'fallback_heuristic';
  } else if (partial) {
    tasks = repairWbsTaskTree(dedupeWbsTasks([...tasks, ...heuristic]));
  }

  tasks = enforceMaxTasksPerCapability(tasks, maxPerCap);
  tasks = applyDependencyOrderHint(tasks, orderHint);

  return {
    status: 'ready',
    model: llmCalls > 0 ? model : null,
    generatedAt: new Date().toISOString(),
    tasks,
    wbs: {
      roots: tasks.filter((t) => !t.parentId).map((t) => t.id),
      taskCount: tasks.length,
    },
    meta: {
      source: collected.length ? (partial ? 'llm_partial' : 'llm') : 'heuristic',
      llmCalls,
      partial,
      error: lastError || undefined,
      elapsedMs: Date.now() - started,
      ...(wallBudgetSkipMeta || {}),
    },
  };
}

function applyWbsToContainer(container, wbsResult) {
  const next = {
    ...container,
    planning: { ...container.planning },
  };
  next.planning.tasks = wbsResult.tasks || [];
  next.planning.wbs = {
    ...(wbsResult.wbs || {
      roots: [],
      taskCount: (wbsResult.tasks || []).length,
    }),
    meta: wbsResult.meta && typeof wbsResult.meta === 'object' ? wbsResult.meta : {},
  };
  return next;
}

module.exports = {
  MAX_TASKS_PER_CAPABILITY,
  AREA_ROLE_HINT,
  normalizeWbsTask,
  dedupeWbsTasks,
  repairWbsTaskTree,
  applyDependencyOrderHint,
  enforceMaxTasksPerCapability,
  validateAndNormalizeWbsPayload,
  buildHeuristicWbsTasks,
  buildWbsChunks,
  canStartChunk,
  runWbsTaskGeneration,
  applyWbsToContainer,
  extractTasksArray,
  inferAreaFromCapability,
};

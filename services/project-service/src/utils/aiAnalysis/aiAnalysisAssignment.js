/**
 * Job6 Employee Assignment (W7b) — assign task→user from Job5 shortlist only.
 * Greedy-first + optional LLM; reject userId∉shortlist.
 */

const {
  generateJson,
  analysisChunkTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { truncate } = require('./aiAnalysisFrSlice');
const { resolveJobWallMs } = require('./aiAnalysisJobBudgets');
const { buildWallBudgetSkipMeta } = require('./aiAnalysisWallBudgetMeta');

const ASSIGN_WALL_MS = resolveJobWallMs('scheduleCapacity');
const ASSIGN_NUM_PREDICT = 512;
const ASSIGN_LLM_MIN_MS = 20000;
const CHUNK_SIZE = 12;
const RATIONALE_MAX = 160;

function shortlistMapFromRecommendations(recommendations = []) {
  const map = new Map();
  for (const rec of recommendations) {
    const taskId = String(rec.taskId || '').trim();
    if (!taskId) continue;
    const allowed = new Map();
    for (const s of rec.shortlist || []) {
      const userId = String(s.userId || '').trim();
      if (!userId) continue;
      allowed.set(userId, {
        score: Number(s.score) || 0,
        displayName: String(s.displayName || '').trim(),
      });
    }
    map.set(taskId, allowed);
  }
  return map;
}

function recommendationsHaveShortlistUsers(recommendations = []) {
  return recommendations.some((rec) =>
    (rec.shortlist || []).some((s) => String(s?.userId || '').trim())
  );
}

function normalizeAssignment(raw, shortlistByTask, { capacityUsed = new Map() } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const taskId = String(raw.taskId || raw.id || '').trim();
  const userId = String(raw.userId || raw.pickedUserId || '').trim();
  if (!taskId || !userId) return null;
  const allowed = shortlistByTask.get(taskId);
  if (!allowed || !allowed.has(userId)) return null;

  const meta = allowed.get(userId) || {};
  const rationale = truncate(raw.rationale || raw.reason || '', RATIONALE_MAX) || undefined;
  const load = capacityUsed.get(userId) || 0;
  capacityUsed.set(userId, load + 1);

  const displayName = String(raw.displayName || meta.displayName || '').trim();

  return {
    taskId,
    userId,
    ...(displayName ? { displayName } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

/**
 * Greedy: pick highest score on shortlist with capacity preference.
 */
function greedyAssignFromShortlists(recommendations = [], { maxTasksPerUser = 8 } = {}) {
  const capacityUsed = new Map();
  const assignments = [];
  const sortedRecs = [...recommendations].sort((a, b) =>
    String(a.taskId).localeCompare(String(b.taskId))
  );

  for (const rec of sortedRecs) {
    const taskId = String(rec.taskId || '').trim();
    if (!taskId) continue;
    const candidates = [...(rec.shortlist || [])]
      .map((s) => ({
        userId: String(s.userId || '').trim(),
        score: Number(s.score) || 0,
        displayName: String(s.displayName || '').trim(),
      }))
      .filter((s) => s.userId)
      .sort((a, b) => {
        const ca = capacityUsed.get(a.userId) || 0;
        const cb = capacityUsed.get(b.userId) || 0;
        if (ca !== cb) return ca - cb;
        return b.score - a.score;
      });

    const pick = candidates.find(
      (c) => (capacityUsed.get(c.userId) || 0) < maxTasksPerUser
    );
    if (!pick) continue;
    capacityUsed.set(pick.userId, (capacityUsed.get(pick.userId) || 0) + 1);
    assignments.push({
      taskId,
      userId: pick.userId,
      ...(pick.displayName ? { displayName: pick.displayName } : {}),
      rationale: `greedy score=${pick.score}`,
    });
  }
  return assignments;
}

function validateAssignmentsAgainstShortlist(assignments, recommendations) {
  const shortlistByTask = shortlistMapFromRecommendations(recommendations);
  const valid = [];
  const rejected = [];
  for (const a of assignments || []) {
    const next = normalizeAssignment(a, shortlistByTask);
    if (next) valid.push(next);
    else rejected.push({ taskId: a?.taskId, userId: a?.userId, reason: 'not_in_shortlist' });
  }
  return { valid, rejected };
}

function extractAssignmentsArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.assignments)) return data.assignments;
    if (Array.isArray(data.items)) return data.items;
  }
  return null;
}

function buildAssignPrompt({ chunk }) {
  return [
    'You assign employees to tasks. Only pick userId from each task shortlist.',
    'Return ONLY JSON: {"assignments":[{"taskId","userId","rationale?"}]}',
    'Never invent userId. Prefer higher score; spread load when possible.',
    `Tasks: ${JSON.stringify(chunk)}`,
  ].join('\n');
}

/** True when a full chunkTimeout still fits in the wall (inclusive). */
function canStartAssignChunk(elapsedMs, wallMs, chunkTimeoutMs) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

function mergeAssignmentsPreferLlm(llmRows, greedyRows) {
  const byTask = new Map();
  for (const a of llmRows || []) {
    if (a?.taskId && !byTask.has(a.taskId)) byTask.set(a.taskId, a);
  }
  for (const g of greedyRows || []) {
    if (g?.taskId && !byTask.has(g.taskId)) byTask.set(g.taskId, g);
  }
  return [...byTask.values()];
}

function resolveMetaError(lastError, assignments) {
  if (!lastError) return undefined;
  // Soft LLM/wall failures should not hide a usable greedy result.
  if (
    Array.isArray(assignments) &&
    assignments.length > 0 &&
    (lastError === 'wall_budget' ||
      lastError === 'ollama_timeout' ||
      lastError === 'ollama_error' ||
      lastError === 'fallback_greedy')
  ) {
    return undefined;
  }
  return lastError;
}

async function runEmployeeAssignment(pack, container, opts = {}) {
  const recommendations = container?.resource?.recommendations || [];
  if (!recommendations.length) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      assignments: [],
      meta: {
        source: 'empty',
        llmCalls: 0,
        partial: false,
        error: 'empty_recommendations',
        recommendationCount: 0,
      },
    };
  }

  const greedy = greedyAssignFromShortlists(recommendations, {
    maxTasksPerUser: opts.maxTasksPerUser || 8,
  });
  const hasShortlistUsers = recommendationsHaveShortlistUsers(recommendations);

  if (!hasShortlistUsers) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      assignments: [],
      meta: {
        source: 'empty',
        llmCalls: 0,
        partial: false,
        error: 'empty_shortlist',
        recommendationCount: recommendations.length,
      },
    };
  }

  const llmEnabled = isAiPlanningLlmEnabled() && opts.forceHeuristic !== true;
  const model = ollamaModel();

  if (!llmEnabled) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      assignments: greedy,
      meta: { source: 'greedy', llmCalls: 0, partial: false },
    };
  }

  const started = opts.nowMs != null ? Number(opts.nowMs) : Date.now();
  const wallMs = opts.wallMs ?? resolveJobWallMs('scheduleCapacity');
  const nowFn = typeof opts.nowFn === 'function' ? opts.nowFn : Date.now;

  const remainingAtStart = wallMs - (nowFn() - started);
  if (remainingAtStart < ASSIGN_LLM_MIN_MS) {
    return {
      status: 'ready',
      model: null,
      generatedAt: new Date().toISOString(),
      assignments: greedy,
      meta: {
        source: 'greedy',
        llmCalls: 0,
        partial: false,
        elapsedMs: nowFn() - started,
        wallBudgetSkippedInputCount: recommendations.length,
        wallBudgetSkippedInputKind: 'recommendation',
      },
    };
  }

  const chunks = [];
  for (let i = 0; i < recommendations.length; i += CHUNK_SIZE) {
    chunks.push(
      recommendations.slice(i, i + CHUNK_SIZE).map((r) => ({
        taskId: r.taskId,
        shortlist: (r.shortlist || []).slice(0, 5),
      }))
    );
  }

  const collected = [];
  let llmCalls = 0;
  let partial = false;
  let lastError = null;
  let wallBudgetSkipMeta = null;
  const shortlistByTask = shortlistMapFromRecommendations(recommendations);
  const countRecommendationInputs = (c) => (Array.isArray(c) ? c.length : 0);

  for (let i = 0; i < chunks.length; i += 1) {
    const elapsed = nowFn() - started;
    const remaining = wallMs - elapsed;
    if (remaining < ASSIGN_LLM_MIN_MS) {
      partial = true;
      wallBudgetSkipMeta = buildWallBudgetSkipMeta({
        chunks,
        fromIndex: i,
        countInputs: countRecommendationInputs,
        kind: 'recommendation',
      });
      if (!greedy.length && !collected.length) lastError = 'wall_budget';
      break;
    }
    const chunkTimeout = Math.min(
      opts.chunkTimeoutMs != null ? Number(opts.chunkTimeoutMs) : analysisChunkTimeoutMs(),
      remaining
    );
    if (!canStartAssignChunk(elapsed, wallMs, chunkTimeout)) {
      partial = true;
      wallBudgetSkipMeta = buildWallBudgetSkipMeta({
        chunks,
        fromIndex: i,
        countInputs: countRecommendationInputs,
        kind: 'recommendation',
      });
      if (!greedy.length && !collected.length) lastError = 'wall_budget';
      break;
    }

    const result = await generateJson({
      prompt: buildAssignPrompt({ chunk: chunks[i] }),
      temperature: 0.1,
      timeoutMs: chunkTimeout,
      numPredict: ASSIGN_NUM_PREDICT,
    });
    llmCalls += 1;
    if (!result.ok || result.data == null) {
      partial = true;
      lastError = result.error || 'ollama_error';
      continue;
    }
    const arr = extractAssignmentsArray(result.data);
    if (!arr) {
      partial = true;
      lastError = 'ASSIGN_INVALID_SHAPE';
      continue;
    }
    for (const row of arr) {
      const a = normalizeAssignment(row, shortlistByTask);
      if (a) collected.push(a);
    }
  }

  const assignments = mergeAssignmentsPreferLlm(collected, greedy);
  const error = resolveMetaError(lastError, assignments);

  return {
    status: 'ready',
    model: llmCalls > 0 && collected.length ? model : null,
    generatedAt: new Date().toISOString(),
    assignments,
    meta: {
      source: collected.length ? (partial || greedy.length ? 'llm_partial' : 'llm') : 'greedy',
      llmCalls,
      partial: Boolean(partial || (collected.length && greedy.length)),
      error,
      elapsedMs: nowFn() - started,
      ...(wallBudgetSkipMeta || {}),
    },
  };
}

function applyAssignmentToContainer(container, assignResult) {
  const next = {
    ...container,
    resource: { ...container.resource },
  };
  next.resource.assignments = assignResult.assignments || [];
  next.resource.assignmentsMeta =
    assignResult.meta && typeof assignResult.meta === 'object' ? assignResult.meta : {};
  return next;
}

module.exports = {
  ASSIGN_WALL_MS,
  ASSIGN_LLM_MIN_MS,
  shortlistMapFromRecommendations,
  recommendationsHaveShortlistUsers,
  normalizeAssignment,
  greedyAssignFromShortlists,
  validateAssignmentsAgainstShortlist,
  canStartAssignChunk,
  resolveMetaError,
  runEmployeeAssignment,
  applyAssignmentToContainer,
  extractAssignmentsArray,
};

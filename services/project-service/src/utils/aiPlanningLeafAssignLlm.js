/**
 * LLM leaf assign — shortlist in, rationale out. Token-efficient + wall budget.
 */

const {
  generateJson,
  assignTimeoutMs,
  ollamaModel,
  isAiPlanningLlmEnabled,
} = require('./ollamaClient');
const { assertAllowlistedLlmCandidate } = require('./employeeSuggestContext');

const ASSIGN_WALL_MS = 240000;
const ASSIGN_MAX_CHUNKS = 3;
const ASSIGN_LEAVES_PER_CHUNK = 8;
const ASSIGN_NUM_PREDICT = 256;
const MAX_CHUNK_BYTES = 8 * 1024;
const RATIONALE_MAX = 200;

function normalizeId(raw) {
  return String(raw || '').trim();
}

function truncateRationale(raw) {
  const s = String(raw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (s.length <= RATIONALE_MAX) return s;
  return s.slice(0, RATIONALE_MAX);
}

function canStartChunk(elapsedMs, wallMs = ASSIGN_WALL_MS, chunkTimeoutMs = assignTimeoutMs()) {
  return elapsedMs + chunkTimeoutMs <= wallMs;
}

/**
 * Group leaf rows by roleKey; split into chunks of ASSIGN_LEAVES_PER_CHUNK.
 * Caps total chunks at maxChunks (caller may further stop by wall).
 */
function buildAssignChunks(leafAssignments = [], { maxLeaves = ASSIGN_LEAVES_PER_CHUNK } = {}) {
  const byRole = new Map();
  for (const leaf of leafAssignments || []) {
    const roleKey = normalizeId(leaf.roleKey).toLowerCase();
    const externalId = normalizeId(leaf.externalId);
    if (!roleKey || !externalId) continue;
    if (!byRole.has(roleKey)) byRole.set(roleKey, []);
    byRole.get(roleKey).push(leaf);
  }

  const chunks = [];
  for (const [roleKey, leaves] of [...byRole.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (let i = 0; i < leaves.length; i += maxLeaves) {
      chunks.push({
        roleKey,
        leaves: leaves.slice(i, i + maxLeaves),
      });
    }
  }
  return chunks;
}

function compactCandidate(suggestion) {
  const row = {
    userId: normalizeId(suggestion.userId),
    displayName: String(suggestion.displayName || '').slice(0, 64),
    jobTitle: String(suggestion.jobTitle || '').slice(0, 64),
    seniorityBand: String(suggestion.seniorityBand || '').slice(0, 32),
    matchedSkills: (suggestion.matchedSkills || []).slice(0, 8).map(String),
    availableHours:
      suggestion.availableHours != null && Number.isFinite(Number(suggestion.availableHours))
        ? Number(suggestion.availableHours)
        : null,
    priorRoleMatch: Boolean(suggestion.priorRoleMatch),
    priorRoleProjects: Number(suggestion.priorRoleProjects) || 0,
    perfConfidence: suggestion.perfConfidence || null,
    accuracyPct:
      suggestion.accuracyPct != null && Number.isFinite(Number(suggestion.accuracyPct))
        ? Number(suggestion.accuracyPct)
        : null,
    reworkRate:
      suggestion.reworkRate != null && Number.isFinite(Number(suggestion.reworkRate))
        ? Number(suggestion.reworkRate)
        : null,
    relevantTaskHours: Number(suggestion.relevantTaskHours) || 0,
    score: Number(suggestion.score) || 0,
  };
  assertAllowlistedLlmCandidate(row);
  return row;
}

function compactLeaf(leaf) {
  return {
    externalId: normalizeId(leaf.externalId),
    name: String(leaf.name || '').slice(0, 80),
    skills: (leaf.requiredSkills || leaf.skills || []).slice(0, 8).map(String),
    estimateHours:
      leaf.estimateHours != null && Number.isFinite(Number(leaf.estimateHours))
        ? Number(leaf.estimateHours)
        : null,
  };
}

function candidateUniverseForChunk(chunk) {
  const byId = new Map();
  for (const leaf of chunk.leaves || []) {
    for (const s of leaf.suggestions || []) {
      const uid = normalizeId(s.userId);
      if (!uid || byId.has(uid)) continue;
      byId.set(uid, compactCandidate(s));
    }
  }
  return [...byId.values()];
}

function shrinkChunkPayload(payload, maxBytes = MAX_CHUNK_BYTES) {
  let current = payload;
  let bytes = Buffer.byteLength(JSON.stringify(current), 'utf8');
  if (bytes <= maxBytes) return current;

  const strip = (keys) => ({
    ...current,
    candidates: (current.candidates || []).map((c) => {
      const next = { ...c };
      for (const k of keys) delete next[k];
      return next;
    }),
  });

  current = strip(['relevantTaskHours', 'accuracyPct', 'reworkRate']);
  bytes = Buffer.byteLength(JSON.stringify(current), 'utf8');
  if (bytes <= maxBytes) return current;

  current = strip(['priorRoleProjects', 'perfConfidence', 'seniorityBand']);
  bytes = Buffer.byteLength(JSON.stringify(current), 'utf8');
  if (bytes <= maxBytes) return current;

  return {
    ...current,
    candidates: (current.candidates || []).slice(0, 5),
    leaves: (current.leaves || []).slice(0, 5),
  };
}

function buildChunkPrompt(chunk) {
  const payload = shrinkChunkPayload({
    roleKey: chunk.roleKey,
    candidates: candidateUniverseForChunk(chunk),
    leaves: (chunk.leaves || []).map((leaf) =>
      compactLeaf({
        externalId: leaf.externalId,
        name: leaf.name,
        estimateHours: leaf.estimateHours,
        requiredSkills: leaf.requiredSkills || [],
      })
    ),
  });

  return [
    'You assign one shortlisted employee per leaf for the given project role.',
    'Only use userIds from candidates. One assignment per leaf externalId.',
    'Return ONLY JSON: {"assignments":[{"externalId":"...","userId":"...","rationale":"one short sentence"}]}',
    'Input:',
    JSON.stringify(payload),
  ].join('\n');
}

function normalizeAssignPayload(data, chunk) {
  const leafIds = new Set((chunk.leaves || []).map((l) => normalizeId(l.externalId)).filter(Boolean));
  const allowedByLeaf = new Map();
  for (const leaf of chunk.leaves || []) {
    const id = normalizeId(leaf.externalId);
    allowedByLeaf.set(
      id,
      new Set((leaf.suggestions || []).map((s) => normalizeId(s.userId)).filter(Boolean))
    );
  }

  const raw = Array.isArray(data?.assignments) ? data.assignments : [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const externalId = normalizeId(row?.externalId);
    const userId = normalizeId(row?.userId);
    if (!externalId || !userId || seen.has(externalId)) continue;
    if (!leafIds.has(externalId)) continue;
    const allowed = allowedByLeaf.get(externalId);
    if (!allowed || !allowed.has(userId)) continue;
    seen.add(externalId);
    out.push({
      externalId,
      userId,
      rationale: truncateRationale(row?.rationale),
    });
  }
  return out;
}

function applyAssignmentsToLeaves(leafAssignments, assignments, { assignSkipReason } = {}) {
  const byId = new Map((assignments || []).map((a) => [a.externalId, a]));
  return (leafAssignments || []).map((leaf) => {
    const id = normalizeId(leaf.externalId);
    const hit = byId.get(id);
    if (!hit) {
      if (assignSkipReason && !leaf.assignSkipReason) {
        return { ...leaf, assignSkipReason };
      }
      return leaf;
    }
    const suggestions = [...(leaf.suggestions || [])];
    const idx = suggestions.findIndex((s) => normalizeId(s.userId) === hit.userId);
    if (idx < 0) return leaf;
    const chosen = {
      ...suggestions[idx],
      rationale: hit.rationale || suggestions[idx].rationale,
    };
    suggestions.splice(idx, 1);
    suggestions.unshift(chosen);
    return {
      ...leaf,
      suggestions,
      suggestedUserId: hit.userId,
      suggestedScore: chosen.score ?? leaf.suggestedScore,
      assignSkipReason: undefined,
    };
  });
}

/**
 * Re-run greedy capacity using LLM order (suggestedUserId preference then score).
 */
function reapplyGreedyCapacity(leafAssignments = []) {
  const assignedHoursByUser = new Map();
  return (leafAssignments || []).map((leaf) => {
    const hours = Number(leaf.estimateHours) > 0 ? Number(leaf.estimateHours) : 0;
    const ordered = [...(leaf.suggestions || [])];
    let suggestedUserId = null;
    let suggestedScore = null;
    for (const cand of ordered) {
      const uid = normalizeId(cand.userId);
      if (!uid) continue;
      const avail = cand.availableHours;
      const used = assignedHoursByUser.get(uid) || 0;
      if (hours > 0 && avail != null && used + hours > avail) continue;
      if (hours > 0) assignedHoursByUser.set(uid, used + hours);
      suggestedUserId = uid;
      suggestedScore = cand.score ?? null;
      break;
    }
    return {
      ...leaf,
      suggestedUserId,
      suggestedScore,
    };
  });
}

/**
 * Attach requiredSkills onto leaf rows for prompt (from pack leaves map optional).
 */
function withLeafSkills(leafAssignments, skillsByExternalId = new Map()) {
  return (leafAssignments || []).map((leaf) => ({
    ...leaf,
    requiredSkills: skillsByExternalId.get(normalizeId(leaf.externalId)) || leaf.requiredSkills || [],
  }));
}

async function runLeafAssignLlm({
  leafAssignments,
  skillsByExternalId,
  generateJsonFn = generateJson,
  nowMs = () => Date.now(),
  wallMs = ASSIGN_WALL_MS,
  maxChunks = ASSIGN_MAX_CHUNKS,
  chunkTimeoutMs,
} = {}) {
  if (!isAiPlanningLlmEnabled()) {
    return {
      status: 'skipped',
      leafAssignments,
      model: ollamaModel(),
      error: 'disabled',
      chunksAttempted: 0,
      chunksMerged: 0,
    };
  }

  const started = nowMs();
  const timeoutPerChunk = chunkTimeoutMs != null ? chunkTimeoutMs : assignTimeoutMs();
  const prepared = withLeafSkills(leafAssignments, skillsByExternalId);
  const allChunks = buildAssignChunks(prepared);
  const limited = allChunks.slice(0, Math.max(0, maxChunks));
  const skippedByCap = allChunks.slice(limited.length);

  let working = prepared.map((l) => ({ ...l }));
  let mergedAssignments = [];
  let chunksMerged = 0;
  let lastError = null;
  let model = ollamaModel();

  for (let i = 0; i < limited.length; i += 1) {
    const elapsed = nowMs() - started;
    if (!canStartChunk(elapsed, wallMs, timeoutPerChunk)) {
      const remainIds = new Set();
      for (let j = i; j < limited.length; j += 1) {
        for (const leaf of limited[j].leaves) remainIds.add(normalizeId(leaf.externalId));
      }
      for (const leaf of skippedByCap.flatMap((c) => c.leaves)) {
        remainIds.add(normalizeId(leaf.externalId));
      }
      working = working.map((leaf) =>
        remainIds.has(normalizeId(leaf.externalId)) && !mergedAssignments.some((a) => a.externalId === normalizeId(leaf.externalId))
          ? { ...leaf, assignSkipReason: 'budget_exhausted' }
          : leaf
      );
      lastError = lastError || 'wall_budget';
      break;
    }

    const chunk = limited[i];
    const prompt = buildChunkPrompt(chunk);
    const result = await generateJsonFn({
      prompt,
      temperature: 0.1,
      timeoutMs: timeoutPerChunk,
      numPredict: ASSIGN_NUM_PREDICT,
    });
    model = result.model || model;

    if (result.skipped) {
      return {
        status: 'skipped',
        leafAssignments: prepared,
        model,
        error: result.error || 'llm_skipped',
        chunksAttempted: i + 1,
        chunksMerged: 0,
      };
    }

    if (!result.ok) {
      lastError = result.error || 'ollama_error';
      if (chunksMerged === 0) {
        return {
          status: 'failed',
          leafAssignments: prepared,
          model,
          error: lastError,
          chunksAttempted: i + 1,
          chunksMerged: 0,
        };
      }
      working = working.map((leaf) => {
        const inRest = limited
          .slice(i)
          .some((c) => c.leaves.some((l) => normalizeId(l.externalId) === normalizeId(leaf.externalId)));
        if (inRest && !mergedAssignments.some((a) => a.externalId === normalizeId(leaf.externalId))) {
          return { ...leaf, assignSkipReason: 'budget_exhausted' };
        }
        return leaf;
      });
      break;
    }

    const normalized = normalizeAssignPayload(result.data, chunk);
    mergedAssignments = mergedAssignments.concat(normalized);
    working = applyAssignmentsToLeaves(working, normalized);
    chunksMerged += 1;
  }

  if (skippedByCap.length) {
    const skipIds = new Set(
      skippedByCap.flatMap((c) => c.leaves.map((l) => normalizeId(l.externalId)))
    );
    working = working.map((leaf) =>
      skipIds.has(normalizeId(leaf.externalId)) &&
      !mergedAssignments.some((a) => a.externalId === normalizeId(leaf.externalId))
        ? { ...leaf, assignSkipReason: 'budget_exhausted' }
        : leaf
    );
  }

  working = reapplyGreedyCapacity(working);

  let status = 'ready';
  if (chunksMerged === 0 && lastError) status = 'failed';
  else if (chunksMerged > 0 && (lastError || skippedByCap.length || limited.length < allChunks.length)) {
    status = 'partial';
  } else if (chunksMerged === 0 && allChunks.length === 0) {
    status = 'ready';
  }

  return {
    status,
    leafAssignments: working,
    model,
    error: status === 'ready' ? null : lastError,
    chunksAttempted: Math.min(limited.length, chunksMerged + (lastError ? 1 : 0)),
    chunksMerged,
  };
}

module.exports = {
  ASSIGN_WALL_MS,
  ASSIGN_MAX_CHUNKS,
  ASSIGN_LEAVES_PER_CHUNK,
  ASSIGN_NUM_PREDICT,
  MAX_CHUNK_BYTES,
  canStartChunk,
  buildAssignChunks,
  compactCandidate,
  normalizeAssignPayload,
  applyAssignmentsToLeaves,
  reapplyGreedyCapacity,
  buildChunkPrompt,
  runLeafAssignLlm,
  withLeafSkills,
};

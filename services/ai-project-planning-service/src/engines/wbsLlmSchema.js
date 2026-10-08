/**
 * Wave L — validate/normalize LLM WBS JSON → { tasks, wbs }.
 * HARD-03: sourceFrIds must ⊆ pack FR whitelist; drop unknown.
 */

const {
  WBS_LLM_LEVELS,
  WBS_LLM_MAX_NODES,
  WBS_LLM_MAX_LEAVES_PER_FR,
  resolveWbsLlmMaxLeavesPerFr,
} = require('../contracts/howWbsLlmContract');

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

const COMPLEXITY_HOURS = Object.freeze({
  low: 8,
  medium: 16,
  high: 32,
});

function listFrIds(pack = {}) {
  const rows = Array.isArray(pack.functionalRequirements)
    ? pack.functionalRequirements
    : Array.isArray(pack.frList)
      ? pack.frList
      : Array.isArray(pack.requirements)
        ? pack.requirements
        : [];
  return new Set(
    rows
      .map((r, i) => String(r?.externalId || r?.id || r?._id || `FR-${i + 1}`).trim())
      .filter(Boolean)
  );
}

function listCapabilityIds(capabilities = []) {
  return new Set(
    (capabilities || [])
      .map((c) => String(c?.capabilityId || c?.id || '').trim())
      .filter(Boolean)
  );
}

function clampEffort(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(80, Math.round(n)));
}

function normalizeLevel(raw) {
  const l = String(raw || '')
    .trim()
    .toLowerCase();
  if (WBS_LLM_LEVELS.includes(l)) return l;
  if (l === 'requirement' || l === 'leaf') return 'task';
  if (l === 'module') return 'epic';
  return null;
}

function detectCycle(nodesById) {
  const visiting = new Set();
  const visited = new Set();
  function dfs(id) {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const parentId = nodesById.get(id)?.parentId;
    if (parentId && nodesById.has(parentId)) {
      if (dfs(parentId)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of nodesById.keys()) {
    if (dfs(id)) return true;
  }
  return false;
}

/**
 * @param {object} raw — LLM JSON ({ nodes } | { tasks })
 * @param {{ pack?: object, capabilities?: object[] }} ctx
 * @returns {{ ok: boolean, tasks?: object[], wbs?: object, errors?: string[] }}
 */
function normalizeWbsLlmOutput(raw, ctx = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['not_object'] };
  }
  const list = Array.isArray(raw.nodes)
    ? raw.nodes
    : Array.isArray(raw.tasks)
      ? raw.tasks
      : null;
  if (!list) {
    return { ok: false, errors: ['missing_nodes'] };
  }
  if (list.length === 0) {
    return { ok: false, errors: ['empty_nodes'] };
  }
  if (list.length > WBS_LLM_MAX_NODES) {
    return { ok: false, errors: [`max_nodes_${WBS_LLM_MAX_NODES}`] };
  }

  const frWhitelist = listFrIds(ctx.pack || {});
  const capWhitelist = listCapabilityIds(ctx.capabilities || []);
  // HARD-03: empty FR pack must not accept invented ids
  if (frWhitelist.size === 0) {
    return { ok: false, errors: ['empty_fr_whitelist'] };
  }
  const nodesById = new Map();
  const leavesPerFr = new Map();
  const maxLeavesPerFr = resolveWbsLlmMaxLeavesPerFr(ctx.env || process.env);

  for (let i = 0; i < list.length; i += 1) {
    const row = list[i];
    if (!row || typeof row !== 'object') {
      errors.push(`row_${i}_invalid`);
      continue;
    }
    const id = String(row.id || row.taskId || '').trim();
    if (!id) {
      errors.push(`row_${i}_missing_id`);
      continue;
    }
    if (nodesById.has(id)) {
      errors.push(`dup_id_${id}`);
      continue;
    }
    const level = normalizeLevel(row.level || row.type);
    if (!level) {
      errors.push(`bad_level_${id}`);
      continue;
    }
    let parentId =
      row.parentId == null || row.parentId === ''
        ? null
        : String(row.parentId).trim();
    if (parentId === id) parentId = null;

    const sourceFrIds = [
      ...new Set(
        (Array.isArray(row.sourceFrIds) ? row.sourceFrIds : [])
          .map((x) => String(x || '').trim())
          .filter((fid) => {
            if (!fid) return false;
            return frWhitelist.has(fid);
          })
      ),
    ];
    const droppedFr = (Array.isArray(row.sourceFrIds) ? row.sourceFrIds : []).filter(
      (fid) => {
        const s = String(fid || '').trim();
        return s && !frWhitelist.has(s);
      }
    );
    if (droppedFr.length) {
      errors.push(`dropped_fr_${id}`);
    }

    const sourceCapabilityIds = [
      ...new Set(
        (Array.isArray(row.sourceCapabilityIds) ? row.sourceCapabilityIds : [])
          .map((x) => String(x || '').trim())
          .filter((cid) => {
            if (!cid) return false;
            if (capWhitelist.size === 0) return true;
            return capWhitelist.has(cid);
          })
      ),
    ];

    const area = String(row.area || 'backend')
      .trim()
      .toLowerCase() || 'backend';
    const suggestedRoleKey =
      String(row.suggestedRoleKey || '').trim() ||
      AREA_ROLE_HINT[area] ||
      'backend_developer';
    let effortSeedHours = clampEffort(row.effortSeedHours ?? row.effortHours);
    if (effortSeedHours == null && level === 'task') {
      effortSeedHours = COMPLEXITY_HOURS.medium;
    }

    const sourceAcIndexes = Array.isArray(row.sourceAcIndexes)
      ? row.sourceAcIndexes
          .map((n) => Number(n))
          .filter((n) => Number.isFinite(n) && n >= 0)
      : [];

    if (level === 'task' && sourceFrIds[0]) {
      const fr = sourceFrIds[0];
      const count = (leavesPerFr.get(fr) || 0) + 1;
      leavesPerFr.set(fr, count);
      if (count > maxLeavesPerFr) {
        errors.push(`max_leaves_${fr}`);
        continue;
      }
    }

    nodesById.set(id, {
      id,
      name: String(row.name || id).trim() || id,
      parentId,
      level,
      area,
      featureId: row.featureId != null ? String(row.featureId) : null,
      sourceCapabilityIds,
      sourceFrIds,
      sourceUcIds: Array.isArray(row.sourceUcIds)
        ? row.sourceUcIds.map(String).filter(Boolean)
        : [],
      sourceAcIndexes,
      suggestedRoleKey,
      effortSeedHours: effortSeedHours != null ? effortSeedHours : level === 'task' ? 16 : 0,
      sortOrder: Number.isFinite(Number(row.sortOrder)) ? Number(row.sortOrder) : i,
    });
  }

  if (!nodesById.size) {
    return { ok: false, errors: errors.length ? errors : ['no_valid_nodes'] };
  }

  // Drop parentId pointing to missing nodes
  for (const node of nodesById.values()) {
    if (node.parentId && !nodesById.has(node.parentId)) {
      node.parentId = null;
    }
  }

  if (detectCycle(nodesById)) {
    return { ok: false, errors: [...errors, 'cycle'] };
  }

  // Processing: if model truncated before task leaves, synthesize 1 task per FR under best parent
  let hasTask = [...nodesById.values()].some((n) => n.level === 'task');
  if (!hasTask) {
    const parents = [...nodesById.values()].filter((n) =>
      ['story', 'feature', 'epic'].includes(n.level)
    );
    const prefer =
      parents.find((n) => n.level === 'story') ||
      parents.find((n) => n.level === 'feature') ||
      parents.find((n) => n.level === 'epic') ||
      null;
    let synth = 0;
    for (const frId of frWhitelist) {
      if (synth >= maxLeavesPerFr * frWhitelist.size) break;
      const parentId = prefer?.id || null;
      const id = `TASK-SYNTH-${frId}`;
      if (nodesById.has(id)) continue;
      nodesById.set(id, {
        id,
        name: `Implement ${frId}`,
        parentId,
        level: 'task',
        area: 'backend',
        featureId: prefer?.featureId || null,
        sourceCapabilityIds: [],
        sourceFrIds: [frId],
        sourceUcIds: [],
        sourceAcIndexes: [],
        suggestedRoleKey: 'backend_developer',
        effortSeedHours: COMPLEXITY_HOURS.medium,
        sortOrder: 9000 + synth,
      });
      synth += 1;
    }
    if (synth > 0) {
      errors.push(`synth_tasks_${synth}`);
    }
    hasTask = [...nodesById.values()].some((n) => n.level === 'task');
  }

  // Latency mode: num_predict may truncate mid-chunk — fill missing FR leaves
  const coveredFr = new Set();
  for (const n of nodesById.values()) {
    if (n.level !== 'task') continue;
    for (const frId of n.sourceFrIds || []) coveredFr.add(String(frId));
  }
  let fillMissing = 0;
  for (const frId of frWhitelist) {
    if (coveredFr.has(frId)) continue;
    const id = `TASK-FILL-${frId}`;
    if (nodesById.has(id)) continue;
    nodesById.set(id, {
      id,
      name: `Implement ${frId}`,
      parentId: null,
      level: 'task',
      area: 'backend',
      featureId: null,
      sourceCapabilityIds: [],
      sourceFrIds: [frId],
      sourceUcIds: [],
      sourceAcIndexes: [],
      suggestedRoleKey: 'backend_developer',
      effortSeedHours: COMPLEXITY_HOURS.medium,
      sortOrder: 9100 + fillMissing,
    });
    coveredFr.add(frId);
    fillMissing += 1;
  }
  if (fillMissing > 0) {
    errors.push(`fill_missing_fr_${fillMissing}`);
  }

  hasTask = [...nodesById.values()].some((n) => n.level === 'task');
  if (!hasTask) {
    return { ok: false, errors: [...errors, 'no_task_leaves'] };
  }

  const allNodes = [...nodesById.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)
  );
  const roots = allNodes.filter((n) => !n.parentId).map((n) => n.id);
  if (!roots.length) {
    return { ok: false, errors: [...errors, 'no_roots'] };
  }

  // Leaf tasks for planning.tasks (executable)
  const tasks = allNodes
    .filter((n) => n.level === 'task')
    .map((n, idx) => ({
      id: n.id,
      name: n.name,
      parentId: n.parentId,
      level: n.level,
      area: n.area,
      featureId: n.featureId,
      sourceCapabilityIds: n.sourceCapabilityIds,
      sourceFrIds: n.sourceFrIds,
      sourceUcIds: n.sourceUcIds,
      sourceAcIndexes: n.sourceAcIndexes,
      suggestedRoleKey: n.suggestedRoleKey,
      effortSeedHours: n.effortSeedHours,
      effortHours: n.effortSeedHours,
      sortOrder: idx,
    }));

  // Also keep container nodes on wbs.nodes for tree UI
  const wbsNodes = allNodes.map((n) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    level: n.level,
    area: n.area,
    featureId: n.featureId,
  }));

  // Include non-leaf as tasks? Hierarchy engine includes containers in tasks array.
  // Match hierarchy: all nodes that are not pure display — include epic/feature/story with effort 0
  const planningTasks = allNodes.map((n, idx) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    level: n.level,
    area: n.area,
    featureId: n.featureId,
    sourceCapabilityIds: n.sourceCapabilityIds,
    sourceFrIds: n.sourceFrIds,
    sourceUcIds: n.sourceUcIds,
    sourceAcIndexes: n.sourceAcIndexes,
    suggestedRoleKey: n.suggestedRoleKey,
    effortSeedHours: n.level === 'task' ? n.effortSeedHours : 0,
    ...(n.level === 'task' ? { effortHours: n.effortSeedHours } : {}),
    sortOrder: idx,
  }));

  return {
    ok: true,
    tasks: planningTasks,
    wbs: {
      roots,
      nodes: wbsNodes,
      taskCount: tasks.length,
    },
    warnings: errors,
  };
}

module.exports = {
  normalizeWbsLlmOutput,
  listFrIds,
  listCapabilityIds,
  detectCycle,
  AREA_ROLE_HINT,
};

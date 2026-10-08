/**
 * Deterministic hierarchy wrap after flat LLM leaves.
 * Epic(module) → Feature → Story(FR) → Task — no extra LLM call.
 * HARD-03: only FR fields from pack (module/feature/name).
 * IDs stay compact ASCII (no slug-of-Vietnamese titles).
 */

/** Keep readable ascii tokens; reject diacritic-stripped junk like t-o-th-nh-… */
function sanitizeRefToken(raw, max = 28) {
  const s = String(raw || '').trim();
  const keep = s
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max);
  if (!keep) return '';
  const alnum = (keep.match(/[a-zA-Z0-9]/g) || []).length;
  const hyphens = (keep.match(/-/g) || []).length;
  if (alnum < 2 || hyphens > alnum) return '';
  return keep;
}

function shortHash(raw, prefix = 'x') {
  const s = String(raw || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}${(h >>> 0).toString(36)}`;
}

/** Compact id token: prefer FR/code-like ascii, else short hash (never VN title slug). */
function compactToken(raw, prefix = 'x') {
  return sanitizeRefToken(raw) || shortHash(raw, prefix);
}

/** @deprecated use compactToken — kept for callers/tests */
function slugPart(raw) {
  return compactToken(raw, 'g');
}

function listFrRows(pack = {}) {
  if (Array.isArray(pack.functionalRequirements)) return pack.functionalRequirements;
  if (Array.isArray(pack.frList)) return pack.frList;
  if (Array.isArray(pack.requirements)) return pack.requirements;
  return [];
}

function rowId(row, index = 0) {
  return String(row?.externalId || row?.id || row?._id || `FR-${index + 1}`).trim();
}

function buildFrIndex(pack = {}) {
  const map = new Map();
  listFrRows(pack).forEach((row, i) => {
    const id = rowId(row, i);
    map.set(id, {
      id,
      name: String(row.name || row.title || id).trim() || id,
      module: String(row.module || row.moduleName || 'General').trim() || 'General',
      feature: String(row.feature || row.featureName || row.name || row.title || id).trim() || id,
    });
  });
  return map;
}

/**
 * @param {{
 *   tasks?: object[],
 *   wbs?: { nodes?: object[], roots?: string[], taskCount?: number },
 *   pack?: object,
 * }} input
 * @returns {{ tasks: object[], wbs: object, meta: { wrapped: boolean, epicCount: number, featureCount: number, storyCount: number } }}
 */
function wrapFlatTasksWithFrHierarchy(input = {}) {
  const pack = input.pack || {};
  const frIndex = buildFrIndex(pack);
  const rawNodes = Array.isArray(input.wbs?.nodes)
    ? input.wbs.nodes
    : Array.isArray(input.tasks)
      ? input.tasks
      : [];

  const taskLeaves = rawNodes.filter((n) => String(n?.level || 'task') === 'task');
  // Already hierarchical? (has non-task parents) → pass through
  const hasBranch = rawNodes.some((n) => {
    const lv = String(n?.level || '');
    return lv === 'epic' || lv === 'feature' || lv === 'story';
  });
  if (hasBranch || !taskLeaves.length) {
    const tasks = Array.isArray(input.tasks) ? input.tasks : rawNodes;
    const wbs = input.wbs || {
      roots: rawNodes.filter((n) => !n.parentId).map((n) => n.id),
      nodes: rawNodes,
      taskCount: taskLeaves.length,
    };
    return {
      tasks,
      wbs,
      meta: { wrapped: false, epicCount: 0, featureCount: 0, storyCount: 0 },
    };
  }

  const nodesById = new Map();
  let epicCount = 0;
  let featureCount = 0;
  let storyCount = 0;

  function ensure(id, factory) {
    if (nodesById.has(id)) return nodesById.get(id);
    const node = factory();
    nodesById.set(id, node);
    return node;
  }

  for (const leaf of taskLeaves) {
    const frId = Array.isArray(leaf.sourceFrIds) && leaf.sourceFrIds[0]
      ? String(leaf.sourceFrIds[0])
      : null;
    const fr = frId && frIndex.get(frId) ? frIndex.get(frId) : null;
    const moduleName = fr?.module || 'General';
    const featureName = fr?.feature || fr?.name || leaf.name || 'Feature';
    const frLabel = fr?.name || frId || leaf.name || 'Story';

    // IDs from stable keys — never slug full Vietnamese titles
    const epicId = `EPIC-${compactToken(moduleName, 'm')}`;
    const featureKey = `${moduleName}::${featureName}`;
    const featureId = `FEAT-${compactToken(featureKey, 'f')}`;
    const storyId = frId
      ? `STORY-${compactToken(frId, 's')}`
      : `STORY-${compactToken(leaf.id, 's')}`;

    if (!nodesById.has(epicId)) epicCount += 1;
    ensure(epicId, () => ({
      id: epicId,
      name: moduleName,
      parentId: null,
      level: 'epic',
      area: leaf.area || 'management',
      featureId: null,
    }));

    if (!nodesById.has(featureId)) featureCount += 1;
    ensure(featureId, () => ({
      id: featureId,
      name: featureName,
      parentId: epicId,
      level: 'feature',
      area: leaf.area || 'backend',
      featureId,
    }));

    if (!nodesById.has(storyId)) storyCount += 1;
    ensure(storyId, () => ({
      id: storyId,
      name: frLabel,
      parentId: featureId,
      level: 'story',
      area: leaf.area || 'backend',
      featureId,
      sourceFrIds: frId ? [frId] : [],
    }));

    const taskId = String(leaf.id || leaf.taskId || '').trim();
    if (!taskId) continue;
    nodesById.set(taskId, {
      ...leaf,
      id: taskId,
      parentId: storyId,
      level: 'task',
      featureId,
      sourceFrIds: Array.isArray(leaf.sourceFrIds)
        ? leaf.sourceFrIds.map(String).filter(Boolean)
        : frId
          ? [frId]
          : [],
    });
  }

  const allNodes = [...nodesById.values()];
  const roots = allNodes.filter((n) => n.parentId == null).map((n) => n.id);
  const taskCount = allNodes.filter((n) => n.level === 'task').length;

  // planning.tasks = full tree nodes (match hierarchy engine)
  const tasks = allNodes.map((n, idx) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    level: n.level,
    area: n.area || 'backend',
    featureId: n.featureId || null,
    sourceCapabilityIds: Array.isArray(n.sourceCapabilityIds) ? n.sourceCapabilityIds : [],
    sourceFrIds: Array.isArray(n.sourceFrIds) ? n.sourceFrIds : [],
    sourceUcIds: Array.isArray(n.sourceUcIds) ? n.sourceUcIds : [],
    sourceAcIndexes: Array.isArray(n.sourceAcIndexes) ? n.sourceAcIndexes : [],
    suggestedRoleKey: n.suggestedRoleKey || undefined,
    effortSeedHours: n.effortSeedHours != null ? n.effortSeedHours : n.level === 'task' ? 16 : 0,
    effortHours: n.effortHours != null ? n.effortHours : n.effortSeedHours != null ? n.effortSeedHours : n.level === 'task' ? 16 : 0,
    sortOrder: idx,
  }));

  return {
    tasks,
    wbs: {
      roots,
      nodes: allNodes.map((n) => ({
        id: n.id,
        name: n.name,
        parentId: n.parentId,
        level: n.level,
        area: n.area || null,
        featureId: n.featureId || null,
      })),
      taskCount,
    },
    meta: {
      wrapped: true,
      epicCount,
      featureCount,
      storyCount,
    },
  };
}

module.exports = {
  wrapFlatTasksWithFrHierarchy,
  buildFrIndex,
  slugPart,
  compactToken,
  sanitizeRefToken,
};

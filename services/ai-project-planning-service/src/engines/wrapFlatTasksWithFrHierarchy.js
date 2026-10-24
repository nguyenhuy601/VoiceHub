/**
 * Deterministic hierarchy wrap after flat LLM leaves.
 * ALWAYS rebuild Epic→Feature→Story(FR)→WorkPackage(area)→Task from leaves + pack.
 * LLM container nodes are discarded — their titles are untrusted.
 *
 * Target shape (per FR), aligned with planning WBS example:
 *   Story = FR title
 *   Work Package = area package (API / UI / E2E Verification)
 *   Tasks = deliverables under WP (roles + leaf effort)
 *   Containers: effortHours = rollup(sum children)
 */

const {
  resolveStoryDisplayName,
  resolveWorkPackageDisplayName,
  resolveTaskDisplayName,
  dedupeChildTitlesAgainstParents,
  applyContainerEffortRollup,
  roleKeyForArea,
} = require('./wbsAgileNaming');
const {
  buildSrsMappingContext,
  resolveEpicPlacement,
  resolveFeaturePlacement,
  resolveSoftTrace,
  frRowId,
  listFrRows,
} = require('./wbsSrsMapping');

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

function compactToken(raw, prefix = 'x') {
  return sanitizeRefToken(raw) || shortHash(raw, prefix);
}

function slugPart(raw) {
  return compactToken(raw, 'g');
}

function buildFrIndex(pack = {}) {
  const map = new Map();
  listFrRows(pack).forEach((row, i) => {
    const id = frRowId(row, i);
    map.set(id, {
      id,
      name: String(row.name || row.title || id).trim() || id,
      module: String(row.module || row.moduleName || row.moduleLabel || 'General').trim() || 'General',
      feature: String(row.feature || row.featureName || row.featureLabel || '').trim(),
      row,
    });
  });
  return map;
}

function emptyTrace() {
  return {
    sourceFrIds: [],
    sourceBgIds: [],
    sourceNfrIds: [],
    sourceUcIds: [],
    sourceCapabilityIds: [],
  };
}

function leafEffortHours(leaf) {
  const h =
    leaf.effortHours != null
      ? Number(leaf.effortHours)
      : leaf.effortSeedHours != null
        ? Number(leaf.effortSeedHours)
        : 16;
  if (!Number.isFinite(h) || h <= 0) return 16;
  return Math.max(1, Math.min(80, Math.round(h)));
}

/**
 * @param {{
 *   tasks?: object[],
 *   wbs?: { nodes?: object[], roots?: string[], taskCount?: number },
 *   pack?: object,
 *   capabilities?: object[],
 *   planningHints?: object|null,
 * }} input
 */
function wrapFlatTasksWithFrHierarchy(input = {}) {
  const pack = input.pack || {};
  const capabilities = input.capabilities || [];
  const planningHints = input.planningHints || null;
  const srsCtx = buildSrsMappingContext(pack, capabilities, planningHints);
  const frIndex = buildFrIndex(pack);

  const rawNodes = Array.isArray(input.wbs?.nodes)
    ? input.wbs.nodes
    : Array.isArray(input.tasks)
      ? input.tasks
      : [];

  // Prefer task leaves only — discard LLM epic/feature/story containers
  let taskLeaves = rawNodes.filter((n) => String(n?.level || 'task') === 'task');
  if (!taskLeaves.length && Array.isArray(input.tasks)) {
    taskLeaves = input.tasks.filter((n) => String(n?.level || 'task') === 'task');
  }

  if (!taskLeaves.length) {
    const baseTasks = Array.isArray(input.tasks) ? input.tasks : rawNodes;
    const rolled = applyContainerEffortRollup(dedupeChildTitlesAgainstParents(baseTasks));
    return {
      tasks: rolled,
      wbs: input.wbs || {
        roots: rolled.filter((n) => !n.parentId).map((n) => n.id),
        nodes: rolled,
        taskCount: 0,
      },
      meta: { wrapped: false, epicCount: 0, featureCount: 0, storyCount: 0 },
    };
  }

  const nodesById = new Map();
  let epicCount = 0;
  let featureCount = 0;
  let storyCount = 0;
  let workPackageCount = 0;
  const wpTaskIndex = new Map(); // wpId → next leaf index

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
    const frRow = fr?.row || {};

    // Story = FR value only — never leaf technical title
    const storyName = resolveStoryDisplayName({
      frName: fr?.name,
      frId: frId || '',
      fallback: frId ? '' : 'Unmapped work',
    });

    const epic = resolveEpicPlacement({
      frId: frId || leaf.id,
      frRow,
      pack,
      frToBg: srsCtx.frToBg,
    });
    const feature = resolveFeaturePlacement({
      frId,
      frRow,
      frName: fr?.name || '',
      capabilities,
      pack,
    });
    const soft = frId
      ? resolveSoftTrace({
          frId,
          pack,
          planningHints,
          frToBg: srsCtx.frToBg,
          frToNfr: srsCtx.frToNfr,
          capabilities,
        })
      : emptyTrace();

    const epicId = `EPIC-${compactToken(epic.epicKey, 'm')}`;
    const featureId = `FEAT-${compactToken(`${epic.epicKey}::${feature.featureKey}`, 'f')}`;
    const storyId = frId
      ? `STORY-${compactToken(frId, 's')}`
      : `STORY-orphan-${compactToken(leaf.id, 's')}`;

    if (!nodesById.has(epicId)) epicCount += 1;
    ensure(epicId, () => ({
      id: epicId,
      name: epic.epicName,
      parentId: null,
      level: 'epic',
      area: 'management',
      featureId: null,
      sourceBgIds: epic.sourceBgIds,
      epicOrigin: epic.epicOrigin,
      suggestedRoleKey: 'project_manager',
      effortSeedHours: 0,
      effortHours: 0,
    }));

    if (!nodesById.has(featureId)) featureCount += 1;
    ensure(featureId, () => ({
      id: featureId,
      name: feature.featureName,
      parentId: epicId,
      level: 'feature',
      area: 'backend',
      featureId,
      sourceCapabilityIds: feature.sourceCapabilityIds,
      suggestedRoleKey: 'technical_lead',
      effortSeedHours: 0,
      effortHours: 0,
    }));

    if (!nodesById.has(storyId)) storyCount += 1;
    ensure(storyId, () => ({
      id: storyId,
      name: storyName,
      parentId: featureId,
      level: 'story',
      area: 'backend',
      featureId,
      ...soft,
      suggestedRoleKey: 'business_analyst',
      effortSeedHours: 0,
      effortHours: 0,
    }));

    const taskId = String(leaf.id || leaf.taskId || '').trim();
    if (!taskId) continue;
    const area = String(leaf.area || 'backend').toLowerCase() || 'backend';
    const wpId = `WP-${compactToken(`${storyId}::${area}`, 'w')}`;
    if (!nodesById.has(wpId)) workPackageCount += 1;
    ensure(wpId, () => ({
      id: wpId,
      name: resolveWorkPackageDisplayName({
        area,
        featureName: feature.featureName,
        moduleName: frRow.module || fr?.module || '',
        storyName,
      }),
      parentId: storyId,
      level: 'work_package',
      area,
      featureId,
      sourceFrIds: soft.sourceFrIds,
      sourceCapabilityIds: soft.sourceCapabilityIds,
      suggestedRoleKey: roleKeyForArea(area),
      effortSeedHours: 0,
      effortHours: 0,
    }));

    const leafIdx = wpTaskIndex.get(wpId) || 0;
    wpTaskIndex.set(wpId, leafIdx + 1);
    const taskName = resolveTaskDisplayName({
      leafName: leaf.name,
      storyName,
      area,
      index: leafIdx,
    });
    const hours = leafEffortHours(leaf);
    nodesById.set(taskId, {
      ...leaf,
      id: taskId,
      name: taskName,
      parentId: wpId,
      level: 'task',
      area,
      featureId,
      suggestedRoleKey: leaf.suggestedRoleKey || roleKeyForArea(area),
      effortSeedHours: hours,
      effortHours: hours,
      sourceFrIds: soft.sourceFrIds.length
        ? soft.sourceFrIds
        : Array.isArray(leaf.sourceFrIds)
          ? leaf.sourceFrIds.map(String).filter(Boolean)
          : [],
      sourceBgIds: soft.sourceBgIds,
      sourceNfrIds: soft.sourceNfrIds,
      sourceUcIds: soft.sourceUcIds,
      sourceCapabilityIds: soft.sourceCapabilityIds.length
        ? soft.sourceCapabilityIds
        : Array.isArray(leaf.sourceCapabilityIds)
          ? leaf.sourceCapabilityIds.map(String)
          : [],
    });
  }

  const deduped = dedupeChildTitlesAgainstParents([...nodesById.values()]);
  const allNodes = applyContainerEffortRollup(deduped);
  const roots = allNodes.filter((n) => n.parentId == null).map((n) => n.id);
  const taskCount = allNodes.filter((n) => n.level === 'task').length;

  const tasks = allNodes.map((n, idx) => ({
    id: n.id,
    name: n.name,
    parentId: n.parentId,
    level: n.level,
    area: n.area || (n.level === 'epic' ? 'management' : 'backend'),
    featureId: n.featureId || null,
    sourceCapabilityIds: Array.isArray(n.sourceCapabilityIds) ? n.sourceCapabilityIds : [],
    sourceFrIds: Array.isArray(n.sourceFrIds) ? n.sourceFrIds : [],
    sourceBgIds: Array.isArray(n.sourceBgIds) ? n.sourceBgIds : [],
    sourceNfrIds: Array.isArray(n.sourceNfrIds) ? n.sourceNfrIds : [],
    sourceUcIds: Array.isArray(n.sourceUcIds) ? n.sourceUcIds : [],
    sourceAcIndexes: Array.isArray(n.sourceAcIndexes) ? n.sourceAcIndexes : [],
    suggestedRoleKey:
      n.level === 'task' || n.level === 'work_package'
        ? n.suggestedRoleKey || roleKeyForArea(n.area)
        : n.level === 'epic'
          ? 'project_manager'
          : n.level === 'feature'
            ? n.suggestedRoleKey || 'technical_lead'
            : n.level === 'story'
              ? n.suggestedRoleKey || 'business_analyst'
              : n.suggestedRoleKey || undefined,
    deliverable: n.level === 'task' ? String(n.deliverable || '').trim() || undefined : undefined,
    effortSeedHours: n.effortSeedHours != null ? n.effortSeedHours : 0,
    effortHours: n.effortHours != null ? n.effortHours : 0,
    sortOrder: idx,
    ...(n.epicOrigin ? { epicOrigin: n.epicOrigin } : {}),
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
      workPackageCount,
      rebuiltFromLeaves: true,
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

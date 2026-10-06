/**
 * Hierarchical WBS: Epic → Feature → Story → Task (HARD-02 single-path).
 * Built from pack FR hierarchy + capability items; AC-split for leaves.
 * (AREA_ROLE_HINT duplicated locally to avoid circular require with wbs.js)
 */

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
const MAX_LEAVES_PER_FR = 8;

function inferAreaFromCapability(cap) {
  const blob = `${cap?.name || ''} ${cap?.module || ''} ${(cap?.requiredSkills || [])
    .map((s) => (typeof s === 'string' ? s : s.name || ''))
    .join(' ')}`.toLowerCase();
  if (/front|react|ui|css|html|ux/.test(blob)) return 'frontend';
  if (/qa|test|selenium/.test(blob)) return 'qa';
  if (/devops|deploy|infra|k8s|docker/.test(blob)) return 'infrastructure';
  if (/design|figma|wireframe/.test(blob)) return 'design';
  if (/auth|oauth|jwt|security/.test(blob)) return 'auth';
  if (/db|sql|mongo|data model/.test(blob)) return 'database';
  if (/api|rest|graphql|endpoint/.test(blob)) return 'api';
  if (/manage|plan|scrum|pm/.test(blob)) return 'management';
  if (/analy|ba |business/.test(blob)) return 'analysis';
  return 'backend';
}

function slugPart(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  if (!s) return '';
  const alnum = (s.match(/[a-z0-9]/g) || []).length;
  const hyphens = (s.match(/-/g) || []).length;
  // Reject diacritic-stripped VN titles (t-o-th-nh-c-ng-…)
  if (alnum < 2 || hyphens > alnum) return '';
  return s;
}

function shortHashId(raw, prefix = 'x') {
  const s = String(raw || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${prefix}${(h >>> 0).toString(36)}`;
}

function compactIdToken(raw, prefix = 'x') {
  return slugPart(raw) || shortHashId(raw, prefix);
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

function rowLevel(row) {
  return String(row?.level || row?.type || '').trim();
}

function complexityHours(complexity) {
  const key = String(complexity || 'medium').toLowerCase();
  return COMPLEXITY_HOURS[key] || COMPLEXITY_HOURS.medium;
}

function splitAcTexts(row, planningHints, frId) {
  if (Array.isArray(planningHints?.acSummaries)) {
    const fromHints = planningHints.acSummaries
      .filter((a) => String(a.frId) === String(frId))
      .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
      .map((a) => String(a.text || '').trim())
      .filter(Boolean);
    if (fromHints.length) return fromHints.slice(0, MAX_LEAVES_PER_FR);
  }
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, MAX_LEAVES_PER_FR);
  }
  const raw = row?.ac || row?.acceptanceCriteria || '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 3)
    .slice(0, MAX_LEAVES_PER_FR);
}

function ucIdsForFr(frId, planningHints, pack) {
  const fromHints = (planningHints?.ucIds || []).filter(Boolean);
  const fr = listFrRows(pack).find(
    (r, i) => rowId(r, i) === frId
  );
  const linked = Array.isArray(fr?.useCaseIds)
    ? fr.useCaseIds.map(String)
    : Array.isArray(fr?.sourceUcIds)
      ? fr.sourceUcIds.map(String)
      : [];
  if (linked.length) return linked;
  // Prefer pack useCases that reference this FR
  const ucs = Array.isArray(pack?.useCases) ? pack.useCases : [];
  const matched = [];
  for (let i = 0; i < ucs.length; i += 1) {
    const uc = ucs[i];
    const frs = uc.sourceFrIds || uc.frIds || uc.relatedFrIds || [];
    if (frs.map(String).includes(String(frId))) {
      matched.push(String(uc.externalId || uc.id || uc.ucKey || `UC-${i + 1}`));
    }
  }
  return matched.length ? matched : fromHints.slice(0, 0);
}

function makeNode({
  id,
  name,
  parentId = null,
  level,
  area = 'backend',
  featureId = null,
  sourceCapabilityIds = [],
  sourceFrIds = [],
  sourceUcIds = [],
  sourceAcIndexes = [],
  effortSeedHours = null,
  suggestedRoleKey = null,
  sortOrder = 0,
  isContainer = false,
}) {
  const role =
    suggestedRoleKey || AREA_ROLE_HINT[area] || 'backend_developer';
  const node = {
    id,
    name,
    parentId,
    level,
    area,
    featureId,
    sourceCapabilityIds: [...sourceCapabilityIds],
    sourceFrIds: [...sourceFrIds],
    sourceUcIds: [...sourceUcIds],
    sourceAcIndexes: [...sourceAcIndexes],
    suggestedRoleKey: role,
    sortOrder,
  };
  if (effortSeedHours != null) {
    node.effortSeedHours = effortSeedHours;
    if (!isContainer) node.effortHours = effortSeedHours;
  }
  if (isContainer) {
    node.effortSeedHours = effortSeedHours != null ? effortSeedHours : 0;
  }
  return node;
}

function capabilityForFr(capabilities, frId) {
  return (capabilities || []).find((c) =>
    (c.sourceFrIds || []).map(String).includes(String(frId))
  );
}

/**
 * @param {{ capabilities?: object[], pack?: object, planningHints?: object }} args
 * @returns {{ tasks: object[], wbs: { roots: string[], nodes: object[], taskCount: number } }}
 */
function buildHierarchicalWbs({ capabilities = [], pack = {}, planningHints = null } = {}) {
  const frRows = listFrRows(pack);
  const tasks = [];
  const nodeById = new Map();
  let sortOrder = 0;

  const push = (node) => {
    if (nodeById.has(node.id)) return nodeById.get(node.id);
    tasks.push(node);
    nodeById.set(node.id, node);
    return node;
  };

  // Index modules / features from FR hierarchy
  const moduleIds = new Map(); // key → epicId
  const featureIds = new Map(); // key → featureId

  function ensureEpic(moduleName, frIdHint) {
    const key = String(moduleName || 'General').toLowerCase() || 'general';
    if (moduleIds.has(key)) return moduleIds.get(key);
    const id = `EPIC-${compactIdToken(moduleName || frIdHint || 'general', 'm')}`;
    const epic = makeNode({
      id,
      name: moduleName || 'General',
      parentId: null,
      level: 'epic',
      area: 'management',
      suggestedRoleKey: 'project_manager',
      sortOrder: sortOrder++,
      isContainer: true,
      effortSeedHours: 0,
    });
    push(epic);
    moduleIds.set(key, id);
    return id;
  }

  function ensureFeature(featureName, epicId, frIds = []) {
    const key = `${epicId}::${String(featureName || 'Feature').toLowerCase()}`;
    if (featureIds.has(key)) return featureIds.get(key);
    const id = `FEAT-${compactIdToken(
      `${epicId}::${featureName || frIds[0] || featureIds.size + 1}`,
      'f'
    )}`;
    const feature = makeNode({
      id,
      name: featureName || 'Feature',
      parentId: epicId,
      level: 'feature',
      featureId: id,
      sourceFrIds: frIds,
      area: 'backend',
      sortOrder: sortOrder++,
      isContainer: true,
      effortSeedHours: 0,
    });
    push(feature);
    featureIds.set(key, id);
    return id;
  }

  // Explicit Module/Feature level rows
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i];
    const level = rowLevel(row);
    if (level === 'Module' || level === 'Epic') {
      ensureEpic(row.name || row.title || rowId(row, i), rowId(row, i));
    }
  }

  const requirementRows = [];
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i];
    const level = rowLevel(row);
    if (level === 'Module' || level === 'Epic' || level === 'Feature') {
      if (level === 'Feature') {
        const parentMod =
          row.module ||
          row.moduleLabel ||
          (frRows.find((r, j) => rowId(r, j) === String(row.parentExternalId || row.parentId || ''))
            ?.name) ||
          'General';
        const epicId = ensureEpic(parentMod, rowId(row, i));
        ensureFeature(row.name || row.title || rowId(row, i), epicId, [rowId(row, i)]);
      }
      continue;
    }
    requirementRows.push({ row, index: i, frId: rowId(row, i) });
  }

  // Fallback: all rows as requirements when no level filtering left items but rows exist
  if (!requirementRows.length && frRows.length) {
    for (let i = 0; i < frRows.length; i += 1) {
      const level = rowLevel(frRows[i]);
      if (level === 'Module' || level === 'Epic' || level === 'Feature') continue;
      requirementRows.push({ row: frRows[i], index: i, frId: rowId(frRows[i], i) });
    }
  }

  for (const { row, frId } of requirementRows) {
    const cap = capabilityForFr(capabilities, frId);
    const moduleName =
      row.module || row.moduleLabel || cap?.module || 'General';
    const featureName =
      row.feature || row.featureLabel || cap?.feature || row.name || row.title || frId;
    const epicId = ensureEpic(moduleName, frId);
    const featureId = ensureFeature(featureName, epicId, [frId]);
    const area = cap ? inferAreaFromCapability(cap) : 'backend';
    const complexity = cap?.complexity || row.complexity || 'medium';
    const seed = complexityHours(complexity);
    const sourceUcIds = [
      ...(cap?.sourceUcIds || []),
      ...ucIdsForFr(frId, planningHints, pack),
    ].map(String);
    const uniqueUc = [...new Set(sourceUcIds)];
    const acTexts = splitAcTexts(row, planningHints, frId);
    const sourceCapIds = cap?.capabilityId ? [cap.capabilityId] : [];

    if (!acTexts.length) {
      // Single leaf task under feature (story skipped when no AC)
      const taskId = `TASK-${compactIdToken(frId, 't') || compactIdToken(featureName, 't') || tasks.length + 1}`;
      push(
        makeNode({
          id: taskId,
          name: row.name || row.title || cap?.name || frId,
          parentId: featureId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: sourceCapIds,
          sourceFrIds: [frId],
          sourceUcIds: uniqueUc,
          sourceAcIndexes: [],
          effortSeedHours: seed,
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
        })
      );
      continue;
    }

    const leaves = acTexts.slice(0, MAX_LEAVES_PER_FR);
    for (let acIndex = 0; acIndex < leaves.length; acIndex += 1) {
      const acText = leaves[acIndex];
      const storyId = `STORY-${compactIdToken(frId, 's')}-${acIndex + 1}`;
      push(
        makeNode({
          id: storyId,
          name: acText.slice(0, 120),
          parentId: featureId,
          level: 'story',
          featureId,
          area,
          sourceCapabilityIds: sourceCapIds,
          sourceFrIds: [frId],
          sourceUcIds: uniqueUc,
          sourceAcIndexes: [acIndex],
          effortSeedHours: Math.max(1, Math.round(seed * 0.25)),
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
          isContainer: true,
        })
      );
      const taskId = `TASK-${compactIdToken(frId, 't')}-ac${acIndex + 1}`;
      const leafHours = Math.max(
        1,
        Math.round(seed / Math.min(leaves.length, MAX_LEAVES_PER_FR))
      );
      push(
        makeNode({
          id: taskId,
          name: `Implement: ${acText.slice(0, 100)}`,
          parentId: storyId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: sourceCapIds,
          sourceFrIds: [frId],
          sourceUcIds: uniqueUc,
          sourceAcIndexes: [acIndex],
          effortSeedHours: leafHours,
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
        })
      );
    }
  }

  // Capabilities without FR mapping → wrap under module epic / single epic
  const coveredFr = new Set(
    tasks.flatMap((t) => t.sourceFrIds || []).map(String)
  );
  const orphanCaps = (capabilities || []).filter((c) => {
    const frs = (c.sourceFrIds || []).map(String);
    if (!frs.length) return true;
    return frs.every((id) => !coveredFr.has(id));
  });

  if (orphanCaps.length) {
    for (const cap of orphanCaps) {
      if (!cap?.capabilityId) continue;
      const moduleName = cap.module || 'General';
      const epicId = ensureEpic(moduleName, cap.capabilityId);
      const featureName = cap.feature || cap.name || cap.capabilityId;
      const featureId = ensureFeature(featureName, epicId, cap.sourceFrIds || []);
      const area = inferAreaFromCapability(cap);
      const seed = complexityHours(cap.complexity);
      const base = slugPart(cap.capabilityId) || slugPart(cap.name) || 'cap';
      push(
        makeNode({
          id: `TASK-${base}`,
          name: cap.name || cap.capabilityId,
          parentId: featureId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: Array.isArray(cap.sourceUcIds) ? [...cap.sourceUcIds] : [],
          sourceAcIndexes: [],
          effortSeedHours: seed,
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
        })
      );
    }
  }

  // Only-capabilities path with zero FR rows already handled via orphanCaps.
  // If still empty but capabilities exist without module — single epic wrap
  if (!tasks.length && (capabilities || []).length) {
    const epicId = ensureEpic('Delivery', 'root');
    for (const cap of capabilities) {
      if (!cap?.capabilityId) continue;
      const area = inferAreaFromCapability(cap);
      const featureId = ensureFeature(cap.name || cap.capabilityId, epicId, cap.sourceFrIds || []);
      const base = slugPart(cap.capabilityId) || 'cap';
      push(
        makeNode({
          id: `TASK-${base}`,
          name: cap.name || cap.capabilityId,
          parentId: featureId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: [],
          sourceAcIndexes: [],
          effortSeedHours: complexityHours(cap.complexity),
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
        })
      );
    }
  }

  const roots = tasks.filter((t) => !t.parentId).map((t) => t.id);
  const wbs = {
    roots,
    nodes: tasks.map((t) => ({
      id: t.id,
      name: t.name,
      parentId: t.parentId || null,
      level: t.level,
      area: t.area,
      featureId: t.featureId || null,
    })),
    taskCount: tasks.filter((t) => t.level === 'task').length,
  };

  return { tasks, wbs };
}

module.exports = {
  MAX_LEAVES_PER_FR,
  COMPLEXITY_HOURS,
  buildHierarchicalWbs,
};

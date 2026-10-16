/**
 * Hierarchical WBS: Epic → Feature → Story → Task (HARD-02 single-path).
 * Epic ← BG/outcome; Feature ← capability/module; Story ← FR value (soft sourceFrIds);
 * AC → Task. FR/NFR/UC/BG are trace fields — not hierarchy identity.
 * (AREA_ROLE_HINT duplicated locally to avoid circular require with wbs.js)
 */

const {
  resolveFeatureDisplayName,
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
  capabilityForFr: capabilityForFrMapped,
  listBgRows,
} = require('./wbsSrsMapping');

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
  sourceBgIds = [],
  sourceNfrIds = [],
  sourceUcIds = [],
  sourceAcIndexes = [],
  effortSeedHours = null,
  suggestedRoleKey = null,
  sortOrder = 0,
  isContainer = false,
  epicOrigin = null,
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
    sourceBgIds: [...sourceBgIds],
    sourceNfrIds: [...sourceNfrIds],
    sourceUcIds: [...sourceUcIds],
    sourceAcIndexes: [...sourceAcIndexes],
    suggestedRoleKey: role,
    sortOrder,
  };
  if (epicOrigin) node.epicOrigin = epicOrigin;
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
  return capabilityForFrMapped(capabilities, frId);
}

/**
 * @param {{ capabilities?: object[], pack?: object, planningHints?: object }} args
 * @returns {{ tasks: object[], wbs: { roots: string[], nodes: object[], taskCount: number } }}
 */
function buildHierarchicalWbs({ capabilities = [], pack = {}, planningHints = null } = {}) {
  const frRows = listFrRows(pack);
  const srsCtx = buildSrsMappingContext(pack, capabilities, planningHints);
  const tasks = [];
  const nodeById = new Map();
  let sortOrder = 0;

  const push = (node) => {
    if (nodeById.has(node.id)) return nodeById.get(node.id);
    tasks.push(node);
    nodeById.set(node.id, node);
    return node;
  };

  // Epic keyed by BG/outcome/module — not by FR id
  const epicIds = new Map(); // epicKey → epicId
  const featureIds = new Map(); // epicId::featureKey → featureId

  function ensureEpicFromPlacement(placement) {
    const key = placement.epicKey;
    if (epicIds.has(key)) return epicIds.get(key);
    const id = `EPIC-${compactIdToken(key, 'm')}`;
    const epic = makeNode({
      id,
      name: placement.epicName || 'General',
      parentId: null,
      level: 'epic',
      area: 'management',
      suggestedRoleKey: 'project_manager',
      sourceBgIds: placement.sourceBgIds || [],
      epicOrigin: placement.epicOrigin || null,
      sortOrder: sortOrder++,
      isContainer: true,
      effortSeedHours: 0,
    });
    push(epic);
    epicIds.set(key, id);
    return id;
  }

  function ensureFeatureUnderEpic(epicId, featureName, sourceCapabilityIds = []) {
    const key = `${epicId}::${String(featureName || 'Feature').toLowerCase()}`;
    if (featureIds.has(key)) return featureIds.get(key);
    const id = `FEAT-${compactIdToken(`${epicId}::${featureName || featureIds.size + 1}`, 'f')}`;
    const feature = makeNode({
      id,
      name: featureName || 'Feature',
      parentId: epicId,
      level: 'feature',
      featureId: id,
      // Soft: capability only — do not stamp FR ids on Feature (FR lives on Story/Task)
      sourceCapabilityIds,
      sourceFrIds: [],
      area: 'backend',
      sortOrder: sortOrder++,
      isContainer: true,
      effortSeedHours: 0,
    });
    push(feature);
    featureIds.set(key, id);
    return id;
  }

  const workPackageIds = new Map(); // storyId::area → wpId
  function ensureWorkPackageUnderStory({
    storyId,
    area,
    featureId,
    featureName,
    moduleName,
    storyName,
    sourceFrIds = [],
    sourceCapabilityIds = [],
  }) {
    const areaKey = String(area || 'backend').toLowerCase() || 'backend';
    const key = `${storyId}::${areaKey}`;
    if (workPackageIds.has(key)) return workPackageIds.get(key);
    const id = `WP-${compactIdToken(key, 'w')}`;
    const wp = makeNode({
      id,
      name: resolveWorkPackageDisplayName({
        area: areaKey,
        featureName,
        moduleName,
        storyName,
      }),
      parentId: storyId,
      level: 'work_package',
      featureId,
      area: areaKey,
      sourceFrIds,
      sourceCapabilityIds,
      suggestedRoleKey: roleKeyForArea(areaKey),
      sortOrder: sortOrder++,
      isContainer: true,
      effortSeedHours: 0,
    });
    push(wp);
    workPackageIds.set(key, id);
    return id;
  }

  // Explicit Feature-level pack rows (rare) — still hang under outcome epic
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i];
    const level = rowLevel(row);
    if (level !== 'Feature') continue;
    const placement = resolveEpicPlacement({
      frId: rowId(row, i),
      frRow: row,
      pack,
      frToBg: srsCtx.frToBg,
    });
    const epicId = ensureEpicFromPlacement(placement);
    ensureFeatureUnderEpic(epicId, row.name || row.title || rowId(row, i), []);
  }

  const requirementRows = [];
  for (let i = 0; i < frRows.length; i += 1) {
    const row = frRows[i];
    const level = rowLevel(row);
    if (level === 'Module' || level === 'Epic' || level === 'Feature') continue;
    requirementRows.push({ row, index: i, frId: rowId(row, i) });
  }

  if (!requirementRows.length && frRows.length) {
    for (let i = 0; i < frRows.length; i += 1) {
      const level = rowLevel(frRows[i]);
      if (level === 'Module' || level === 'Epic' || level === 'Feature') continue;
      requirementRows.push({ row: frRows[i], index: i, frId: rowId(frRows[i], i) });
    }
  }

  for (const { row, frId } of requirementRows) {
    const cap = capabilityForFr(capabilities, frId);
    const frTitle = row.name || row.title || frId;
    const epicPlacement = resolveEpicPlacement({
      frId,
      frRow: row,
      pack,
      frToBg: srsCtx.frToBg,
    });
    const featurePlacement = resolveFeaturePlacement({
      frId,
      frRow: row,
      frName: frTitle,
      capabilities,
      pack,
    });
    const epicId = ensureEpicFromPlacement(epicPlacement);
    const featureId = ensureFeatureUnderEpic(
      epicId,
      featurePlacement.featureName,
      featurePlacement.sourceCapabilityIds
    );
    const area = cap ? inferAreaFromCapability(cap) : 'backend';
    const complexity = cap?.complexity || row.complexity || 'medium';
    const seed = complexityHours(complexity);
    const soft = resolveSoftTrace({
      frId,
      pack,
      planningHints,
      frToBg: srsCtx.frToBg,
      frToNfr: srsCtx.frToNfr,
      capabilities,
      sourceUcIds: [
        ...(cap?.sourceUcIds || []),
        ...ucIdsForFr(frId, planningHints, pack),
      ].map(String),
    });
    const acTexts = splitAcTexts(row, planningHints, frId);

    // Story = FR value once; SRS ids are soft trace only
    const storyName = resolveStoryDisplayName({ frName: frTitle, frId });
    const storyId = `STORY-${compactIdToken(frId, 's')}`;
    push(
      makeNode({
        id: storyId,
        name: storyName,
        parentId: featureId,
        level: 'story',
        featureId,
        area,
        sourceCapabilityIds: soft.sourceCapabilityIds,
        sourceFrIds: soft.sourceFrIds,
        sourceBgIds: soft.sourceBgIds,
        sourceNfrIds: soft.sourceNfrIds,
        sourceUcIds: soft.sourceUcIds,
        sourceAcIndexes: [],
        effortSeedHours: 0,
        suggestedRoleKey: AREA_ROLE_HINT[area],
        sortOrder: sortOrder++,
        isContainer: true,
      })
    );

    const wpId = ensureWorkPackageUnderStory({
      storyId,
      area,
      featureId,
      featureName: featurePlacement.featureName,
      moduleName: row.module || row.moduleLabel || '',
      storyName,
      sourceFrIds: soft.sourceFrIds,
      sourceCapabilityIds: soft.sourceCapabilityIds,
    });

    if (!acTexts.length) {
      const taskId = `TASK-${compactIdToken(frId, 't') || compactIdToken(featurePlacement.featureName, 't') || tasks.length + 1}`;
      push(
        makeNode({
          id: taskId,
          name: resolveTaskDisplayName({
            leafName: cap?.name && cap.name !== frTitle ? cap.name : '',
            storyName,
            area,
          }),
          parentId: wpId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: soft.sourceCapabilityIds,
          sourceFrIds: soft.sourceFrIds,
          sourceBgIds: soft.sourceBgIds,
          sourceNfrIds: soft.sourceNfrIds,
          sourceUcIds: soft.sourceUcIds,
          sourceAcIndexes: [],
          effortSeedHours: seed,
          suggestedRoleKey: roleKeyForArea(area),
          sortOrder: sortOrder++,
        })
      );
      continue;
    }

    const leaves = acTexts.slice(0, MAX_LEAVES_PER_FR);
    for (let acIndex = 0; acIndex < leaves.length; acIndex += 1) {
      const acText = leaves[acIndex];
      const taskId = `TASK-${compactIdToken(frId, 't')}-ac${acIndex + 1}`;
      const leafHours = Math.max(
        1,
        Math.round(seed / Math.min(leaves.length, MAX_LEAVES_PER_FR))
      );
      push(
        makeNode({
          id: taskId,
          name: resolveTaskDisplayName({
            leafName: `Implement: ${acText.slice(0, 100)}`,
            storyName,
            area,
            index: acIndex,
          }),
          parentId: wpId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: soft.sourceCapabilityIds,
          sourceFrIds: soft.sourceFrIds,
          sourceBgIds: soft.sourceBgIds,
          sourceNfrIds: soft.sourceNfrIds,
          sourceUcIds: soft.sourceUcIds,
          sourceAcIndexes: [acIndex],
          effortSeedHours: leafHours,
          suggestedRoleKey: roleKeyForArea(area),
          sortOrder: sortOrder++,
        })
      );
    }
  }

  // Orphan capabilities (no FR covered) — Feature under outcome epic; Story soft-links FR if any
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
      const hintFrId = Array.isArray(cap.sourceFrIds) && cap.sourceFrIds[0]
        ? String(cap.sourceFrIds[0])
        : cap.capabilityId;
      const epicPlacement = resolveEpicPlacement({
        frId: hintFrId,
        frRow: { module: cap.module || 'General' },
        pack,
        frToBg: srsCtx.frToBg,
      });
      const epicId = ensureEpicFromPlacement(epicPlacement);
      const featureName = resolveFeatureDisplayName({
        feature: cap.feature,
        capabilityName: cap.name,
        frName: '',
        moduleName: cap.module || 'General',
      });
      const featureId = ensureFeatureUnderEpic(epicId, featureName, [cap.capabilityId]);
      const area = inferAreaFromCapability(cap);
      const seed = complexityHours(cap.complexity);
      const base = slugPart(cap.capabilityId) || slugPart(cap.name) || 'cap';
      const storyName = resolveStoryDisplayName({
        frName: cap.name,
        frId: cap.capabilityId,
      });
      const storyId = `STORY-${compactIdToken(cap.capabilityId, 's')}`;
      push(
        makeNode({
          id: storyId,
          name: storyName,
          parentId: featureId,
          level: 'story',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: Array.isArray(cap.sourceUcIds) ? [...cap.sourceUcIds] : [],
          sourceAcIndexes: [],
          effortSeedHours: 0,
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
          isContainer: true,
        })
      );
      const wpId = ensureWorkPackageUnderStory({
        storyId,
        area,
        featureId,
        featureName,
        moduleName: cap.module || 'General',
        storyName,
        sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
        sourceCapabilityIds: [cap.capabilityId],
      });
      push(
        makeNode({
          id: `TASK-${base}`,
          name: resolveTaskDisplayName({
            leafName: '',
            storyName,
            area,
          }),
          parentId: wpId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: Array.isArray(cap.sourceUcIds) ? [...cap.sourceUcIds] : [],
          sourceAcIndexes: [],
          effortSeedHours: seed,
          suggestedRoleKey: roleKeyForArea(area),
          sortOrder: sortOrder++,
        })
      );
    }
  }

  if (!tasks.length && (capabilities || []).length) {
    const epicPlacement = resolveEpicPlacement({
      frId: 'root',
      frRow: { module: 'Delivery' },
      pack,
      frToBg: srsCtx.frToBg,
    });
    // Force delivery epic when pack has no BG/overview and only caps
    const hasOutcome =
      listBgRows(pack).length > 0 ||
      Boolean(
        pack.overview &&
          (pack.overview.projectObjective ||
            pack.overview.requirementName ||
            pack.overview.businessScope)
      );
    const epicId = ensureEpicFromPlacement(
      hasOutcome
        ? epicPlacement
        : {
            epicKey: 'module:delivery',
            epicName: 'Delivery',
            sourceBgIds: [],
            epicOrigin: 'module',
          }
    );
    for (const cap of capabilities) {
      if (!cap?.capabilityId) continue;
      const area = inferAreaFromCapability(cap);
      const featureName = resolveFeatureDisplayName({
        feature: cap.feature,
        capabilityName: cap.name,
        frName: '',
        moduleName: 'Delivery',
      });
      const featureId = ensureFeatureUnderEpic(epicId, featureName, [cap.capabilityId]);
      const base = slugPart(cap.capabilityId) || 'cap';
      const storyName = resolveStoryDisplayName({
        frName: cap.name,
        frId: cap.capabilityId,
      });
      const storyId = `STORY-${compactIdToken(cap.capabilityId, 's')}`;
      push(
        makeNode({
          id: storyId,
          name: storyName,
          parentId: featureId,
          level: 'story',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: [],
          sourceAcIndexes: [],
          effortSeedHours: 0,
          suggestedRoleKey: AREA_ROLE_HINT[area],
          sortOrder: sortOrder++,
          isContainer: true,
        })
      );
      const wpId = ensureWorkPackageUnderStory({
        storyId,
        area,
        featureId,
        featureName,
        moduleName: 'Delivery',
        storyName,
        sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
        sourceCapabilityIds: [cap.capabilityId],
      });
      push(
        makeNode({
          id: `TASK-${base}`,
          name: resolveTaskDisplayName({
            leafName: '',
            storyName,
            area,
          }),
          parentId: wpId,
          level: 'task',
          featureId,
          area,
          sourceCapabilityIds: [cap.capabilityId],
          sourceFrIds: Array.isArray(cap.sourceFrIds) ? [...cap.sourceFrIds] : [],
          sourceUcIds: [],
          sourceAcIndexes: [],
          effortSeedHours: complexityHours(cap.complexity),
          suggestedRoleKey: roleKeyForArea(area),
          sortOrder: sortOrder++,
        })
      );
    }
  }

  const deduped = dedupeChildTitlesAgainstParents(tasks);
  const rolled = applyContainerEffortRollup(deduped);
  // Replace in-place so callers holding tasks ref stay consistent
  tasks.length = 0;
  for (const n of rolled) tasks.push(n);

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

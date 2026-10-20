/**
 * BacklogMap — deterministic SRS → Agile backlog.
 *
 * Hierarchy is contextual (not always Epic→Feature→Story):
 * - Epic = business outcome (BG)
 * - Feature = product capability only when warranted (explicit feature / capability /
 *   shared real module with ≥2 stories under the same Epic)
 * - Story = concrete PBI (FR/UC/NFR value) — may parent directly under Epic
 *
 * FR ≠ Story identity; UC may group multiple FRs; unmappedFrIds for coverage.
 */

const {
  listFrRows,
  listUcRows,
  listNfrRows,
  frRowId,
  relatedIds,
  resolveEpicPlacement,
  resolveFeaturePlacement,
  resolveSoftTrace,
  buildSrsMappingContext,
} = require('./wbsSrsMapping');
const { resolveStoryDisplayName } = require('./wbsAgileNaming');

function compactToken(raw, prefix = 'x') {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24);
  return s || prefix;
}

function frDisplayName(row, frId) {
  return String(row?.name || row?.title || frId || '').trim() || frId;
}

/** Keep all AC lines needed for Wbs cite — cap only pathological dumps. */
const MAX_STORY_AC_REFS = 24;
const MAX_STORY_DESC_CHARS = 2000;

function extractAcRefs(row) {
  if (Array.isArray(row?.acceptanceCriteriaList)) {
    return row.acceptanceCriteriaList
      .map((x) => String(x || '').trim())
      .filter(Boolean)
      .slice(0, MAX_STORY_AC_REFS);
  }
  const raw = row?.ac || row?.acceptanceCriteria || '';
  if (typeof raw !== 'string' || !raw.trim()) return [];
  return raw
    .split(/\n|;/)
    .map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((s) => s.length >= 3)
    .slice(0, MAX_STORY_AC_REFS);
}

function frDescription(row) {
  const parts = [
    row?.description,
    row?.detail,
    row?.summary,
    row?.statement,
  ]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!parts.length) return '';
  return parts.join('\n').slice(0, MAX_STORY_DESC_CHARS);
}

function ucId(row, index = 0) {
  return String(
    row?.externalId || row?.id || row?.ucKey || row?.ucId || `UC-${index + 1}`
  ).trim();
}

/**
 * @param {object} opts
 * @param {object} opts.pack
 * @param {object[]} [opts.capabilities]
 * @param {object|null} [opts.planningHints]
 */
function runBacklogMapEngine(opts = {}) {
  const pack = opts.pack || {};
  const capabilities = Array.isArray(opts.capabilities) ? opts.capabilities : [];
  const planningHints = opts.planningHints || null;
  const srsCtx = buildSrsMappingContext(pack, capabilities, planningHints);
  const frRows = listFrRows(pack);
  const frById = new Map();
  frRows.forEach((row, i) => {
    const id = frRowId(row, i);
    frById.set(id, { row, index: i, name: frDisplayName(row, id) });
  });

  const coveredFr = new Set();
  const epicsById = new Map();
  const featuresById = new Map();
  const stories = [];

  function ensureEpic(epic) {
    const epicId = `EPIC-${compactToken(epic.epicKey, 'm')}`;
    if (!epicsById.has(epicId)) {
      epicsById.set(epicId, {
        id: epicId,
        name: epic.epicName,
        parentId: null,
        level: 'epic',
        sourceBgIds: Array.isArray(epic.sourceBgIds) ? [...epic.sourceBgIds] : [],
        epicOrigin: epic.epicOrigin,
      });
    }
    return epicId;
  }

  function ensureFeature(epicId, feature) {
    if (!feature?.featureKey || !feature?.featureName) return null;
    const featureId = `FEAT-${compactToken(`${epicId}::${feature.featureKey}`, 'f')}`;
    if (!featuresById.has(featureId)) {
      featuresById.set(featureId, {
        id: featureId,
        name: feature.featureName,
        parentId: epicId,
        level: 'feature',
        sourceCapabilityIds: Array.isArray(feature.sourceCapabilityIds)
          ? [...feature.sourceCapabilityIds]
          : [],
        featureOrigin: feature.warrantSignal || null,
      });
    }
    return featureId;
  }

  /** Drafts: decide Feature after we know cluster sizes under each Epic. */
  const drafts = [];

  // 1) Stories from UC groups (multi-FR) — UC already is a Story-sized value unit
  listUcRows(pack).forEach((uc, ui) => {
    const id = ucId(uc, ui);
    const frIds = relatedIds(uc, ['sourceFrIds', 'frIds', 'relatedFrIds']).filter((fid) =>
      frById.has(fid)
    );
    if (frIds.length < 2) return;

    const primaryFr = frIds[0];
    const frMeta = frById.get(primaryFr);
    const epic = resolveEpicPlacement({
      frId: primaryFr,
      frRow: frMeta.row,
      pack,
      frToBg: srsCtx.frToBg,
    });
    const feature = resolveFeaturePlacement({
      frId: primaryFr,
      frRow: frMeta.row,
      frName: frMeta.name,
      capabilities,
      pack,
    });
    const epicId = ensureEpic(epic);
    const soft = resolveSoftTrace({
      frId: primaryFr,
      pack,
      planningHints,
      frToBg: srsCtx.frToBg,
      frToNfr: srsCtx.frToNfr,
      capabilities,
      sourceUcIds: [id],
    });
    const storyName =
      String(uc.name || uc.title || uc.summary || '').trim() ||
      resolveStoryDisplayName({ frName: frMeta.name, frId: primaryFr });

    const storyId = `STORY-UC-${compactToken(id, 'u')}`;
    for (const fid of frIds) coveredFr.add(fid);
    const acRefs = [
      ...new Set(frIds.flatMap((fid) => extractAcRefs(frById.get(fid)?.row || {}))),
    ].slice(0, MAX_STORY_AC_REFS);
    const description = frIds
      .map((fid) => frDescription(frById.get(fid)?.row || {}))
      .filter(Boolean)
      .join('\n---\n')
      .slice(0, MAX_STORY_DESC_CHARS);

    drafts.push({
      epicId,
      feature,
      story: {
        id: storyId,
        name: storyName.slice(0, 240),
        description,
        level: 'story',
        sourceFrIds: [...frIds],
        sourceUcIds: [...new Set([id, ...(soft.sourceUcIds || [])])],
        sourceNfrIds: soft.sourceNfrIds || [],
        sourceBgIds: soft.sourceBgIds || [],
        sourceCapabilityIds: soft.sourceCapabilityIds || [],
        acRefs,
        needsDecomposition: true,
      },
    });
  });

  // 2) Residual FR → one Story each
  for (const [frId, frMeta] of frById) {
    if (coveredFr.has(frId)) continue;
    const epic = resolveEpicPlacement({
      frId,
      frRow: frMeta.row,
      pack,
      frToBg: srsCtx.frToBg,
    });
    const feature = resolveFeaturePlacement({
      frId,
      frRow: frMeta.row,
      frName: frMeta.name,
      capabilities,
      pack,
    });
    const epicId = ensureEpic(epic);
    const soft = resolveSoftTrace({
      frId,
      pack,
      planningHints,
      frToBg: srsCtx.frToBg,
      frToNfr: srsCtx.frToNfr,
      capabilities,
    });
    const storyId = `STORY-${compactToken(frId, 's')}`;
    coveredFr.add(frId);
    drafts.push({
      epicId,
      feature,
      story: {
        id: storyId,
        name: resolveStoryDisplayName({ frName: frMeta.name, frId }).slice(0, 240),
        description: frDescription(frMeta.row),
        level: 'story',
        sourceFrIds: [frId],
        sourceUcIds: soft.sourceUcIds || [],
        sourceNfrIds: soft.sourceNfrIds || [],
        sourceBgIds: soft.sourceBgIds || [],
        sourceCapabilityIds: soft.sourceCapabilityIds || [],
        acRefs: extractAcRefs(frMeta.row),
        needsDecomposition: true,
      },
    });
  }

  // 3) Independent NFR PBIs — Story under Epic (no invented NFR Feature layer)
  listNfrRows(pack).forEach((nfr, ni) => {
    const nfrId = String(
      nfr?.nfrId || nfr?.externalId || nfr?.id || nfr?._id || `NFR-${ni + 1}`
    ).trim();
    const frLinks = relatedIds(nfr, ['relatedFrIds', 'sourceFrIds', 'frIds']);
    if (frLinks.length) return;
    const label = String(nfr?.name || nfr?.title || nfr?.statement || nfrId).trim();
    if (!label || label.length < 4) return;

    const epic = resolveEpicPlacement({
      frId: `nfr:${nfrId}`,
      frRow: {},
      pack,
      frToBg: srsCtx.frToBg,
    });
    const epicId = ensureEpic(epic);
    drafts.push({
      epicId,
      feature: { warrantSignal: null, featureKey: null, featureName: null },
      story: {
        id: `STORY-NFR-${compactToken(nfrId, 'n')}`,
        name: label.slice(0, 240),
        description: frDescription(nfr),
        level: 'story',
        sourceFrIds: [],
        sourceUcIds: [],
        sourceNfrIds: [nfrId],
        sourceBgIds: [],
        sourceCapabilityIds: [],
        acRefs: extractAcRefs(nfr),
        needsDecomposition: true,
      },
    });
  });

  // Cluster size for module-warranted features (need ≥2 stories under same Epic)
  const moduleClusterCount = new Map();
  for (const d of drafts) {
    if (d.feature?.warrantSignal !== 'module' || !d.feature.featureKey) continue;
    const k = `${d.epicId}::${d.feature.featureKey}`;
    moduleClusterCount.set(k, (moduleClusterCount.get(k) || 0) + 1);
  }

  function resolveStoryParentId(epicId, feature) {
    const sig = feature?.warrantSignal || null;
    if (!sig || !feature.featureKey) return epicId;
    if (sig === 'explicit_feature' || sig === 'capability') {
      return ensureFeature(epicId, feature) || epicId;
    }
    if (sig === 'module') {
      const n = moduleClusterCount.get(`${epicId}::${feature.featureKey}`) || 0;
      if (n >= 2) return ensureFeature(epicId, feature) || epicId;
    }
    return epicId;
  }

  for (const d of drafts) {
    const parentId = resolveStoryParentId(d.epicId, d.feature);
    stories.push({
      ...d.story,
      parentId,
    });
  }

  const unmappedFrIds = [...frById.keys()].filter((id) => !coveredFr.has(id));

  const backlog = {
    epics: [...epicsById.values()],
    features: [...featuresById.values()],
    stories,
    unmappedFrIds,
    meta: {
      source: 'deterministic',
      storyCount: stories.length,
      epicCount: epicsById.size,
      featureCount: featuresById.size,
      frCount: frById.size,
      unmappedCount: unmappedFrIds.length,
    },
  };

  return { backlog, meta: backlog.meta };
}

/**
 * Materialize backlog nodes as planning.tasks-compatible rows (for Dep/Effort/Gate2).
 */
function backlogNodesAsTasks(backlog = {}) {
  const out = [];
  for (const e of backlog.epics || []) {
    out.push({
      id: e.id,
      name: e.name,
      parentId: null,
      level: 'epic',
      sourceBgIds: e.sourceBgIds || [],
      suggestedRoleKey: 'project_manager',
      effortSeedHours: 0,
      effortHours: 0,
    });
  }
  for (const f of backlog.features || []) {
    out.push({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      level: 'feature',
      sourceCapabilityIds: f.sourceCapabilityIds || [],
      effortSeedHours: 0,
      effortHours: 0,
    });
  }
  for (const s of backlog.stories || []) {
    out.push({
      id: s.id,
      name: s.name,
      description: s.description || '',
      parentId: s.parentId,
      level: 'story',
      sourceFrIds: s.sourceFrIds || [],
      sourceUcIds: s.sourceUcIds || [],
      sourceNfrIds: s.sourceNfrIds || [],
      sourceBgIds: s.sourceBgIds || [],
      sourceCapabilityIds: s.sourceCapabilityIds || [],
      acRefs: Array.isArray(s.acRefs) ? s.acRefs : [],
      effortSeedHours: 0,
      effortHours: 0,
      needsDecomposition: s.needsDecomposition !== false,
    });
  }
  return out;
}

function applyBacklogToContainer(container, backlogResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.backlog = backlogResult.backlog;
  // Seed tasks with backlog containers; Wbs LLM appends leaves later
  next.planning.tasks = backlogNodesAsTasks(backlogResult.backlog);
  return next;
}

module.exports = {
  runBacklogMapEngine,
  backlogNodesAsTasks,
  applyBacklogToContainer,
};

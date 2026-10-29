/**
 * Map Gate1-approved Epic→Story SoT → planning.backlog (no invent).
 */

function normalizeRef(raw) {
  return String(raw || '').trim();
}

/** Drop temporary fr-from-cr chunk prefix from epic titles (`c0-EPIC-IOT` → `EPIC-IOT`). */
function stripChunkIdPrefix(raw) {
  return String(raw || '').replace(/^c\d+-/i, '');
}

function cleanEpicTitle(name, id) {
  const raw = String(name || '').trim();
  const cleanId = stripChunkIdPrefix(id) || id;
  if (!raw || raw === id || raw === cleanId) return cleanId;
  if (/^c\d+-/i.test(raw)) return stripChunkIdPrefix(raw) || raw;
  return raw;
}

/**
 * Resolve approvedBacklogStructure from pack / container / toolData.
 * @param {{ pack?: object, container?: object, toolData?: object, approvedBacklogStructure?: object }} opts
 * @returns {object|null}
 */
function resolveApprovedBacklogStructure(opts = {}) {
  if (opts.approvedBacklogStructure && typeof opts.approvedBacklogStructure === 'object') {
    return opts.approvedBacklogStructure;
  }
  const pack = opts.pack || {};
  const container = opts.container || {};
  const toolData = opts.toolData || {};
  const candidates = [
    toolData.approvedBacklogStructure,
    container?.analyses?.approvedBacklogStructure,
    pack?.aiAnalysis?.analyses?.approvedBacklogStructure,
    pack?.analyses?.approvedBacklogStructure,
    container?.planning?.approvedBacklogStructure,
  ];
  for (const c of candidates) {
    if (c && typeof c === 'object' && Array.isArray(c.stories)) return c;
  }
  return null;
}

/**
 * @param {object} structure — approvedBacklogStructure
 * @returns {{ backlog: object, meta: object }}
 */
function mapApprovedStructureToBacklog(structure) {
  const epicsIn = Array.isArray(structure?.epics) ? structure.epics : [];
  const featuresIn = Array.isArray(structure?.features) ? structure.features : [];
  const storiesIn = Array.isArray(structure?.stories) ? structure.stories : [];
  const epics = [];
  const epicIds = new Set();
  for (const e of epicsIn) {
    const rawId = normalizeRef(e?.id);
    if (!rawId) continue;
    const id = stripChunkIdPrefix(rawId) || rawId;
    if (epicIds.has(id)) continue;
    epicIds.add(id);
    epics.push({
      id,
      name: cleanEpicTitle(e.name || e.title, rawId),
      parentId: null,
      level: 'epic',
      sourceBgIds: Array.isArray(e.sourceBgIds) ? e.sourceBgIds.map(String) : [],
      sourceFrIds: Array.isArray(e.sourceFrIds) ? e.sourceFrIds.map(String) : [],
      epicOrigin: 'approved_backlog_structure',
    });
  }

  const features = [];
  const featureIds = new Set();
  for (const f of featuresIn) {
    const id = normalizeRef(f?.id);
    if (!id) continue;
    if (featureIds.has(id)) continue;
    featureIds.add(id);
    const parentEpicRaw =
      f.parentEpicId === undefined || f.parentEpicId === null || f.parentEpicId === ''
        ? null
        : normalizeRef(f.parentEpicId);
    const parentEpicId = parentEpicRaw
      ? stripChunkIdPrefix(parentEpicRaw) || parentEpicRaw
      : null;
    features.push({
      id,
      name: String(f.name || f.title || id).trim().slice(0, 240),
      parentId: parentEpicId && epicIds.has(parentEpicId) ? parentEpicId : null,
      level: 'feature',
      sourceFrIds: Array.isArray(f.sourceFrIds) ? f.sourceFrIds.map(String) : [],
      storyIds: Array.isArray(f.storyIds) ? f.storyIds.map(String) : [],
    });
  }

  const stories = [];
  const coveredFr = new Set();
  for (const s of storiesIn) {
    const id = normalizeRef(s?.id);
    if (!id) continue;
    const sourceFrIds = Array.isArray(s.sourceFrIds)
      ? s.sourceFrIds.map(normalizeRef).filter(Boolean)
      : [];
    if (!sourceFrIds.length) continue;
    for (const fr of sourceFrIds) coveredFr.add(fr);

    const parentFeatureRaw =
      s.parentFeatureId === undefined || s.parentFeatureId === null || s.parentFeatureId === ''
        ? null
        : normalizeRef(s.parentFeatureId);
    const parentFeatureId =
      parentFeatureRaw && featureIds.has(parentFeatureRaw) ? parentFeatureRaw : null;

    let parentId = null;
    const parentRaw =
      s.parentEpicId === undefined || s.parentEpicId === null || s.parentEpicId === ''
        ? null
        : normalizeRef(s.parentEpicId);
    const parentEpicId = parentRaw
      ? stripChunkIdPrefix(parentRaw) || parentRaw
      : null;
    if (parentFeatureId) {
      parentId = parentFeatureId;
    } else if (parentEpicId && epicIds.has(parentEpicId)) {
      parentId = parentEpicId;
    } else if (parentEpicId && !epicIds.has(parentEpicId)) {
      // Orphan epic ref — prefer null parent (root / independent story).
      parentId = null;
    }

    stories.push({
      id,
      name: String(s.name || s.title || id).trim().slice(0, 240),
      description: String(s.description || '').trim(),
      parentId,
      parentFeatureId: parentFeatureId || null,
      parentEpicId: parentFeatureId ? null : parentEpicId && epicIds.has(parentEpicId) ? parentEpicId : null,
      level: 'story',
      sourceFrIds,
      sourceUcIds: Array.isArray(s.sourceUcIds)
        ? s.sourceUcIds.map(String).filter(Boolean)
        : [],
      sourceNfrIds: [],
      sourceBgIds: Array.isArray(s.sourceBgIds) ? s.sourceBgIds.map(String) : [],
      sourceCapabilityIds: Array.isArray(s.sourceCapabilityIds)
        ? s.sourceCapabilityIds.map(String)
        : [],
      acRefs: Array.isArray(s.acRefs) ? s.acRefs.map(String).filter(Boolean) : [],
      needsDecomposition: s.needsDecomposition !== false,
    });
  }

  const unmappedFrIds = Array.isArray(structure?.unmappedFrIds)
    ? structure.unmappedFrIds.map(String)
    : [];

  const backlog = {
    epics,
    features,
    stories,
    unmappedFrIds,
    coverageByFrId: structure?.coverageByFrId || undefined,
    coverageByAcRef: structure?.coverageByAcRef || undefined,
    meta: {
      source: 'approved_backlog_structure',
      shapeVersion: structure?.meta?.shapeVersion || undefined,
      approvedBaselineVersion: structure?.meta?.approvedBaselineVersion || undefined,
      sourceSnapshotVersion: structure?.meta?.sourceSnapshotVersion || undefined,
      storyCount: stories.length,
      epicCount: epics.length,
      featureCount: features.length,
      frCoveredCount: coveredFr.size,
      unmappedCount: unmappedFrIds.length,
      nfrAnalysis: false,
    },
  };

  return {
    backlog,
    meta: backlog.meta,
  };
}

/**
 * @param {object} opts
 * @returns {{ ok: boolean, backlog?: object, meta: object }}
 */
function runBacklogStructureMap(opts = {}) {
  const structure = resolveApprovedBacklogStructure(opts);
  if (!structure || !Array.isArray(structure.stories) || !structure.stories.length) {
    return {
      ok: false,
      meta: {
        source: 'missing_approved_backlog_structure',
        reasonCodes: ['missing_approved_backlog_structure'],
        storyCount: 0,
        epicCount: 0,
      },
    };
  }

  const mapped = mapApprovedStructureToBacklog(structure);
  if (!mapped.backlog.stories.length) {
    return {
      ok: false,
      meta: {
        source: 'empty_approved_stories',
        reasonCodes: ['empty_approved_stories'],
        storyCount: 0,
        epicCount: mapped.backlog.epics.length,
      },
    };
  }

  return { ok: true, backlog: mapped.backlog, meta: mapped.meta };
}

module.exports = {
  resolveApprovedBacklogStructure,
  mapApprovedStructureToBacklog,
  runBacklogStructureMap,
};

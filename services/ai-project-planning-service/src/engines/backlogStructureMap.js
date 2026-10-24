/**
 * Map Gate1-approved Epic→Story SoT → planning.backlog (no invent).
 */

function normalizeRef(raw) {
  return String(raw || '').trim();
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
  const storiesIn = Array.isArray(structure?.stories) ? structure.stories : [];

  const epics = [];
  const epicIds = new Set();
  for (const e of epicsIn) {
    const id = normalizeRef(e?.id);
    if (!id || epicIds.has(id)) continue;
    epicIds.add(id);
    epics.push({
      id,
      name: String(e.name || id).trim(),
      parentId: null,
      level: 'epic',
      sourceBgIds: Array.isArray(e.sourceBgIds) ? e.sourceBgIds.map(String) : [],
      sourceFrIds: Array.isArray(e.sourceFrIds) ? e.sourceFrIds.map(String) : [],
      epicOrigin: 'approved_backlog_structure',
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

    let parentId = null;
    const parentEpicId =
      s.parentEpicId === undefined || s.parentEpicId === null || s.parentEpicId === ''
        ? null
        : normalizeRef(s.parentEpicId);
    if (parentEpicId && epicIds.has(parentEpicId)) {
      parentId = parentEpicId;
    } else if (parentEpicId && !epicIds.has(parentEpicId)) {
      // Orphan epic ref — promote story under synthetic? Prefer null parent (root story).
      parentId = null;
    }

    stories.push({
      id,
      name: String(s.name || id).trim().slice(0, 240),
      description: String(s.description || '').trim(),
      parentId,
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
    features: [],
    stories,
    unmappedFrIds,
    meta: {
      source: 'approved_backlog_structure',
      storyCount: stories.length,
      epicCount: epics.length,
      featureCount: 0,
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

/**
 * Stamp analyses.approvedBacklogStructure from Gate1-approved proposal tree.
 * Filters out rows rejected in review.decisions when present.
 */

function normalizeStructure(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const epics = Array.isArray(raw.epics) ? raw.epics : [];
  const stories = Array.isArray(raw.stories) ? raw.stories : [];
  if (!stories.length && !epics.length) return null;
  return {
    epics: epics.map((e) => ({
      id: String(e.id || '').trim(),
      name: String(e.name || e.title || e.id || '').trim(),
      description: e.description || e.goal || undefined,
      sourceFrIds: Array.isArray(e.sourceFrIds) ? e.sourceFrIds.map(String) : [],
      storyIds: Array.isArray(e.storyIds) ? e.storyIds.map(String) : [],
      rationale: e.rationale || undefined,
    })).filter((e) => e.id),
    stories: stories.map((s) => ({
      id: String(s.id || '').trim(),
      name: String(s.name || s.title || s.id || '').trim(),
      description: s.description || undefined,
      parentEpicId:
        s.parentEpicId === undefined || s.parentEpicId === null || s.parentEpicId === ''
          ? null
          : String(s.parentEpicId).trim(),
      sourceFrIds: Array.isArray(s.sourceFrIds) ? s.sourceFrIds.map(String) : [],
      sourceUcIds: Array.isArray(s.sourceUcIds) ? s.sourceUcIds.map(String) : [],
      acRefs: Array.isArray(s.acRefs) ? s.acRefs.map(String) : [],
      needsDecomposition: s.needsDecomposition !== false,
      rationale: s.rationale || undefined,
    })).filter((s) => s.id && Array.isArray(s.sourceFrIds) && s.sourceFrIds.length),
    features: [],
    unmappedFrIds: Array.isArray(raw.unmappedFrIds) ? raw.unmappedFrIds.map(String) : [],
    openQuestions: Array.isArray(raw.openQuestions) ? raw.openQuestions : [],
    meta: {
      ...(raw.meta && typeof raw.meta === 'object' ? raw.meta : {}),
      source: 'gate1_approved',
      approvedAt: new Date().toISOString(),
    },
  };
}

/**
 * @param {object|null} proposal — srsProposal
 * @returns {object|null}
 */
function materializeApprovedBacklogStructure(proposal) {
  const raw = proposal?.generated?.backlogStructure;
  const normalized = normalizeStructure(raw);
  if (!normalized) return null;

  const decisions =
    proposal?.review?.decisions && typeof proposal.review.decisions === 'object'
      ? proposal.review.decisions
      : {};

  function isRejected(id) {
    const d = decisions[id] || decisions[`backlogStructure:${id}`];
    const action = String(d?.action || '').toLowerCase();
    return action === 'reject' || action === 'rejected';
  }

  function applyEdit(id, row) {
    const d = decisions[id] || decisions[`backlogStructure:${id}`];
    if (!d || String(d.action || '').toLowerCase() !== 'edit') return row;
    const payload = d.editedPayload || d.payload || {};
    return {
      ...row,
      name: payload.title || payload.name || row.name,
      description: payload.description != null ? payload.description : row.description,
      acRefs:
        payload.ac != null
          ? String(payload.ac)
              .split(/;|\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          : row.acRefs,
    };
  }

  const epics = normalized.epics
    .filter((e) => !isRejected(e.id))
    .map((e) => applyEdit(e.id, e));
  const epicIds = new Set(epics.map((e) => e.id));
  const stories = normalized.stories
    .filter((s) => !isRejected(s.id))
    .map((s) => {
      const next = applyEdit(s.id, s);
      if (next.parentEpicId && !epicIds.has(next.parentEpicId)) {
        next.parentEpicId = null;
      }
      return next;
    });

  if (!stories.length) return null;

  for (const epic of epics) {
    epic.storyIds = stories
      .filter((s) => s.parentEpicId === epic.id)
      .map((s) => s.id);
  }

  return {
    ...normalized,
    epics,
    stories,
    meta: {
      ...normalized.meta,
      epicCount: epics.length,
      storyCount: stories.length,
    },
  };
}

module.exports = {
  materializeApprovedBacklogStructure,
  normalizeStructure,
};

/**
 * Resolve Gate1-approved stories for WbsTool (SoT) — no FR→Story invent.
 */

const { resolveApprovedBacklogStructure } = require('./backlogStructureMap');
const { isExcludedFromWbsDecomposition } = require('./backlogMap');

/**
 * @param {{
 *   pack?: object,
 *   container?: object,
 *   toolData?: object,
 *   approvedBacklogStructure?: object,
 * }} opts
 * @returns {{ ok: boolean, stories: object[], epics: object[], reasonCodes: string[] }}
 */
function resolveWbsStoriesFromSot(opts = {}) {
  const structure = resolveApprovedBacklogStructure(opts);
  const reasonCodes = [];

  // Prefer planning.backlog after BacklogMap map-only (same SoT content).
  const backlogStories = opts.container?.planning?.backlog?.stories;
  const fromBacklog = Array.isArray(backlogStories) ? backlogStories : null;

  let stories = [];
  let epics = [];

  if (fromBacklog?.length) {
    stories = fromBacklog.filter((s) => s && !isExcludedFromWbsDecomposition(s));
    epics = Array.isArray(opts.container?.planning?.backlog?.epics)
      ? opts.container.planning.backlog.epics
      : [];
  } else if (structure && Array.isArray(structure.stories)) {
    stories = structure.stories
      .filter((s) => s && Array.isArray(s.sourceFrIds) && s.sourceFrIds.length)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name || s.id),
        description: s.description || '',
        parentId: s.parentEpicId || null,
        sourceFrIds: [...s.sourceFrIds],
        sourceUcIds: Array.isArray(s.sourceUcIds) ? [...s.sourceUcIds] : [],
        sourceNfrIds: [],
        acRefs: Array.isArray(s.acRefs) ? [...s.acRefs] : [],
        needsDecomposition: s.needsDecomposition !== false,
      }))
      .filter((s) => !isExcludedFromWbsDecomposition(s));
    epics = Array.isArray(structure.epics) ? structure.epics : [];
  }

  if (!stories.length) {
    reasonCodes.push('missing_approved_backlog_stories');
    return { ok: false, stories: [], epics: [], reasonCodes };
  }

  return { ok: true, stories, epics, reasonCodes };
}

/** Map SoT stories → WBS LLM unit shape (id = story id). */
function storiesToWbsUnits(stories = []) {
  return (Array.isArray(stories) ? stories : []).map((s) => ({
    id: s.id,
    kind: 'story',
    name: s.name || s.id,
    description: s.description || '',
    fr: Array.isArray(s.sourceFrIds) ? s.sourceFrIds : Array.isArray(s.fr) ? s.fr : [],
    ac: Array.isArray(s.acRefs) ? s.acRefs : Array.isArray(s.ac) ? s.ac : [],
    uc: Array.isArray(s.sourceUcIds) ? s.sourceUcIds : Array.isArray(s.uc) ? s.uc : [],
    parentId: s.parentId || s.parentEpicId || null,
  }));
}

/** Unique FR ids cited on SoT stories (for semantic index). */
function collectStoryFrIds(stories = []) {
  const ids = new Set();
  for (const s of Array.isArray(stories) ? stories : []) {
    const list = Array.isArray(s?.sourceFrIds)
      ? s.sourceFrIds
      : Array.isArray(s?.fr)
        ? s.fr
        : [];
    for (const id of list) {
      const n = String(id || '').trim();
      if (n) ids.add(n);
    }
  }
  return [...ids];
}

/** Prompt/accept story payload (whitelist fields only). */
function storiesToPromptPayload(stories = []) {
  return storiesToWbsUnits(stories).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description || undefined,
    fr: s.fr,
    ac: s.ac,
    uc: s.uc,
  }));
}

module.exports = {
  resolveWbsStoriesFromSot,
  storiesToWbsUnits,
  collectStoryFrIds,
  storiesToPromptPayload,
};

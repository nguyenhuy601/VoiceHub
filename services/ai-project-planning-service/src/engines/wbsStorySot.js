/**
 * Resolve Gate1-approved stories for WbsTool (SoT) — no FR→Story invent.
 * WbsTool decomposes Stories only; Epics without Stories are reported, not invented.
 * Stories must pass AC contract (acRefs + FR.AC whitelist) before WBS.
 */

const { resolveApprovedBacklogStructure } = require('./backlogStructureMap');
const { isExcludedFromWbsDecomposition } = require('./backlogMap');
const { filterStoriesByAcContract, storyHasAcRefsShape } = require('./storyAcContract');

function collectFrItemsForAc(opts = {}) {
  const pack = opts.pack && typeof opts.pack === 'object' ? opts.pack : {};
  const fromPack = Array.isArray(pack.functionalRequirements) ? pack.functionalRequirements : [];
  if (fromPack.length) return fromPack;
  const toolFr = opts.toolData?.functionalRequirements;
  if (Array.isArray(toolFr) && toolFr.length) return toolFr;
  const proposalFr =
    opts.container?.analyses?.srsProposal?.generated?.functionalRequirements?.items;
  if (Array.isArray(proposalFr) && proposalFr.length) return proposalFr;
  return [];
}

/**
 * @param {{
 *   pack?: object,
 *   container?: object,
 *   toolData?: object,
 *   approvedBacklogStructure?: object,
 * }} opts
 * @returns {{
 *   ok: boolean,
 *   stories: object[],
 *   epics: object[],
 *   epicsWithoutStories: string[],
 *   reasonCodes: string[],
 *   rejectedStories?: object[],
 * }}
 */
function resolveWbsStoriesFromSot(opts = {}) {
  const structure = resolveApprovedBacklogStructure(opts);
  const reasonCodes = [];

  // Prefer Gate1 approvedBacklogStructure (FR+Epic one-shot stamp). Legacy
  // planning.backlog only if SoT missing (old runs that still had BacklogMap).
  let stories = [];
  let epics = [];

  if (structure && Array.isArray(structure.stories) && structure.stories.length) {
    stories = structure.stories
      .filter((s) => s && Array.isArray(s.sourceFrIds) && s.sourceFrIds.length)
      .map((s) => ({
        id: String(s.id),
        name: String(s.name || s.title || s.id),
        description: s.description || '',
        parentId: s.parentFeatureId || s.parentEpicId || null,
        parentFeatureId: s.parentFeatureId || null,
        parentEpicId: s.parentFeatureId ? null : s.parentEpicId || null,
        sourceFrIds: [...s.sourceFrIds],
        sourceUcIds: Array.isArray(s.sourceUcIds) ? [...s.sourceUcIds] : [],
        sourceNfrIds: [],
        acRefs: Array.isArray(s.acRefs) ? [...s.acRefs] : [],
        needsDecomposition: s.needsDecomposition !== false,
        approvedBaselineVersion: structure.meta?.approvedBaselineVersion || null,
        sourceSnapshotVersion: structure.meta?.sourceSnapshotVersion || null,
        howStale: Boolean(s.howStale),
      }))
      .filter((s) => !isExcludedFromWbsDecomposition(s));
    epics = Array.isArray(structure.epics) ? structure.epics : [];
  } else {
    const backlogStories = opts.container?.planning?.backlog?.stories;
    const fromBacklog = Array.isArray(backlogStories) ? backlogStories : null;
    if (fromBacklog?.length) {
      stories = fromBacklog.filter((s) => s && !isExcludedFromWbsDecomposition(s));
      epics = Array.isArray(opts.container?.planning?.backlog?.epics)
        ? opts.container.planning.backlog.epics
        : [];
    }
  }

  let rejectedStories = [];
  const frItems = collectFrItemsForAc(opts);
  if (stories.length && frItems.length) {
    const filtered = filterStoriesByAcContract(stories, frItems);
    rejectedStories = filtered.rejected;
    stories = filtered.stories;
    for (const code of filtered.reasonCodes) {
      if (!reasonCodes.includes(code)) reasonCodes.push(code);
    }
  } else if (stories.length && !frItems.length) {
    // No FR rows to resolve — fail-closed on empty acRefs shape only.
    const kept = [];
    for (const s of stories) {
      if (storyHasAcRefsShape(s)) {
        kept.push(s);
      } else {
        rejectedStories.push({
          id: String(s.id || ''),
          reasonCodes: ['MISSING_ACCEPTANCE_CRITERIA'],
          invalidRefs: [],
        });
        if (!reasonCodes.includes('MISSING_ACCEPTANCE_CRITERIA')) {
          reasonCodes.push('MISSING_ACCEPTANCE_CRITERIA');
        }
      }
    }
    stories = kept;
  }

  const storyParentIds = new Set(
    stories
      .map((s) => String(s.parentId || s.parentEpicId || '').trim())
      .filter(Boolean)
  );
  const epicsWithoutStories = (Array.isArray(epics) ? epics : [])
    .map((e) => String(e?.id || '').trim())
    .filter((id) => id && !storyParentIds.has(id));

  if (epicsWithoutStories.length) {
    reasonCodes.push('epic_missing_stories');
  }

  if (!stories.length) {
    if (!reasonCodes.includes('missing_approved_backlog_stories')) {
      reasonCodes.push('missing_approved_backlog_stories');
    }
    // Epic-only SoT cannot be decomposed — fix at WHAT, do not invent Stories here.
    if (epics.length) reasonCodes.push('epic_only_backlog_needs_what');
    return {
      ok: false,
      stories: [],
      epics,
      epicsWithoutStories,
      reasonCodes,
      rejectedStories,
    };
  }

  return { ok: true, stories, epics, epicsWithoutStories, reasonCodes, rejectedStories };
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

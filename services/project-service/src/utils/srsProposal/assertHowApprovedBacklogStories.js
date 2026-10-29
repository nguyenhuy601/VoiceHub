/**
 * HOW start hard-gate: require Gate1 backlog SoT (approvedBacklogStructure.stories).
 * Soft re-materialize from srsProposal when stamp missing but publishable draft exists.
 */

const {
  materializeApprovedBacklogStructure,
} = require('./materializeApprovedBacklogStructure');
const { filterStoriesByAcContract, storyHasAcRefsShape } = require('./storyAcContract');

function readPackAi(pack) {
  if (!pack || typeof pack !== 'object') return {};
  return pack.aiAnalysis && typeof pack.aiAnalysis === 'object' ? pack.aiAnalysis : {};
}

function storiesFromStructure(structure, pack = null) {
  if (!structure || typeof structure !== 'object') return [];
  let stories = (Array.isArray(structure.stories) ? structure.stories : []).filter(
    (s) => s && Array.isArray(s.sourceFrIds) && s.sourceFrIds.length
  );
  const frItems = Array.isArray(pack?.functionalRequirements) ? pack.functionalRequirements : [];
  if (stories.length && frItems.length) {
    return filterStoriesByAcContract(stories, frItems).stories;
  }
  // No FR rows — still require non-empty acRefs shape for HOW.
  return stories.filter(storyHasAcRefsShape);
}

/**
 * @param {object} pack — mongoose doc or lean
 * @returns {{ structure: object|null, stories: object[], rematerialized: boolean }}
 */
function resolveHowApprovedBacklogStories(pack) {
  const ai = readPackAi(pack);
  const stamped =
    ai.analyses?.approvedBacklogStructure && typeof ai.analyses.approvedBacklogStructure === 'object'
      ? ai.analyses.approvedBacklogStructure
      : null;
  let stories = storiesFromStructure(stamped, pack);
  if (stories.length) {
    return { structure: stamped, stories, rematerialized: false };
  }

  const proposal = ai.analyses?.srsProposal || null;
  const derived = materializeApprovedBacklogStructure(proposal);
  stories = storiesFromStructure(derived, pack);
  if (stories.length) {
    return { structure: derived, stories, rematerialized: true };
  }

  return { structure: derived || stamped, stories: [], rematerialized: false };
}

/**
 * @param {object} pack
 * @param {{ job?: string }} [opts]
 * @returns {{ structure: object|null, stories: object[], rematerialized: boolean }}
 */
function assertHowApprovedBacklogStories(pack, opts = {}) {
  const resolved = resolveHowApprovedBacklogStories(pack);
  if (resolved.stories.length) return resolved;

  const err = new Error(
    'Phase HOW yêu cầu Story SoT (approvedBacklogStructure) — duyệt Gate1 với FR+Epic hợp lệ rồi chạy lại.'
  );
  err.statusCode = 422;
  err.errorCode = 'AI_ANALYSIS_HOW_REQUIRES_BACKLOG_STORIES';
  err.details = {
    job: opts.job || undefined,
    storyCount: 0,
    hasStamp: Boolean(readPackAi(pack).analyses?.approvedBacklogStructure),
  };
  throw err;
}

/**
 * Status + Story SoT gate for HOW (pure; no mongoose).
 * @param {object} pack
 * @param {{ job?: string }} [opts]
 * @returns {{ structure: object|null, stories: object[], rematerialized: boolean }}
 */
function assertHowPackApprovedWithBacklogStories(pack, opts = {}) {
  const status = String(pack?.status || '');
  if (status !== 'approved' && status !== 'project_linked') {
    const err = new Error(
      'Planning AI jobs (WBS…Project Plan) yêu cầu Requirement pack đã approved — không chạy trên path SRS/Requirement draft'
    );
    err.statusCode = 422;
    err.errorCode = 'AI_ANALYSIS_HOW_REQUIRES_APPROVED';
    err.details = { status, job: opts.job || undefined };
    throw err;
  }
  return assertHowApprovedBacklogStories(pack, opts);
}

/**
 * Persist rematerialized SoT onto pack.aiAnalysis (caller saves).
 * @param {object} pack — mongoose doc preferred
 * @param {object} structure
 */
function stampApprovedBacklogStructureOnPack(pack, structure) {
  if (!pack || !structure || typeof structure !== 'object') return false;
  const { ensureAiAnalysisContainer } = require('../aiAnalysis/aiAnalysisContainer');
  const container = ensureAiAnalysisContainer(pack.aiAnalysis);
  container.analyses = {
    ...(container.analyses || {}),
    approvedBacklogStructure: structure,
  };
  pack.aiAnalysis = container;
  if (typeof pack.markModified === 'function') {
    pack.markModified('aiAnalysis');
  }
  return true;
}

module.exports = {
  resolveHowApprovedBacklogStories,
  assertHowApprovedBacklogStories,
  assertHowPackApprovedWithBacklogStories,
  stampApprovedBacklogStructureOnPack,
  storiesFromStructure,
};

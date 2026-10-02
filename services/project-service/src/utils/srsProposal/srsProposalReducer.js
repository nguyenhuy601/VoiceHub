/**
 * Section-scoped Proposal Reducer — applyProposalFragment(section) only.
 * Never blindly merge whole analyses blobs.
 * RULE-ONE-SECTION-WRITE-01: one section per call.
 */

const { createEmptySrsProposal, isSrsProposal } = require('./srsProposalSchema');
const { frLogicalId } = require('./logicalId');
const { REDUCER_SECTION_KEYS, isLegacySection } = require('./contracts/analysisSections');
const { normalizeProposalItem } = require('./contracts/proposalItem');

const SECTION_KEYS = new Set(REDUCER_SECTION_KEYS);

/**
 * @param {object|null} current
 * @param {{ section: string, items?: object[], relations?: object[], clarificationQuestions?: object[], evidence?: object|null, meta?: object, content?: object }} fragment
 * @param {{ generationId?: string, bumpProposalVersion?: boolean, allowLegacyWrite?: boolean }} [opts]
 */
function applyProposalFragment(current, fragment, opts = {}) {
  const base = isSrsProposal(current) ? structuredCloneSafe(current) : createEmptySrsProposal();
  const section = String(fragment?.section || '');
  if (!SECTION_KEYS.has(section)) {
    const err = new Error(`Unknown proposal section: ${section}`);
    err.code = 'UNKNOWN_PROPOSAL_SECTION';
    throw err;
  }

  // Analysis engines must not write legacy foundation sections
  if (isLegacySection(section) && opts.allowLegacyWrite !== true) {
    const err = new Error(`Legacy section write forbidden: ${section}`);
    err.code = 'LEGACY_SECTION_WRITE_FORBIDDEN';
    throw err;
  }

  if (section === 'synthesis') {
    base.generated.synthesis =
      fragment.content && typeof fragment.content === 'object'
        ? fragment.content
        : {
            summary: fragment.summary || null,
            insights: fragment.insights || [],
            coverageObservations: fragment.coverageObservations || [],
            gaps: fragment.gaps || [],
          };
  } else {
    const items = Array.isArray(fragment.items)
      ? fragment.items.map((it, i) =>
          normalizeProposalItem(
            {
              ...it,
              logicalId: it.logicalId || frLogicalId(it, i),
            },
            { index: i, section }
          )
        )
      : [];
    base.generated[section] = {
      items,
      relations: Array.isArray(fragment.relations) ? fragment.relations : [],
      clarificationQuestions: Array.isArray(fragment.clarificationQuestions)
        ? fragment.clarificationQuestions
        : [],
      evidence: fragment.evidence != null ? fragment.evidence : null,
      meta: { ...(fragment.meta || {}) },
    };
  }

  if (opts.generationId) base.generationId = String(opts.generationId);
  if (fragment.meta?.generationId) base.generationId = String(fragment.meta.generationId);
  if (opts.bumpProposalVersion !== false) {
    base.proposalVersion = Number(base.proposalVersion || 0) + 1;
  } else if (fragment.meta?.proposalVersion != null) {
    base.proposalVersion = Number(fragment.meta.proposalVersion);
  }
  base.meta = {
    ...(base.meta || {}),
    kind: base.meta?.kind || 'requirement_analysis_proposal',
    updatedAt: new Date().toISOString(),
    lastSection: section,
  };
  return base;
}

function structuredCloneSafe(obj) {
  try {
    return structuredClone(obj);
  } catch {
    return JSON.parse(JSON.stringify(obj));
  }
}

module.exports = {
  applyProposalFragment,
  SECTION_KEYS,
};

/**
 * Meta Gate — outside AnalysisEngineRegistry.
 * Cross-check + sectionReviews + completeness + gate1ReadinessPolicy.
 * Does not create domain Analysis items. Does not write srsDraft.
 */

const { runCrossChecks, buildSynthesisResult } = require('./crossSynthesis');
const { applyProposalFragment } = require('./srsProposalReducer');
const { computeAllSectionReviews } = require('./contracts/sectionReviewStatus');
const { computeGate1Readiness } = require('./gate1ReadinessPolicy');
const { ANALYSIS_PROPOSAL_KIND } = require('./contracts/analysisSections');

/**
 * @param {object} proposal
 * @param {{
 *   resultsById?: object,
 *   synthesis?: object,
 * }} [opts]
 */
function runMetaGate(proposal, opts = {}) {
  if (!proposal || typeof proposal !== 'object') return proposal;

  const resultsById = opts.resultsById || {};
  const bySection = {};
  for (const result of Object.values(resultsById)) {
    const section = result?.meta?.section;
    if (section) bySection[section] = result;
  }

  const cross = runCrossChecks(proposal);
  const sectionReviews = computeAllSectionReviews(proposal, bySection);
  const readiness = computeGate1Readiness(proposal, { sectionReviews, resultsById });

  const coverage = {};
  for (const rev of sectionReviews) {
    coverage[rev.section] = rev.reviewable
      ? 'COVERED'
      : rev.status === 'NO_DATA' || rev.status === 'EMPTY'
        ? 'MISSING'
        : 'PARTIAL';
  }

  let next = proposal;
  if (!next.generated?.synthesis || opts.synthesis) {
    const synthesis = buildSynthesisResult(
      opts.synthesis || {
        summary: 'Meta Gate: Analysis Proposal readiness (not SRS).',
        coverageObservations: sectionReviews.map((r) => ({
          section: r.section,
          reviewable: r.reviewable,
          status: r.status,
        })),
        gaps: readiness.softGaps,
      }
    );
    next = applyProposalFragment(
      next,
      { section: 'synthesis', content: synthesis },
      { bumpProposalVersion: false }
    );
  }

  next.completeness = {
    ...(next.completeness || {}),
    coverage,
    missingAreas: Object.entries(coverage)
      .filter(([, v]) => v === 'MISSING')
      .map(([k]) => k),
    readyForGate1: readiness.readyForGate1,
    missingForGate1: readiness.missingForGate1,
    sectionReviews,
    softGaps: readiness.softGaps,
    policy: readiness.policy,
  };

  next.meta = {
    ...(next.meta || {}),
    kind: next.meta?.kind || ANALYSIS_PROPOSAL_KIND,
    crossChecks: cross,
    updatedAt: new Date().toISOString(),
  };

  return next;
}

module.exports = {
  runMetaGate,
};

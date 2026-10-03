/**
 * Meta Gate — outside AnalysisEngineRegistry.
 * Cross-check + sectionReviews + completeness + gate1ReadinessPolicy.
 * RULE-META-01: Does not create domain Analysis items, no LLM, no derive, no srsDraft.
 */

const { runCrossChecks, buildSynthesisResult } = require('./crossSynthesis');
const { applyProposalFragment } = require('./srsProposalReducer');
const { computeAllSectionReviews } = require('./contracts/sectionReviewStatus');
const { computeGate1Readiness } = require('./gate1ReadinessPolicy');
const { ANALYSIS_PROPOSAL_KIND } = require('./contracts/analysisSections');

function countSection(proposal, section) {
  const items = proposal?.generated?.[section]?.items;
  return Array.isArray(items) ? items.length : 0;
}

/**
 * Pure decision payload — READY | NOT_READY.
 * @param {object} proposal
 * @param {{ readyForGate1: boolean, missingForGate1: string[], softGaps: object[] }} readiness
 * @param {object[]} sectionReviews
 */
function buildGateDecision(proposal, readiness, sectionReviews) {
  const coverageCounts = {
    FR: countSection(proposal, 'functionalRequirements'),
    NFR: countSection(proposal, 'nonFunctionalRequirements'),
    BR: countSection(proposal, 'businessRules'),
    BPM: countSection(proposal, 'processes'),
    UC: countSection(proposal, 'useCases'),
    BG: countSection(proposal, 'businessGoals'),
    Scope: countSection(proposal, 'scope'),
    Data: countSection(proposal, 'entities'),
    Interface: countSection(proposal, 'interfaces'),
  };

  const blockingIssues = (readiness.missingForGate1 || []).map((code) => ({
    code: String(code).toUpperCase(),
    section: String(code).startsWith('functional') ? 'FR' : code,
  }));

  const warnings = (readiness.softGaps || []).map((gap) => ({
    code: String(gap.reason || 'SOFT_GAP').toUpperCase(),
    section: gap.section,
  }));

  const decision = readiness.readyForGate1 ? 'READY' : 'NOT_READY';

  return {
    decision,
    coverage: coverageCounts,
    blockingIssues,
    warnings,
    sectionReviewCount: Array.isArray(sectionReviews) ? sectionReviews.length : 0,
    policy: readiness.policy || 'gate1_v1_hard_A',
  };
}

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
  const gateDecision = buildGateDecision(proposal, readiness, sectionReviews);

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
    gateDecision,
  };

  next.meta = {
    ...(next.meta || {}),
    kind: next.meta?.kind || ANALYSIS_PROPOSAL_KIND,
    crossChecks: cross,
    gateDecision,
    updatedAt: new Date().toISOString(),
  };

  return next;
}

module.exports = {
  runMetaGate,
  buildGateDecision,
};

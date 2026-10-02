/**
 * Deterministic completeness — delegates readiness to gate1ReadinessPolicy when possible.
 * Prefer metaGate.runMetaGate for full sectionReviews.
 */

const { computeGate1Readiness } = require('./gate1ReadinessPolicy');

function computeCompleteness(proposal) {
  const generated = proposal?.generated || {};
  const fr = generated.functionalRequirements?.items || [];
  const nfr = generated.nonFunctionalRequirements?.items || [];
  const rules = generated.businessRules?.items || [];
  const scope = generated.scope?.items || [];
  const evidence = generated.functionalRequirements?.evidence;

  const coverage = {
    functionalRequirements: fr.length > 0 ? 'COVERED' : 'MISSING',
    nonFunctionalRequirements: nfr.length > 0 ? 'COVERED' : 'PARTIAL',
    businessRules: rules.length > 0 ? 'COVERED' : 'PARTIAL',
    scope: scope.length > 0 ? 'COVERED' : 'PARTIAL',
    evidence: evidence ? 'COVERED' : 'PARTIAL',
  };

  const missingAreas = Object.entries(coverage)
    .filter(([, v]) => v === 'MISSING')
    .map(([k]) => k);

  const readiness = computeGate1Readiness(proposal, {
    sectionReviews: proposal?.completeness?.sectionReviews || [],
  });

  return {
    coverage,
    missingAreas,
    readyForGate1: readiness.readyForGate1,
    missingForGate1: readiness.missingForGate1,
    softGaps: readiness.softGaps,
    sectionReviews: proposal?.completeness?.sectionReviews || [],
    policy: readiness.policy,
  };
}

function applyCompleteness(proposal) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  const completeness = computeCompleteness(proposal);
  return { ...proposal, completeness };
}

module.exports = {
  computeCompleteness,
  applyCompleteness,
};

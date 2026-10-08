/**
 * Cross-check helpers. Synthesis hints only — Meta Gate owns full readiness.
 */

const { applyProposalFragment } = require('./srsProposalReducer');
const { applyCompleteness } = require('./completeness');

function runCrossChecks(proposal) {
  const fr = proposal?.generated?.functionalRequirements?.items || [];
  const uc = proposal?.generated?.useCases?.items || [];
  const issues = [];
  const frIds = new Set(fr.map((x) => x.logicalId || x.id));
  for (const u of uc) {
    for (const rid of u.relatedFrIds || []) {
      if (!frIds.has(rid)) {
        issues.push({ kind: 'uc_orphan_fr', useCaseId: u.logicalId, frId: rid });
      }
    }
  }
  return { ok: issues.length === 0, issues };
}

function buildSynthesisResult(input = {}) {
  return {
    summary: input.summary || input.legacySynthesis || null,
    insights: Array.isArray(input.insights) ? input.insights : [],
    coverageObservations: Array.isArray(input.coverageObservations)
      ? input.coverageObservations
      : [],
    gaps: Array.isArray(input.gaps) ? input.gaps : [],
  };
}

function applyCrossAndSynthesis(proposal, opts = {}) {
  const cross = runCrossChecks(proposal);
  const synthesis = buildSynthesisResult(opts.synthesis || {});
  let next = applyProposalFragment(
    proposal,
    { section: 'synthesis', content: synthesis },
    { bumpProposalVersion: true }
  );
  next = applyCompleteness(next);
  next.meta = {
    ...(next.meta || {}),
    crossChecks: cross,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

module.exports = {
  runCrossChecks,
  buildSynthesisResult,
  applyCrossAndSynthesis,
};

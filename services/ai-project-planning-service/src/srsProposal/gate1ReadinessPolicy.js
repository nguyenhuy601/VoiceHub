/**
 * Gate1 readiness policy (V1 hard-A) — sibling of Meta Gate.
 * Does NOT hard-require BR/BPM merely because empty.
 * RULE-READY-NOT-BY-COUNT-01: not items.length alone.
 */

const { ANALYSIS_SECTION_KEYS } = require('./contracts/analysisSections');

/**
 * @param {object} proposal
 * @param {{ sectionReviews?: object[], resultsById?: object }} [ctx]
 */
function computeGate1Readiness(proposal, ctx = {}) {
  const generated = proposal?.generated || {};
  const fr = generated.functionalRequirements?.items || [];
  const sectionReviews = Array.isArray(ctx.sectionReviews)
    ? ctx.sectionReviews
    : proposal?.completeness?.sectionReviews || [];

  const missingForGate1 = [];
  const softGaps = [];

  // Hard-A: at least one FR item
  if (fr.length === 0) {
    missingForGate1.push('functionalRequirements');
  }

  const frReview = sectionReviews.find((r) => r.section === 'functionalRequirements');
  if (fr.length > 0 && frReview && frReview.validation?.errors?.length) {
    missingForGate1.push('functionalRequirements_validation');
  }

  // Soft: any empty analysis section → gap note, not blocking (except FR already hard-checked)
  for (const key of ANALYSIS_SECTION_KEYS) {
    if (key === 'functionalRequirements') continue;
    const block = generated[key];
    const items = block?.items || [];
    if (items.length) continue;
    const review = sectionReviews.find((r) => r.section === key);
    const cov =
      review?.coverage?.status ||
      block?.meta?.coverage?.status ||
      '';
    const reason =
      review?.coverage?.reason ||
      block?.meta?.coverage?.reason ||
      cov ||
      'NO_DATA';
    softGaps.push({ section: key, reason });
  }

  const untraced = fr.filter(
    (item) => !Array.isArray(item.sourceRefs) || item.sourceRefs.length === 0
  );
  if (fr.length > 0 && untraced.length === fr.length) {
    softGaps.push({ section: 'functionalRequirements', reason: 'evidence_traceability' });
    // Soft: do not block Gate1 solely on missing refs (warnings path)
  }

  const readyForGate1 = missingForGate1.length === 0 && fr.length > 0;

  return {
    readyForGate1,
    missingForGate1,
    softGaps,
    policy: 'gate1_v1_hard_A',
  };
}

module.exports = {
  computeGate1Readiness,
};

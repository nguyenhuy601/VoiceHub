/**
 * Section review status — feeds Meta Gate / Gate1 Analysis Review.
 * Soft evidence: EXTRACTED + errors=0 can be reviewable even if some refs missing (warnings).
 */

const { hasEvidenceOrDerivation } = require('./evidenceRefs');
const { ANALYSIS_SECTION_KEYS } = require('./analysisSections');

/**
 * @param {string} section
 * @param {{ items?: object[], coverage?: object, validation?: object }} block
 * @param {{ requireEvidence?: boolean }} [opts]
 */
function computeSectionReview(section, block = {}, opts = {}) {
  const items = Array.isArray(block.items) ? block.items : [];
  const validation = block.validation || { errors: [], warnings: [] };
  const errors = Array.isArray(validation.errors) ? validation.errors : [];
  const warnings = Array.isArray(validation.warnings)
    ? [...validation.warnings]
    : [...warningsSafe(block)];
  const requireEvidence = opts.requireEvidence === true;

  let untraced = 0;
  for (const it of items) {
    if (!hasEvidenceOrDerivation(it)) untraced += 1;
  }
  if (untraced > 0 && !warnings.some((w) => String(w?.code || w) === 'MISSING_SOURCE_REFS')) {
    warnings.push({ code: 'MISSING_SOURCE_REFS', count: untraced });
  }

  const coverageStatus = String(block.coverage?.status || '').toUpperCase();
  const hasItems = items.length > 0;
  const noErrors = errors.length === 0;

  let reviewable = false;
  if (hasItems && noErrors) {
    if (requireEvidence) {
      reviewable = untraced === 0;
    } else {
      reviewable = true;
    }
  }

  const status = !hasItems
    ? coverageStatus === 'NO_DATA'
      ? 'NO_DATA'
      : 'EMPTY'
    : reviewable
      ? 'REVIEW_REQUIRED'
      : errors.length
        ? 'BLOCKED'
        : 'NOT_REVIEWABLE';

  return {
    section: String(section),
    status,
    reviewable,
    coverage: {
      sourceRows: block.coverage?.sourceStats?.sourceRows ?? items.length,
      mappedRows: block.coverage?.sourceStats?.mappedRows ?? items.length - untraced,
      orphanRows: block.coverage?.sourceStats?.orphanRows ?? untraced,
      status: coverageStatus || (hasItems ? 'AVAILABLE' : 'NO_DATA'),
      reason: block.coverage?.reason || null,
    },
    validation: { errors, warnings },
  };
}

function warningsSafe(block) {
  return Array.isArray(block?.meta?.warnings) ? block.meta.warnings : [];
}

/**
 * Always one review per ANALYSIS_SECTION_KEYS — never legacy actors/domain/context.
 * @param {object} proposal
 * @param {object} [engineResultsBySection]
 */
function computeAllSectionReviews(proposal, engineResultsBySection = {}) {
  const generated = proposal?.generated || {};
  const reviews = [];
  for (const section of ANALYSIS_SECTION_KEYS) {
    const block = generated[section] && typeof generated[section] === 'object' ? generated[section] : {};
    const fromEngine = engineResultsBySection[section];
    reviews.push(
      computeSectionReview(section, {
        items: block.items,
        coverage: fromEngine?.coverage || block.meta?.coverage,
        validation: fromEngine?.validation || block.meta?.validation || { errors: [], warnings: [] },
      })
    );
  }
  return reviews;
}

module.exports = {
  computeSectionReview,
  computeAllSectionReviews,
};

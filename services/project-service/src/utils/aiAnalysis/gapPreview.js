/**
 * Thin gap preview DTO for requirementAnalysis — no LLM / runGapAnalysis.
 */

const DEFAULT_HARD_BLOCK_NEXT_JOB = false;

const GAP_SEVERITY = Object.freeze(['low', 'medium', 'high', 'critical']);

function normalizeSeverity(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  if (t === 'med') return 'medium';
  if (GAP_SEVERITY.includes(t)) return t;
  return '';
}

function emptySeverityCounts() {
  return { low: 0, medium: 0, high: 0, critical: 0 };
}

function countBySeverity(items = []) {
  const counts = emptySeverityCounts();
  for (const item of items) {
    const s = normalizeSeverity(item?.severity);
    if (s) counts[s] += 1;
  }
  return counts;
}

function buildGapPolicyMeta(items = [], { hardBlockNextJob = DEFAULT_HARD_BLOCK_NEXT_JOB } = {}) {
  const severityCounts = countBySeverity(items);
  const reviewCount = severityCounts.high + severityCounts.critical;
  return {
    hardBlockNextJob: Boolean(hardBlockNextJob),
    baReviewRequired: reviewCount > 0,
    severityCounts,
    warningGapIds: items
      .filter((g) => g.severity === 'high' || g.severity === 'critical')
      .map((g) => g.gapId),
  };
}

/** Preview DTO extras for Job1 — gaps + CTA bổ sung FR. */
function buildRequirementAnalysisGapPreview(gapSection) {
  const items = Array.isArray(gapSection?.items) ? gapSection.items : [];
  const policy = buildGapPolicyMeta(items, {
    hardBlockNextJob:
      gapSection?.meta?.hardBlockNextJob === true
        ? true
        : DEFAULT_HARD_BLOCK_NEXT_JOB,
  });
  const warnings = items
    .filter((g) => g.severity === 'high' || g.severity === 'critical')
    .map((g) => ({
      gapId: g.gapId,
      type: g.type,
      severity: g.severity,
      issue: g.issue,
      relatedFrIds: g.relatedFrIds || [],
      recommendation: g.recommendation,
    }));

  return {
    gaps: items,
    severityCounts: policy.severityCounts,
    warnings,
    baReviewRequired: policy.baReviewRequired,
    hardBlockNextJob: policy.hardBlockNextJob,
    cta: {
      action: 'supplement_fr',
      labelKey: 'requirements.aiAnalysisGapCtaSupplementFr',
      descriptionKey: 'requirements.aiAnalysisGapCtaSupplementFrHint',
    },
  };
}

module.exports = {
  DEFAULT_HARD_BLOCK_NEXT_JOB,
  buildGapPolicyMeta,
  buildRequirementAnalysisGapPreview,
  countBySeverity,
};

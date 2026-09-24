/**
 * Format Planning baseline readiness lines for Overview / Approval UI.
 * Baseline only counts approved kinds — drafts look "missing" unless we split messages.
 */

/** Enrich readiness when API is older (no draft/absent split) using summary.byKind. */
export function enrichPlanningBaselineReadiness(readiness, byKind = {}) {
  if (!readiness) return null;
  if (
    Array.isArray(readiness.requiredDraftOnly) &&
    Array.isArray(readiness.requiredAbsent)
  ) {
    return readiness;
  }
  const missing = Array.isArray(readiness.missingRequired) ? readiness.missingRequired : [];
  const requiredDraftOnly = missing.filter((k) => Number(byKind?.[k]?.total ?? 0) > 0);
  const requiredAbsent = missing.filter((k) => Number(byKind?.[k]?.total ?? 0) <= 0);
  return { ...readiness, requiredDraftOnly, requiredAbsent };
}

export function formatPlanningBaselineReadinessLines(readiness, t) {
  if (!readiness) return [];
  if (readiness.ok) {
    return [t('workspace.phase1BaselineReadyOk')];
  }
  const lines = [];
  const draftOnly = Array.isArray(readiness.requiredDraftOnly)
    ? readiness.requiredDraftOnly
    : [];
  const absent = Array.isArray(readiness.requiredAbsent) ? readiness.requiredAbsent : [];
  const missing = Array.isArray(readiness.missingRequired) ? readiness.missingRequired : [];

  if (draftOnly.length) {
    lines.push(
      t('workspace.phase1BaselineDraftOnlyRequired', {
        kinds: draftOnly.join(', '),
      })
    );
  }
  if (absent.length) {
    lines.push(
      t('workspace.phase1BaselineAbsentRequired', {
        kinds: absent.join(', '),
      })
    );
  }
  if (!draftOnly.length && !absent.length && missing.length) {
    lines.push(
      t('workspace.phase1BaselineMissingRequired', {
        kinds: missing.join(', ') || '—',
      })
    );
  }
  if ((readiness.missingRecommended || []).length) {
    lines.push(
      t('workspace.phase1BaselineMissingRecommended', {
        kinds: readiness.missingRecommended.join(', '),
      })
    );
  }
  return lines;
}

export function formatPlanningBaselineReadinessSummary(readiness, t, loadingLabel) {
  if (!readiness) return loadingLabel || '';
  const lines = formatPlanningBaselineReadinessLines(readiness, t);
  return lines[0] || t('workspace.phase1BaselineMissingRequired', { kinds: '—' });
}

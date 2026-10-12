/**
 * Display Gate A advisory quality checks (duplicates / missing sections / consistency…).
 * Does not block Gate 1 approve — warnings only.
 */

const CHECK_LABEL_KEYS = {
  duplicates: 'requirements.gateACheckDuplicates',
  missing_sections: 'requirements.gateACheckMissingSections',
  coverage: 'requirements.gateACheckCoverage',
  consistency: 'requirements.gateACheckConsistency',
  completeness: 'requirements.gateACheckCompleteness',
  ambiguity: 'requirements.gateACheckAmbiguity',
};

function formatRatio(value) {
  if (value == null || Number.isNaN(Number(value))) return '—';
  const n = Number(value);
  if (n >= 0 && n <= 1) return `${Math.round(n * 100)}%`;
  return String(n);
}

function formatCheckValue(check) {
  if (!check || check.value == null) return '—';
  if (check.id === 'coverage' || check.id === 'completeness') {
    return formatRatio(check.value);
  }
  return String(check.value);
}

function formatThreshold(check) {
  if (!check || check.threshold == null) return null;
  if (check.id === 'coverage' || check.id === 'completeness') {
    return formatRatio(check.threshold);
  }
  return String(check.threshold);
}

function checkLabel(id, t) {
  const key = CHECK_LABEL_KEYS[id];
  if (key) {
    const translated = t(key);
    if (translated && translated !== key) return translated;
  }
  const fallbacks = {
    duplicates: 'Trùng dữ liệu AI generate',
    missing_sections: 'Các cột/section đang thiếu dữ liệu',
    coverage: 'Coverage (tham khảo — không chặn)',
    consistency: 'Consistency (xung đột)',
    completeness: 'Completeness (đủ field FR)',
    ambiguity: 'Ambiguity (mơ hồ)',
  };
  return fallbacks[id] || id;
}

/**
 * @param {{ gateA: { passed: boolean, hasWarnings?: boolean, checks?: array } | null, t?: function, className?: string }} props
 */
export default function GateAChecksPanel({ gateA = null, t = (k) => k, className = '' }) {
  if (!gateA || typeof gateA !== 'object') return null;

  const checks = Array.isArray(gateA.checks) ? gateA.checks : [];
  const visibleChecks = checks.filter((c) => c && !c.skipped);
  const skippedCoverage = checks.filter((c) => c?.id === 'coverage' && c.skipped);
  const hasWarnings =
    gateA.hasWarnings === true ||
    gateA.passed === false ||
    visibleChecks.some((c) => c && c.passed === false);
  const failed = visibleChecks.filter((c) => c && c.passed === false);

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        hasWarnings
          ? 'border-amber-500/40 bg-amber-500/5'
          : 'border-emerald-500/40 bg-emerald-500/5'
      } ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p
        className={`text-sm font-medium ${
          hasWarnings
            ? 'text-amber-800 dark:text-amber-300'
            : 'text-emerald-700 dark:text-emerald-400'
        }`}
      >
        {hasWarnings
          ? t('requirements.gateAHasWarnings') ||
            'Gate A: có cảnh báo — không chặn duyệt'
          : t('requirements.gateAPassed') || 'Gate A: không có cảnh báo'}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('requirements.gateAAdvisoryHint') ||
          'Chỉ thông báo chất lượng (trùng AI / section thiếu). PO vẫn duyệt Gate 1 bình thường.'}
      </p>
      {hasWarnings && failed.length > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('requirements.gateAFailedSummary', { count: failed.length }) ||
            `${failed.length} tiêu chuẩn cần lưu ý`}
        </p>
      ) : null}
      {visibleChecks.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {visibleChecks.map((c) => {
            const id = c?.id || 'check';
            const ok = c?.passed === true;
            const threshold = formatThreshold(c);
            return (
              <li
                key={id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs"
              >
                <span className="text-foreground">
                  <span
                    className={`mr-1.5 inline-block font-semibold ${
                      ok
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-300'
                    }`}
                    aria-hidden
                  >
                    {ok ? '✓' : '!'}
                  </span>
                  {checkLabel(id, t)}
                </span>
                <span className="font-mono text-muted-foreground">
                  {formatCheckValue(c)}
                  {threshold != null ? (
                    <span className="text-muted-foreground/80">
                      {' '}
                      / {t('requirements.gateAThreshold') || 'ngưỡng'} {threshold}
                    </span>
                  ) : null}
                  <span className="ml-1.5 font-sans font-medium">
                    {ok
                      ? t('requirements.gateACheckPass') || 'đạt'
                      : t('requirements.gateACheckWarn') || 'cảnh báo'}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('requirements.gateANoChecks') || 'Chưa có chi tiết từng tiêu chuẩn trong kết quả Gate A.'}
        </p>
      )}
      {skippedCoverage.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('requirements.gateACoverageSkippedHint') ||
            'Coverage (độ phủ FR) chỉ tham khảo — không dùng để chặn duyệt.'}
          {skippedCoverage[0]?.value != null
            ? ` · ${formatRatio(skippedCoverage[0].value)}`
            : ''}
        </p>
      ) : null}
    </div>
  );
}

export { formatCheckValue, formatThreshold, checkLabel, CHECK_LABEL_KEYS };

/**
 * Display Gate A requirement-quality checks (coverage / consistency / completeness / ambiguity).
 */

const CHECK_LABEL_KEYS = {
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
    coverage: 'Coverage (độ phủ FR)',
    consistency: 'Consistency (xung đột)',
    completeness: 'Completeness (đủ field FR)',
    ambiguity: 'Ambiguity (mơ hồ)',
  };
  return fallbacks[id] || id;
}

/**
 * @param {{ gateA: { passed: boolean, checks?: array } | null, t?: function, className?: string }} props
 */
export default function GateAChecksPanel({ gateA = null, t = (k) => k, className = '' }) {
  if (!gateA || typeof gateA !== 'object') return null;

  const checks = Array.isArray(gateA.checks) ? gateA.checks : [];
  const passed = Boolean(gateA.passed);
  const failed = checks.filter((c) => c && c.passed === false);

  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        passed
          ? 'border-emerald-500/40 bg-emerald-500/5'
          : 'border-amber-500/40 bg-amber-500/5'
      } ${className}`.trim()}
      role="status"
      aria-live="polite"
    >
      <p
        className={`text-sm font-medium ${
          passed ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-800 dark:text-amber-300'
        }`}
      >
        {passed
          ? t('requirements.gateAPassed') || 'Gate A: đạt'
          : t('requirements.gateANotPassed') || 'Gate A: chưa đạt (cần sửa hoặc force duyệt)'}
      </p>
      {!passed && failed.length > 0 ? (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t('requirements.gateAFailedSummary', { count: failed.length }) ||
            `${failed.length} tiêu chuẩn chưa đạt`}
        </p>
      ) : null}
      {checks.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {checks.map((c) => {
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
                      ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'
                    }`}
                    aria-hidden
                  >
                    {ok ? '✓' : '✗'}
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
                      : t('requirements.gateACheckFail') || 'chưa đạt'}
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
    </div>
  );
}

export { formatCheckValue, formatThreshold, checkLabel, CHECK_LABEL_KEYS };

/**
 * Display Gate A advisory quality checks (duplicates / missing sections / consistency…).
 * Compact: warning icon (click → details) or green Gate badge when all pass.
 * Does not block Gate 1 approve — warnings only.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { isLlmInsufficientReason } from '../../utils/customerRawFormSummary';

const CHECK_LABEL_KEYS = {
  duplicates: 'requirements.gateACheckDuplicates',
  missing_sections: 'requirements.gateACheckMissingSections',
  coverage: 'requirements.gateACheckCoverage',
  consistency: 'requirements.gateACheckConsistency',
  completeness: 'requirements.gateACheckCompleteness',
  ambiguity: 'requirements.gateACheckAmbiguity',
};

/** Display names for Analysis Proposal section keys (Gate A missing_sections). */
const SECTION_DISPLAY = Object.freeze({
  businessGoals: 'Business Goals (BG)',
  businessRules: 'Business Rules (BR)',
  processes: 'Processes / BPM',
  functionalRequirements: 'Functional Requirements (FR)',
  useCases: 'Use Cases (UC)',
  nonFunctionalRequirements: 'Non-Functional Requirements (NFR)',
  scope: 'Scope',
  entities: 'Entities / Data',
  actors: 'Actors',
  domain: 'Domain',
  context: 'Context',
});

/** Sheet-empty / source-unavailable — not Gate A "thiếu đề xuất" (align BE SOURCE_ABSENCE_REASONS). */
function isSourceAbsenceReason(reason) {
  const r = String(reason || '').trim().toUpperCase();
  if (!r) return false;
  if (r === 'INTAKE_SOURCE_UNAVAILABLE') return true;
  return isLlmInsufficientReason(r);
}

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

function sectionDisplayName(sectionKey) {
  const key = String(sectionKey || '').trim();
  if (!key) return '';
  return SECTION_DISPLAY[key] || key;
}

/**
 * Normalize missing_sections check.detail → [{ section, reason, label }].
 * Drops sheet-empty / source-unavailable rows (stale Gate A snapshots).
 * @param {unknown} detail
 */
function listMissingSectionRows(detail) {
  if (!Array.isArray(detail)) return [];
  const out = [];
  for (const row of detail) {
    if (!row || typeof row !== 'object') continue;
    const section = String(row.section || '').trim();
    if (!section) continue;
    const reason = String(row.reason || '').trim();
    if (isSourceAbsenceReason(reason)) continue;
    out.push({
      section,
      reason,
      label: sectionDisplayName(section),
    });
  }
  return out;
}

/** Effective pass for UI — missing_sections with only sheet-empty detail counts as pass. */
function isCheckEffectivelyOk(check) {
  if (!check) return true;
  if (check.passed === true) return true;
  if (check.id !== 'missing_sections') return check.passed !== false;
  if (!Array.isArray(check.detail)) return check.passed !== false;
  return listMissingSectionRows(check.detail).length === 0;
}

function GateAChecksDetailBody({
  t,
  hasWarnings,
  failed,
  visibleChecks,
  skippedCoverage,
}) {
  return (
    <>
      <p
        className={`text-sm font-semibold ${
          hasWarnings
            ? 'text-amber-950 dark:text-amber-100'
            : 'text-emerald-950 dark:text-emerald-100'
        }`}
      >
        {hasWarnings
          ? t('requirements.gateAHasWarnings')
          : t('requirements.gateAPassed')}
      </p>
      <p className="mt-0.5 text-xs text-foreground/80">
        {t('requirements.gateAAdvisoryHint')}
      </p>
      {hasWarnings && failed.length > 0 ? (
        <p className="mt-0.5 text-xs font-medium text-amber-900 dark:text-amber-200">
          {t('requirements.gateAFailedSummary', { count: failed.length }) ||
            `${failed.length} tiêu chuẩn cần lưu ý`}
        </p>
      ) : null}
      {visibleChecks.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {visibleChecks.map((c) => {
            const id = c?.id || 'check';
            const ok = isCheckEffectivelyOk(c);
            const threshold = formatThreshold(c);
            const missingRows =
              id === 'missing_sections' && !ok ? listMissingSectionRows(c.detail) : [];
            const displayValue =
              id === 'missing_sections' && Array.isArray(c?.detail)
                ? String(listMissingSectionRows(c.detail).length)
                : formatCheckValue(c);
            return (
              <li key={id} className="text-xs">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
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
                    {displayValue}
                    {threshold != null ? (
                      <span className="text-muted-foreground/80">
                        {' '}
                        / {t('requirements.gateAThreshold')} {threshold}
                      </span>
                    ) : null}
                    <span className="ml-1.5 font-sans font-medium">
                      {ok
                        ? t('requirements.gateACheckPass')
                        : t('requirements.gateACheckWarn')}
                    </span>
                  </span>
                </div>
                {missingRows.length > 0 ? (
                  <ul className="mt-1 ml-5 list-disc space-y-0.5 text-[11px] text-amber-900/90 dark:text-amber-200/90">
                    {missingRows.map((row) => (
                      <li key={row.section}>
                        <span className="font-medium">{row.label}</span>
                        <span className="font-mono text-muted-foreground"> ({row.section})</span>
                        {row.reason ? (
                          <span className="text-muted-foreground"> — {row.reason}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          {t('requirements.gateANoChecks')}
        </p>
      )}
      {skippedCoverage.length > 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t('requirements.gateACoverageSkippedHint')}
          {skippedCoverage[0]?.value != null
            ? ` · ${formatRatio(skippedCoverage[0].value)}`
            : ''}
        </p>
      ) : null}
    </>
  );
}

/**
 * @param {{ gateA: { passed: boolean, hasWarnings?: boolean, checks?: array } | null, t?: function, className?: string }} props
 */
export default function GateAChecksPanel({ gateA = null, t = (k) => k, className = '' }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();

  useEffect(() => {
    if (!detailsOpen) return undefined;
    const onDocPointer = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setDetailsOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailsOpen(false);
    };
    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [detailsOpen]);

  if (!gateA || typeof gateA !== 'object') return null;

  const checks = Array.isArray(gateA.checks) ? gateA.checks : [];
  const visibleChecks = checks.filter((c) => c && !c.skipped);
  const skippedCoverage = checks.filter((c) => c?.id === 'coverage' && c.skipped);
  const failed = visibleChecks.filter((c) => !isCheckEffectivelyOk(c));
  const hasWarnings = failed.length > 0;

  const detailBody = (
    <GateAChecksDetailBody
      t={t}
      hasWarnings={hasWarnings}
      failed={failed}
      visibleChecks={visibleChecks}
      skippedCoverage={skippedCoverage}
    />
  );

  if (!hasWarnings) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 rounded-full border border-emerald-600/40 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800 shadow-sm dark:bg-emerald-950/50 dark:text-emerald-100 ${className}`.trim()}
        role="status"
        aria-live="polite"
      >
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{t('requirements.gateAGreenLabel')}</span>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={`relative inline-flex ${className}`.trim()}>
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-full border border-amber-600/50 bg-amber-50 px-2 py-1 text-amber-900 shadow-sm transition-colors hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-900/60"
        onClick={() => setDetailsOpen((v) => !v)}
        aria-expanded={detailsOpen}
        aria-controls={panelId}
        aria-label={
          t('requirements.gateAWarnAria', { count: failed.length }) ||
          `Cảnh báo Gate A (${failed.length}) — nhấn để xem chi tiết`
        }
        title={
          t('requirements.gateAHasWarnings')
        }
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
        {failed.length > 0 ? (
          <span className="min-w-[1rem] text-center text-[11px] font-bold tabular-nums">
            {failed.length}
          </span>
        ) : null}
      </button>

      {detailsOpen ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={t('requirements.gateAPanelTitle')}
          className="absolute left-0 top-full z-40 mt-1.5 w-[min(24rem,calc(100vw-2rem))] rounded-md border border-amber-600/50 bg-amber-50 px-3 py-2 shadow-lg dark:bg-amber-950/95"
        >
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-900/80 dark:text-amber-200/80">
              {t('requirements.gateAPanelTitle')}
            </p>
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-amber-800/70 hover:bg-amber-200/60 hover:text-amber-950 dark:text-amber-200/70 dark:hover:bg-amber-900/80"
              onClick={() => setDetailsOpen(false)}
              aria-label={t('common.close')}
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {detailBody}
        </div>
      ) : null}
    </div>
  );
}

export {
  formatCheckValue,
  formatThreshold,
  checkLabel,
  CHECK_LABEL_KEYS,
  listMissingSectionRows,
  isCheckEffectivelyOk,
  isSourceAbsenceReason,
  sectionDisplayName,
  SECTION_DISPLAY,
};

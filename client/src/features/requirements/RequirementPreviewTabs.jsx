import RequirementExcelPreviewGrid from './RequirementExcelPreviewGrid';
import { getPlanningReadinessTone } from '../../utils/requirementImportReadiness';
import { resolveSeverityFilter } from '../../utils/requirementIssueHints';

function planningScoreClass(tone) {
  if (tone === 'destructive') return 'font-medium text-destructive';
  if (tone === 'success') return 'font-medium text-emerald-700 dark:text-emerald-300';
  if (tone === 'warning') return 'font-medium text-amber-800 dark:text-amber-200';
  return 'text-muted-foreground';
}

function readinessStripClass(tone) {
  if (tone === 'destructive') {
    return 'border-destructive/30 bg-destructive/10 text-destructive';
  }
  if (tone === 'success') {
    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200';
  }
  if (tone === 'warning') {
    return 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200';
  }
  return '';
}

/**
 * Import preview — issue-focused Excel rows (no requirement tree, no full-file browse).
 */
export default function RequirementPreviewTabs({
  fileName = '',
  valid = null,
  errorCount = 0,
  warningCount = 0,
  infoCount = 0,
  summary = null,
  excelPreview = null,
  issues = [],
  labels = {},
  headerExtra = null,
  className = '',
  fillParent = false,
  planningReadiness = null,
  previewMode = 'import',
}) {
  const sheetCount = excelPreview?.sheetCount ?? excelPreview?.sheets?.length ?? 0;
  const totalRows = excelPreview?.totalRows ?? 0;
  const displayName = fileName || excelPreview?.fileName || '—';
  const readinessTone = getPlanningReadinessTone(planningReadiness);
  const planningScore = planningReadiness?.score;
  const missingLeafIds = planningReadiness?.missingLeafIds || [];
  const showReadinessStrip =
    planningReadiness &&
    (missingLeafIds.length > 0 ||
      planningReadiness.allLeavesStaffed !== true ||
      (planningReadiness.allLeavesStaffed === true && planningScore != null && planningScore < 80));

  const severityFilter = resolveSeverityFilter(errorCount, warningCount, infoCount);
  const hasIssues = severityFilter != null;
  const isPackMode = previewMode === 'pack';

  const shellHeightClass = fillParent ? 'h-full min-h-0' : 'h-[min(70vh,42rem)]';

  return (
    <div
      className={`flex ${shellHeightClass} flex-col overflow-hidden rounded-lg border border-border bg-muted/30 text-sm ${className}`}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            <span className="truncate">{displayName}</span>
            {valid != null && !isPackMode ? (
              <span
                className={
                  valid
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-destructive'
                }
              >
                {valid ? labels.parsedOk || '✓ Parsed' : labels.parsedFail || '✕ Invalid'}
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {labels.meta
              ? labels.meta
                  .replace('{sheets}', String(sheetCount))
                  .replace('{rows}', String(totalRows))
              : `${sheetCount} sheets · ${totalRows} rows`}
            {summary ? (
              <span>
                {' '}
                · FR: {summary.functionalCount ?? 0} · NFR: {summary.nfrCount ?? 0} · Scope:{' '}
                {summary.scopeCount ?? 0}
              </span>
            ) : null}
            {errorCount || warningCount || infoCount ? (
              <span>
                {' '}
                · {errorCount} errors, {warningCount} warnings
                {infoCount ? `, ${infoCount} notes` : ''}
              </span>
            ) : null}
            {planningScore != null ? (
              <span>
                {' '}
                ·{' '}
                <span className={planningScoreClass(readinessTone)}>
                  {labels.planningScore
                    ? labels.planningScore.replace('{score}', String(planningScore))
                    : `Planning ${planningScore}%`}
                </span>
              </span>
            ) : null}
          </div>
        </div>
        {headerExtra}
      </div>

      {showReadinessStrip ? (
        <div
          className={`shrink-0 border-b px-3 py-2 text-xs ${readinessStripClass(readinessTone)}`}
        >
          {missingLeafIds.length > 0 ? (
            <p>
              {labels.missingLeafStaffing
                ? labels.missingLeafStaffing.replace(
                    '{ids}',
                    missingLeafIds.slice(0, 8).join(', ')
                  )
                : `Hàng thực thi thiếu staffing: ${missingLeafIds.slice(0, 8).join(', ')}`}
            </p>
          ) : planningReadiness?.allLeavesStaffed !== true ? (
            <p>{labels.planningNotReady || 'Chưa đủ staffing trên hàng thực thi (Story/Task/Subtask).'}</p>
          ) : planningScore != null && planningScore < 80 ? (
            <p>
              {labels.previewPlanningLowScore
                ? labels.previewPlanningLowScore.replace('{score}', String(planningScore))
                : `Planning ${planningScore}% — có thể thiếu deadline hoặc thông tin overview.`}
            </p>
          ) : null}
        </div>
      ) : null}

      {excelPreview?.derivedFromPack ? (
        <div
          className={`shrink-0 border-b border-border px-3 py-2 text-xs ${
            isPackMode
              ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
          }`}
        >
          {isPackMode
            ? labels.previewPackProcessed ||
              'Post-import view — parent Effort Hours rolled up; new skills show registry status.'
            : labels.derivedFromPackHint ||
              'View reconstructed from saved pack data (not the original Excel bytes).'}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
        {!hasIssues ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-8 text-center">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              {isPackMode
                ? labels.previewPackReady ||
                  'Post-import data processed — no blocking issues.'
                : labels.previewNoIssues || 'No errors or warnings — file is ready to import.'}
            </p>
          </div>
        ) : (
          <RequirementExcelPreviewGrid
            className="h-full min-h-0 flex-1"
            excelPreview={excelPreview}
            issues={issues}
            severityFilter={severityFilter}
            emptyLabel={labels.noExcelPreview || labels.emptyExcel || 'No Excel preview'}
            labels={labels}
          />
        )}
      </div>
    </div>
  );
}

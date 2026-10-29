/**
 * Gate2 / HOW Monitor — drill-down chi tiết Test Case (steps, preconditions, data).
 * Pattern: Gate2SprintScopePanel (modal overlay). Decision actions sống trên bảng HITL.
 */

import { X } from 'lucide-react';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  if (value == null || value === '' || value === key) return fallback;
  return value;
}

function DetailList({ title, items, empty }) {
  return (
    <div>
      <p className="font-medium text-foreground">{title}</p>
      {items?.length ? (
        <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function executionLabel(row, t) {
  const status = String(row?.executionStatus || '').toLowerCase();
  if (status === 'passed') {
    return labelOf(t, 'requirements.qualityReviewPassed', 'Đạt');
  }
  if (status === 'failed') {
    return labelOf(t, 'requirements.qualityReviewFailed', 'Không đạt');
  }
  return labelOf(t, 'requirements.qualityReviewNotRun', 'Chưa chạy');
}

export default function Gate2TcDetailPanel({ row = null, onClose, t }) {
  if (!row) return null;

  const missing = labelOf(t, 'requirements.qualityReviewMissing', 'Chưa có');
  const meta = [row.testLevel || row.level, row.testType, row.scenarioType, row.sourceUcKey]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gate2-tc-detail-title"
      onClick={onClose}
    >
      <div
        className="vh-motion-respect flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] text-muted-foreground">{row.id || '—'}</p>
            <h2 id="gate2-tc-detail-title" className="truncate text-base font-semibold">
              {row.title || row.id || '—'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[meta, executionLabel(row, t)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button
            type="button"
            className="vh-motion-btn rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={onClose}
            aria-label={labelOf(t, 'common.close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 text-xs">
          {row.objective ? <p className="text-sm text-foreground">{row.objective}</p> : null}

          <DetailList
            title={labelOf(t, 'requirements.qualityReviewPreconditions', 'Điều kiện tiền đề')}
            items={row.preconditions}
            empty={missing}
          />

          <div>
            <p className="font-medium text-foreground">
              {labelOf(t, 'requirements.qualityReviewData', 'Dữ liệu kiểm thử')}
            </p>
            {row.testData?.length ? (
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                {row.testData.map((item) => (
                  <li key={`${item.field}-${item.value}`}>
                    <span className="text-foreground">{item.field}</span>: {item.value}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">{missing}</p>
            )}
          </div>

          <div>
            <p className="font-medium text-foreground">
              {labelOf(t, 'requirements.qualityReviewSteps', 'Các bước')}
            </p>
            {row.steps?.length ? (
              <ol className="mt-1 space-y-2">
                {row.steps.map((step, index) => (
                  <li key={step.stepNo || index}>
                    <p className="text-foreground">
                      {step.stepNo || index + 1}. {step.action}
                    </p>
                    <p className="text-muted-foreground">
                      {labelOf(t, 'requirements.qualityReviewExpected', 'Kết quả mong đợi')}:{' '}
                      {step.expectedResult}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-muted-foreground">{missing}</p>
            )}
          </div>

          <p className="text-muted-foreground">
            {labelOf(t, 'requirements.qualityReviewSources', 'Nguồn')}:{' '}
            {(row.sourceRefs || []).map((ref) => `${ref.type} ${ref.id}`).join(' · ') || '—'}
          </p>

          {row.missingInformation ? (
            <p className="text-amber-800 dark:text-amber-200">{row.missingInformation}</p>
          ) : null}

          {row.scenarioType ? (
            <p className="text-muted-foreground">
              {labelOf(t, 'requirements.gate2ColScenarioType', 'Kịch bản')}: {row.scenarioType}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

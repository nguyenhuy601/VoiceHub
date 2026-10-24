/**
 * Gate 2 / HOW Monitor — danh sách Test Case để rà soát.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  const text = value == null || value === '' || value === key ? fallback : value;
  if (!vars) return text;
  return Object.entries(vars).reduce(
    (next, [name, raw]) => next.replace(`{${name}}`, String(raw ?? '')),
    text
  );
}

function decisionAction(decisions, row) {
  return String(decisions?.[row.logicalId || row.id]?.action || '').toLowerCase();
}

export default function QualityReviewPanel({
  rows = [],
  decisions = null,
  setDecision = null,
  showSubmit = false,
  t,
}) {
  const [openId, setOpenId] = useState('');
  const cases = Array.isArray(rows) ? rows.filter((row) => row?.recordKind !== 'test_strategy') : [];
  const canDecide = showSubmit && typeof setDecision === 'function';

  return (
    <section className="mb-3 rounded-md border border-border bg-card px-3 py-3" aria-label={labelOf(t, 'requirements.qualityReviewList', 'Danh sách Test Case')}>
      <h4 className="text-sm font-semibold text-foreground">
        {labelOf(t, 'requirements.qualityReviewList', 'Danh sách Test Case')}
      </h4>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.qualityReviewListHint',
          'Chờ duyệt là trạng thái rà soát. Chưa chạy nghĩa là chưa thực thi. Ready không có nghĩa là đã kiểm thử thành công.'
        )}
      </p>
      {cases.length ? (
        <ul className="mt-2 space-y-2">
          {cases.map((row) => (
            <CaseCard
              key={row.logicalId || row.id}
              row={row}
              open={openId === (row.logicalId || row.id)}
              onToggle={() =>
                setOpenId((prev) => (prev === (row.logicalId || row.id) ? '' : row.logicalId || row.id))
              }
              decision={decisionAction(decisions, row)}
              note={decisions?.[row.logicalId || row.id]?.note || ''}
              canDecide={canDecide}
              onDecide={(action, extra) => setDecision(row.logicalId || row.id, { action, ...extra })}
              t={t}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {labelOf(t, 'requirements.qualityReviewEmpty', 'Không có Test Case.')}
        </p>
      )}
    </section>
  );
}

function CaseCard({ row, open, onToggle, decision, note, canDecide, onDecide, t }) {
  const refs = (row.sourceRefs || []).map((ref) => ref.id).filter(Boolean);
  const meta = [refs.join(', '), row.testLevel, row.testType].filter(Boolean).join(' · ');
  const reviewLabel =
    decision === 'accept'
      ? labelOf(t, 'requirements.qualityReviewAccepted', 'Đã duyệt')
      : decision === 'reject'
        ? labelOf(t, 'requirements.qualityReviewRejected', 'Từ chối')
        : decision === 'edit'
          ? labelOf(t, 'requirements.qualityReviewEdit', 'Cần sửa')
          : row.status === 'NEEDS_SUPPLEMENT'
            ? labelOf(t, 'requirements.qualityReviewSupplement', 'Cần bổ sung')
            : labelOf(t, 'requirements.qualityReviewPending', 'Chờ duyệt');
  const runLabel =
    row.executionStatus === 'passed'
      ? labelOf(t, 'requirements.qualityReviewPassed', 'Đạt')
      : row.executionStatus === 'failed'
        ? labelOf(t, 'requirements.qualityReviewFailed', 'Không đạt')
        : labelOf(t, 'requirements.qualityReviewNotRun', 'Chưa chạy');

  return (
    <li className="rounded-md border border-border">
      <button
        type="button"
        onClick={onToggle}
        className="vh-motion-row flex w-full items-start gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[11px] text-muted-foreground">{row.id}</span>
          <span className="block text-sm font-medium text-foreground">{row.title}</span>
          {meta ? <span className="mt-0.5 block text-xs text-muted-foreground">{meta}</span> : null}
          <span className="mt-1 flex flex-wrap gap-1">
            <Badge>{reviewLabel}</Badge>
            <Badge>{runLabel}</Badge>
            {row.scenarioType ? <Badge>{row.scenarioType}</Badge> : null}
          </span>
        </span>
        <ChevronRight className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <div className="space-y-3 border-t border-border px-3 py-3 text-xs">
          {row.objective ? (
            <p className="text-foreground">{row.objective}</p>
          ) : null}
          <DetailList
            title={labelOf(t, 'requirements.qualityReviewPreconditions', 'Điều kiện tiền đề')}
            items={row.preconditions}
            empty={labelOf(t, 'requirements.qualityReviewMissing', 'Chưa có')}
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
              <p className="mt-1 text-muted-foreground">{labelOf(t, 'requirements.qualityReviewMissing', 'Chưa có')}</p>
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
                      {labelOf(t, 'requirements.qualityReviewExpected', 'Kết quả mong đợi')}: {step.expectedResult}
                    </p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-muted-foreground">{labelOf(t, 'requirements.qualityReviewMissing', 'Chưa có')}</p>
            )}
          </div>
          <p className="text-muted-foreground">
            {labelOf(t, 'requirements.qualityReviewSources', 'Nguồn')}:{' '}
            {(row.sourceRefs || []).map((ref) => `${ref.type} ${ref.id}`).join(' · ') || '—'}
          </p>
          {row.missingInformation ? (
            <p className="text-amber-800 dark:text-amber-200">{row.missingInformation}</p>
          ) : null}
          {canDecide ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onDecide('accept', { editedPayload: null })} className="rounded-md border border-emerald-600/40 px-2 py-1 font-medium text-emerald-800 dark:text-emerald-300">
                {labelOf(t, 'requirements.qualityReviewAccept', 'Chấp nhận')}
              </button>
              <button type="button" onClick={() => onDecide('edit', { note })} className="rounded-md border border-border px-2 py-1 font-medium text-foreground">
                {labelOf(t, 'requirements.qualityReviewEdit', 'Sửa')}
              </button>
              <button type="button" onClick={() => onDecide('reject', { editedPayload: null })} className="rounded-md border border-destructive/40 px-2 py-1 font-medium text-destructive">
                {labelOf(t, 'requirements.qualityReviewReject', 'Từ chối')}
              </button>
            </div>
          ) : null}
          {canDecide && decision === 'edit' ? (
            <label className="block text-muted-foreground">
              {labelOf(t, 'requirements.qualityReviewEditNote', 'Nội dung cần sửa')}
              <textarea
                value={note}
                onChange={(event) => onDecide('edit', { note: event.target.value })}
                rows={2}
                className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
              />
            </label>
          ) : null}
        </div>
      ) : null}
    </li>
  );
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

function Badge({ children }) {
  return (
    <span className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

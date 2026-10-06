/**
 * Read-only HOW run results on Monitor — visible to BA / PO / PM (no Gate2 decisions).
 * Reuses buildGate2ProposalItems + Gate2 column config.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildGate2ProposalItems } from '../buildGate2ProposalItems';
import {
  GATE2_SCROLL_PAGE_SIZE,
  getGate2ColumnsForSection,
  getGate2RowId,
} from '../gate2/gate2SectionTableConfig';
import { resolveHowPlanSummary } from './howPlanSummary';
import { shouldShowHowMonitorResults } from './howMonitorResultsVisibility';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

export { shouldShowHowMonitorResults };

function HowPlanSummaryStrip({ pack, t }) {
  const summary = resolveHowPlanSummary(pack);
  if (!summary.hasSummary) return null;
  const dc = summary.deadlineConflict;
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span>
        {labelOf(t, 'requirements.gate2CriticalPathDays', 'CP (ngày)')}:{' '}
        {summary.criticalPathDays == null ? '—' : summary.criticalPathDays}
      </span>
      <span>
        {labelOf(t, 'requirements.gate2ConflictCount', 'Conflicts')}: {summary.conflictCount}
      </span>
      <span>
        {labelOf(t, 'requirements.gate2UnassignedCount', 'Unassigned')}:{' '}
        {summary.unassignedCount}
      </span>
      {dc ? (
        <span className="font-medium text-amber-800 dark:text-amber-200">
          {labelOf(t, 'requirements.gate2Deadline', 'Deadline')}: {dc.deadline || '—'} ·{' '}
          {labelOf(t, 'requirements.gate2EstimatedEnd', 'Est. end')}: {dc.estimatedEnd || '—'}
        </span>
      ) : null}
    </div>
  );
}

function ReadOnlyResultsTable({ section, rows, t }) {
  const columns = useMemo(() => getGate2ColumnsForSection(section), [section]);
  const [visibleCount, setVisibleCount] = useState(GATE2_SCROLL_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);

  useEffect(() => {
    setVisibleCount(GATE2_SCROLL_PAGE_SIZE);
  }, [section]);

  const visibleRows = useMemo(() => rows.slice(0, visibleCount), [rows, visibleCount]);
  const hasMore = visibleCount < rows.length;

  useEffect(() => {
    if (!hasMore) return undefined;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + GATE2_SCROLL_PAGE_SIZE, rows.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, rows.length, section, visibleCount]);

  if (!rows.length) return null;

  return (
    <div className="mt-3 space-y-2">
      <div
        ref={scrollRootRef}
        className="max-h-96 overflow-auto rounded-md border border-border overscroll-contain"
      >
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-muted-foreground backdrop-blur-sm">
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-1.5 font-medium"
                  style={{ minWidth: col.minPx || 64 }}
                >
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const id = getGate2RowId(row, index);
              const status = String(row.status || '').toUpperCase();
              const warn =
                status === 'CRITICAL' ||
                status === 'BLOCKING' ||
                status === 'OVERLOAD' ||
                status === 'UNASSIGNED';
              return (
                <tr
                  key={`${id}-${index}`}
                  className={`border-t border-border ${warn ? 'bg-amber-500/10' : ''}`}
                >
                  {columns.map((col) => (
                    <td key={col.key} className="max-w-[16rem] px-2 py-1.5 align-top text-foreground">
                      <span className="break-words">
                        {typeof col.render === 'function' ? col.render(row, t) : row[col.field] || '—'}
                      </span>
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasMore ? <div ref={sentinelRef} className="h-4 w-full" aria-hidden /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {labelOf(t, 'requirements.phase1Gate1Showing', 'Đang hiện')} {visibleRows.length}/
          {rows.length}
        </span>
        {hasMore ? (
          <button
            type="button"
            className="rounded border border-border px-2 py-1 hover:bg-muted/50"
            onClick={() =>
              setVisibleCount((n) => Math.min(n + GATE2_SCROLL_PAGE_SIZE, rows.length))
            }
          >
            {labelOf(t, 'common.loadMore', 'Tải thêm')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Monitor HOW results — read-only; no role gate (BA / PO / PM).
 */
export default function HowMonitorResultsPanel({ pack = null, t }) {
  const bundle = useMemo(() => buildGate2ProposalItems({ pack }), [pack]);
  const bySection = bundle.proposalBySection || {};
  const sectionTabs = bundle.proposalSections || [];
  const hasRows = (bundle.items || []).length > 0;

  const [activeSection, setActiveSection] = useState('');

  useEffect(() => {
    setActiveSection((prev) => {
      if (prev && sectionTabs.some((tab) => tab.key === prev)) return prev;
      const withConflict = sectionTabs.find((tab) => tab.hasConflict || tab.conflictCount > 0);
      if (withConflict?.key) return withConflict.key;
      const withItems = sectionTabs.find((tab) => (bySection[tab.key]?.length || tab.count || 0) > 0);
      return withItems?.key || sectionTabs[0]?.key || '';
    });
  }, [sectionTabs, bySection]);

  if (!hasRows) return null;

  const activeRows = bySection[activeSection] || [];
  const activeTab = sectionTabs.find((tab) => tab.key === activeSection);
  const activeMissing = Boolean(activeTab?.missing) || activeRows.length === 0;

  return (
    <section
      className="rounded-md border border-border bg-card px-3 py-3"
      aria-label={labelOf(t, 'requirements.aiHitlMonitorResultsTitle', 'Kết quả chạy HOW')}
    >
      <h3 className="text-sm font-semibold text-foreground">
        {labelOf(t, 'requirements.aiHitlMonitorResultsTitle', 'Kết quả chạy HOW')}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.aiHitlMonitorResultsHint',
          'Bảng kết quả planning (WBS, phụ thuộc, phân công, lịch, rủi ro) — BA / PO / PM đều xem được. Duyệt quyết định ở tab Duyệt.'
        )}
      </p>
      <HowPlanSummaryStrip pack={pack} t={t} />

      {sectionTabs.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sectionTabs.map((tab) => {
            const isMissing = Boolean(tab.missing) || !(bySection[tab.key]?.length || tab.count);
            const isActive = activeSection === tab.key;
            const hasConflict = Boolean(tab.hasConflict) || Number(tab.conflictCount) > 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveSection(tab.key)}
                className={`rounded-md border px-2 py-1 text-xs ${
                  isActive
                    ? hasConflict
                      ? 'border-amber-600 bg-amber-500/20 text-foreground'
                      : 'border-primary bg-primary/10 text-foreground'
                    : hasConflict
                      ? 'border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                      : isMissing
                        ? 'border-dashed border-border text-muted-foreground'
                        : 'border-border text-muted-foreground'
                }`}
              >
                {tab.label}
                {isMissing
                  ? ` · ${labelOf(t, 'requirements.phase1Gate1TabMissing', 'Thiếu')}`
                  : ` (${tab.count})`}
              </button>
            );
          })}
        </div>
      ) : null}

      {!activeMissing && activeRows.length ? (
        <ReadOnlyResultsTable section={activeSection} rows={activeRows} t={t} />
      ) : activeSection ? (
        <p className="mt-3 rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
          {labelOf(
            t,
            'requirements.aiHitlMonitorResultsEmptySection',
            'Section này chưa có dữ liệu từ lần chạy HOW.'
          )}
        </p>
      ) : null}
    </section>
  );
}

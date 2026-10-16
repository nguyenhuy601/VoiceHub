/**
 * Read-only WHAT run results on Monitor — visible to BA / PO / PM (no Gate1 decisions).
 * Reuses buildGate1ProposalItems + Gate1 column config (same pattern as HowMonitorResultsPanel).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GATE1_SCROLL_PAGE_SIZE,
  GATE1_TABLE_BODY_HEIGHT_CLASS,
  getGate1ColumnsForSection,
  getGate1RowId,
} from '../gate1/gate1SectionTableConfig';
import {
  buildWhatMonitorResultsBundle,
  shouldShowWhatMonitorResults,
} from './whatMonitorResultsVisibility';
import HitlSectionTabList from './HitlSectionTabList';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value) return value;
  if (!vars) return fallback;
  return Object.entries(vars).reduce(
    (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
    fallback
  );
}

export { shouldShowWhatMonitorResults };

function sectionHasIssue(tab, bySection) {
  if (!tab) return false;
  const isMissing = Boolean(tab.missing) || !(bySection[tab.key]?.length || tab.count);
  const hasConflict = Boolean(tab.hasConflict) || Number(tab.conflictCount) > 0;
  return isMissing || hasConflict;
}

function ReadOnlyResultsTable({ section, rows, t, headerTone = 'ok' }) {
  const columns = useMemo(() => getGate1ColumnsForSection(section), [section]);
  const [visibleCount, setVisibleCount] = useState(GATE1_SCROLL_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);
  const isWarnHeader = headerTone === 'warn';

  useEffect(() => {
    setVisibleCount(GATE1_SCROLL_PAGE_SIZE);
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
          setVisibleCount((n) => Math.min(n + GATE1_SCROLL_PAGE_SIZE, rows.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, rows.length, section, visibleCount]);

  if (!rows.length) return null;

  const theadClass = isWarnHeader
    ? 'sticky top-0 z-[1] border-b border-amber-600/40 bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-50'
    : 'sticky top-0 z-[1] border-b border-emerald-600/40 bg-emerald-100 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-50';

  return (
    <div className="mt-3 space-y-2">
      <div
        ref={scrollRootRef}
        className={`${GATE1_TABLE_BODY_HEIGHT_CLASS} overflow-auto rounded-md border bg-card text-foreground shadow-sm overscroll-contain ${
          isWarnHeader ? 'border-amber-600/40' : 'border-emerald-600/40'
        }`}
      >
        <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
          <thead className={theadClass}>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="whitespace-nowrap px-2 py-1.5 text-xs font-semibold"
                  style={{ minWidth: col.minPx || 64 }}
                >
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const id = getGate1RowId(row, index);
              const status = String(row.status || '').toUpperCase();
              const warn =
                Boolean(row.hasConflict) ||
                status === 'NEEDS_CONFIRMATION' ||
                status === 'CONFLICT' ||
                status === 'AMBIGUOUS';
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
              setVisibleCount((n) => Math.min(n + GATE1_SCROLL_PAGE_SIZE, rows.length))
            }
          >
            {labelOf(t, 'common.loadMore', 'Tải thêm')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EmptySectionPanel({ t }) {
  return (
    <div
      className={`mt-3 flex ${GATE1_TABLE_BODY_HEIGHT_CLASS} flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-3 text-center`}
    >
      <p className="text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.aiHitlMonitorWhatResultsEmptySection',
          'Section này chưa có dữ liệu từ lần chạy WHAT.'
        )}
      </p>
    </div>
  );
}

/**
 * Monitor WHAT results — read-only; no role gate (BA / PO / PM).
 */
export default function WhatMonitorResultsPanel({ pack = null, t }) {
  const bundle = useMemo(() => buildWhatMonitorResultsBundle(pack), [pack]);
  const bySection = bundle.bySection || {};
  const sectionTabs = bundle.sections || [];
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
  const activeHasIssue = sectionHasIssue(activeTab, bySection);

  return (
    <section
      className="rounded-md border border-border bg-card px-3 py-3"
      aria-label={labelOf(t, 'requirements.aiHitlMonitorWhatResultsTitle', 'Kết quả chạy WHAT')}
    >
      <h3 className="text-sm font-semibold text-foreground">
        {labelOf(t, 'requirements.aiHitlMonitorWhatResultsTitle', 'Kết quả chạy WHAT')}
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {labelOf(
          t,
          'requirements.aiHitlMonitorWhatResultsHint',
          'Bảng kết quả phân tích (FR, NFR, UC, BR…) — BA / PO / PM đều xem được. Duyệt quyết định ở tab Duyệt.'
        )}
      </p>

      <HitlSectionTabList
        tabs={sectionTabs}
        activeKey={activeSection}
        onSelect={setActiveSection}
        tabHasIssue={(tab) => sectionHasIssue(tab, bySection)}
        t={t}
        ariaLabel={labelOf(
          t,
          'requirements.aiHitlMonitorWhatSectionTabsAria',
          'Các section WHAT'
        )}
      />

      {!activeMissing && activeRows.length ? (
        <ReadOnlyResultsTable
          section={activeSection}
          rows={activeRows}
          t={t}
          headerTone={activeHasIssue ? 'warn' : 'ok'}
        />
      ) : activeSection ? (
        <EmptySectionPanel t={t} />
      ) : null}
    </section>
  );
}

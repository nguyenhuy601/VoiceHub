import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GATE1_SCROLL_PAGE_SIZE,
  getGate1ColumnsForSection,
} from './gate1SectionTableConfig';

function labelOf(t, key, fallback) {
  const value = typeof t === 'function' ? t(key) : '';
  return value || fallback;
}

/**
 * Per-section Gate1 review table with client-side scroll-load (page 30).
 */
export default function Gate1SectionReviewTable({
  section,
  rows = [],
  decisions = {},
  setDecision,
  showSubmit = false,
  busy = false,
  t,
}) {
  const columns = useMemo(() => getGate1ColumnsForSection(section), [section]);
  const [visibleCount, setVisibleCount] = useState(GATE1_SCROLL_PAGE_SIZE);
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);

  useEffect(() => {
    setVisibleCount(GATE1_SCROLL_PAGE_SIZE);
  }, [section, rows.length]);

  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount]
  );
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

  return (
    <div className="mt-3 space-y-2">
      <div
        ref={scrollRootRef}
        className="max-h-96 overflow-auto rounded-md border border-border overscroll-contain"
      >
        <table className="w-full min-w-[36rem] text-left text-xs">
          <thead className="sticky top-0 z-[1] bg-muted/90 text-muted-foreground backdrop-blur-sm">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-2 py-1.5 font-medium whitespace-nowrap">
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </th>
              ))}
              <th className="px-2 py-1.5 font-medium whitespace-nowrap">
                {labelOf(t, 'requirements.phase1ColDecision', 'Decision')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, index) => {
              const id = row.logicalId || row.id || `row-${index}`;
              const d = decisions[id] || {};
              const needsConfirm =
                String(row.status || '').toUpperCase() === 'NEEDS_CONFIRMATION';
              return (
                <tr key={`${id}-${index}`} className="border-t border-border align-top">
                  {columns.map((col) => (
                    <td key={col.key} className="px-2 py-1.5 text-foreground">
                      {col.render(row)}
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    {showSubmit ? (
                      <div className="space-y-1 min-w-[9rem]">
                        <div className="flex flex-wrap gap-1">
                          {['accept', 'edit', 'reject'].map((action) => (
                            <button
                              key={action}
                              type="button"
                              disabled={busy}
                              onClick={() => setDecision(id, { action })}
                              className={`rounded border px-1.5 py-0.5 capitalize ${
                                d.action === action
                                  ? 'border-primary bg-primary/10 text-foreground'
                                  : 'border-border text-muted-foreground'
                              }`}
                            >
                              {action}
                            </button>
                          ))}
                        </div>
                        {needsConfirm && d.action === 'accept' ? (
                          <div className="space-y-1">
                            <input
                              className="w-full rounded border border-border bg-background px-1.5 py-1"
                              placeholder="note (bắt buộc)"
                              value={d.note || ''}
                              onChange={(e) => setDecision(id, { note: e.target.value })}
                            />
                            <input
                              className="w-full rounded border border-border bg-background px-1.5 py-1"
                              placeholder="resolution (bắt buộc)"
                              value={d.resolution || ''}
                              onChange={(e) => setDecision(id, { resolution: e.target.value })}
                            />
                          </div>
                        ) : null}
                        {d.action === 'edit' ? (
                          <textarea
                            className="w-full rounded border border-border bg-background px-1.5 py-1"
                            rows={2}
                            placeholder="edited description"
                            value={d.editedPayload?.description || ''}
                            onChange={(e) =>
                              setDecision(id, {
                                editedPayload: {
                                  ...(d.editedPayload || {}),
                                  description: e.target.value,
                                },
                              })
                            }
                          />
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">{d.action || '—'}</span>
                    )}
                  </td>
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

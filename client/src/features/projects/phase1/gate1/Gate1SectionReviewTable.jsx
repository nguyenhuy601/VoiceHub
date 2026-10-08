import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GATE1_SCROLL_PAGE_SIZE,
  getGate1ColumnsForSection,
  getGate1FieldValue,
  getGate1RowId,
  patchGate1EditedPayload,
  seedGate1EditedPayload,
} from './gate1SectionTableConfig';

/** Default Gate1 helpers — Gate2 passes overrides for the same table UX. */
const DEFAULT_TABLE_CONFIG = {
  getColumnsForSection: getGate1ColumnsForSection,
  getFieldValue: getGate1FieldValue,
  getRowId: getGate1RowId,
  seedEditedPayload: seedGate1EditedPayload,
  patchEditedPayload: patchGate1EditedPayload,
  scrollPageSize: GATE1_SCROLL_PAGE_SIZE,
  storageKeyPrefix: 'gate1-review-cols-v2',
};
import {
  formatMissingFieldsSuffix,
  integrityRowLabelFallback,
  integrityRowLabelKey,
  normalizeIntegrityBlockKind,
} from './integrityGateLabels';
import { useResizableTableColumns } from '../../hub/useResizableTableColumns';
import ResizableTableHeader from '../../hub/ResizableTableHeader';

function labelOf(t, key, fallback, vars) {
  const value = typeof t === 'function' ? t(key, vars) : '';
  if (value == null || value === '' || value === key) {
    if (!vars) return fallback;
    return Object.entries(vars).reduce(
      (text, [name, raw]) => text.replace(`{${name}}`, String(raw ?? '')),
      fallback
    );
  }
  return value;
}

function rowDecisionClass(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'accept') {
    return 'border-l-4 border-l-emerald-500 bg-emerald-500/5 ring-1 ring-inset ring-emerald-500/35';
  }
  if (a === 'edit') {
    return 'border-l-4 border-l-amber-500 bg-amber-500/5 ring-1 ring-inset ring-amber-500/40';
  }
  if (a === 'reject') {
    return 'border-l-4 border-l-rose-500 bg-rose-500/5 ring-1 ring-inset ring-rose-500/35 opacity-80';
  }
  return '';
}

/**
 * Per-section Gate1 review table with client-side scroll-load (page 30).
 * Inline cell edit on "Sửa"; checkbox + bulk actions; resizable columns.
 */
export default function Gate1SectionReviewTable({
  section,
  rows = [],
  decisions = {},
  setDecision,
  showSubmit = false,
  busy = false,
  t,
  /** Optional overrides — Gate2 Planning Review reuses this table. */
  tableConfig = null,
}) {
  const cfg = {
    ...DEFAULT_TABLE_CONFIG,
    ...(tableConfig && typeof tableConfig === 'object' ? tableConfig : {}),
  };
  const scrollPageSize = Number(cfg.scrollPageSize) || GATE1_SCROLL_PAGE_SIZE;
  const columns = useMemo(
    () => cfg.getColumnsForSection(section),
    [section, cfg.getColumnsForSection]
  );
  const [visibleCount, setVisibleCount] = useState(scrollPageSize);
  const [selectedBySection, setSelectedBySection] = useState(() => ({}));
  const selectedIds = selectedBySection[section] || new Set();
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);

  const resizeColumns = useMemo(() => {
    const resizeAria = labelOf(t, 'workspace.projectHubTableResizeCol', 'Kéo để đổi độ rộng cột');
    return [
      {
        id: '_select',
        defaultPx: 40,
        minPx: 36,
        resizable: false,
      },
      ...columns.map((col) => ({
        id: col.key,
        defaultPx: col.defaultPx ?? 140,
        minPx: col.minPx ?? 72,
        resizable: true,
        resizeAria,
      })),
      {
        id: '_decision',
        defaultPx: 260,
        minPx: 220,
        resizable: true,
        resizeAria,
      },
    ];
  }, [columns, t]);

  const { gridStyle, onResizeStart } = useResizableTableColumns({
    storageKey: `${cfg.storageKeyPrefix || 'gate1-review-cols-v2'}:${section || 'default'}`,
    columns: resizeColumns,
    containerRef: scrollRootRef,
  });

  useEffect(() => {
    setVisibleCount(scrollPageSize);
  }, [section, scrollPageSize]);

  const setSelectedIds = useCallback(
    (updater) => {
      setSelectedBySection((prev) => {
        const current = prev[section] || new Set();
        const nextSet = typeof updater === 'function' ? updater(current) : updater;
        return { ...prev, [section]: nextSet };
      });
    },
    [section]
  );

  const allRowIds = useMemo(
    () => rows.map((row, index) => cfg.getRowId(row, index)),
    [rows]
  );

  const visibleRows = useMemo(
    () => rows.slice(0, visibleCount),
    [rows, visibleCount]
  );
  const hasMore = visibleCount < rows.length;

  const allRowsSelected =
    allRowIds.length > 0 && allRowIds.every((id) => selectedIds.has(id));
  const someRowsSelected = allRowIds.some((id) => selectedIds.has(id));

  useEffect(() => {
    if (!hasMore) return undefined;
    const root = scrollRootRef.current;
    const target = sentinelRef.current;
    if (!root || !target) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((n) => Math.min(n + scrollPageSize, rows.length));
        }
      },
      { root, rootMargin: '80px', threshold: 0 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, rows.length, section, visibleCount]);

  const toggleSelect = useCallback(
    (id) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setSelectedIds]
  );

  /** Select / clear every row in the section — including not-yet-scrolled ones. */
  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (allRowsSelected) return new Set();
      const next = new Set(prev);
      for (const id of allRowIds) next.add(id);
      return next;
    });
  }, [allRowsSelected, allRowIds, setSelectedIds]);

  const applyActionToIds = useCallback(
    (ids, action) => {
      if (!showSubmit || typeof setDecision !== 'function') return;
      for (const id of ids) {
        const rowIndex = rows.findIndex(
          (r, i) => cfg.getRowId(r, i) === String(id)
        );
        const row = rowIndex >= 0 ? rows[rowIndex] : null;
        if (action === 'edit') {
          setDecision(id, {
            action: 'edit',
            editedPayload: cfg.seedEditedPayload(row || {}, columns),
          });
        } else if (action === 'accept') {
          setDecision(id, { action: 'accept', editedPayload: null });
        } else if (action === 'reject') {
          setDecision(id, { action: 'reject', editedPayload: null });
        }
      }
    },
    [showSubmit, setDecision, rows, columns]
  );

  const applyBulk = useCallback(
    (action) => {
      applyActionToIds([...selectedIds], action);
    },
    [applyActionToIds, selectedIds]
  );

  const onRowAction = useCallback(
    (id, action, row) => {
      if (action === 'edit') {
        const existing = decisions[id]?.editedPayload;
        setDecision(id, {
          action: 'edit',
          editedPayload:
            existing && typeof existing === 'object'
              ? existing
              : cfg.seedEditedPayload(row || {}, columns),
        });
        return;
      }
      if (action === 'accept') {
        setDecision(id, { action: 'accept', editedPayload: null });
        return;
      }
      setDecision(id, { action: 'reject', editedPayload: null });
    },
    [columns, decisions, setDecision]
  );

  if (!rows.length) return null;

  const selectedCount = selectedIds.size;

  return (
    <div className="mt-3 space-y-2">
      {showSubmit && selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            {labelOf(t, 'requirements.phase1BulkSelected', '{count} đã chọn', {
              count: selectedCount,
            })}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('accept')}
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-foreground hover:bg-emerald-500/20 disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1BulkAccept', 'Chấp nhận đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('edit')}
            className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-foreground hover:bg-amber-500/20 disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1BulkEdit', 'Sửa đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('reject')}
            className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-foreground hover:bg-rose-500/20 disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1BulkReject', 'Từ chối đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-border px-2 py-0.5 text-muted-foreground hover:bg-muted/60 disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1BulkClear', 'Bỏ chọn')}
          </button>
        </div>
      ) : null}

      <div
        ref={scrollRootRef}
        className="max-h-96 overflow-auto rounded-md border border-border overscroll-contain"
      >
        <div className="min-w-0" style={{ minWidth: gridStyle.minWidth }}>
          <div
            className="sticky top-0 z-[1] border-b border-border bg-muted/90 text-muted-foreground backdrop-blur-sm"
            style={gridStyle}
            role="row"
          >
            <div className="flex items-center justify-center px-1 py-1.5">
              {showSubmit ? (
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-primary"
                  checked={allRowsSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someRowsSelected && !allRowsSelected;
                  }}
                  disabled={busy || !allRowIds.length}
                  onChange={toggleSelectAll}
                  aria-label={labelOf(
                    t,
                    'requirements.phase1SelectAll',
                    'Chọn tất cả ({count})',
                    { count: allRowIds.length }
                  )}
                  title={labelOf(
                    t,
                    'requirements.phase1SelectAllHint',
                    'Chọn tất cả {count} dòng (kể cả chưa tải)',
                    { count: allRowIds.length }
                  )}
                />
              ) : (
                <span className="sr-only">—</span>
              )}
            </div>
            {columns.map((col) => {
              const resizeCol = resizeColumns.find((c) => c.id === col.key);
              return (
                <ResizableTableHeader
                  key={col.key}
                  column={resizeCol}
                  onResizeStart={onResizeStart}
                  className="px-2 py-1.5 text-xs font-medium"
                >
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </ResizableTableHeader>
              );
            })}
            <ResizableTableHeader
              column={resizeColumns.find((c) => c.id === '_decision')}
              onResizeStart={onResizeStart}
              className="px-2 py-1.5 text-xs font-medium"
            >
              {labelOf(t, 'requirements.phase1ColDecision', 'Quyết định')}
            </ResizableTableHeader>
          </div>

          {visibleRows.map((row, visibleIndex) => {
            const rowIndex = visibleIndex; // visibleRows is a prefix slice of `rows`
            const id = cfg.getRowId(row, rowIndex);
            const d = decisions[id] || {};
            const action = String(d.action || '').toLowerCase();
            const isEditing = showSubmit && action === 'edit';
            const isRejected = action === 'reject';
            const needsConfirm =
              String(row.status || '').toUpperCase() === 'NEEDS_CONFIRMATION';
            const hasConflict = Boolean(row.hasConflict);
            const issues = Array.isArray(row.blockingIssues) ? row.blockingIssues : [];
            const integrityKind = normalizeIntegrityBlockKind({
              blockKind: row.integrityKind || row.conflictKind,
              kind: issues[0]?.kind,
              code: issues[0]?.code,
            });
            const detailLabel = issues
              .slice(0, 2)
              .map((issue) =>
                integrityKind === 'data_integrity'
                  ? formatMissingFieldsSuffix(issue)
                  : issue.message || issue.code || issue.kind
              )
              .filter(Boolean)
              .join(' · ');
            const decisionRing = rowDecisionClass(action);
            const conflictBg = hasConflict && !action ? 'bg-amber-500/10' : '';

            return (
              <div
                key={`${id}-${rowIndex}`}
                role="row"
                data-conflict={hasConflict ? '1' : undefined}
                data-integrity={hasConflict ? integrityKind : undefined}
                data-decision={action || undefined}
                className={`border-t border-border align-top text-xs ${decisionRing} ${conflictBg}`}
                style={gridStyle}
              >
                <div className="flex items-start justify-center px-1 py-1.5">
                  {showSubmit ? (
                    <input
                      type="checkbox"
                      className="mt-0.5 h-3.5 w-3.5 accent-primary"
                      checked={selectedIds.has(id)}
                      disabled={busy}
                      onChange={() => toggleSelect(id)}
                      aria-label={labelOf(t, 'requirements.phase1SelectRow', 'Chọn dòng')}
                    />
                  ) : null}
                </div>

                {columns.map((col) => {
                  const canInline =
                    isEditing && col.editable && col.field && !busy;
                  return (
                    <div
                      key={col.key}
                      className={`min-w-0 px-2 py-1.5 text-foreground ${
                        isRejected ? 'line-through text-muted-foreground' : ''
                      }`}
                    >
                      {canInline ? (
                        <textarea
                          className="w-full min-h-[2.25rem] resize-y rounded border border-amber-500/40 bg-background px-1.5 py-1 text-xs text-foreground outline-none focus:border-amber-500"
                          rows={col.key === 'ac' ? 3 : 2}
                          value={cfg.getFieldValue(row, col, d.editedPayload)}
                          onChange={(e) =>
                            setDecision(id, {
                              editedPayload: cfg.patchEditedPayload(
                                d.editedPayload,
                                col.field,
                                e.target.value
                              ),
                            })
                          }
                          aria-label={labelOf(t, col.headerKey, col.headerFallback)}
                        />
                      ) : (
                        <>
                          <span className="break-words">
                            {isEditing && col.editable && col.field
                              ? cfg.getFieldValue(row, col, d.editedPayload) || '—'
                              : col.render(row, t)}
                          </span>
                          {col.key === columns[0]?.key && hasConflict ? (
                            <div className="mt-1 text-[10px] font-medium text-amber-800 dark:text-amber-200 no-underline">
                              {labelOf(
                                t,
                                integrityRowLabelKey(integrityKind),
                                integrityRowLabelFallback(integrityKind)
                              )}
                              {detailLabel ? `: ${detailLabel}` : ''}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}

                <div className="min-w-0 px-2 py-1.5">
                  {showSubmit ? (
                    <div className="space-y-1">
                        <div className="flex flex-nowrap gap-1 whitespace-nowrap">
                          {['accept', 'edit', 'reject'].map((act) => (
                            <button
                              key={act}
                              type="button"
                              disabled={busy}
                              onClick={() => onRowAction(id, act, row)}
                              className={`shrink-0 rounded border px-1.5 py-0.5 ${
                                action === act
                                  ? act === 'accept'
                                    ? 'border-emerald-500 bg-emerald-500/15 text-foreground'
                                    : act === 'edit'
                                      ? 'border-amber-500 bg-amber-500/15 text-foreground'
                                      : 'border-rose-500 bg-rose-500/15 text-foreground'
                                  : 'border-border text-muted-foreground'
                              }`}
                            >
                            {labelOf(
                              t,
                              `requirements.phase1Decision_${act}`,
                              act === 'accept'
                                ? 'Chấp nhận'
                                : act === 'edit'
                                  ? 'Sửa'
                                  : 'Từ chối'
                            )}
                          </button>
                        ))}
                      </div>
                      {needsConfirm && action === 'accept' ? (
                        <div className="space-y-1">
                          <input
                            className="w-full rounded border border-border bg-background px-1.5 py-1"
                            placeholder={labelOf(
                              t,
                              'requirements.phase1DecisionNotePlaceholder',
                              'Ghi chú (bắt buộc)'
                            )}
                            value={d.note || ''}
                            onChange={(e) => setDecision(id, { note: e.target.value })}
                          />
                          <input
                            className="w-full rounded border border-border bg-background px-1.5 py-1"
                            placeholder={labelOf(
                              t,
                              'requirements.phase1DecisionResolutionPlaceholder',
                              'Cách xử lý (bắt buộc)'
                            )}
                            value={d.resolution || ''}
                            onChange={(e) =>
                              setDecision(id, { resolution: e.target.value })
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {action
                        ? labelOf(t, `requirements.phase1Decision_${action}`, action)
                        : '—'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
              setVisibleCount((n) => Math.min(n + scrollPageSize, rows.length))
            }
          >
            {labelOf(t, 'common.loadMore', 'Tải thêm')}
          </button>
        ) : null}
      </div>
    </div>
  );
}

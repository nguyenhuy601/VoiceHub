import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GATE1_SCROLL_PAGE_SIZE,
  GATE1_TABLE_BODY_HEIGHT_CLASS,
  getGate1ColumnsForSection,
  getGate1FieldValue,
  getGate1RowId,
  patchGate1EditedPayload,
  seedGate1EditedPayload,
} from './gate1SectionTableConfig';
import { resolveGate1DisplayIds } from './gate1DisplayIds';

/** Default Gate1 helpers — Gate2 passes overrides for the same table UX. */
const DEFAULT_TABLE_CONFIG = {
  getColumnsForSection: getGate1ColumnsForSection,
  getFieldValue: getGate1FieldValue,
  getRowId: getGate1RowId,
  seedEditedPayload: seedGate1EditedPayload,
  patchEditedPayload: patchGate1EditedPayload,
  scrollPageSize: GATE1_SCROLL_PAGE_SIZE,
  storageKeyPrefix: 'gate1-review-cols-v3',
};
import {
  formatMissingFieldsSuffix,
  integrityRowLabelFallback,
  integrityRowLabelKey,
  normalizeIntegrityBlockKind,
} from './integrityGateLabels';
import { filterBlockingIssuesForCurrentValues } from './resolveConflictAmbiguityUi';
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

const ROW_DECISION_ACTIONS = ['accept', 'edit', 'reject'];

/** Left accent via inset shadow — không chiếm layout (tránh lệch cột khi chọn). */
function rowDecisionClass(action) {
  const a = String(action || '').toLowerCase();
  if (a === 'accept') {
    return 'bg-emerald-50 shadow-[inset_4px_0_0_0_#059669] ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-950/40';
  }
  if (a === 'edit' || a === 'create') {
    return 'bg-amber-50 shadow-[inset_4px_0_0_0_#d97706] ring-1 ring-inset ring-amber-600/30 dark:bg-amber-950/40';
  }
  if (a === 'reject') {
    return 'bg-rose-50/90 shadow-[inset_4px_0_0_0_#e11d48] ring-1 ring-inset ring-rose-600/30 opacity-90 dark:bg-rose-950/40';
  }
  return 'bg-card';
}

function decisionActionLabel(t, act) {
  return labelOf(
    t,
    `requirements.phase1Decision_${act}`,
    act === 'accept' ? 'Chấp nhận' : act === 'edit' ? 'Sửa' : 'Từ chối'
  );
}

function decisionAccentClass(act, selected) {
  if (!selected) return 'text-foreground/75';
  if (act === 'accept') return 'text-emerald-800 dark:text-emerald-200';
  if (act === 'edit') return 'text-amber-800 dark:text-amber-200';
  return 'text-rose-800 dark:text-rose-200';
}

/**
 * Per-section Gate1 review table with client-side scroll-load (page 30).
 * Inline cell edit on "Sửa"; checkbox + bulk actions; resizable columns.
 * Optional hover "+" to add a BA draft row (Actor-first wave).
 */
export default function Gate1SectionReviewTable({
  section,
  rows = [],
  decisions = {},
  setDecision,
  showSubmit = false,
  busy = false,
  t,
  /** Column header tone: ok = green, warn = amber (section health). */
  headerTone = 'ok',
  /** Optional overrides — Gate2 Planning Review reuses this table. */
  tableConfig = null,
  /** When true (and showSubmit), show hover "+" affordance to add a row. */
  canAddRow = false,
  onAddRow = null,
  onRemoveAddedRow = null,
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
  /** Gate2 WBS: ids of containers whose children are hidden (collapsed). */
  const [wbsCollapsedIds, setWbsCollapsedIds] = useState(() => new Set());
  const sentinelRef = useRef(null);
  const scrollRootRef = useRef(null);
  const wbsTreeCollapse = Boolean(cfg.wbsTreeCollapse) && section === 'tasks';

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
        defaultPx: 240,
        minPx: 200,
        resizable: true,
        resizeAria,
      },
    ];
  }, [columns, t]);

  const { gridStyle, onResizeStart } = useResizableTableColumns({
    storageKey: `${cfg.storageKeyPrefix || 'gate1-review-cols-v2'}:${section || 'default'}`,
    columns: resizeColumns,
    containerRef: scrollRootRef,
    fillContainer: true,
  });

  useEffect(() => {
    setVisibleCount(scrollPageSize);
  }, [section, scrollPageSize]);

  // Default: collapse work_package (or story if no WP) so tasks stay tucked until click.
  useEffect(() => {
    if (!wbsTreeCollapse) return;
    const hasWp = rows.some((r) => String(r?.level || '') === 'work_package');
    const next = new Set();
    for (const r of rows) {
      const level = String(r?.level || '');
      if (!r?.id || !r?.hasChildren) continue;
      if (hasWp && level === 'work_package') next.add(String(r.id));
      if (!hasWp && level === 'story') next.add(String(r.id));
    }
    setWbsCollapsedIds(next);
  }, [wbsTreeCollapse, section, rows]);

  const toggleWbsCollapse = useCallback((rowId) => {
    const id = String(rowId || '');
    if (!id) return;
    setWbsCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  /** Compact PREFIX-n labels after reject; decision keys stay on logicalId. */
  const displayIds = useMemo(
    () => resolveGate1DisplayIds(rows, decisions, cfg.getRowId),
    [rows, decisions]
  );
  const displayIdByRowId = useMemo(() => {
    const map = new Map();
    rows.forEach((row, index) => {
      map.set(String(cfg.getRowId(row, index)), displayIds[index]);
    });
    return map;
  }, [rows, displayIds, cfg.getRowId]);

  const treeFilteredRows = useMemo(() => {
    if (!wbsTreeCollapse || !wbsCollapsedIds.size) return rows;
    const byId = new Map(rows.map((r) => [String(r.id), r]));
    return rows.filter((r) => {
      let pid = r.parentId != null && r.parentId !== '' ? String(r.parentId) : null;
      let guard = 0;
      while (pid && guard < 12) {
        if (wbsCollapsedIds.has(pid)) return false;
        pid =
          byId.get(pid)?.parentId != null && byId.get(pid)?.parentId !== ''
            ? String(byId.get(pid).parentId)
            : null;
        guard += 1;
      }
      return true;
    });
  }, [rows, wbsTreeCollapse, wbsCollapsedIds]);

  const visibleRows = useMemo(
    () => treeFilteredRows.slice(0, visibleCount),
    [treeFilteredRows, visibleCount]
  );
  const hasMore = visibleCount < treeFilteredRows.length;

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

  const allowAdd = Boolean(canAddRow && showSubmit && typeof onAddRow === 'function');
  if (!rows.length && !allowAdd) return null;

  const selectedCount = selectedIds.size;
  const isWarnHeader = headerTone === 'warn';
  const headerRowClass = isWarnHeader
    ? 'sticky top-0 z-[1] border-b border-amber-600/40 bg-amber-100 text-amber-950 dark:bg-amber-950/80 dark:text-amber-50'
    : 'sticky top-0 z-[1] border-b border-emerald-600/40 bg-emerald-100 text-emerald-950 dark:bg-emerald-950/80 dark:text-emerald-50';
  const headerCellClass = isWarnHeader
    ? 'px-2 py-1.5 text-xs font-semibold text-amber-950 dark:text-amber-50'
    : 'px-2 py-1.5 text-xs font-semibold text-emerald-950 dark:text-emerald-50';

  return (
    <div className="mt-3 space-y-2">
      {showSubmit && selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-xs shadow-sm">
          <span className="font-medium text-foreground">
            {labelOf(t, 'requirements.phase1BulkSelected', '{count} đã chọn', {
              count: selectedCount,
            })}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('accept')}
            className="rounded border border-emerald-600/50 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-900 hover:bg-emerald-100 disabled:opacity-40 dark:bg-emerald-950/60 dark:text-emerald-100"
          >
            {labelOf(t, 'requirements.phase1BulkAccept', 'Chấp nhận đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('edit')}
            className="rounded border border-amber-600/50 bg-amber-50 px-2 py-0.5 font-medium text-amber-950 hover:bg-amber-100 disabled:opacity-40 dark:bg-amber-950/60 dark:text-amber-100"
          >
            {labelOf(t, 'requirements.phase1BulkEdit', 'Sửa đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => applyBulk('reject')}
            className="rounded border border-rose-600/50 bg-rose-50 px-2 py-0.5 font-medium text-rose-950 hover:bg-rose-100 disabled:opacity-40 dark:bg-rose-950/60 dark:text-rose-100"
          >
            {labelOf(t, 'requirements.phase1BulkReject', 'Từ chối đã chọn')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelectedIds(new Set())}
            className="rounded border border-border bg-background px-2 py-0.5 font-medium text-foreground hover:bg-muted disabled:opacity-40"
          >
            {labelOf(t, 'requirements.phase1BulkClear', 'Bỏ chọn')}
          </button>
        </div>
      ) : null}

      <div
        className={`relative ${GATE1_TABLE_BODY_HEIGHT_CLASS} rounded-md border bg-card text-foreground shadow-sm ${
          isWarnHeader ? 'border-amber-600/40' : 'border-emerald-600/40'
        }`}
      >
        <div
          ref={scrollRootRef}
          className="h-full overflow-auto overscroll-contain"
        >
        <div className="min-w-0 w-full" style={{ minWidth: gridStyle.minWidth }}>
          <div className={headerRowClass} style={gridStyle} role="row">
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
                  className={headerCellClass}
                >
                  {labelOf(t, col.headerKey, col.headerFallback)}
                </ResizableTableHeader>
              );
            })}
            <ResizableTableHeader
              column={resizeColumns.find((c) => c.id === '_decision')}
              onResizeStart={onResizeStart}
              className={headerCellClass}
            >
              {labelOf(t, 'requirements.phase1ColDecision', 'Quyết định')}
            </ResizableTableHeader>
          </div>

          {visibleRows.map((row, visibleIndex) => {
            const fullIndex = rows.indexOf(row);
            const rowIndex = fullIndex >= 0 ? fullIndex : visibleIndex;
            const id = cfg.getRowId(row, rowIndex);
            const d = decisions[id] || {};
            const action = String(d.action || '').toLowerCase();
            const isLocalCreate = Boolean(row?.addedLocally) || action === 'create';
            const isEditing =
              showSubmit && (action === 'edit' || action === 'create');
            const isRejected = action === 'reject';
            const needsConfirm =
              String(row.status || '').toUpperCase() === 'NEEDS_CONFIRMATION';
            const issues = filterBlockingIssuesForCurrentValues(
              row.blockingIssues,
              row,
              d
            );
            const hasConflict = issues.length > 0;
            const integrityKind = normalizeIntegrityBlockKind({
              blockKind: issues[0]?.blockKind || row.integrityKind || row.conflictKind,
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
            const conflictBg = hasConflict && !action ? 'bg-amber-50 dark:bg-amber-950/35' : '';

            return (
              <div
                key={`${id}-${rowIndex}`}
                role="row"
                data-conflict={hasConflict ? '1' : undefined}
                data-integrity={hasConflict ? integrityKind : undefined}
                data-decision={action || undefined}
                className={`border-t border-border align-top text-xs text-foreground ${decisionRing} ${conflictBg}`}
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
                        <input
                          type="text"
                          className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs text-foreground shadow-none outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring"
                          value={cfg.getFieldValue(row, col, d.editedPayload)}
                          onChange={(e) =>
                            setDecision(id, {
                              ...(action === 'create'
                                ? { action: 'create', section }
                                : {}),
                              editedPayload: cfg.patchEditedPayload(
                                d.editedPayload,
                                col.field,
                                e.target.value
                              ),
                            })
                          }
                          aria-label={labelOf(t, col.headerKey, col.headerFallback)}
                          placeholder={labelOf(t, col.headerKey, col.headerFallback)}
                        />
                      ) : (
                        <>
                          <span className="break-words">
                            {isEditing && col.editable && col.field
                              ? cfg.getFieldValue(row, col, d.editedPayload) || '—'
                              : col.render(row, t, {
                                  decision: d,
                                  displayId:
                                    displayIdByRowId.get(id) || displayIds[rowIndex],
                                  wbsExpanded: wbsTreeCollapse
                                    ? !wbsCollapsedIds.has(String(row.id))
                                    : true,
                                  onToggleWbs: wbsTreeCollapse ? toggleWbsCollapse : null,
                                })}
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
                      {isLocalCreate ? (
                        <div className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
                          <span className="rounded border border-amber-700 bg-amber-100 px-1.5 py-0.5 font-medium text-amber-950 dark:bg-amber-900 dark:text-amber-50">
                            {labelOf(t, 'requirements.phase1AuditSource_BA', 'BA')}
                          </span>
                          {typeof onRemoveAddedRow === 'function' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onRemoveAddedRow(id)}
                              className="shrink-0 rounded border border-rose-600/50 bg-rose-50 px-1.5 py-0.5 font-medium text-rose-950 hover:bg-rose-100 disabled:opacity-40 dark:bg-rose-950/60 dark:text-rose-100"
                              aria-label={labelOf(
                                t,
                                'requirements.phase1Gate1RemoveDraftRow',
                                'Xóa dòng nháp'
                              )}
                            >
                              {labelOf(t, 'requirements.phase1Gate1RemoveDraftRow', 'Xóa')}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <>
                          <div
                            role="group"
                            aria-label={labelOf(
                              t,
                              'requirements.phase1ColDecision',
                              'Quyết định'
                            )}
                            className="flex flex-nowrap items-center gap-x-2.5 gap-y-1"
                          >
                            {ROW_DECISION_ACTIONS.map((act) => {
                              const selected = action === act;
                              return (
                                <label
                                  key={act}
                                  className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] leading-none ${
                                    busy ? 'pointer-events-none opacity-40' : ''
                                  } ${decisionAccentClass(act, selected)}`}
                                >
                                  <input
                                    type="checkbox"
                                    name={`gate-decision-${section}-${id}`}
                                    value={act}
                                    checked={selected}
                                    disabled={busy}
                                    aria-checked={selected}
                                    onChange={() => {
                                      if (!selected) onRowAction(id, act, row);
                                    }}
                                    className="h-3.5 w-3.5 shrink-0 appearance-none rounded-full border border-border bg-background checked:border-current checked:bg-current checked:ring-2 checked:ring-inset checked:ring-background"
                                  />
                                  <span className={selected ? 'font-medium' : 'font-normal'}>
                                    {decisionActionLabel(t, act)}
                                  </span>
                                </label>
                              );
                            })}
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
                        </>
                      )}
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

        {/* Không chừa dòng trống: hover đáy khung bảng → + trượt lên để thêm dữ liệu */}
        {allowAdd && !hasMore ? (
          <div className="group/addzone absolute inset-x-0 bottom-0 z-[2] flex h-12 items-end justify-center pb-1.5">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/80 to-transparent opacity-0 transition-opacity duration-200 group-hover/addzone:opacity-100 group-focus-within/addzone:opacity-100" />
            <button
              type="button"
              disabled={busy}
              onClick={() => onAddRow(section)}
              className="relative z-[1] flex h-8 w-8 translate-y-full items-center justify-center rounded-full border border-emerald-600/60 bg-emerald-50 text-lg font-semibold leading-none text-emerald-800 opacity-0 shadow-sm transition-all duration-200 ease-out hover:scale-110 hover:bg-emerald-100 focus-visible:translate-y-0 focus-visible:opacity-100 disabled:pointer-events-none disabled:opacity-40 group-hover/addzone:translate-y-0 group-hover/addzone:opacity-100 dark:bg-emerald-950/60 dark:text-emerald-100"
              aria-label={labelOf(
                t,
                'requirements.phase1Gate1AddRowHint',
                'Thêm dòng dữ liệu mới'
              )}
              title={labelOf(t, 'requirements.phase1Gate1AddRow', 'Thêm dòng')}
            >
              +
            </button>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/80">
        <span>
          {labelOf(t, 'requirements.phase1Gate1Showing', 'Đang hiện')} {visibleRows.length}/
          {rows.length}
        </span>
        {hasMore ? (
          <button
            type="button"
            className="rounded border border-border bg-card px-2 py-1 font-medium text-foreground hover:bg-muted"
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

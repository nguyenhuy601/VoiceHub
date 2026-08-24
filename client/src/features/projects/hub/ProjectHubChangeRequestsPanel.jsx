import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskBoardDetailPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import {
  formatHubDateTime,
  unwrapChangeRequestEntity,
  unwrapChangeRequestList,
  unwrapProjectMembers,
  displayIssueKey,
  collectCrWorkItems,
  isLinkableCrWorkType,
  mergeChangeRequestPatch,
  resolveHubActor,
  HUB_GRID_CELL_BORDER,
} from './projectHubUtils';
import { listAllowedCrStatusTransitions, labelCrWorkStatus } from './projectHubCrWorkflow';
import ProjectHubChangeRequestDetailDrawer from './ProjectHubChangeRequestDetailDrawer';
import ProjectHubChangeRequestFormModal from './ProjectHubChangeRequestFormModal';
import ResizableTableHeader from './ResizableTableHeader';
import { useResizableTableColumns } from './useResizableTableColumns';

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const CR_TYPES = [
  'requirement_change',
  'scope_change',
  'design_change',
  'technical_change',
  'other',
];
const CR_STATUSES = ['draft', 'pending', 'reviewing', 'approved', 'rejected', 'deferred'];
const CR_PRIORITIES = ['low', 'medium', 'high', 'critical'];

const COLUMNS = [
  { id: 'code', labelKey: 'workspace.projectHubCrColId', sort: 'code', minPx: 72, defaultPx: 96 },
  { id: 'title', labelKey: 'workspace.projectHubCrColTitle', sort: 'title', minPx: 140, defaultPx: 220 },
  { id: 'type', labelKey: 'workspace.projectHubCrColType', sort: 'type', minPx: 96, defaultPx: 132 },
  { id: 'priority', labelKey: 'workspace.projectHubCrColPriority', sort: 'priority', minPx: 80, defaultPx: 104 },
  { id: 'status', labelKey: 'workspace.projectHubCrColApproval', sort: 'status', minPx: 88, defaultPx: 120 },
  { id: 'workStatus', labelKey: 'workspace.projectHubCrColWorkStatus', sort: null, minPx: 96, defaultPx: 128 },
  { id: 'work', labelKey: 'workspace.projectHubCrColWork', sort: null, minPx: 120, defaultPx: 160 },
  { id: 'createdBy', labelKey: 'workspace.projectHubCrColCreatedBy', sort: null, minPx: 96, defaultPx: 128 },
  { id: 'createdAt', labelKey: 'workspace.projectHubCrColCreatedAt', sort: 'createdAt', minPx: 104, defaultPx: 132 },
  { id: 'updatedAt', labelKey: 'workspace.projectHubCrColUpdatedAt', sort: 'updatedAt', minPx: 104, defaultPx: 132 },
];

const WORK_CHIP_MAX = 2;

function truncateTitle(title, max = 28) {
  const s = String(title || '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function sortParam(field, dir) {
  return dir === 'asc' ? field : `-${field}`;
}

function CrWorkCell({
  works = [],
  linkable = [],
  canUpdate = false,
  projectCode = '',
  cellSelect = '',
  t,
  onLink,
}) {
  const [picking, setPicking] = useState(false);
  const hasWork = works.length > 0;
  const canPick = canUpdate && linkable.length > 0;
  const showSelect = canPick && (!hasWork || picking);

  useEffect(() => {
    if (hasWork) setPicking(false);
  }, [hasWork]);

  const shown = works.slice(0, WORK_CHIP_MAX);
  const extra = works.length - shown.length;

  return (
    <span className="flex min-w-0 flex-col gap-1">
      {hasWork ? (
        <span className="flex min-w-0 flex-wrap items-center gap-1">
          {shown.map((w) => {
            const wid = String(w._id || w.id || '');
            const key = displayIssueKey(projectCode, wid);
            const label = truncateTitle(w.title);
            return (
              <span
                key={wid || key}
                className="inline-flex max-w-full truncate rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                title={w.title || key}
              >
                {label ? `${key} — ${label}` : key}
              </span>
            );
          })}
          {extra > 0 ? (
            <span className="text-[10px] font-semibold text-muted-foreground">+{extra}</span>
          ) : null}
          {canPick && !showSelect ? (
            <button
              type="button"
              className="rounded px-1 text-[10px] font-semibold text-primary hover:underline"
              aria-label={t('workspace.projectHubCrWorkLink')}
              onClick={() => setPicking(true)}
            >
              {t('workspace.projectHubCrWorkAdd')}
            </button>
          ) : null}
        </span>
      ) : showSelect ? null : (
        <span className="truncate text-muted-foreground">{t('workspace.projectHubCrWorkNone')}</span>
      )}
      {showSelect ? (
        <select
          className={cellSelect}
          value=""
          aria-label={t('workspace.projectHubCrWorkLink')}
          onChange={(e) => {
            const tid = e.target.value;
            if (!tid) return;
            setPicking(false);
            onLink?.(tid);
          }}
          onBlur={() => {
            if (hasWork) setPicking(false);
          }}
        >
          <option value="">{t('workspace.projectHubCrWorkPick')}</option>
          {linkable.map((c) => {
            const cid = String(c._id || c.id);
            return (
              <option key={cid} value={cid}>
                {displayIssueKey(projectCode, cid)} — {c.title || cid}
              </option>
            );
          })}
        </select>
      ) : null}
    </span>
  );
}

/**
 * Tab Change Requests — bảng + search/filter/sort/pagination.
 */
export default function ProjectHubChangeRequestsPanel({
  projectId = '',
  listActive = true,
  isDarkMode = false,
  locale = 'en',
  projectCode = '',
  canCreate = false,
  canUpdate = false,
  canDelete = false,
  /** Enrich actor names — chỉ gọi listMembers khi true (members:view). */
  canViewMembers = false,
  boardId = '',
  boardCards = [],
  lists = [],
  apiCtx = null,
  onOpenWorkItem = null,
  onRefreshBoard = null,
  externalCrId = '',
  onExternalCrConsumed = null,
}) {
  const { t } = useAppStrings();
  const crColumns = useMemo(
    () =>
      COLUMNS.map((col) => ({
        ...col,
        resizeAria: t('workspace.projectHubTableResizeCol'),
      })),
    [t]
  );
  const tableScrollRef = useRef(null);
  const { gridStyle, onResizeStart } = useResizableTableColumns({
    storageKey: 'vh.hub.cr.colWidths',
    columns: crColumns,
    containerRef: tableScrollRef,
  });
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [sortField, setSortField] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [detailId, setDetailId] = useState('');
  const [detailEpoch, setDetailEpoch] = useState(0);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [formInitial, setFormInitial] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [fetchedCards, setFetchedCards] = useState([]);

  useEffect(() => {
    const id = String(externalCrId || '').trim();
    if (!id) return;
    setDetailId(id);
    onExternalCrConsumed?.();
  }, [externalCrId, onExternalCrConsumed]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadList = useCallback(async () => {
    if (!projectId || !listActive) return;
    setLoading(true);
    setLoadError(false);
    try {
      const res = await projectAPI.listChangeRequests(projectId, {
        q: q || undefined,
        type: type || undefined,
        status: status || undefined,
        priority: priority || undefined,
        sort: sortParam(sortField, sortDir),
        page,
        size: PAGE_SIZE,
      });
      const payload = unwrapChangeRequestList(res);
      setItems((prev) =>
        (payload.items || []).map((row) => {
          const old = prev.find((p) => String(p._id || p.id) === String(row._id || row.id));
          return mergeChangeRequestPatch(old || {}, row, {});
        })
      );
      setTotal(payload.total);
      if (payload.page && payload.page !== page) setPage(payload.page);
    } catch (err) {
      setItems([]);
      setTotal(0);
      setLoadError(true);
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubCrLoadFail') })
      );
    } finally {
      setLoading(false);
    }
  }, [projectId, listActive, q, type, status, priority, sortField, sortDir, page, t]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!listActive || !projectId || !canViewMembers) {
      setProjectMembers([]);
      return undefined;
    }
    let cancelled = false;
    projectAPI
      .listMembers(projectId, { skipPermissionDeniedToast: true })
      .then((res) => {
        if (!cancelled) setProjectMembers(unwrapProjectMembers(res));
      })
      .catch(() => {
        if (!cancelled) setProjectMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [listActive, projectId, canViewMembers]);

  const parentCardCount = Array.isArray(boardCards) ? boardCards.length : 0;
  const workCards = useMemo(
    () => (parentCardCount > 0 ? boardCards : fetchedCards),
    [parentCardCount, boardCards, fetchedCards]
  );

  useEffect(() => {
    if (!listActive) return undefined;
    if (parentCardCount > 0) {
      setFetchedCards([]);
      return undefined;
    }
    if (!boardId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardDetail(boardId, apiCtx || {});
        const payload = unwrapTaskBoardDetailPayload(res);
        if (!cancelled) {
          setFetchedCards(Array.isArray(payload?.cards) ? payload.cards : []);
        }
      } catch {
        if (!cancelled) setFetchedCards([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listActive, boardId, parentCardCount, apiCtx?.workspaceSlug]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';

  const onFilterChange = (setter) => (event) => {
    setter(event.target.value);
    setPage(1);
  };

  const toggleSort = (field) => {
    if (!field) return;
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir(field === 'createdAt' || field === 'updatedAt' ? 'desc' : 'asc');
    }
    setPage(1);
  };

  const selectClass =
    'rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground';

  const emptyMessage = loading
    ? t('common.loading')
    : t('workspace.projectHubCrEmpty');

  const openCreate = () => {
    setFormMode('create');
    setFormInitial(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    setFormMode('edit');
    setFormInitial(row || null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setFormInitial(null);
  };

  const onFormSaved = () => {
    if (formMode === 'create' && page !== 1) setPage(1);
    else void loadList();
    if (detailId) setDetailEpoch((n) => n + 1);
  };

  const createBtn = canCreate ? (
    <button
      type="button"
      className="inline-flex shrink-0 items-center rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
      onClick={openCreate}
    >
      {t('workspace.projectHubCrCreate')}
    </button>
  ) : null;

  const typeLabel = (value) => {
    if (!value) return '—';
    const key = `workspace.projectHubCrType_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };
  const statusLabel = (value) => {
    if (!value) return '—';
    const key = `workspace.projectHubCrStatus_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };
  const workStatusLabel = (value) => {
    if (!value) return '—';
    const fromList = labelCrWorkStatus(value, lists);
    if (fromList && fromList !== String(value).toLowerCase()) return fromList;
    const key = `workspace.projectHubWorkStatus_${value}`;
    const label = t(key);
    return label === key ? fromList || String(value) : label;
  };
  const priorityLabel = (value) => {
    if (!value) return '—';
    const key = `workspace.projectHubCrPriority_${value}`;
    const label = t(key);
    return label === key ? String(value) : label;
  };

  const applyPatchedRow = (row, saved, patch = {}) => {
    const sid = String(saved?._id || saved?.id || row?._id || row?.id || '');
    if (!sid) return;
    setItems((prev) =>
      prev.map((item) =>
        String(item._id || item.id) === sid
          ? mergeChangeRequestPatch(item, saved || {}, patch, workCards)
          : item
      )
    );
  };

  const patchRow = async (row, patch, { failKey, successKey } = {}) => {
    const id = String(row?._id || row?.id || '');
    if (!canUpdate || !projectId || !id) return;
    try {
      const res = await projectAPI.patchChangeRequest(projectId, id, patch);
      applyPatchedRow(row, unwrapChangeRequestEntity(res) || {}, patch);
      if (patch.linkWorkItemId || patch.unlinkWorkItemId) void loadList();
      if (successKey) toast.success(t(successKey));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, {
          t,
          fallback: t(failKey || 'workspace.projectHubCrTransitionFail'),
        })
      );
    }
  };

  const stopRowClick = (e) => {
    e.stopPropagation();
  };

  if (loadError && items.length === 0 && !loading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2">
          <div>
            <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabChangeRequests')}</h3>
            <p className={`text-xs ${muted}`}>{t('workspace.projectHubCrHint')}</p>
          </div>
          {createBtn}
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12">
          <p className={`text-sm ${muted}`}>{t('workspace.projectHubCrLoadFail')}</p>
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
            onClick={() => void loadList()}
          >
            {t('workspace.projectHubCrRetry')}
          </button>
        </div>
        <ProjectHubChangeRequestFormModal
          isOpen={formOpen}
          mode={formMode}
          projectId={projectId}
          initial={formInitial}
          onClose={closeForm}
          onSaved={onFormSaved}
        />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" aria-busy={loading || undefined}>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-2">
        <div>
          <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabChangeRequests')}</h3>
          <p className={`text-xs ${muted}`}>{t('workspace.projectHubCrHint')}</p>
        </div>
        {createBtn}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder={t('workspace.projectHubCrSearchPh')}
          aria-label={t('workspace.projectHubCrSearchPh')}
          className="min-w-[12rem] flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-xs text-foreground"
        />
        <select
          value={status}
          onChange={onFilterChange(setStatus)}
          aria-label={t('workspace.projectHubCrFilterStatus')}
          className={selectClass}
        >
          <option value="">{t('workspace.projectHubCrFilterAll')}</option>
          {CR_STATUSES.map((id) => (
            <option key={id} value={id}>
              {statusLabel(id)}
            </option>
          ))}
        </select>
        <select
          value={type}
          onChange={onFilterChange(setType)}
          aria-label={t('workspace.projectHubCrFilterType')}
          className={selectClass}
        >
          <option value="">{t('workspace.projectHubCrFilterAll')}</option>
          {CR_TYPES.map((id) => (
            <option key={id} value={id}>
              {typeLabel(id)}
            </option>
          ))}
        </select>
        <select
          value={priority}
          onChange={onFilterChange(setPriority)}
          aria-label={t('workspace.projectHubCrFilterPriority')}
          className={selectClass}
        >
          <option value="">{t('workspace.projectHubCrFilterAll')}</option>
          {CR_PRIORITIES.map((id) => (
            <option key={id} value={id}>
              {priorityLabel(id)}
            </option>
          ))}
        </select>
      </div>

      <div ref={tableScrollRef} className="scrollbar-overlay min-h-0 flex-1 overflow-auto">
        <div role="table" aria-label={t('workspace.projectHubTabChangeRequests')} className="min-w-0">
          <div
            role="row"
            style={gridStyle}
            className="sticky top-0 z-10 border-b border-border bg-surface px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {crColumns.map((col) => (
              <ResizableTableHeader key={col.id} column={col} onResizeStart={onResizeStart}>
                {col.sort ? (
                  <button
                    type="button"
                    className="inline-flex min-w-0 items-center gap-0.5 text-left hover:text-foreground"
                    onClick={() => toggleSort(col.sort)}
                    aria-sort={
                      sortField === col.sort ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <span className="truncate">{t(col.labelKey)}</span>
                    {sortField === col.sort ? (
                      sortDir === 'asc' ? (
                        <ChevronUp size={12} aria-hidden />
                      ) : (
                        <ChevronDown size={12} aria-hidden />
                      )
                    ) : null}
                  </button>
                ) : (
                  <span className="truncate">{t(col.labelKey)}</span>
                )}
              </ResizableTableHeader>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <p className={`text-sm ${muted}`}>{emptyMessage}</p>
            </div>
          ) : (
            items.map((row) => {
              const id = String(row._id || row.id || '');
              const nextStatuses = listAllowedCrStatusTransitions(row.status);
              const statusOptions = [String(row.status || ''), ...nextStatuses].filter(
                (s, i, arr) => s && arr.indexOf(s) === i
              );
              const cellSelect =
                'max-w-full rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground';
              return (
                <div
                  key={id}
                  role="row"
                  tabIndex={0}
                  style={gridStyle}
                  className="w-full cursor-pointer items-center border-b border-border px-3 py-2 text-left text-xs hover:bg-muted/40"
                  onClick={() => setDetailId(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setDetailId(id);
                    }
                  }}
                >
                  <span className={`truncate font-semibold text-primary ${HUB_GRID_CELL_BORDER}`}>{row.code || '—'}</span>
                  <span className={`truncate text-foreground ${HUB_GRID_CELL_BORDER}`}>{row.title || '—'}</span>
                  <span className={`truncate ${HUB_GRID_CELL_BORDER}`}>{typeLabel(row.type)}</span>
                  <span className={`min-w-0 ${HUB_GRID_CELL_BORDER}`} onClick={stopRowClick} onMouseDown={stopRowClick}>
                    {canUpdate ? (
                      <select
                        className={cellSelect}
                        value={String(row.priority || 'medium')}
                        aria-label={t('workspace.projectHubCrColPriority')}
                        onChange={(e) => void patchRow(row, { priority: e.target.value })}
                      >
                        {CR_PRIORITIES.map((pid) => (
                          <option key={pid} value={pid}>
                            {priorityLabel(pid)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="truncate">{priorityLabel(row.priority)}</span>
                    )}
                  </span>
                  <span className={`min-w-0 ${HUB_GRID_CELL_BORDER}`} onClick={stopRowClick} onMouseDown={stopRowClick}>
                    {canUpdate && statusOptions.length ? (
                      <select
                        className={cellSelect}
                        value={String(row.status || '')}
                        disabled={nextStatuses.length === 0}
                        aria-label={t('workspace.projectHubCrColApproval')}
                        onChange={(e) => void patchRow(row, { status: e.target.value })}
                      >
                        {statusOptions.map((sid) => (
                          <option key={sid} value={sid}>
                            {statusLabel(sid)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="truncate">{statusLabel(row.status)}</span>
                    )}
                  </span>
                  <span className={`min-w-0 truncate ${HUB_GRID_CELL_BORDER}`}>
                    {workStatusLabel(row.workStatus)}
                  </span>
                  <span className={`min-w-0 ${HUB_GRID_CELL_BORDER}`} onClick={stopRowClick} onMouseDown={stopRowClick}>
                    {(() => {
                      const works = collectCrWorkItems(row, workCards);
                      const linkedIds = new Set(
                        works.map((w) => String(w._id || w.id || '')).filter(Boolean)
                      );
                      const linkable = (workCards || []).filter((c) => {
                        const cid = String(c._id || c.id || '');
                        if (!cid || linkedIds.has(cid)) return false;
                        return isLinkableCrWorkType(c.issueType || c.type);
                      });
                      return (
                        <CrWorkCell
                          works={works}
                          linkable={linkable}
                          canUpdate={canUpdate}
                          projectCode={projectCode}
                          cellSelect={cellSelect}
                          t={t}
                          onLink={(tid) =>
                            void patchRow(
                              row,
                              { linkWorkItemId: tid },
                              {
                                failKey: 'workspace.projectHubCrWorkLinkFail',
                                successKey: 'workspace.projectHubCrWorkLinked',
                              }
                            )
                          }
                        />
                      );
                    })()}
                  </span>
                  <span className={`truncate ${HUB_GRID_CELL_BORDER}`}>
                    {resolveHubActor(row, projectMembers)?.name || '—'}
                  </span>
                  <span className={`truncate ${HUB_GRID_CELL_BORDER}`}>
                    {formatHubDateTime(row.createdAt, locale) || '—'}
                  </span>
                  <span className={`truncate ${HUB_GRID_CELL_BORDER}`}>
                    {formatHubDateTime(row.updatedAt, locale) || '—'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        <span>{t('workspace.projectHubCrPageOf', { page: safePage, total: totalPages })}</span>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            disabled={safePage <= 1 || loading}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('workspace.projectHubCrPrev')}
          </button>
          <button
            type="button"
            className="rounded-md border border-border px-2 py-1 disabled:opacity-40"
            disabled={safePage >= totalPages || loading}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            {t('workspace.projectHubCrNext')}
          </button>
        </div>
      </div>

      <ProjectHubChangeRequestDetailDrawer
        open={Boolean(detailId)}
        projectId={projectId}
        crId={detailId}
        locale={locale}
        projectCode={projectCode}
        refreshKey={detailEpoch}
        canUpdate={canUpdate}
        canDelete={canDelete}
        boardCards={workCards}
        lists={lists}
        projectMembers={projectMembers}
        onEdit={canUpdate ? openEdit : null}
        onStatusChanged={() => void loadList()}
        onOpenWorkItem={onOpenWorkItem}
        onWorkItemsChanged={() => {
          void loadList();
          onRefreshBoard?.();
        }}
        onDeleted={() => {
          void loadList();
          onRefreshBoard?.();
        }}
        onClose={() => setDetailId('')}
      />
      <ProjectHubChangeRequestFormModal
        isOpen={formOpen}
        mode={formMode}
        projectId={projectId}
        initial={formInitial}
        onClose={closeForm}
        onSaved={onFormSaved}
      />
    </div>
  );
}

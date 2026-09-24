import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import PlanningResourcePanel from './PlanningResourcePanel';
import PlanningGanttPanel from './PlanningGanttPanel';
import PlanningArtifactFormDrawer from './PlanningArtifactFormDrawer';
import PlanningSuggestFromRaModal from './PlanningSuggestFromRaModal';
import Phase1SplitWorkspace from '../shared/Phase1SplitWorkspace';
import Phase1InlineActionBar from '../shared/Phase1InlineActionBar';
import {
  Phase1DataTableToolbar,
  Phase1SortableTh,
  Phase1TablePagination,
} from '../shared/Phase1DataTableChrome';
import {
  PHASE1_TABLE_PAGE_SIZE,
  paginatePhase1Rows,
  sortPhase1Rows,
} from '../shared/phase1ClientTable';
import { resolvePlanningInlineEditTarget } from '../shared/phase1InlineColumnEdit';
import { renderPhase1TableCell } from '../shared/phase1TableCell';
import {
  PHASE1_DENSE_ROW,
  PHASE1_DENSE_ROW_EDITING,
  PHASE1_DENSE_ROW_SELECTED,
  PHASE1_TABLE,
  PHASE1_TABLE_FRAME,
  PHASE1_TABLE_SHELL,
  PHASE1_TD,
} from '../shared/phase1ListDensity';
import {
  buildPlanningSubmitPayload,
  draftFromPlanningArtifact,
  getPlanningListColumns,
  truncatePlanningCell,
} from './planningWorkbookFields';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const GANTT_KINDS = new Set(['WBS', 'SCHEDULE', 'MILESTONE', 'RELEASE', 'DEPENDENCY']);
const SUGGEST_FROM_RA_KINDS = new Set(['WBS', 'RISK', 'RESOURCE', 'MILESTONE', 'SCHEDULE']);
const CONTENT_EDITABLE = new Set(['draft', 'rejected', 'changes_requested']);

const CELL_INPUT =
  'w-full min-w-[8rem] rounded border border-[#FFD591] bg-[#FFFBE6] px-1.5 py-1 text-[13px] text-[#262626] outline-none focus:border-[#FA8C16]';

/**
 * Planning list — inline cell edit + view-only side detail; create via Modal.
 */
export default function PlanningArtifactListPage({ projectId, kind, title }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [filter, setFilter] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [error, setError] = useState(null);
  const [sortId, setSortId] = useState('externalKey');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState(null);
  const [activeColId, setActiveColId] = useState(null);
  const [inlineDraft, setInlineDraft] = useState(null);
  const [inlineBaseline, setInlineBaseline] = useState(null);

  const canEdit = capabilities.canEditPlanning;
  const canReview = Boolean(capabilities.canReviewPlanning);
  const showGantt = GANTT_KINDS.has(String(kind || '').toUpperCase());

  const PLANNING_NEXT = {
    draft: 'pm_review',
    ba_review: 'tech_review',
    tech_review: 'po_review',
    pm_review: 'po_review',
    po_review: 'approved',
    changes_requested: 'pm_review',
    rejected: 'draft',
  };

  const {
    data: rows = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['planningArtifacts', projectId, kind],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId && kind),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, kind] });
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningSummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
  };

  const createMut = useMutation({
    mutationFn: (body) => planningAPI.createArtifact(projectId, { ...body, kind }),
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      toast.success(t('workspace.phase1ArtifactCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => planningAPI.updateArtifact(projectId, id, body),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1ArtifactUpdated'));
      setEditingId(null);
      setActiveColId(null);
      setInlineDraft(null);
      setInlineBaseline(null);
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus }) =>
      planningAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus }),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(t('workspace.phase1ArtifactGateOk', { status: vars?.toStatus || '' }));
      setEditingId(null);
      setActiveColId(null);
      setInlineDraft(null);
      setInlineBaseline(null);
      if (selected && String(selected.id || selected._id) === String(vars.id)) {
        setSelected((prev) => (prev ? { ...prev, status: vars.toStatus } : prev));
      }
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        String(r.externalKey || '')
          .toLowerCase()
          .includes(q) ||
        String(r.title || '')
          .toLowerCase()
          .includes(q) ||
        String(r.summary || '')
          .toLowerCase()
          .includes(q)
    );
  }, [rows, filter]);

  useEffect(() => {
    setPage(1);
    setEditingId(null);
    setActiveColId(null);
    setInlineDraft(null);
    setInlineBaseline(null);
  }, [filter, kind]);

  useEffect(() => {
    setSortId('externalKey');
    setSortDir('asc');
  }, [kind]);

  const listColumns = useMemo(() => getPlanningListColumns(kind), [kind]);
  const columnById = useMemo(() => new Map(listColumns.map((c) => [c.id, c])), [listColumns]);

  const sortedRows = useMemo(
    () =>
      sortPhase1Rows(filtered, {
        sortId,
        sortDir,
        getValue: (row, colId) => columnById.get(colId)?.getValue?.(row) ?? '',
      }),
    [filtered, sortId, sortDir, columnById]
  );

  const { pageRows, page: safePage, pageCount, total } = useMemo(
    () => paginatePhase1Rows(sortedRows, { page, pageSize: PHASE1_TABLE_PAGE_SIZE }),
    [sortedRows, page]
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const onSortColumn = (colId) => {
    setSortId((prev) => {
      if (prev === colId) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        return prev;
      }
      setSortDir('asc');
      return colId;
    });
    setPage(1);
  };

  const resourceRow = useMemo(
    () => (kind === 'RESOURCE' ? rows.find((r) => r.status !== 'approved') || rows[0] : null),
    [kind, rows]
  );

  const selectRow = (row) => setSelected(row);

  const beginInline = (row, colId) => {
    const st = String(row.status || '');
    if (!(canEdit && CONTENT_EDITABLE.has(st))) return;
    const target = resolvePlanningInlineEditTarget({ id: colId });
    if (!target) return;
    const id = String(row.id || row._id);
    setSelected(row);
    if (editingId !== id) {
      const draft = draftFromPlanningArtifact(row);
      setInlineDraft(draft);
      setInlineBaseline(draft);
      setEditingId(id);
    }
    setActiveColId(colId);
  };

  const editingRow = editingId
    ? rows.find((r) => String(r.id || r._id) === String(editingId))
    : null;

  const editingNext = useMemo(() => {
    if (!editingRow) return null;
    const st = String(editingRow.status || '').toLowerCase();
    const hasTech = Boolean(capabilities.hasPlanningTechReviewer);
    let to = PLANNING_NEXT[st];
    if (st === 'changes_requested') {
      to = String(editingRow.changesRequestedFrom || 'pm_review').toLowerCase();
    }
    if (st === 'pm_review') to = hasTech ? 'tech_review' : 'po_review';
    if (st === 'ba_review') to = hasTech ? 'tech_review' : 'pm_review';
    if (!to) return null;
    if (st === 'draft' || st === 'rejected' || st === 'changes_requested') {
      return canEdit || canReview ? to : null;
    }
    return canReview ? to : null;
  }, [editingRow, canEdit, canReview, capabilities.hasPlanningTechReviewer]);

  const isDirty = useMemo(() => {
    if (!inlineDraft || !inlineBaseline) return false;
    return JSON.stringify(inlineDraft) !== JSON.stringify(inlineBaseline);
  }, [inlineDraft, inlineBaseline]);

  const canSaveInline =
    Boolean(editingId) &&
    isDirty &&
    Boolean(String(inlineDraft?.title || '').trim()) &&
    !updateMut.isPending;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <Phase1DataTableToolbar
        kind={kind}
        title={title}
        subtitle={t('workspace.phase1PlanningListHint', { kind, count: rows.length })}
        searchValue={filter}
        onSearchChange={setFilter}
        searchPlaceholder={t('common.search')}
        extraActions={
          <>
            {canEdit ? (
              <button
                type="button"
                className="rounded-full border border-[#2563EB]/60 bg-[#EFF6FF] px-3 py-1.5 text-sm text-[#1D4ED8]"
                onClick={() => navigate(buildPhase1ModulePath(projectId, 'planning/overview'))}
                title={t('workspace.phase1DumpGoImportHint')}
              >
                {t('workspace.phase1DumpGoImport')}
              </button>
            ) : null}
            {SUGGEST_FROM_RA_KINDS.has(String(kind || '').toUpperCase()) ? (
              <button
                type="button"
                className="rounded-full border border-[#D9D9D9] bg-white px-3 py-1.5 text-sm shadow-sm"
                onClick={() => setSuggestOpen(true)}
              >
                {t('workspace.phase1AiSuggest')}
              </button>
            ) : null}
          </>
        }
        primaryLabel={canEdit ? t('common.add') : null}
        onPrimary={canEdit ? () => setCreateOpen(true) : undefined}
      />

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError || error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-1.5 text-sm">
          <span>{error || t('common.error')}</span>
          <button
            type="button"
            className="rounded border border-border px-2 py-0.5 text-xs"
            onClick={() => {
              setError(null);
              refetch();
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {showGantt ? (
        <PlanningGanttPanel artifacts={filtered} onSelect={selectRow} kind={kind} />
      ) : null}

      {kind === 'RESOURCE' && resourceRow ? (
        <PlanningResourcePanel
          projectId={projectId}
          artifact={resourceRow}
          canEdit={canEdit && CONTENT_EDITABLE.has(String(resourceRow.status))}
          onSaved={invalidate}
        />
      ) : null}

      <div className={PHASE1_TABLE_FRAME}>
        <div className={PHASE1_TABLE_SHELL}>
          <table className={PHASE1_TABLE}>
            <thead className="sticky top-0 z-10">
              <tr>
                {listColumns.map((col) => (
                  <Phase1SortableTh
                    key={col.id}
                    label={t(col.labelKey)}
                    sortId={col.id}
                    activeSortId={sortId}
                    sortDir={sortDir}
                    onSort={onSortColumn}
                    sticky={col.id === 'externalKey'}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const id = String(row.id || row._id);
                const rowEditable = canEdit && CONTENT_EDITABLE.has(String(row.status));
                const isEditing = editingId === id;
                const isSelected = selected && String(selected.id || selected._id) === id && !isEditing;
                return (
                  <tr
                    key={id}
                    className={`${rowEditable ? PHASE1_DENSE_ROW : 'odd:bg-[#F5F7FA] even:bg-white'} ${
                      isEditing ? PHASE1_DENSE_ROW_EDITING : isSelected ? PHASE1_DENSE_ROW_SELECTED : ''
                    }`}
                    onClick={() => selectRow(row)}
                  >
                    {listColumns.map((col) => {
                      const target = resolvePlanningInlineEditTarget(col);
                      const isActive = isEditing && activeColId === col.id && Boolean(target);
                      const raw = col.getValue(row);
                      const display = col.isStatus ? raw : truncatePlanningCell(raw);
                      return (
                        <td
                          key={col.id}
                          className={`${PHASE1_TD} ${col.mono ? 'font-mono text-xs' : ''} ${
                            isActive ? 'bg-[#FFF7E6] ring-2 ring-inset ring-[#FAAD14]' : ''
                          }`}
                          title={raw || undefined}
                          onClick={(e) => {
                            if (!rowEditable || !target) return;
                            e.stopPropagation();
                            beginInline(row, col.id);
                          }}
                        >
                          {isActive && inlineDraft ? (
                            target.multiline ? (
                              <textarea
                                className={`${CELL_INPUT} min-h-[52px]`}
                                value={inlineDraft[target.key] || ''}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setInlineDraft((d) => ({ ...d, [target.key]: e.target.value }))
                                }
                              />
                            ) : (
                              <input
                                className={CELL_INPUT}
                                value={inlineDraft[target.key] || ''}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setInlineDraft((d) => ({ ...d, [target.key]: e.target.value }))
                                }
                              />
                            )
                          ) : (
                            renderPhase1TableCell({ col, row, display, full: raw, t })
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!filtered.length && !isLoading ? (
                <tr>
                  <td
                    colSpan={listColumns.length}
                    className={`${PHASE1_TD} py-8 text-center text-muted-foreground`}
                  >
                    {t('workspace.phase1EmptyPlanning')}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {editingId ? (
          <Phase1InlineActionBar
            title={
              editingRow
                ? `${editingRow.externalKey || ''} — ${editingRow.title || ''}`.trim()
                : t('workspace.phase1EditArtifact')
            }
            dirty={isDirty}
            canSave={canSaveInline}
            saving={updateMut.isPending}
            transitioning={transitionMut.isPending}
            nextStatus={editingNext}
            submitLabel={
              String(editingRow?.status) === 'draft'
                ? t('workspace.phase1SubmitForReview')
                : t('workspace.phase1Approve')
            }
            cancelLabel={t('common.cancel')}
            saveLabel={t('common.save')}
            savingLabel={t('common.saving')}
            onCancel={() => {
              setEditingId(null);
              setActiveColId(null);
              setInlineDraft(null);
              setInlineBaseline(null);
            }}
            onSave={() => {
              if (!canSaveInline || !editingId || !inlineDraft) return;
              updateMut.mutate({
                id: editingId,
                body: buildPlanningSubmitPayload(kind, inlineDraft),
              });
            }}
            onSubmitReview={
              editingNext
                ? () => transitionMut.mutate({ id: editingId, toStatus: editingNext })
                : undefined
            }
          />
        ) : null}
        <Phase1TablePagination
          page={safePage}
          pageCount={pageCount}
          total={total}
          onPageChange={setPage}
          pageLabel={t('workspace.phase1TablePage', {
            page: safePage,
            pageCount,
            total,
          })}
        />
      </div>
    </div>
  );

  // Side: clone as approved so FormDrawer fields are read-only (edit is inline only).
  const sideArtifact = selected
    ? { ...selected, status: 'approved' }
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <Phase1SplitWorkspace
        list={listPane}
        detail={
          sideArtifact ? (
            <PlanningArtifactFormDrawer
              open
              mode="edit"
              kind={kind}
              artifact={sideArtifact}
              busy={false}
              transitioning={false}
              nextStatus={null}
              onClose={() => setSelected(null)}
              onSubmit={() => {}}
              variant="pane"
            />
          ) : null
        }
        hasSelection={Boolean(selected)}
        onCloseDetail={() => setSelected(null)}
        detailWidthClass="lg:w-[min(420px,38%)]"
      />
      <PlanningArtifactFormDrawer
        open={createOpen}
        mode="create"
        kind={kind}
        artifact={null}
        busy={createMut.isPending}
        transitioning={false}
        nextStatus={null}
        onClose={() => setCreateOpen(false)}
        onSubmit={(body) => createMut.mutate(body)}
        variant="modal"
      />
      <PlanningSuggestFromRaModal
        projectId={projectId}
        kind={kind}
        open={suggestOpen}
        onClose={() => setSuggestOpen(false)}
        canEdit={canEdit}
      />
    </div>
  );
}

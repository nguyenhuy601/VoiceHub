import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import Modal from '../../../../components/Shared/Modal';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import {
  getDefaultVisibleColumnIds,
  loadVisibleColumnIds,
  resolveVisibleColumns,
  truncateCell,
} from './artifactListColumns';
import ArtifactColumnPicker from './ArtifactColumnPicker';
import ArtifactDetailPanel from './ArtifactDetailPanel';
import { modulePathForArtifactKind, resolveArtifactRelated } from './artifactRelated';
import {
  buildArtifactFormState,
  buildArtifactUpdateBody,
  isArtifactContentEditable,
} from './artifactFieldCatalog';
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
import {
  readInlineFormValue,
  resolveRaInlineEditTarget,
  writeInlineFormValue,
} from '../shared/phase1InlineColumnEdit';
import { renderPhase1TableCell } from '../shared/phase1TableCell';
import {
  PHASE1_DENSE_ROW,
  PHASE1_DENSE_ROW_EDITING,
  PHASE1_DENSE_ROW_SELECTED,
  PHASE1_TABLE,
  PHASE1_TABLE_FRAME,
  PHASE1_TABLE_SHELL,
  PHASE1_TD,
  PHASE1_TD_STICKY,
} from '../shared/phase1ListDensity';
import { isTechFocusKind } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const CELL_INPUT =
  'w-full min-w-[8rem] rounded border border-[#FFD591] bg-[#FFFBE6] px-1.5 py-1 text-[13px] text-[#262626] outline-none focus:border-[#FA8C16] focus:ring-1 focus:ring-[#FA8C16]';

/**
 * RA artifact table — inline cell edit + view-only side detail; create via Modal.
 */
export default function ArtifactListPage({
  projectId,
  kind,
  title,
  readOnly = false,
  layout = 'table',
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState('');
  const [createDraft, setCreateDraft] = useState({ externalKey: '', title: '', summary: '' });
  const [visibleColumnIds, setVisibleColumnIds] = useState(
    () => loadVisibleColumnIds(kind) || getDefaultVisibleColumnIds(kind)
  );
  const [sortId, setSortId] = useState('id');
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [activeColId, setActiveColId] = useState(null);
  const [inlineForm, setInlineForm] = useState(null);
  const [inlineBaseline, setInlineBaseline] = useState(null);
  const createPaneRef = useRef(null);

  useEffect(() => {
    setVisibleColumnIds(loadVisibleColumnIds(kind) || getDefaultVisibleColumnIds(kind));
    setSortId('id');
    setSortDir('asc');
    setPage(1);
    setEditingId(null);
    setActiveColId(null);
    setInlineForm(null);
    setInlineBaseline(null);
  }, [kind]);

  useEffect(() => {
    setPage(1);
  }, [filter]);

  const canEdit =
    (capabilities.canEditAnalysis || capabilities.canImportAnalysis) && !readOnly;
  const canSubmitBa = !readOnly && Boolean(capabilities.canBaAuthorAnalysis);

  const ARTIFACT_NEXT = {
    draft: { to: 'ba_review', allow: canSubmitBa },
    ba_review: { to: 'tech_review', allow: Boolean(capabilities.canReviewAnalysisBa) && !readOnly },
    tech_review: {
      to: 'po_review',
      allow: Boolean(capabilities.canReviewAnalysisTech) && !readOnly,
    },
    po_review: { to: 'approved', allow: Boolean(capabilities.canReviewAnalysisPo) && !readOnly },
    changes_requested: { to: null, allow: canSubmitBa },
  };

  const clearArtifactQuery = useCallback(() => {
    if (!searchParams.has('artifact')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('artifact');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const stopInlineEdit = useCallback(() => {
    setEditingId(null);
    setActiveColId(null);
    setInlineForm(null);
    setInlineBaseline(null);
  }, []);

  const selectRow = useCallback(
    (id) => {
      setCreateOpen(false);
      setSelectedId(id);
      const next = new URLSearchParams(searchParams);
      next.set('artifact', String(id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  const openCreate = useCallback(() => {
    setSelectedId(null);
    setCreateOpen(true);
    stopInlineEdit();
    setCreateDraft({ externalKey: '', title: '', summary: '' });
    clearArtifactQuery();
  }, [clearArtifactQuery, stopInlineEdit]);

  useEffect(() => {
    const fromQuery = String(searchParams.get('artifact') || '').trim();
    if (!fromQuery) return;
    setCreateOpen(false);
    setSelectedId((prev) => (prev === fromQuery ? prev : fromQuery));
  }, [searchParams]);

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ['analysisArtifacts', projectId, kind],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId, { kind }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId && kind),
  });

  const { data: selectedDetail } = useQuery({
    queryKey: ['analysisArtifact', projectId, selectedId],
    queryFn: async () => unwrap(await analysisAPI.getArtifact(projectId, selectedId)),
    enabled: Boolean(projectId && selectedId),
    placeholderData: keepPreviousData,
  });

  const selectedFromList = useMemo(() => {
    if (!selectedId) return null;
    return rows.find((r) => String(r.id || r._id) === String(selectedId)) || null;
  }, [rows, selectedId]);

  const selected = selectedDetail || selectedFromList;
  const detailOpen = Boolean(selectedId);

  const { data: traceLinks = [], isLoading: linksLoading } = useQuery({
    queryKey: ['analysisTraceLinks', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listTraceLinks(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const { data: relatedCatalog = [], isLoading: catalogLoading } = useQuery({
    queryKey: ['analysisArtifacts', projectId, 'ALL'],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });

  const relatedItems = useMemo(() => {
    const catalog =
      relatedCatalog.length > 0
        ? relatedCatalog
        : [
            ...rows,
            ...(selected &&
            !rows.some((r) => String(r.id || r._id) === String(selected.id || selected._id))
              ? [selected]
              : []),
          ];
    return resolveArtifactRelated({ artifact: selected, links: traceLinks, catalog });
  }, [selected, traceLinks, relatedCatalog, rows]);

  const relatedLoading = detailOpen && (linksLoading || catalogLoading) && relatedItems.length === 0;

  const openRelated = useCallback(
    (item) => {
      if (!item || item.unresolved || !item.id) return;
      const targetKind = String(item.kind || '').toUpperCase();
      if (targetKind === String(kind || '').toUpperCase()) {
        selectRow(item.id);
        return;
      }
      const moduleSeg = modulePathForArtifactKind(targetKind);
      if (!moduleSeg) return;
      navigate(buildPhase1ModulePath(projectId, moduleSeg, { artifact: item.id }));
    },
    [kind, navigate, selectRow, projectId]
  );

  const createMut = useMutation({
    mutationFn: (body) => analysisAPI.createArtifact(projectId, { ...body, kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      setCreateOpen(false);
      setCreateDraft({ externalKey: '', title: '', summary: '' });
      toast.success(t('workspace.phase1ArtifactCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => analysisAPI.updateArtifact(projectId, id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifact', projectId, selectedId] });
      toast.success(t('workspace.phase1ArtifactSaved'));
      stopInlineEdit();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus, note }) =>
      analysisAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus, note }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifact', projectId, selectedId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1ArtifactGateOk', { status: vars?.toStatus || '' }));
      stopInlineEdit();
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedNext = useMemo(() => {
    const st = String(selected?.status || '').toLowerCase();
    const step = ARTIFACT_NEXT[st];
    if (!step?.allow) return null;
    if (st === 'changes_requested') {
      return String(selected?.changesRequestedFrom || 'tech_review').toLowerCase();
    }
    return step.to;
  }, [
    selected?.status,
    selected?.changesRequestedFrom,
    canSubmitBa,
    capabilities.canReviewAnalysisBa,
    capabilities.canReviewAnalysisTech,
    capabilities.canReviewAnalysisPo,
    readOnly,
  ]);

  const canRequestChanges =
    !readOnly &&
    ['ba_review', 'tech_review', 'po_review'].includes(String(selected?.status || '').toLowerCase()) &&
    ((String(selected?.status) === 'ba_review' && capabilities.canReviewAnalysisBa) ||
      (String(selected?.status) === 'tech_review' && capabilities.canReviewAnalysisTech) ||
      (String(selected?.status) === 'po_review' && capabilities.canReviewAnalysisPo));

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
          .includes(q)
    );
  }, [rows, filter]);

  const treeRows = useMemo(() => {
    if (layout !== 'tree') return filtered;
    const byKey = new Map(filtered.map((r) => [r.externalKey, r]));
    const roots = [];
    const children = new Map();
    for (const r of filtered) {
      const parent = r.structured?.parentExternalKey;
      if (parent && byKey.has(parent)) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(r);
      } else {
        roots.push(r);
      }
    }
    const flat = [];
    const walk = (node, depth) => {
      flat.push({ ...node, _depth: depth });
      for (const c of children.get(node.externalKey) || []) walk(c, depth + 1);
    };
    for (const r of roots) walk(r, 0);
    return flat;
  }, [filtered, layout]);

  const columns = useMemo(
    () => resolveVisibleColumns(kind, visibleColumnIds),
    [kind, visibleColumnIds]
  );

  const columnById = useMemo(() => new Map(columns.map((c) => [c.id, c])), [columns]);

  const sourceRows = layout === 'tree' ? treeRows : filtered;

  const sortedRows = useMemo(() => {
    if (layout === 'tree') return sourceRows;
    return sortPhase1Rows(sourceRows, {
      sortId,
      sortDir,
      getValue: (row, colId) => columnById.get(colId)?.getValue?.(row) ?? '',
    });
  }, [sourceRows, layout, sortId, sortDir, columnById]);

  const { pageRows, page: safePage, pageCount, total } = useMemo(
    () => paginatePhase1Rows(sortedRows, { page, pageSize: PHASE1_TABLE_PAGE_SIZE }),
    [sortedRows, page]
  );

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [safePage, page]);

  const onSortColumn = useCallback(
    (colId) => {
      if (layout === 'tree') return;
      setSortId((prev) => {
        if (prev === colId) {
          setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
          return prev;
        }
        setSortDir('asc');
        return colId;
      });
      setPage(1);
    },
    [layout]
  );

  const dirtyBody = useMemo(() => {
    if (!inlineForm || !inlineBaseline) return {};
    return buildArtifactUpdateBody(inlineForm, inlineBaseline, kind);
  }, [inlineForm, inlineBaseline, kind]);
  const isDirty = Object.keys(dirtyBody).length > 0;
  const canSaveInline =
    Boolean(editingId) &&
    isDirty &&
    !updateMut.isPending &&
    !transitionMut.isPending &&
    Boolean(String(inlineForm?.top?.title || '').trim());

  const beginInlineEdit = useCallback(
    (row, colId) => {
      if (!canEdit || !isArtifactContentEditable(row?.status)) return;
      const target = resolveRaInlineEditTarget({ id: colId }, kind);
      if (!target) return;
      const id = String(row.id || row._id);
      selectRow(id);
      if (editingId !== id) {
        const form = buildArtifactFormState(row, kind);
        setInlineForm(form);
        setInlineBaseline(form);
        setEditingId(id);
      }
      setActiveColId(colId);
    },
    [canEdit, kind, editingId, selectRow]
  );

  const onCancelInline = () => {
    stopInlineEdit();
  };

  const onSaveInline = () => {
    if (!canSaveInline || !editingId) return;
    updateMut.mutate({ id: editingId, body: dirtyBody });
  };

  useEffect(() => {
    if (createOpen) createPaneRef.current?.querySelector('input')?.focus();
  }, [createOpen]);

  const editingRow = editingId
    ? rows.find((r) => String(r.id || r._id) === String(editingId))
    : null;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <Phase1DataTableToolbar
        kind={kind}
        title={title}
        subtitle={
          <>
            {rows.length} {t('workspace.phase1Items')}
            {isTechFocusKind(kind) ? (
              <span className="ml-1.5 text-sky-800 dark:text-sky-200">
                · {t('workspace.phase1TechFocusListHint')}
              </span>
            ) : null}
          </>
        }
        searchValue={filter}
        onSearchChange={setFilter}
        searchPlaceholder={t('common.search')}
        columnsSlot={
          <ArtifactColumnPicker
            kind={kind}
            visibleIds={visibleColumnIds}
            onChange={setVisibleColumnIds}
          />
        }
        primaryLabel={canEdit ? t('common.add') : null}
        onPrimary={canEdit ? openCreate : undefined}
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">{resolveApiErrorMessage(error)}</p>
      ) : null}

      <div className={PHASE1_TABLE_FRAME}>
        <div className={PHASE1_TABLE_SHELL}>
          <table className={PHASE1_TABLE}>
            <thead className="sticky top-0 z-10">
              <tr>
                {columns.map((col) => (
                  <Phase1SortableTh
                    key={col.id}
                    label={t(col.labelKey)}
                    sortId={col.id}
                    activeSortId={sortId}
                    sortDir={sortDir}
                    onSort={layout === 'tree' ? undefined : onSortColumn}
                    sticky={col.id === 'id'}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const id = String(row.id || row._id);
                const isEditing = editingId === id;
                const isSelected = selectedId === id && !isEditing;
                const rowEditable = canEdit && isArtifactContentEditable(row.status);
                return (
                  <tr
                    key={id}
                    className={`${PHASE1_DENSE_ROW} ${
                      isEditing
                        ? PHASE1_DENSE_ROW_EDITING
                        : isSelected
                          ? PHASE1_DENSE_ROW_SELECTED
                          : ''
                    }`}
                    onClick={() => selectRow(id)}
                  >
                    {columns.map((col) => {
                      const target = resolveRaInlineEditTarget(col, kind);
                      const isActive = isEditing && activeColId === col.id && Boolean(target);
                      const isIdCol = col.id === 'id';
                      const full = col.getValue(row);
                      const display = col.isStatus ? full : truncateCell(full);
                      return (
                        <td
                          key={col.id}
                          className={`${isIdCol ? PHASE1_TD_STICKY : PHASE1_TD} max-w-[16rem] ${
                            isActive
                              ? 'bg-[#FFF7E6] ring-2 ring-inset ring-[#FAAD14]'
                              : isEditing && isIdCol
                                ? 'bg-[#FFF7E6]'
                                : isSelected && isIdCol
                                  ? 'bg-primary/10'
                                  : ''
                          } ${col.mono || isIdCol ? 'font-mono text-xs' : ''}`}
                          style={
                            isIdCol && layout === 'tree'
                              ? { paddingLeft: 10 + (row._depth || 0) * 14 }
                              : undefined
                          }
                          title={full || undefined}
                          onClick={(e) => {
                            if (!rowEditable || !target) return;
                            e.stopPropagation();
                            beginInlineEdit(row, col.id);
                          }}
                        >
                          {isActive && inlineForm ? (
                            target.multiline ? (
                              <textarea
                                className={`${CELL_INPUT} min-h-[52px] resize-y`}
                                value={readInlineFormValue(inlineForm, target)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setInlineForm((f) =>
                                    writeInlineFormValue(f, target, e.target.value)
                                  )
                                }
                              />
                            ) : (
                              <input
                                className={CELL_INPUT}
                                value={readInlineFormValue(inlineForm, target)}
                                autoFocus
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) =>
                                  setInlineForm((f) =>
                                    writeInlineFormValue(f, target, e.target.value)
                                  )
                                }
                              />
                            )
                          ) : (
                            renderPhase1TableCell({ col, row, display, full, t })
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {!isLoading && filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className={`${PHASE1_TD} py-8 text-center text-muted-foreground`}
                  >
                    {t('workspace.phase1EmptyArtifacts')}
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
            nextStatus={
              editingId === selectedId && selectedNext ? selectedNext : null
            }
            submitLabel={
              String(editingRow?.status) === 'draft'
                ? t('workspace.phase1SubmitForReview')
                : String(editingRow?.status) === 'changes_requested'
                  ? t('workspace.phase1ResubmitReview')
                  : t('workspace.phase1Approve')
            }
            cancelLabel={t('common.cancel')}
            saveLabel={t('common.save')}
            savingLabel={t('common.saving')}
            onCancel={onCancelInline}
            onSave={onSaveInline}
            onSubmitReview={
              editingId === selectedId && selectedNext
                ? () => transitionMut.mutate({ id: editingId, toStatus: selectedNext })
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

  const detailPane =
    selectedId && selected ? (
      <ArtifactDetailPanel
        artifact={selected}
        kind={kind}
        canEdit={false}
        viewOnly
        saving={false}
        transitioning={transitionMut.isPending}
        nextStatus={null}
        relatedItems={relatedItems}
        relatedLoading={relatedLoading}
        onClose={() => {
          setSelectedId(null);
          clearArtifactQuery();
        }}
        onSave={undefined}
        onTransition={
          canRequestChanges
            ? (toStatus, note) => transitionMut.mutate({ id: selectedId, toStatus, note })
            : undefined
        }
        canRequestChanges={canRequestChanges}
        canReject={canRequestChanges}
        onOpenRelated={openRelated}
      />
    ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <Phase1SplitWorkspace
        list={listPane}
        detail={detailPane}
        hasSelection={Boolean(selectedId)}
        onCloseDetail={() => {
          setSelectedId(null);
          clearArtifactQuery();
        }}
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t('workspace.phase1CreateArtifact')}
        size="md"
      >
        <div ref={createPaneRef} className="space-y-3">
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('workspace.phase1PlaceholderExternalKey')}
            value={createDraft.externalKey}
            onChange={(e) => setCreateDraft((d) => ({ ...d, externalKey: e.target.value }))}
          />
          <input
            className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('workspace.phase1PlaceholderTitle')}
            value={createDraft.title}
            onChange={(e) => setCreateDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <textarea
            className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('workspace.phase1PlaceholderSummary')}
            value={createDraft.summary}
            onChange={(e) => setCreateDraft((d) => ({ ...d, summary: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-full border border-[#D9D9D9] bg-white px-4 py-1.5 text-sm"
              onClick={() => setCreateOpen(false)}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="rounded-full bg-[#1677FF] px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              disabled={
                !createDraft.externalKey.trim() ||
                !createDraft.title.trim() ||
                createMut.isPending
              }
              onClick={() => createMut.mutate(createDraft)}
            >
              {createMut.isPending ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { getArtifactListColumns, truncateCell } from './artifactListColumns';
import ArtifactDetailPanel from './ArtifactDetailPanel';
import { modulePathForArtifactKind, resolveArtifactRelated } from './artifactRelated';
import Phase1SplitWorkspace from '../shared/Phase1SplitWorkspace';
import {
  PHASE1_DENSE_ROW,
  PHASE1_DENSE_ROW_SELECTED,
  PHASE1_TABLE,
  PHASE1_TABLE_SHELL,
  PHASE1_TD,
  PHASE1_TH,
} from '../shared/phase1ListDensity';
import { kindChipClass, statusBadgeClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const ARTIFACT_NEXT_MAP = {
  draft: 'ba_review',
  ba_review: 'tech_review',
  tech_review: 'po_review',
  po_review: 'approved',
};

/**
 * Shared list + split detail for AnalysisArtifact kinds (desktop list|pane, mobile sheet).
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
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ externalKey: '', title: '', summary: '' });
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const createPaneRef = useRef(null);

  const canEdit = capabilities.canEditAnalysis && !readOnly;

  const canSubmitBa =
    !readOnly &&
    (Boolean(capabilities.canImportAnalysis) ||
      Boolean(capabilities.canEditAnalysis) ||
      (Array.isArray(capabilities.permissions) &&
        capabilities.permissions.includes('analysis:submit_ba_review')));

  const ARTIFACT_NEXT = {
    draft: { to: 'ba_review', allow: canSubmitBa },
    ba_review: { to: 'tech_review', allow: Boolean(capabilities.canReviewAnalysisBa) && !readOnly },
    tech_review: {
      to: 'po_review',
      allow: Boolean(capabilities.canReviewAnalysisTech) && !readOnly,
    },
    po_review: { to: 'approved', allow: Boolean(capabilities.canReviewAnalysisPo) && !readOnly },
  };

  const clearArtifactQuery = useCallback(() => {
    if (!searchParams.has('artifact')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('artifact');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const closeDetail = useCallback(() => {
    setSelectedId(null);
    setCreating(false);
    clearArtifactQuery();
  }, [clearArtifactQuery]);

  const openArtifact = useCallback(
    (id) => {
      setCreating(false);
      setSelectedId(id);
      const next = new URLSearchParams(searchParams);
      next.set('artifact', String(id));
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams]
  );

  // Deep-link: /analysis-fr?artifact=<id> (Wave 4 related nav)
  useEffect(() => {
    const fromQuery = String(searchParams.get('artifact') || '').trim();
    if (!fromQuery) return;
    setCreating(false);
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

  const { data: selected } = useQuery({
    queryKey: ['analysisArtifact', projectId, selectedId],
    queryFn: async () => unwrap(await analysisAPI.getArtifact(projectId, selectedId)),
    enabled: Boolean(projectId && selectedId),
  });

  const detailOpen = Boolean(selectedId);

  // Prefetch on list page so Related pane resolves titles immediately on first click
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
        : [...rows, ...(selected && !rows.some((r) => String(r.id || r._id) === String(selected.id || selected._id)) ? [selected] : [])];
    return resolveArtifactRelated({
      artifact: selected,
      links: traceLinks,
      catalog,
    });
  }, [selected, traceLinks, relatedCatalog, rows]);

  const relatedLoading = detailOpen && (linksLoading || catalogLoading) && relatedItems.length === 0;

  const openRelated = useCallback(
    (item) => {
      if (!item || item.unresolved || !item.id) return;
      const targetKind = String(item.kind || '').toUpperCase();
      if (targetKind === String(kind || '').toUpperCase()) {
        openArtifact(item.id);
        return;
      }
      const moduleSeg = modulePathForArtifactKind(targetKind);
      if (!moduleSeg) return;
      navigate(buildPhase1ModulePath(projectId, moduleSeg, { artifact: item.id }));
    },
    [kind, navigate, openArtifact, projectId]
  );

  const createMut = useMutation({
    mutationFn: (body) => analysisAPI.createArtifact(projectId, { ...body, kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      setCreating(false);
      setDraft({ externalKey: '', title: '', summary: '' });
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
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus }) =>
      analysisAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus }),
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifact', projectId, selectedId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(
        t('workspace.phase1ArtifactGateOk', { status: vars?.toStatus || '' })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const bulkMut = useMutation({
    mutationFn: ({ fromStatus, toStatus, artifactIds }) =>
      analysisAPI.bulkTransitionArtifacts(projectId, { fromStatus, toStatus, artifactIds }),
    onSuccess: (res) => {
      const data = unwrap(res);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, 'ALL'] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(
        t('workspace.phase1BulkTransitionOk', {
          updated: data?.updated ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const selectedNext = useMemo(() => {
    const st = String(selected?.status || '').toLowerCase();
    const step = ARTIFACT_NEXT[st];
    return step?.allow ? step.to : null;
  }, [
    selected?.status,
    canSubmitBa,
    capabilities.canReviewAnalysisBa,
    capabilities.canReviewAnalysisTech,
    capabilities.canReviewAnalysisPo,
    readOnly,
  ]);
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

  const columns = useMemo(() => getArtifactListColumns(kind), [kind]);

  const visibleRows = layout === 'tree' ? treeRows : filtered;

  const selectedRows = useMemo(() => {
    return rows.filter((r) => selectedIds.has(String(r.id || r._id)));
  }, [rows, selectedIds]);

  const selectionMeta = useMemo(() => {
    if (!selectedRows.length) {
      return { ok: false, fromStatus: '', toStatus: null, allow: false };
    }
    const statuses = new Set(
      selectedRows.map((r) => String(r.status || '').toLowerCase())
    );
    if (statuses.size !== 1) {
      return { ok: false, fromStatus: '', toStatus: null, allow: false, mixed: true };
    }
    const fromStatus = [...statuses][0];
    const toStatus = ARTIFACT_NEXT_MAP[fromStatus] || null;
    const step = toStatus ? ARTIFACT_NEXT[fromStatus] : null;
    return {
      ok: Boolean(toStatus && step?.allow),
      fromStatus,
      toStatus,
      allow: Boolean(step?.allow),
      mixed: false,
    };
  }, [selectedRows, ARTIFACT_NEXT]);

  const allVisibleSelected =
    visibleRows.length > 0 &&
    visibleRows.every((r) => selectedIds.has(String(r.id || r._id)));

  const toggleSelect = useCallback((id, checked) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const r of visibleRows) next.delete(String(r.id || r._id));
      } else {
        for (const r of visibleRows) next.add(String(r.id || r._id));
      }
      return next;
    });
  }, [allVisibleSelected, visibleRows]);

  useEffect(() => {
    if (creating) createPaneRef.current?.querySelector('input')?.focus();
  }, [creating]);

  const hasSelection = Boolean(selectedId) || creating;

  const detailPane = creating ? (
    <div ref={createPaneRef} className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold">{t('workspace.phase1CreateArtifact')}</h2>
        <button
          type="button"
          className="rounded border border-border px-2 py-0.5 text-xs"
          onClick={closeDetail}
        >
          {t('common.close')}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          placeholder={t('workspace.phase1PlaceholderExternalKey')}
          value={draft.externalKey}
          onChange={(e) => setDraft((d) => ({ ...d, externalKey: e.target.value }))}
        />
        <input
          className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          placeholder={t('workspace.phase1PlaceholderTitle')}
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <textarea
          className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          placeholder={t('workspace.phase1PlaceholderSummary')}
          value={draft.summary}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
        />
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-3 py-2">
        <button
          type="button"
          className="rounded-lg border border-border px-3 py-1.5 text-sm"
          onClick={closeDetail}
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          disabled={!draft.externalKey.trim() || !draft.title.trim() || createMut.isPending}
          onClick={() => createMut.mutate(draft)}
        >
          {t('common.save')}
        </button>
      </div>
    </div>
  ) : selectedId && selected ? (
    <ArtifactDetailPanel
      artifact={selected}
      kind={kind}
      canEdit={canEdit}
      saving={updateMut.isPending}
      transitioning={transitionMut.isPending}
      nextStatus={selectedNext}
      relatedItems={relatedItems}
      relatedLoading={relatedLoading}
      onClose={closeDetail}
      onSave={(body) => updateMut.mutate({ id: selectedId, body })}
      onTransition={(toStatus) => transitionMut.mutate({ id: selectedId, toStatus })}
      onOpenRelated={openRelated}
    />
  ) : null;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-base font-semibold text-foreground">
            <span className={kindChipClass(kind)}>{kind}</span>
            {title}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {rows.length} {t('workspace.phase1Items')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm outline-none focus:border-primary"
            placeholder={t('common.search')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {selectedIds.size > 0 ? (
            <>
              <button
                type="button"
                className="rounded-lg border border-border px-2.5 py-1 text-sm"
                onClick={() => setSelectedIds(new Set())}
              >
                {t('workspace.phase1ClearSelection')}
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground disabled:opacity-40"
                disabled={!selectionMeta.ok || bulkMut.isPending}
                title={
                  selectionMeta.mixed
                    ? t('workspace.phase1BulkNeedSameStatus')
                    : undefined
                }
                onClick={() => {
                  if (!selectionMeta.ok) {
                    toast.error(t('workspace.phase1BulkNeedSameStatus'));
                    return;
                  }
                  bulkMut.mutate({
                    fromStatus: selectionMeta.fromStatus,
                    toStatus: selectionMeta.toStatus,
                    artifactIds: [...selectedIds],
                  });
                }}
              >
                {t('workspace.phase1BulkSendSelected', { count: selectedIds.size })}
              </button>
            </>
          ) : null}
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1 text-sm font-medium text-primary-foreground"
              onClick={() => {
                setSelectedId(null);
                setCreating(true);
                setDraft({ externalKey: '', title: '', summary: '' });
                clearArtifactQuery();
              }}
            >
              {t('common.add')}
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">{resolveApiErrorMessage(error)}</p>
      ) : null}

      <div className={PHASE1_TABLE_SHELL}>
        <table className={PHASE1_TABLE}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={`${PHASE1_TH} w-10`}>
                <input
                  type="checkbox"
                  aria-label={t('workspace.phase1SelectAllVisible')}
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  onClick={(e) => e.stopPropagation()}
                />
              </th>
              {columns.map((col) => (
                <th key={col.id} className={PHASE1_TH}>
                  {t(col.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const id = String(row.id || row._id);
              const selected = id === selectedId && !creating;
              const checked = selectedIds.has(id);
              return (
                <tr
                  key={id}
                  className={`${PHASE1_DENSE_ROW} ${selected ? PHASE1_DENSE_ROW_SELECTED : ''}`}
                  onClick={() => openArtifact(id)}
                >
                  <td
                    className={`${PHASE1_TD} w-10`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleSelect(id, e.target.checked)}
                      aria-label={row.externalKey || id}
                    />
                  </td>
                  {columns.map((col) => {
                    const full = col.getValue(row);
                    const display = col.isStatus ? full : truncateCell(full);
                    const isIdCol = col.id === 'id';
                    return (
                      <td
                        key={col.id}
                        className={`${PHASE1_TD} max-w-[14rem] ${col.mono || isIdCol ? 'font-mono text-xs' : ''}`}
                        style={
                          isIdCol && layout === 'tree'
                            ? { paddingLeft: 10 + (row._depth || 0) * 14 }
                            : undefined
                        }
                        title={full || undefined}
                      >
                        {col.isStatus ? (
                          <span className={statusBadgeClass(row.status)}>{display || '—'}</span>
                        ) : (
                          display || '—'
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
                  colSpan={columns.length + 1}
                  className={`${PHASE1_TD} py-8 text-center text-muted-foreground`}
                >
                  {t('workspace.phase1EmptyArtifacts')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <Phase1SplitWorkspace
        list={listPane}
        detail={detailPane}
        hasSelection={hasSelection}
        onCloseDetail={closeDetail}
      />
    </div>
  );
}

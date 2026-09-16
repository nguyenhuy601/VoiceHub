import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { getArtifactListColumns, truncateCell } from './artifactListColumns';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const STATUS_TONE = {
  draft: 'bg-muted text-muted-foreground',
  ba_review: 'bg-amber-500/15 text-amber-800 dark:text-amber-200',
  tech_review: 'bg-sky-500/15 text-sky-800 dark:text-sky-200',
  po_review: 'bg-violet-500/15 text-violet-800 dark:text-violet-200',
  approved: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
  rejected: 'bg-destructive/15 text-destructive',
};

const DRAWER_SLIDE_MS = 250;

/**
 * Shared list + detail drawer for AnalysisArtifact kinds.
 */
export default function ArtifactListPage({
  projectId,
  kind,
  title,
  readOnly = false,
  layout = 'table',
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [selectedId, setSelectedId] = useState(null);
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef(null);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ externalKey: '', title: '', summary: '' });

  const canEdit = capabilities.canEditAnalysis && !readOnly;

  const finishClose = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setSelectedId(null);
    setClosing(false);
  }, []);

  const requestClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    closeTimerRef.current = setTimeout(() => {
      finishClose();
    }, DRAWER_SLIDE_MS);
  }, [closing, finishClose]);

  const openArtifact = useCallback((id) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    setClosing(false);
    setSelectedId(id);
  }, []);

  useEffect(
    () => () => {
      if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    },
    []
  );

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

  const createMut = useMutation({
    mutationFn: (body) => analysisAPI.createArtifact(projectId, { ...body, kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysisArtifacts', projectId, kind] });
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
      queryClient.invalidateQueries({ queryKey: ['analysisArtifact', projectId, selectedId] });
      toast.success(t('workspace.phase1ArtifactSaved'));
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {kind} · {rows.length} {t('workspace.phase1Items')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            placeholder={t('common.search')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              onClick={() => setCreating(true)}
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

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted/80 text-xs uppercase text-muted-foreground">
            <tr>
              {columns.map((col) => (
                <th key={col.id} className="px-3 py-2 whitespace-nowrap">
                  {t(col.labelKey)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(layout === 'tree' ? treeRows : filtered).map((row) => (
              <tr
                key={row.id || row._id}
                className="cursor-pointer border-t border-border/60 hover:bg-muted/40"
                onClick={() => openArtifact(String(row.id || row._id))}
              >
                {columns.map((col) => {
                  const full = col.getValue(row);
                  const display = col.isStatus ? full : truncateCell(full);
                  const isIdCol = col.id === 'id';
                  return (
                    <td
                      key={col.id}
                      className={`px-3 py-2 max-w-[14rem] ${col.mono || isIdCol ? 'font-mono text-xs' : ''}`}
                      style={
                        isIdCol && layout === 'tree'
                          ? { paddingLeft: 12 + (row._depth || 0) * 16 }
                          : undefined
                      }
                      title={full || undefined}
                    >
                      {col.isStatus ? (
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[row.status] || STATUS_TONE.draft}`}
                        >
                          {display || '—'}
                        </span>
                      ) : (
                        display || '—'
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
            {!isLoading && filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  {t('workspace.phase1EmptyArtifacts')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4 shadow-xl">
            <h2 className="text-base font-semibold">{t('workspace.phase1CreateArtifact')}</h2>
            <div className="mt-3 space-y-2">
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={t('workspace.phase1PlaceholderExternalKey')}
                value={draft.externalKey}
                onChange={(e) => setDraft((d) => ({ ...d, externalKey: e.target.value }))}
              />
              <input
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={t('workspace.phase1PlaceholderTitle')}
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
              <textarea
                className="min-h-[80px] w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={t('workspace.phase1PlaceholderSummary')}
                value={draft.summary}
                onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-border px-3 py-1.5 text-sm" onClick={() => setCreating(false)}>
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
        </div>
      ) : null}

      {selectedId && selected ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-40 bg-black/20"
            onClick={requestClose}
          />
          <div
            className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-2xl transition-transform duration-200 ease-out ${
              closing ? 'translate-x-full' : 'translate-x-0'
            }`}
            onTransitionEnd={(e) => {
              if (e.propertyName !== 'transform') return;
              if (closing) finishClose();
            }}
          >
            <div className="flex items-start justify-between gap-2 border-b border-border p-4">
              <div>
                <p className="font-mono text-xs text-muted-foreground">{selected.externalKey}</p>
                <h2 className="text-base font-semibold">{selected.title}</h2>
                <span
                  className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[selected.status] || STATUS_TONE.draft}`}
                >
                  {selected.status} · v{selected.version || 1}
                </span>
              </div>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={requestClose}
                aria-label={t('common.close')}
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto p-4 text-sm">
              <label className="block">
                <span className="text-xs text-muted-foreground">{t('workspace.phase1Summary')}</span>
                <textarea
                  className="mt-1 min-h-[100px] w-full rounded-lg border border-border bg-background px-3 py-2"
                  defaultValue={selected.summary || ''}
                  disabled={!canEdit || !['draft', 'rejected'].includes(selected.status)}
                  onBlur={(e) => {
                    if (!canEdit) return;
                    if (e.target.value !== (selected.summary || '')) {
                      updateMut.mutate({ id: selectedId, body: { summary: e.target.value } });
                    }
                  }}
                />
              </label>
              {kind === 'UC' && selected.structured ? (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t('workspace.phase1Flows')}
                  </p>
                  <pre className="mt-2 whitespace-pre-wrap text-xs">
                    {JSON.stringify(
                      {
                        mainFlow: selected.structured.mainFlow,
                        alternativeFlows: selected.structured.alternativeFlows,
                        relatedFrKeys: selected.structured.relatedFrKeys,
                      },
                      null,
                      2
                    )}
                  </pre>
                </div>
              ) : null}
              {kind === 'FR' && Array.isArray(selected.structured?.relatedUcKeys) ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-muted-foreground">
                    {t('workspace.phase1UseCases')}
                  </p>
                  <ul className="mt-1 list-inside list-disc text-sm">
                    {selected.structured.relatedUcKeys.map((k) => (
                      <li key={k}>{k}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  {t('workspace.phase1VersionHistory')}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t('workspace.phase1CurrentVersion', { version: selected.version || 1 })}
                </p>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

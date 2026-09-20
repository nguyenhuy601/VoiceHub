import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import PlanningResourcePanel from './PlanningResourcePanel';
import PlanningGanttPanel from './PlanningGanttPanel';
import PlanningArtifactFormDrawer from './PlanningArtifactFormDrawer';
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

const GANTT_KINDS = new Set(['WBS', 'SCHEDULE', 'MILESTONE', 'RELEASE', 'DEPENDENCY']);

/**
 * Shared list/CRUD for PlanningArtifact kinds (+ split form pane, collapsible Gantt, AI suggest HITL).
 */
export default function PlanningArtifactListPage({ projectId, kind, title }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [filter, setFilter] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState('create');
  const [editing, setEditing] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [selectedSuggest, setSelectedSuggest] = useState(() => new Set());
  const [error, setError] = useState(null);

  const canEdit = capabilities.canEditPlanning;
  const showGantt = GANTT_KINDS.has(String(kind || '').toUpperCase());

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
      setFormOpen(false);
      setEditing(null);
      toast.success(t('workspace.phase1ArtifactCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => planningAPI.updateArtifact(projectId, id, body),
    onSuccess: () => {
      invalidate();
      setFormOpen(false);
      setEditing(null);
      toast.success(t('workspace.phase1ArtifactUpdated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const suggestMut = useMutation({
    mutationFn: () => planningAPI.suggest(projectId, { kind }),
    onSuccess: (res) => {
      const data = unwrap(res);
      const list = Array.isArray(data?.suggestions) ? data.suggestions : [];
      setSuggestions(list);
      setSelectedSuggest(new Set(list.map((_, i) => i)));
      setError(null);
      if (!list.length) {
        toast(data?.message || t('workspace.phase1AiSuggestEmpty'));
      } else {
        toast.success(data?.message || t('workspace.phase1AiSuggestReady', { count: list.length }));
      }
    },
    onError: (err) => {
      setError(resolveApiErrorMessage(err));
      toast.error(resolveApiErrorMessage(err));
    },
  });

  const confirmMut = useMutation({
    mutationFn: (items) => planningAPI.confirmSuggestions(projectId, { suggestions: items }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      setSuggestions([]);
      setSelectedSuggest(new Set());
      toast.success(
        t('workspace.phase1AiSuggestConfirmed', {
          count: data?.created ?? 0,
        })
      );
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

  const resourceRow = useMemo(
    () => (kind === 'RESOURCE' ? rows.find((r) => r.status !== 'approved') || rows[0] : null),
    [kind, rows]
  );

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
  };

  const openCreate = () => {
    setFormMode('create');
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (row) => {
    if (!['draft', 'rejected'].includes(String(row.status)) || !canEdit) return;
    setFormMode('edit');
    setEditing(row);
    setFormOpen(true);
  };

  const onSubmit = (body) => {
    if (formMode === 'edit' && editing) {
      updateMut.mutate({
        id: String(editing.id || editing._id),
        body: {
          title: body.title,
          summary: body.summary,
          parentExternalKey: body.parentExternalKey,
          structured: body.structured,
        },
      });
    } else {
      createMut.mutate(body);
    }
  };

  const editingId = editing ? String(editing.id || editing._id) : null;

  const listPane = (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className={kindChipClass(kind)}>{kind}</span>
            {title}
          </h1>
          <p className="text-[11px] text-muted-foreground">
            {t('workspace.phase1PlanningListHint', { kind, count: rows.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm"
            placeholder={t('common.search')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border border-border px-2.5 py-1 text-sm disabled:opacity-50"
            disabled={suggestMut.isPending}
            onClick={() => suggestMut.mutate()}
          >
            {t('workspace.phase1AiSuggest')}
          </button>
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-2.5 py-1 text-sm text-primary-foreground"
              onClick={openCreate}
            >
              {t('common.add')}
            </button>
          ) : null}
        </div>
      </div>

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

      {suggestions.length > 0 ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2">
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold">
              {t('workspace.phase1AiSuggestPanel', { count: suggestions.length })}
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-[11px]"
                onClick={() => setSuggestions([])}
              >
                {t('common.cancel')}
              </button>
              {canEdit ? (
                <button
                  type="button"
                  className="rounded bg-primary px-2 py-0.5 text-[11px] text-primary-foreground disabled:opacity-50"
                  disabled={confirmMut.isPending || selectedSuggest.size === 0}
                  onClick={() => {
                    const items = suggestions.filter((_, i) => selectedSuggest.has(i));
                    confirmMut.mutate(items);
                  }}
                >
                  {t('workspace.phase1AiSuggestConfirmSelected')}
                </button>
              ) : null}
            </div>
          </div>
          <ul className="max-h-28 space-y-0.5 overflow-y-auto text-xs">
            {suggestions.map((s, i) => (
              <li key={`${s.kind}-${s.externalKey}-${i}`} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selectedSuggest.has(i)}
                  onChange={() => {
                    setSelectedSuggest((prev) => {
                      const next = new Set(prev);
                      if (next.has(i)) next.delete(i);
                      else next.add(i);
                      return next;
                    });
                  }}
                />
                <span>
                  <span className="font-mono text-[10px]">{s.kind}</span> {s.externalKey} — {s.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showGantt ? (
        <PlanningGanttPanel artifacts={filtered} onSelect={openEdit} kind={kind} />
      ) : null}

      {kind === 'RESOURCE' && resourceRow ? (
        <PlanningResourcePanel
          projectId={projectId}
          artifact={resourceRow}
          canEdit={canEdit && ['draft', 'rejected'].includes(String(resourceRow.status))}
          onSaved={invalidate}
        />
      ) : null}

      <div className={PHASE1_TABLE_SHELL}>
        <table className={PHASE1_TABLE}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={PHASE1_TH}>{t('workspace.phase1ColKey')}</th>
              <th className={PHASE1_TH}>{t('workspace.phase1ColTitle')}</th>
              <th className={PHASE1_TH}>{t('workspace.phase1ColStatus')}</th>
              <th className={PHASE1_TH}>{t('workspace.phase1ColDates')}</th>
              <th className={PHASE1_TH}>{t('workspace.phase1ColSource')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => {
              const st = row.structured || {};
              const dates = [st.startDate, st.endDate || st.targetDate].filter(Boolean).join(' → ');
              const editable = canEdit && ['draft', 'rejected'].includes(String(row.status));
              const id = String(row.id || row._id);
              const selected = formOpen && formMode === 'edit' && id === editingId;
              return (
                <tr
                  key={id}
                  className={`${editable ? PHASE1_DENSE_ROW : 'odd:bg-muted/15'} ${
                    selected ? PHASE1_DENSE_ROW_SELECTED : ''
                  } ${editable ? '' : 'cursor-default'}`}
                  onClick={() => openEdit(row)}
                >
                  <td className={`${PHASE1_TD} font-mono text-xs`}>{row.externalKey}</td>
                  <td className={PHASE1_TD}>{row.title}</td>
                  <td className={PHASE1_TD}>
                    <span className={statusBadgeClass(row.status)}>{row.status || '—'}</span>
                  </td>
                  <td className={`${PHASE1_TD} text-xs text-muted-foreground`}>
                    {dates || '—'}
                  </td>
                  <td className={`${PHASE1_TD} text-xs text-muted-foreground`}>
                    {row.source}
                  </td>
                </tr>
              );
            })}
            {!filtered.length && !isLoading ? (
              <tr>
                <td colSpan={5} className={`${PHASE1_TD} py-8 text-center text-muted-foreground`}>
                  {t('workspace.phase1EmptyPlanning')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );

  const detailPane = formOpen ? (
    <PlanningArtifactFormDrawer
      open={formOpen}
      mode={formMode}
      kind={kind}
      artifact={editing}
      busy={createMut.isPending || updateMut.isPending}
      onClose={closeForm}
      onSubmit={onSubmit}
      variant="pane"
    />
  ) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3 sm:p-4">
      <Phase1SplitWorkspace
        list={listPane}
        detail={detailPane}
        hasSelection={formOpen}
        onCloseDetail={closeForm}
      />
    </div>
  );
}

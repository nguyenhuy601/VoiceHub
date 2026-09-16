import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Shared list/CRUD for PlanningArtifact kinds (+ AI suggest stub).
 */
export default function PlanningArtifactListPage({ projectId, kind, title }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ externalKey: '', title: '', summary: '' });

  const canEdit = capabilities.canEditPlanning;

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['planningArtifacts', projectId, kind],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId, { kind }));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId && kind),
  });

  const createMut = useMutation({
    mutationFn: (body) => planningAPI.createArtifact(projectId, { ...body, kind }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId, kind] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      setCreating(false);
      setDraft({ externalKey: '', title: '', summary: '' });
      toast.success(t('workspace.phase1ArtifactCreated'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const suggestMut = useMutation({
    mutationFn: () => planningAPI.suggest(projectId, { kind }),
    onSuccess: (res) => {
      const data = unwrap(res);
      toast(data?.message || t('workspace.phase1AiSuggestStub'));
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">{title}</h1>
          <p className="text-xs text-muted-foreground">
            {t('workspace.phase1PlanningListHint', { kind, count: rows.length })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('common.search')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
            disabled={suggestMut.isPending}
            onClick={() => suggestMut.mutate()}
          >
            {t('workspace.phase1AiSuggest')}
          </button>
          {canEdit ? (
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
              onClick={() => setCreating(true)}
            >
              {t('common.add')}
            </button>
          ) : null}
        </div>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-muted/80 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('workspace.phase1ColKey')}</th>
              <th className="px-3 py-2">{t('workspace.phase1ColTitle')}</th>
              <th className="px-3 py-2">{t('workspace.phase1ColStatus')}</th>
              <th className="px-3 py-2">{t('workspace.phase1ColSource')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id || row._id} className="border-t border-border/60">
                <td className="px-3 py-2 font-mono text-xs">{row.externalKey}</td>
                <td className="px-3 py-2">{row.title}</td>
                <td className="px-3 py-2 text-xs">{row.status}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{row.source}</td>
              </tr>
            ))}
            {!filtered.length && !isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  {t('workspace.phase1EmptyPlanning')}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-4">
            <h2 className="font-semibold">{t('workspace.phase1CreateArtifact')}</h2>
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
              <button type="button" className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setCreating(false)}>
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
    </div>
  );
}

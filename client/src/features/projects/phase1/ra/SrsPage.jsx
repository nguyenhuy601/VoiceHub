import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const TAB_LABEL_KEYS = {
  draft: 'workspace.phase1TabDraft',
  preview: 'workspace.phase1TabPreview',
  baselines: 'workspace.phase1TabBaselines',
};

export default function SrsPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [tab, setTab] = useState('draft');
  const [version, setVersion] = useState('');

  const { data: draft, isLoading: draftLoading } = useQuery({
    queryKey: ['srsDraft', projectId],
    queryFn: async () => unwrap(await analysisAPI.getSrsDraft(projectId)),
    enabled: Boolean(projectId) && tab !== 'baselines',
  });

  const { data: baselines = [] } = useQuery({
    queryKey: ['srsBaselines', projectId],
    queryFn: async () => {
      const raw = unwrap(await analysisAPI.listSrsBaselines(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const cutMut = useMutation({
    mutationFn: () => {
      const n = baselines.length + 1;
      return analysisAPI.cutSrsBaseline(projectId, {
        srsVersion: version.trim() || `v${n}`,
        title: t('workspace.phase1SrsBaselineTitle', { n }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['srsBaselines', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1SrsCut'));
      setTab('baselines');
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const sections = draft?.sections || {};

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{t('workspace.phaseNavSrsBaselines')}</h1>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {['draft', 'preview', 'baselines'].map((k) => (
            <button
              key={k}
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium ${tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
              onClick={() => setTab(k)}
            >
              {t(TAB_LABEL_KEYS[k])}
            </button>
          ))}
        </div>
      </div>

      {tab === 'baselines' ? (
        <div className="rounded-xl border border-border bg-surface">
          <ul className="divide-y divide-border">
            {baselines.map((b) => (
              <li key={b.id || b._id} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {b.srsVersion} — {b.title || t('workspace.phase1SrsBaselineDefault')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('workspace.phase1ArtifactsMeta', {
                    count: (b.artifactSnapshot || []).length,
                    date: b.approvedAt || '',
                  })}
                </p>
              </li>
            ))}
            {!baselines.length ? (
              <li className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('workspace.phase1NoSrsBaseline')}
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <>
          {draftLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
          <div className="space-y-3">
            {Object.entries(sections).map(([kind, rows]) => (
              <div key={kind} className="rounded-xl border border-border bg-surface p-4">
                <h2 className="text-sm font-semibold">{kind}</h2>
                <ul className="mt-2 space-y-1 text-sm">
                  {(rows || []).map((r) => (
                    <li key={r.id}>
                      <span className="font-mono text-xs">{r.externalKey}</span> {r.title}
                    </li>
                  ))}
                  {!rows?.length ? (
                    <li className="text-muted-foreground">{t('workspace.phase1EmptySection')}</li>
                  ) : null}
                </ul>
              </div>
            ))}
          </div>
          {capabilities.canCutSrs && !readOnly ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
              <input
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                placeholder={t('workspace.phase1SrsVersionPlaceholder')}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                disabled={cutMut.isPending}
                onClick={() => cutMut.mutate()}
              >
                {t('workspace.phase1CutSrs')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

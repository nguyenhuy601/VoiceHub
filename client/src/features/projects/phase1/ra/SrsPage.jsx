import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import { isSrsDraftEmpty } from './srsEmptyAudit';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const TAB_LABEL_KEYS = {
  draft: 'workspace.phase1TabDraft',
  preview: 'workspace.phase1TabPreview',
  baselines: 'workspace.phase1TabBaselines',
};

const SECTION_ORDER = ['SCOPE', 'BG', 'BR', 'BPM', 'FR', 'UC', 'NFR'];

export default function SrsPage({ projectId, readOnly = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
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
  const approvedCount = Number(draft?.artifactCount || 0);
  const sectionEntries = useMemo(() => {
    const keys = SECTION_ORDER.filter((k) => k in sections);
    for (const k of Object.keys(sections)) {
      if (!keys.includes(k)) keys.push(k);
    }
    return keys.map((kind) => [kind, sections[kind] || []]);
  }, [sections]);

  const isDraftEmpty = tab !== 'baselines' && isSrsDraftEmpty(draft, { loading: draftLoading });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t('workspace.phaseNavSrsBaselines')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1ReleaseVerIsSrsHint')}</p>
          {tab !== 'baselines' ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1SrsDraftHint')}</p>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('workspace.phase1SrsBaselinesReleaseHint')}
            </p>
          )}
        </div>
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
                  <span className="mr-1.5 inline-flex rounded border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('workspace.phase1SrsReleaseVerLabel')}
                  </span>
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

          {isDraftEmpty ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-6 text-sm">
              <h2 className="text-base font-semibold text-foreground">
                {t('workspace.phase1SrsEmptyTitle')}
              </h2>
              <p className="mt-2 text-muted-foreground">{t('workspace.phase1SrsEmptyBody')}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('workspace.phase1SrsEmptyNotBroken')}
              </p>
              <button
                type="button"
                className="mt-4 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted/50"
                onClick={() => navigate(buildPhase1ModulePath(projectId, 'analysis-reviews'))}
              >
                {t('workspace.phase1SrsGoApprove')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {!draftLoading && approvedCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t('workspace.phase1SrsApprovedCount', { count: approvedCount })}
                </p>
              ) : null}
              {sectionEntries.map(([kind, rows]) => (
                <div key={kind} className="rounded-xl border border-border bg-surface p-4">
                  <h2 className="text-sm font-semibold">{kind}</h2>
                  <ul className="mt-2 space-y-1 text-sm">
                    {(rows || []).map((r) => (
                      <li key={r.id}>
                        <span className="font-mono text-xs">{r.externalKey}</span> {r.title}
                        {r.version != null ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">
                            {t('workspace.phase1SrsDraftArtifactVer', { version: r.version })}
                          </span>
                        ) : null}
                      </li>
                    ))}
                    {!rows?.length ? (
                      <li className="text-muted-foreground">
                        {t('workspace.phase1SrsEmptySection', { kind })}
                      </li>
                    ) : null}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {capabilities.canCutSrs && !readOnly && !isDraftEmpty ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
              <p className="w-full text-xs text-muted-foreground">
                {t('workspace.phase1SrsCutCreatesReleaseVer')}
              </p>
              <input
                className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                placeholder={t('workspace.phase1SrsVersionPlaceholder')}
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                disabled={cutMut.isPending || approvedCount === 0}
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

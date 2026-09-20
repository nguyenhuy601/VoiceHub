import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { kindChipClass, queueCardClass, statusBadgeClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const NEXT_STATUS = {
  draft: 'ba_review',
  ba_review: 'tech_review',
  tech_review: 'pm_review',
  pm_review: 'po_review',
  po_review: 'approved',
  rejected: 'draft',
};

export default function PlanningApprovalPage({ projectId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [version, setVersion] = useState('');
  const [dumpText, setDumpText] = useState('');

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['planningArtifacts', projectId, 'all'],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listArtifacts(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: baselines = [] } = useQuery({
    queryKey: ['planningBaselines', projectId],
    queryFn: async () => {
      const raw = unwrap(await planningAPI.listBaselines(projectId));
      return Array.isArray(raw) ? raw : [];
    },
    enabled: Boolean(projectId),
  });

  const { data: summary } = useQuery({
    queryKey: ['planningSummary', projectId],
    queryFn: async () => unwrap(await planningAPI.getSummary(projectId)),
    enabled: Boolean(projectId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningBaselines', projectId] });
    queryClient.invalidateQueries({ queryKey: ['planningSummary', projectId] });
    queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
  };

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus }) =>
      planningAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const bulkMut = useMutation({
    mutationFn: ({ fromStatus, toStatus }) =>
      planningAPI.bulkTransitionArtifacts(projectId, { fromStatus, toStatus }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      toast.success(
        t('workspace.phase1BulkTransitionOk', {
          updated: data?.updated ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const cutMut = useMutation({
    mutationFn: () =>
      planningAPI.cutBaseline(projectId, {
        planVersion: version.trim() || `v${baselines.length + 1}`,
      }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      toast.success(t('workspace.phase1PlanningBaselineCut'));
      if (Array.isArray(data?.warnings) && data.warnings[0]?.message) {
        toast(data.warnings[0].message);
      }
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const publishMut = useMutation({
    mutationFn: () => planningAPI.publishWbs(projectId),
    onSuccess: (res) => {
      const data = unwrap(res);
      toast.success(
        t('workspace.phase1PublishWbsOk', {
          count: data?.published ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const dumpMut = useMutation({
    mutationFn: () =>
      planningAPI.bulkDumpArtifacts(projectId, {
        format: dumpText.trim().startsWith('[') ? 'json' : 'csv',
        text: dumpText,
      }),
    onSuccess: (res) => {
      const data = unwrap(res);
      invalidate();
      setDumpText('');
      toast.success(
        t('workspace.phase1DumpOk', {
          created: data?.created ?? 0,
          skipped: data?.skipped ?? 0,
        })
      );
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const forkMut = useMutation({
    mutationFn: ({ id, note }) => planningAPI.forkArtifactVersion(projectId, id, { note }),
    onSuccess: () => {
      invalidate();
      toast.success(t('workspace.phase1ForkOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const pending = rows.filter((r) => r.status !== 'approved');
  const approved = rows.filter((r) => r.status === 'approved');
  const hasBaseline = Boolean(summary?.planningBaselineExists);
  const queueCounts = useMemo(() => {
    const m = {};
    for (const r of pending) {
      m[r.status] = (m[r.status] || 0) + 1;
    }
    return m;
  }, [pending]);

  const readiness = summary?.baselineReadiness;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <h1 className="text-base font-semibold">{t('workspace.phaseNavPlanningApproval')}</h1>

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}
      {isError ? (
        <div className="flex items-center gap-2 text-sm">
          <span>{t('common.error')}</span>
          <button type="button" className="rounded border px-2 py-0.5 text-xs" onClick={() => refetch()}>
            {t('common.retry')}
          </button>
        </div>
      ) : null}

      {readiness ? (
        <div
          className={`rounded-lg border px-2.5 py-2 text-sm ${
            readiness.ok ? queueCardClass('approved') : queueCardClass('ba_review')
          }`}
        >
          <h2 className="text-xs font-semibold">{t('workspace.phase1BaselineReadiness')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {readiness.ok
              ? t('workspace.phase1BaselineReadyOk')
              : t('workspace.phase1BaselineMissingRequired', {
                  kinds: (readiness.missingRequired || []).join(', ') || '—',
                })}
          </p>
          {(readiness.missingRecommended || []).length ? (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t('workspace.phase1BaselineMissingRecommended', {
                kinds: readiness.missingRecommended.join(', '),
              })}
            </p>
          ) : null}
        </div>
      ) : null}

      {capabilities.canEditPlanning ? (
        <div className="rounded-lg border border-border bg-surface px-2.5 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-semibold">{t('workspace.phase1DumpTitle')}</h2>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className="rounded border border-border px-2 py-0.5 text-[11px]"
                onClick={async () => {
                  try {
                    const res = await planningAPI.downloadDumpTemplate(projectId);
                    const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data]);
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'planning-dump-template.xlsx';
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (err) {
                    toast.error(resolveApiErrorMessage(err));
                  }
                }}
              >
                {t('workspace.phase1DumpDownloadTemplate')}
              </button>
              <label className="cursor-pointer rounded border border-border px-2 py-0.5 text-[11px]">
                {t('workspace.phase1DumpUploadExcel')}
                <input
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (!file) return;
                    try {
                      const buf = await file.arrayBuffer();
                      const bytes = new Uint8Array(buf);
                      let binary = '';
                      bytes.forEach((b) => {
                        binary += String.fromCharCode(b);
                      });
                      const base64 = btoa(binary);
                      const res = await planningAPI.bulkDumpArtifacts(projectId, {
                        format: 'xlsx',
                        base64,
                      });
                      const data = unwrap(res);
                      invalidate();
                      toast.success(
                        t('workspace.phase1DumpOk', {
                          created: data?.created ?? 0,
                          skipped: data?.skipped ?? 0,
                        })
                      );
                    } catch (err) {
                      toast.error(resolveApiErrorMessage(err));
                    }
                  }}
                />
              </label>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">{t('workspace.phase1DumpHint')}</p>
          <textarea
            className="mt-1.5 min-h-[64px] w-full rounded-lg border border-border bg-background px-2.5 py-1.5 font-mono text-[11px]"
            placeholder={t('workspace.phase1DumpPlaceholder')}
            value={dumpText}
            onChange={(e) => setDumpText(e.target.value)}
          />
          <button
            type="button"
            className="mt-1.5 rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
            disabled={!dumpText.trim() || dumpMut.isPending}
            onClick={() => dumpMut.mutate()}
          >
            {t('workspace.phase1DumpSubmit')}
          </button>
        </div>
      ) : null}

      {capabilities.canReviewPlanning ? (
        <div className="flex flex-wrap gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-2">
          {Object.entries(NEXT_STATUS)
            .filter(([from]) => from !== 'rejected' && (queueCounts[from] || 0) > 0)
            .map(([from, to]) => (
              <button
                key={from}
                type="button"
                className="rounded border border-border px-2 py-0.5 text-[11px] disabled:opacity-50"
                disabled={bulkMut.isPending}
                onClick={() => bulkMut.mutate({ fromStatus: from, toStatus: to })}
              >
                {t('workspace.phase1BulkAdvance', {
                  from,
                  to,
                  count: queueCounts[from] || 0,
                })}
              </button>
            ))}
        </div>
      ) : null}

      <div className={`rounded-lg border ${queueCardClass('ba_review')}`}>
        <h2 className="border-b border-border/60 px-2.5 py-1.5 text-xs font-semibold">
          {t('workspace.phase1PendingArtifacts')}
        </h2>
        <ul className="divide-y divide-border/60">
          {pending.map((item) => {
            const id = String(item.id || item._id);
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 text-sm">
                <span className="flex min-w-0 flex-wrap items-center gap-1.5 text-xs">
                  <span className={kindChipClass(item.kind)}>{item.kind}</span>
                  <span className="font-mono text-[11px]">{item.externalKey}</span>
                  <span className="truncate">— {item.title}</span>
                  <span className={statusBadgeClass(item.status)}>{item.status}</span>
                </span>
                {capabilities.canReviewPlanning ? (
                  <button
                    type="button"
                    className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[11px]"
                    onClick={() =>
                      transitionMut.mutate({
                        id,
                        toStatus: NEXT_STATUS[item.status] || 'approved',
                      })
                    }
                  >
                    {t('workspace.phase1Advance')}
                  </button>
                ) : null}
              </li>
            );
          })}
          {!pending.length ? (
            <li className="px-2.5 py-3 text-sm text-muted-foreground">
              {t('workspace.phase1AllPlanningApproved')}
            </li>
          ) : null}
        </ul>
      </div>

      {hasBaseline && approved.length && capabilities.canEditPlanning ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5">
          <div className="border-b border-border/60 px-2.5 py-1.5">
            <h2 className="text-xs font-semibold">{t('workspace.phase1ForkTitle')}</h2>
            <p className="text-[11px] text-muted-foreground">{t('workspace.phase1ForkHint')}</p>
          </div>
          <ul className="max-h-40 divide-y divide-border/60 overflow-y-auto">
            {approved.slice(0, 30).map((item) => {
              const id = String(item.id || item._id);
              return (
                <li
                  key={`fork-${id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={kindChipClass(item.kind)}>{item.kind}</span>
                    <span className="font-mono text-[11px]">{item.externalKey}</span>
                    <span className={statusBadgeClass('approved')}>v{item.version || 1}</span>
                  </span>
                  <button
                    type="button"
                    className="rounded border border-border px-1.5 py-0.5 text-[11px] disabled:opacity-50"
                    disabled={forkMut.isPending}
                    onClick={() => forkMut.mutate({ id, note: 'change-control' })}
                  >
                    {t('workspace.phase1ForkAction')}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {capabilities.canCutPlanningBaseline ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2">
          <input
            className="rounded-lg border border-border bg-background px-2.5 py-1 text-sm"
            placeholder={t('workspace.phase1PlanVersionPlaceholder')}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-50"
            disabled={cutMut.isPending || readiness?.ok === false}
            onClick={() => cutMut.mutate()}
          >
            {t('workspace.phase1CutPlanningBaseline')}
          </button>
          {summary?.planningBaselineExists ? (
            <button
              type="button"
              className="rounded-lg border border-border px-2.5 py-1 text-xs disabled:opacity-50"
              disabled={publishMut.isPending}
              onClick={() => publishMut.mutate()}
            >
              {t('workspace.phase1PublishWbs')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="rounded-lg border border-border bg-surface">
        <h2 className="border-b border-border px-2.5 py-1.5 text-xs font-semibold">
          {t('workspace.phase1Baselines')}
        </h2>
        <ul className="divide-y divide-border/60">
          {baselines.map((b) => (
            <li key={b.id || b._id} className="px-2.5 py-1.5 text-xs">
              {t('workspace.phase1BaselineArtifactsCount', {
                version: b.planVersion,
                count: (b.artifactSnapshot || []).length,
              })}
              {b.isActive === false ? (
                <span className="ml-2 text-[11px] text-muted-foreground">(inactive)</span>
              ) : null}
            </li>
          ))}
          {!baselines.length ? (
            <li className="px-2.5 py-4 text-center text-sm text-muted-foreground">
              {t('workspace.phase1EmptySection')}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

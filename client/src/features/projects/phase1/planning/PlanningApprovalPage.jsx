import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { planningAPI } from '../../../../services/api/planningAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export default function PlanningApprovalPage({ projectId }) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const [version, setVersion] = useState('');

  const { data: rows = [] } = useQuery({
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

  const transitionMut = useMutation({
    mutationFn: ({ id, toStatus }) =>
      planningAPI.transitionArtifact(projectId, id, { toStatus, status: toStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningArtifacts', projectId] });
      toast.success(t('workspace.phase1TransitionOk'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const cutMut = useMutation({
    mutationFn: () =>
      planningAPI.cutBaseline(projectId, {
        planVersion: version.trim() || `v${baselines.length + 1}`,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['planningBaselines', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1PlanningBaselineCut'));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const pending = rows.filter((r) => r.status !== 'approved');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <h1 className="text-lg font-semibold">{t('workspace.phaseNavPlanningApproval')}</h1>

      <div className="rounded-xl border border-border bg-surface p-4">
        <h2 className="text-sm font-semibold">{t('workspace.phase1PendingArtifacts')}</h2>
        <ul className="mt-2 space-y-2">
          {pending.map((item) => {
            const id = String(item.id || item._id);
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  <span className="font-mono text-xs">{item.kind}</span> {item.externalKey} — {item.title}{' '}
                  <span className="text-muted-foreground">({item.status})</span>
                </span>
                {capabilities.canReviewPlanning ? (
                  <button
                    type="button"
                    className="rounded border border-border px-2 py-1 text-xs"
                    onClick={() => {
                      const map = {
                        draft: 'ba_review',
                        ba_review: 'tech_review',
                        tech_review: 'pm_review',
                        pm_review: 'po_review',
                        po_review: 'approved',
                        rejected: 'draft',
                      };
                      transitionMut.mutate({ id, toStatus: map[item.status] || 'approved' });
                    }}
                  >
                    {t('workspace.phase1Advance')}
                  </button>
                ) : null}
              </li>
            );
          })}
          {!pending.length ? (
            <li className="text-sm text-muted-foreground">
              {t('workspace.phase1AllPlanningApproved')}
            </li>
          ) : null}
        </ul>
      </div>

      {capabilities.canCutPlanningBaseline ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-4">
          <input
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            placeholder={t('workspace.phase1PlanVersionPlaceholder')}
            value={version}
            onChange={(e) => setVersion(e.target.value)}
          />
          <button
            type="button"
            className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            disabled={cutMut.isPending}
            onClick={() => cutMut.mutate()}
          >
            {t('workspace.phase1CutPlanningBaseline')}
          </button>
        </div>
      ) : null}

      <div className="rounded-xl border border-border bg-surface">
        <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">
          {t('workspace.phase1Baselines')}
        </h2>
        <ul className="divide-y divide-border">
          {baselines.map((b) => (
            <li key={b.id || b._id} className="px-4 py-3 text-sm">
              {t('workspace.phase1BaselineArtifactsCount', {
                version: b.planVersion,
                count: (b.artifactSnapshot || []).length,
              })}
            </li>
          ))}
          {!baselines.length ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('workspace.phase1EmptySection')}
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

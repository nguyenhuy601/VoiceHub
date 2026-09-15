import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import {
  buildPhase1ModulePath,
  isPlanningUnlocked,
} from '../nav/phase1NavConfig';
import { useNavigate } from 'react-router-dom';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function KindRow({ label, count, approved }) {
  const ok = approved && count > 0;
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-1.5 text-sm last:border-0">
      <span>{label}</span>
      <span className="font-mono text-xs">
        {count ?? 0} {ok ? '✓' : count ? '⚠' : '—'}
      </span>
    </div>
  );
}

export default function Phase1OverviewPage({ projectId, organizationId, deliveryPhase }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities } = useProjectCapabilities(projectId);
  const planningUnlocked = isPlanningUnlocked(deliveryPhase);

  const { data: gaps, isLoading } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await analysisAPI.getGaps(projectId)),
    enabled: Boolean(projectId) && capabilities.canViewAnalysis,
    staleTime: 15_000,
  });

  const startMut = useMutation({
    mutationFn: () => analysisAPI.startDeliveryPlanning(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeysSafe(projectId) });
      queryClient.invalidateQueries({ queryKey: ['projectAnalysisGaps', String(projectId)] });
      toast.success(t('workspace.phase1PlanningStarted'));
      navigate(buildPhase1ModulePath(projectId, 'planning/overview', { organizationId }));
    },
    onError: (err) => toast.error(resolveApiErrorMessage(err)),
  });

  const counts = gaps?.counts || {};
  const raReady = Boolean(gaps?.raReadiness?.raApproved);
  const showStartCard =
    !planningUnlocked && raReady && capabilities.canChangeDeliveryPhase;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
      <h1 className="text-lg font-semibold">{t('workspace.phase1OverviewTitle')}</h1>

      {showStartCard ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <h2 className="text-base font-semibold">{t('workspace.phase1RaApprovedTitle')}</h2>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            {t('workspace.phase1RaApprovedBody')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            disabled={startMut.isPending}
            onClick={() => startMut.mutate()}
          >
            {t('workspace.phase1StartPlanning')}
          </button>
        </div>
      ) : null}

      {isLoading ? <p className="text-sm text-muted-foreground">{t('common.loading')}</p> : null}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">{t('workspace.phase1GroupRequirementAnalysis')}</h2>
          <div className="mt-2">
            {['BG', 'BR', 'BPM', 'FR', 'UC', 'NFR', 'SCOPE'].map((k) => (
              <KindRow key={k} label={k} count={counts[k]} approved={raReady} />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold">{t('workspace.phase1Gaps')}</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            <li>
              {t('workspace.phase1GapFrMissingUcCount', {
                count: (gaps?.frMissingUc || []).length,
              })}
            </li>
            <li>
              {t('workspace.phase1GapBrMissingBgCount', {
                count: (gaps?.brMissingBg || []).length,
              })}
            </li>
            <li>{t('workspace.phase1GapCritical', { count: gaps?.criticalGapCount ?? 0 })}</li>
            <li>
              {t('workspace.phase1GapSrsBaseline', {
                mark: gaps?.srsBaselineExists ? '✓' : '—',
              })}
            </li>
            <li>
              {t('workspace.phase1GapPlanningBaseline', {
                mark: gaps?.planningBaselineExists ? '✓' : '—',
              })}
            </li>
            <li>
              {t('workspace.phase1GapReadyForPhase2', {
                mark: gaps?.readyForPhase2 ? '✓' : '—',
              })}
            </li>
          </ul>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4 md:col-span-2">
          <h2 className="text-sm font-semibold">{t('workspace.phase1GroupPlanning')}</h2>
          {planningUnlocked ? (
            <div className="mt-2 grid gap-2 sm:grid-cols-2 md:grid-cols-4">
              {Object.entries(gaps?.planningReadiness?.byKind || {}).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <p className="font-medium">{k}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('workspace.phase1PlanningApprovedDraft', {
                      approved: v.approved,
                      total: v.total,
                      draft: v.draft,
                    })}
                  </p>
                </div>
              ))}
              {!Object.keys(gaps?.planningReadiness?.byKind || {}).length ? (
                <p className="text-sm text-muted-foreground">{t('workspace.phase1PlanningEmpty')}</p>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {t('workspace.phase1PlanningLockedHint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function queryKeysSafe(projectId) {
  return ['projectHub', 'project', String(projectId || '')];
}

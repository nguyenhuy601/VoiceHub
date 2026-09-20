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
import Phase2GateBanner from '../../phase/Phase2GateBanner';
import { gateStepClass, kindChipClass } from '../shared/phase1UiTokens';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function KindChip({ label, count, approved }) {
  const ok = approved && count > 0;
  return (
    <span
      className={`${kindChipClass(label)} ${ok ? 'ring-1 ring-emerald-500/40' : ''}`}
      title={`${label}: ${count ?? 0}`}
    >
      {label}
      <span className="opacity-80">{count ?? 0}</span>
    </span>
  );
}

function Mark({ ok }) {
  return <span className="font-mono text-xs">{ok ? '✓' : '—'}</span>;
}

export default function Phase1OverviewPage({ projectId, organizationId, deliveryPhase }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { capabilities, isLoading: capsLoading } = useProjectCapabilities(projectId);
  const planningUnlocked = isPlanningUnlocked(deliveryPhase);

  const { data: gaps, isLoading } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await analysisAPI.getGaps(projectId)),
    enabled: Boolean(projectId) && !capsLoading && capabilities.canViewAnalysis,
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
  const srsReady = Boolean(gaps?.srsBaselineExists);
  const planReady = Boolean(gaps?.planningBaselineExists);
  // Gate checklist is sequential (1→2→3) so step marks never skip ahead of prior steps.
  const gateStep1Ok = raReady;
  const gateStep2Ok = raReady && srsReady;
  const gateStep3Ok = planningUnlocked;
  const showStartCta =
    !planningUnlocked && raReady && srsReady && capabilities.canChangeDeliveryPhase;
  const showNeedSrs =
    !planningUnlocked && raReady && !srsReady && capabilities.canViewAnalysis;
  const showNotReady =
    !planningUnlocked && !raReady && capabilities.canViewAnalysis;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4">
      <Phase2GateBanner
        projectId={projectId}
        organizationId={organizationId}
        deliveryPhase={deliveryPhase}
        canChangePhase={Boolean(capabilities.canChangeDeliveryPhase)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold">{t('workspace.phase1OverviewTitle')}</h1>
        {isLoading ? (
          <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
        ) : null}
      </div>

      {/* Single readiness + CTA block — Wave G1: 3-step gate copy */}
      <section className="rounded-xl border border-border bg-surface px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.phase1ReadinessTitle')}
        </h2>
        <p className="mt-1 text-[11px] font-medium text-muted-foreground">
          {t('workspace.phase1GateStepsTitle')}
        </p>
        <ol className="mt-1.5 flex flex-wrap gap-2 text-[11px]">
          <li className={gateStepClass(gateStep1Ok ? 'done' : 'pending')}>
            <Mark ok={gateStep1Ok} /> {t('workspace.phase1GateStep1')}
          </li>
          <li
            className={gateStepClass(
              gateStep2Ok ? 'done' : gateStep1Ok ? 'pending' : 'locked'
            )}
          >
            <Mark ok={gateStep2Ok} /> {t('workspace.phase1GateStep2')}
          </li>
          <li
            className={gateStepClass(
              gateStep3Ok ? 'done' : gateStep2Ok ? 'pending' : 'locked'
            )}
          >
            <Mark ok={gateStep3Ok} /> {t('workspace.phase1GateStep3')}
          </li>
        </ol>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessRa')} <Mark ok={raReady} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessSrs')} <Mark ok={srsReady} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessPlan')} <Mark ok={planReady} />
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            Phase 2 <Mark ok={Boolean(gaps?.readyForPhase2)} />
          </span>
        </div>

        {showStartCta ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <p className="flex-1 text-sm text-emerald-800 dark:text-emerald-200">
              {t('workspace.phase1RaApprovedBody')}
            </p>
            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={startMut.isPending}
              onClick={() => startMut.mutate()}
            >
              {t('workspace.phase1StartPlanning')}
            </button>
          </div>
        ) : null}

        {showNeedSrs ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-500/30 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t('workspace.phase1NeedSrsTitle')}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('workspace.phase1NeedSrsBody')}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
              onClick={() =>
                navigate(buildPhase1ModulePath(projectId, 'srs-baselines', { organizationId }))
              }
            >
              {t('workspace.phase1GoCutSrs')}
            </button>
          </div>
        ) : null}

        {showNotReady ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t('workspace.phase1RaNotReadyTitle')}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('workspace.phase1DoubleGateHint')}</p>
              {(gaps?.raReadiness?.blockingReasons || []).length ? (
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                  {(gaps.raReadiness.blockingReasons || []).slice(0, 6).map((reason, i) => {
                    const text =
                      typeof reason === 'string'
                        ? reason
                        : String(reason?.message || reason?.code || JSON.stringify(reason));
                    return <li key={`${text}-${i}`}>{text}</li>;
                  })}
                </ul>
              ) : null}
            </div>
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
              onClick={() =>
                navigate(buildPhase1ModulePath(projectId, 'analysis-reviews', { organizationId }))
              }
            >
              {t('workspace.phase1GoReviews')}
            </button>
          </div>
        ) : null}
      </section>

      <div className="grid min-h-0 gap-3 lg:grid-cols-[1fr_minmax(240px,320px)]">
        <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1GroupRequirementAnalysis')}
          </h2>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['BG', 'BR', 'BPM', 'FR', 'UC', 'NFR', 'SCOPE'].map((k) => (
              <KindChip key={k} label={k} count={counts[k]} approved={raReady} />
            ))}
          </div>
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
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
          </ul>
        </section>

        <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.phase1ConstraintsAssumptions')}
          </h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('workspace.phase1Constraints')} ({(gaps?.constraints || []).length})
              </p>
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {(gaps?.constraints || []).slice(0, 8).map((c, i) => (
                  <li key={`c-${i}`} className="truncate" title={c.text}>
                    {c.externalKey ? `${c.externalKey}: ` : ''}
                    {c.text}
                  </li>
                ))}
                {!(gaps?.constraints || []).length ? (
                  <li>{t('workspace.phase1ConstraintsEmpty')}</li>
                ) : null}
              </ul>
            </div>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {t('workspace.phase1Assumptions')} ({(gaps?.assumptions || []).length})
              </p>
              <ul className="mt-0.5 max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
                {(gaps?.assumptions || []).slice(0, 8).map((a, i) => (
                  <li key={`a-${i}`} className="truncate" title={a.text}>
                    {a.externalKey ? `${a.externalKey}: ` : ''}
                    {a.text}
                  </li>
                ))}
                {!(gaps?.assumptions || []).length ? (
                  <li>{t('workspace.phase1AssumptionsEmpty')}</li>
                ) : null}
              </ul>
            </div>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-surface px-3 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('workspace.phase1GroupPlanning')}
        </h2>
        {planningUnlocked ? (
          <div className="mt-2">
            <p className="mb-2 text-sm text-emerald-800 dark:text-emerald-200">
              {t('workspace.phase1PlanningUnlockedHint')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(gaps?.planningReadiness?.byKind || {}).map(([k, v]) => (
                <span
                  key={k}
                  className={kindChipClass(k)}
                  title={t('workspace.phase1PlanningApprovedDraft', {
                    approved: v.approved,
                    total: v.total,
                    draft: v.draft,
                  })}
                >
                  {k}
                  <span className="opacity-80">
                    {v.approved}/{v.total}
                  </span>
                </span>
              ))}
              {!Object.keys(gaps?.planningReadiness?.byKind || {}).length ? (
                <p className="text-sm text-muted-foreground">{t('workspace.phase1PlanningEmpty')}</p>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {gaps?.planningBaselineExists
                ? t('workspace.phase1PlanningBaselineExists')
                : t('workspace.phase1PlanningBaselineNeeded')}
              {gaps?.readyForPhase2 ? ` · ${t('workspace.phase1ReadyForPhase2')}` : ''}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            {t('workspace.phase1PlanningLockedHint')}
          </p>
        )}
      </section>
    </div>
  );
}

function queryKeysSafe(projectId) {
  return ['projectHub', 'project', String(projectId || '')];
}

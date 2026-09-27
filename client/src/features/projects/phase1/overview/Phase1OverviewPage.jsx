import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import {
  buildPhase1ModulePath,
  isPlanningUnlocked,
  PLANNING_KIND_BY_MODULE,
} from '../nav/phase1NavConfig';
import { useNavigate } from 'react-router-dom';
import Phase2GateBanner from '../../phase/Phase2GateBanner';
import { gateStepClass } from '../shared/phase1UiTokens';
import { modulePathForArtifactKind } from '../ra/artifactRelated';
import {
  Phase1KindNavChip as KindNavChip,
  Phase1OverviewMark as Mark,
  Phase1OverviewSection as OverviewSection,
  Phase1ReviewAttentionBlock as ReviewAttentionBlock,
} from '../shared/phase1OverviewBlocks';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/** Sidebar order — đủ kind phân tích (không chỉ 7 kind cổng). */
const ANALYSIS_KIND_ORDER = [
  'SCOPE',
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'INTERFACE',
  'DATA',
  'GLOSSARY',
  'ASSUMPTION',
];

const PLANNING_KIND_ORDER = [
  'WBS',
  'ARCHITECTURE',
  'RESOURCE',
  'DEPENDENCY',
  'SCHEDULE',
  'MILESTONE',
  'RELEASE',
  'RISK',
];

const PLANNING_MODULE_BY_KIND = Object.freeze(
  Object.fromEntries(
    Object.entries(PLANNING_KIND_BY_MODULE).map(([mod, kind]) => [kind, mod.replace(/^planning-/, 'planning/')])
  )
);

/** pathSeg for planning kinds: planning/wbs … */
function modulePathForPlanningKind(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  const fromMap = {
    WBS: 'planning/wbs',
    ARCHITECTURE: 'planning/architecture',
    RESOURCE: 'planning/resources',
    DEPENDENCY: 'planning/dependencies',
    SCHEDULE: 'planning/schedule',
    MILESTONE: 'planning/milestones',
    RELEASE: 'planning/releases',
    RISK: 'planning/risks',
  };
  return fromMap[k] || PLANNING_MODULE_BY_KIND[k] || null;
}

/**
 * Phase 1 overview — 3 sections; attention lives under Analysis / Planning respectively.
 */
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
  const gateStep1Ok = raReady;
  const gateStep2Ok = raReady && srsReady;
  const gateStep3Ok = planningUnlocked;
  const showStartCta =
    !planningUnlocked && raReady && srsReady && capabilities.canChangeDeliveryPhase;
  const showNeedSrs =
    !planningUnlocked && raReady && !srsReady && capabilities.canViewAnalysis;
  const showNotReady =
    !planningUnlocked && !raReady && capabilities.canViewAnalysis;

  const constraintCount = (gaps?.constraints || []).length;
  const assumptionCount = (gaps?.assumptions || []).length;
  const frMissingUc = (gaps?.frMissingUc || []).length;
  const brMissingBg = (gaps?.brMissingBg || []).length;
  const criticalCount = gaps?.criticalGapCount ?? 0;

  return (
    <div className="w-full space-y-5 p-3 sm:p-4">
      <Phase2GateBanner
        projectId={projectId}
        organizationId={organizationId}
        deliveryPhase={deliveryPhase}
        canChangePhase={Boolean(capabilities.canChangeDeliveryPhase)}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight">{t('workspace.phase1OverviewTitle')}</h1>
        {isLoading ? (
          <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
        ) : null}
      </div>

      {/* 1. Tổng tiến độ — chỉ cổng + CTA (không nhét inbox phân tích/planning) */}
      <OverviewSection index={1} title={t('workspace.phase1SectionProgress')}>
        <ol className="flex flex-wrap gap-2 text-[11px]">
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

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessRa')} <Mark ok={raReady} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessSrs')} <Mark ok={srsReady} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            {t('workspace.phase1ReadinessPlan')} <Mark ok={planReady} />
          </span>
          <span className="inline-flex items-center gap-1.5">
            Phase 2 <Mark ok={Boolean(gaps?.readyForPhase2)} />
          </span>
        </div>

        {showStartCta ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
            <p className="min-w-0 flex-1 text-sm text-emerald-900 dark:text-emerald-100">
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
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t('workspace.phase1NeedSrsTitle')}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('workspace.phase1NeedSrsBody')}</p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              onClick={() =>
                navigate(buildPhase1ModulePath(projectId, 'srs-baselines', { organizationId }))
              }
            >
              {t('workspace.phase1GoCutSrs')}
            </button>
          </div>
        ) : null}

        {showNotReady ? (
          <p className="mt-3 text-xs text-muted-foreground">{t('workspace.phase1DoubleGateHint')}</p>
        ) : null}
      </OverviewSection>

      {/* 2. Phân tích — đủ kind + thông báo duyệt phân tích */}
      <OverviewSection
        index={2}
        title={t('workspace.phase1SectionAnalysis')}
        action={
          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
            onClick={() =>
              navigate(buildPhase1ModulePath(projectId, 'analysis-bg', { organizationId }))
            }
          >
            {t('workspace.phase1OpenAnalysis')}
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {ANALYSIS_KIND_ORDER.map((k) => (
            <KindNavChip
              key={k}
              kind={k}
              count={counts[k] ?? 0}
              resolvePath={modulePathForArtifactKind}
              projectId={projectId}
              organizationId={organizationId}
              navigate={navigate}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <span>{t('workspace.phase1GapFrMissingUcCount', { count: frMissingUc })}</span>
          <span>{t('workspace.phase1GapBrMissingBgCount', { count: brMissingBg })}</span>
          <span>{t('workspace.phase1GapCritical', { count: criticalCount })}</span>
          <span>
            {t('workspace.phase1Constraints')}: {constraintCount}
          </span>
          <span>
            {t('workspace.phase1Assumptions')}: {assumptionCount}
          </span>
        </div>

        {!isLoading && gaps ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('workspace.phase1AttentionTitle')}
            </p>
            <ReviewAttentionBlock
              attention={gaps.reviewAttention}
              kindOrder={ANALYSIS_KIND_ORDER}
              resolvePath={modulePathForArtifactKind}
              reviewsPath="analysis-reviews"
              projectId={projectId}
              organizationId={organizationId}
              navigate={navigate}
              t={t}
            />
          </div>
        ) : null}
      </OverviewSection>

      {/* 3. Planning — catalog + thông báo duyệt planning */}
      <OverviewSection
        index={3}
        title={t('workspace.phase1SectionPlanning')}
        action={
          planningUnlocked ? (
            <button
              type="button"
              className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
              onClick={() =>
                navigate(buildPhase1ModulePath(projectId, 'planning/overview', { organizationId }))
              }
            >
              {t('workspace.phase1OpenPlanning')}
            </button>
          ) : null
        }
      >
        {planningUnlocked ? (
          <div>
            <p className="text-sm text-emerald-800 dark:text-emerald-200">
              {t('workspace.phase1PlanningUnlockedHint')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {PLANNING_KIND_ORDER.map((k) => {
                const v = gaps?.planningReadiness?.byKind?.[k];
                const total = v?.total ?? 0;
                return (
                  <KindNavChip
                    key={k}
                    kind={k}
                    count={total}
                    resolvePath={modulePathForPlanningKind}
                    projectId={projectId}
                    organizationId={organizationId}
                    navigate={navigate}
                  />
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {gaps?.planningBaselineExists
                ? t('workspace.phase1PlanningBaselineExists')
                : t('workspace.phase1PlanningBaselineNeeded')}
              {gaps?.readyForPhase2 ? ` · ${t('workspace.phase1ReadyForPhase2')}` : ''}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('workspace.phase1PlanningSectionLocked')}
          </p>
        )}

        {!isLoading && gaps && planningUnlocked ? (
          <div className="mt-3 border-t border-border/50 pt-3">
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t('workspace.phase1AttentionTitle')}
            </p>
            <ReviewAttentionBlock
              attention={gaps.planningReviewAttention}
              kindOrder={PLANNING_KIND_ORDER}
              resolvePath={modulePathForPlanningKind}
              reviewsPath="planning/approval"
              projectId={projectId}
              organizationId={organizationId}
              navigate={navigate}
              t={t}
            />
          </div>
        ) : null}
      </OverviewSection>
    </div>
  );
}

function queryKeysSafe(projectId) {
  return ['projectHub', 'project', String(projectId || '')];
}

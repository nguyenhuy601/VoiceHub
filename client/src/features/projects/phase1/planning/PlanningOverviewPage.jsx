/**
 * Planning Overview — same 3-part layout as Analysis overview:
 * 1) Excel import  2) kind catalog + stats  3) review attention + baseline readiness.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { planningAPI } from '../../../../services/api/planningAPI';
import { analysisAPI } from '../../../../services/api/analysisAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import useProjectCapabilities from '../hooks/useProjectCapabilities';
import { buildPhase1ModulePath } from '../nav/phase1NavConfig';
import {
  Phase1KindNavChip,
  Phase1OverviewSection,
  Phase1ReviewAttentionBlock,
} from '../shared/phase1OverviewBlocks';
import PlanningWorkbookImportPanel from './PlanningWorkbookImportPanel';
import {
  enrichPlanningBaselineReadiness,
  formatPlanningBaselineReadinessLines,
} from './planningBaselineReadinessCopy';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

const KIND_ORDER = Object.freeze([
  'WBS',
  'ARCHITECTURE',
  'RESOURCE',
  'DEPENDENCY',
  'SCHEDULE',
  'MILESTONE',
  'RELEASE',
  'RISK',
]);

function modulePathForPlanningKind(kind) {
  const map = {
    WBS: 'planning/wbs',
    ARCHITECTURE: 'planning/architecture',
    RESOURCE: 'planning/resources',
    DEPENDENCY: 'planning/dependencies',
    SCHEDULE: 'planning/schedule',
    MILESTONE: 'planning/milestones',
    RELEASE: 'planning/releases',
    RISK: 'planning/risks',
  };
  return map[String(kind || '').toUpperCase()] || null;
}

export default function PlanningOverviewPage({ projectId, organizationId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { capabilities } = useProjectCapabilities(projectId);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['planningSummary', projectId],
    queryFn: async () => unwrap(await planningAPI.getSummary(projectId)),
    enabled: Boolean(projectId),
  });

  const { data: gaps, isLoading: gapsLoading } = useQuery({
    queryKey: ['projectAnalysisGaps', String(projectId || '')],
    queryFn: async () => unwrap(await analysisAPI.getGaps(projectId)),
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });

  const byKind = summary?.byKind || {};
  const readiness = enrichPlanningBaselineReadiness(summary?.baselineReadiness, byKind);
  const readinessLines = readiness ? formatPlanningBaselineReadinessLines(readiness, t) : [];
  const isLoading = summaryLoading || gapsLoading;

  const totals = useMemo(() => {
    let total = 0;
    let approved = 0;
    for (const kind of KIND_ORDER) {
      const row = byKind[kind] || {};
      total += Number(row.total ?? 0);
      approved += Number(row.approved ?? 0);
    }
    return { total, approved, pending: Math.max(0, total - approved) };
  }, [byKind]);

  return (
    <div className="w-full space-y-5 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-base font-semibold tracking-tight">
            {t('workspace.phaseNavPlanningOverview')}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('workspace.phase1PlanningOverviewHint')}
          </p>
        </div>
        {isLoading ? (
          <span className="text-xs text-muted-foreground">{t('common.loading')}</span>
        ) : null}
      </div>

      <Phase1OverviewSection index={1} title={t('workspace.phase1DumpTitle')}>
        <PlanningWorkbookImportPanel
          projectId={projectId}
          canEdit={Boolean(capabilities.canEditPlanning)}
        />
      </Phase1OverviewSection>

      <Phase1OverviewSection
        index={2}
        title={t('workspace.phase1PlanningKindsTitle')}
        action={
          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
            onClick={() =>
              navigate(buildPhase1ModulePath(projectId, 'planning/wbs', { organizationId }))
            }
          >
            {t('workspace.phaseNavPlanningWbs')}
          </button>
        }
      >
        <div className="flex flex-wrap gap-1.5">
          {KIND_ORDER.map((kind) => {
            const row = byKind[kind] || {};
            return (
              <Phase1KindNavChip
                key={kind}
                kind={kind}
                count={Number(row.total ?? 0)}
                resolvePath={modulePathForPlanningKind}
                projectId={projectId}
                organizationId={organizationId}
                navigate={navigate}
              />
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/50 pt-2.5 text-xs text-muted-foreground">
          <span>
            {t('workspace.phase1PlanningOverviewTotal', { count: totals.total })}
          </span>
          <span>
            {t('workspace.phase1PlanningOverviewApproved', { count: totals.approved })}
          </span>
          <span>
            {t('workspace.phase1PlanningPendingReviewCount', { count: totals.pending })}
          </span>
          <span>
            {summary?.planningBaselineExists
              ? t('workspace.phase1PlanningBaselineExists')
              : t('workspace.phase1PlanningBaselineNeeded')}
          </span>
        </div>

        {readiness && !readiness.ok ? (
          <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
            {readinessLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        ) : null}
      </Phase1OverviewSection>

      <Phase1OverviewSection
        index={3}
        title={t('workspace.phase1AttentionTitle')}
        action={
          <button
            type="button"
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] font-medium hover:bg-muted"
            onClick={() =>
              navigate(buildPhase1ModulePath(projectId, 'planning/approval', { organizationId }))
            }
          >
            {t('workspace.phaseNavPlanningApproval')}
          </button>
        }
      >
        <Phase1ReviewAttentionBlock
          attention={gaps?.planningReviewAttention}
          kindOrder={KIND_ORDER}
          resolvePath={modulePathForPlanningKind}
          reviewsPath="planning/approval"
          projectId={projectId}
          organizationId={organizationId}
          navigate={navigate}
          t={t}
        />
      </Phase1OverviewSection>
    </div>
  );
}

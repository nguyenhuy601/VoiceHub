import { Link, Navigate, useParams } from 'react-router-dom';
import { useAppStrings } from '../../../../locales/appStrings';
import { buildPhase1ModulePath, resolvePlanningResourcesStep } from '../nav/phase1NavConfig';
import { STAFFING_STEPS } from './staffingPipelineModel';
import PlanningResourcesWbsPanel from './PlanningResourcesWbsPanel';
import PlanningResourcesEffortPanel from './PlanningResourcesEffortPanel';
import PlanningResourcesMatchPanel from './PlanningResourcesMatchPanel';
import PlanningResourcesCapacityCalendarPanel from './PlanningResourcesCapacityCalendarPanel';
import PlanningResourcesScheduleStaffingPanel from './PlanningResourcesScheduleStaffingPanel';

const STEP_LABEL_KEYS = {
  wbs: 'workspace.phaseNavPlanningResourcesWbs',
  effort: 'workspace.phaseNavPlanningResourcesEffort',
  match: 'workspace.phaseNavPlanningResourcesMatch',
  capacity: 'workspace.phaseNavPlanningResourcesCapacity',
  schedule: 'workspace.phaseNavPlanningResourcesSchedule',
};

/**
 * Parent shell for「Kế hoạch nguồn lực」— 5 staffing step panels.
 */
export default function PlanningResourcesShell({
  projectId,
  organizationId,
  step: stepProp,
}) {
  const { t } = useAppStrings();
  const params = useParams();
  const splat = params['*'] || '';
  const step = resolvePlanningResourcesStep(stepProp || splat);

  if (!splat && !stepProp) {
    return (
      <Navigate
        to={buildPhase1ModulePath(projectId, 'planning/resources/wbs')}
        replace
      />
    );
  }

  const stepIndex = STAFFING_STEPS.indexOf(step);
  const prev = stepIndex > 0 ? STAFFING_STEPS[stepIndex - 1] : null;
  const next = stepIndex >= 0 && stepIndex < STAFFING_STEPS.length - 1 ? STAFFING_STEPS[stepIndex + 1] : null;

  let body = null;
  if (step === 'wbs') {
    body = <PlanningResourcesWbsPanel projectId={projectId} />;
  } else if (step === 'effort') {
    body = <PlanningResourcesEffortPanel projectId={projectId} />;
  } else if (step === 'match') {
    body = (
      <PlanningResourcesMatchPanel projectId={projectId} organizationId={organizationId} />
    );
  } else if (step === 'capacity') {
    body = (
      <PlanningResourcesCapacityCalendarPanel
        projectId={projectId}
        organizationId={organizationId}
      />
    );
  } else if (step === 'schedule') {
    body = <PlanningResourcesScheduleStaffingPanel projectId={projectId} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 sm:p-4">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {t('workspace.phaseNavPlanningResources')}
          </p>
          <h1 className="text-lg font-semibold text-foreground">
            {t(STEP_LABEL_KEYS[step] || STEP_LABEL_KEYS.wbs)}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('workspace.phase1StaffingPipelineHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {prev ? (
            <Link
              to={buildPhase1ModulePath(projectId, `planning/resources/${prev}`)}
              className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted/40"
            >
              ← {t(STEP_LABEL_KEYS[prev])}
            </Link>
          ) : null}
          {next ? (
            <Link
              to={buildPhase1ModulePath(projectId, `planning/resources/${next}`)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/40"
            >
              {t(STEP_LABEL_KEYS[next])} →
            </Link>
          ) : null}
        </div>
      </header>
      <div className="min-h-0 flex-1">{body}</div>
    </div>
  );
}

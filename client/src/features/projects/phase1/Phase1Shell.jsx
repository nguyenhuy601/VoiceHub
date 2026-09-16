import { useEffect } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SpaceProvider, SPACE_KIND } from '../../../context/SpaceContext';
import { fetchProjectHubProject } from '../hub/useProjectHubQueries';
import { queryKeys } from '../../../lib/queryKeys';
import {
  coerceDeliveryPhase,
  isAnalysisViewModule,
  isModuleAllowedForPhase,
  isPlanningViewModule,
} from '../../../utils/projectPhaseNav';
import {
  ARTIFACT_KIND_BY_MODULE,
  PLANNING_KIND_BY_MODULE,
  PLANNING_SUB_TO_MODULE,
  buildPhase1ModulePath,
  isPhase1DeliveryPhase,
  isPlanningUnlocked,
} from './nav/phase1NavConfig';
import { PHASE_MODULE_LABEL_KEYS } from '../../../utils/projectPhaseNav';
import {
  buildProjectsModulePath,
  buildProjectsPickerPath,
  resolveProjectOrganizationId,
  writeStoredLastOrganizationId,
} from '../../../utils/suitePathUtils';
import { useAppStrings } from '../../../locales/appStrings';
import Phase1OverviewPage from './overview/Phase1OverviewPage';
import CustomerRequirementsPage from './ra/CustomerRequirementsPage';
import ArtifactListPage from './ra/ArtifactListPage';
import TraceabilityPage from './ra/TraceabilityPage';
import SrsPage from './ra/SrsPage';
import ApprovalHubPage from './ra/ApprovalHubPage';
import PlanningArtifactListPage from './planning/PlanningArtifactListPage';
import PlanningApprovalPage from './planning/PlanningApprovalPage';
import SpaceCalendarModule from '../../spaceModules/SpaceCalendarModule';
import SpaceDocumentsModule from '../../spaceModules/SpaceDocumentsModule';
import SpaceProjectChatModule from '../../spaceModules/SpaceProjectChatModule';
import ProjectHubPage from '../../../pages/Projects/ProjectHubPage';

/**
 * Nested Phase 1 body for RA + Planning modules (and collab).
 * Mounted from ProjectModuleRoute / planning/* routes.
 */
export default function Phase1Shell({
  module: moduleProp,
  planningSub: planningSubProp,
} = {}) {
  const { projectId: projectIdParam, module: moduleParam, planningModule } =
    useParams();
  const [searchParams] = useSearchParams();
  const { t } = useAppStrings();
  const projectId = String(projectIdParam || '').trim();

  const planningSub = planningSubProp || planningModule || '';
  let module =
    moduleProp ||
    (planningSub
      ? PLANNING_SUB_TO_MODULE[String(planningSub).toLowerCase()] || `planning-${planningSub}`
      : String(moduleParam || 'overview').toLowerCase());

  const { data: projectRow } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
  const deliveryPhase = coerceDeliveryPhase(projectRow?.deliveryPhase);
  const planningUnlocked = isPlanningUnlocked(deliveryPhase);
  const raReadOnly = deliveryPhase === 'delivery_planning';
  const caps = projectRow?.capabilities || {};
  const canViewAnalysis = Boolean(caps.canViewAnalysis);
  const canViewPlanning = Boolean(caps.canViewPlanning);
  const orgId = resolveProjectOrganizationId({
    search: searchParams,
    projectRow,
  });

  useEffect(() => {
    if (orgId) writeStoredLastOrganizationId(orgId);
  }, [orgId]);

  if (!projectId) {
    return <Navigate to={buildProjectsPickerPath(orgId)} replace />;
  }

  if (projectRow && !isPhase1DeliveryPhase(deliveryPhase)) {
    return <Navigate to={buildProjectsModulePath(projectId, 'overview')} replace />;
  }

  if (String(module).startsWith('planning') && !planningUnlocked) {
    return <Navigate to={buildPhase1ModulePath(projectId, 'overview')} replace />;
  }

  if (projectRow && !isModuleAllowedForPhase(module, deliveryPhase)) {
    return <Navigate to={buildPhase1ModulePath(projectId, 'overview')} replace />;
  }

  // Deep-link / bookmark: không mount analysis/planning UI khi thiếu view perm (tránh 403).
  if (
    projectRow &&
    isAnalysisViewModule(module) &&
    !canViewAnalysis
  ) {
    return <Navigate to={buildPhase1ModulePath(projectId, 'overview')} replace />;
  }
  if (projectRow && isPlanningViewModule(module) && !canViewPlanning) {
    return <Navigate to={buildPhase1ModulePath(projectId, 'overview')} replace />;
  }

  let body = null;
  if (module === 'overview' || module === 'planning-overview') {
    body =
      module === 'planning-overview' ? (
        <Phase1OverviewPage
          projectId={projectId}
          organizationId={orgId}
          deliveryPhase={deliveryPhase}
        />
      ) : (
        <Phase1OverviewPage
          projectId={projectId}
          organizationId={orgId}
          deliveryPhase={deliveryPhase}
        />
      );
  } else if (module === 'customer-documents') {
    body = (
      <CustomerRequirementsPage
        projectId={projectId}
        organizationId={orgId}
        readOnly={raReadOnly}
      />
    );
  } else if (ARTIFACT_KIND_BY_MODULE[module]) {
    const kind = ARTIFACT_KIND_BY_MODULE[module];
    const labelKey = PHASE_MODULE_LABEL_KEYS[module];
    body = (
      <ArtifactListPage
        projectId={projectId}
        kind={kind}
        title={labelKey ? t(labelKey) : kind}
        readOnly={raReadOnly}
        layout={kind === 'FR' ? 'tree' : 'table'}
      />
    );
  } else if (module === 'traceability') {
    body = <TraceabilityPage projectId={projectId} readOnly={raReadOnly} />;
  } else if (module === 'srs-baselines') {
    body = <SrsPage projectId={projectId} readOnly={raReadOnly} />;
  } else if (module === 'analysis-reviews') {
    body = <ApprovalHubPage projectId={projectId} readOnly={raReadOnly} />;
  } else if (PLANNING_KIND_BY_MODULE[module]) {
    const kind = PLANNING_KIND_BY_MODULE[module];
    const labelKey = PHASE_MODULE_LABEL_KEYS[module];
    body = (
      <PlanningArtifactListPage
        projectId={projectId}
        kind={kind}
        title={labelKey ? t(labelKey) : kind}
      />
    );
  } else if (module === 'planning-approval') {
    body = <PlanningApprovalPage projectId={projectId} />;
  } else if (module === 'chat') {
    body = <SpaceProjectChatModule />;
  } else if (module === 'calendar') {
    body = <SpaceCalendarModule />;
  } else if (module === 'documents') {
    body = <SpaceDocumentsModule />;
  } else if (module === 'members' || module === 'settings') {
    body = (
      <ProjectHubPage
        controlledModule={module}
        hideTabBar
        onModuleChange={() => {}}
        onSwitchProject={() => {}}
      />
    );
  } else {
    body = (
      <Navigate
        to={buildPhase1ModulePath(projectId, 'overview', { organizationId: orgId })}
        replace
      />
    );
  }

  return (
    <SpaceProvider kind={SPACE_KIND.PROJECT} organizationId={orgId} projectId={projectId}>
      {body}
    </SpaceProvider>
  );
}

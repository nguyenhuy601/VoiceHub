import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import ProjectHubPage from '../../../pages/Projects/ProjectHubPage';
import CollaborateRequirementsPage from '../../requirements/CollaborateRequirementsPage';
import SpaceCalendarModule from '../../spaceModules/SpaceCalendarModule';
import SpaceDocumentsModule from '../../spaceModules/SpaceDocumentsModule';
import SpaceProjectChatModule from '../../spaceModules/SpaceProjectChatModule';
import Phase1Shell from '../phase1/Phase1Shell';
import { MODULE_TO_HUB_TAB, normalizeProjectModule } from '../../../utils/suiteNavConfig';
import {
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  isPhase1DeliveryPhase,
  phaseHomeModule,
} from '../../../utils/projectPhaseNav';
import {
  ARTIFACT_KIND_BY_MODULE,
  PLANNING_KIND_BY_MODULE,
  PLANNING_SUB_TO_MODULE,
} from '../phase1/nav/phase1NavConfig';
import {
  buildProjectsModulePath,
  buildProjectsPickerPath,
  resolveProjectOrganizationId,
  writeStoredLastOrganizationId,
} from '../../../utils/suitePathUtils';
import { writeStoredLastProjectId } from '../picker/projectPickerRemember';
import { SpaceProvider, SPACE_KIND } from '../../../context/SpaceContext';
import { fetchProjectHubProject } from './useProjectHubQueries';
import { queryKeys } from '../../../lib/queryKeys';
import { useAppStrings } from '../../../locales/appStrings';

const PHASE1_MODULES = new Set([
  'overview',
  'customer-documents',
  'analysis-bg',
  'analysis-br',
  'analysis-bpm',
  'analysis-fr',
  'analysis-uc',
  'analysis-nfr',
  'analysis-scope',
  'traceability',
  'analysis-reviews',
  'srs-baselines',
  ...Object.keys(ARTIFACT_KIND_BY_MODULE),
  ...Object.keys(PLANNING_KIND_BY_MODULE),
  ...Object.values(PLANNING_SUB_TO_MODULE),
]);

/**
 * Route /app/projects/:projectId/:module — data always scoped to projectId.
 * Phase 1 delivery phases render Phase1Shell for analysis/planning modules.
 */
export default function ProjectModuleRoute() {
  const { projectId: projectIdParam, module: moduleParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = String(projectIdParam || '').trim();
  const module = normalizeProjectModule(moduleParam);

  const { t } = useAppStrings();
  const {
    data: projectRow,
    isPending: projectPending,
  } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
  // Only coerce after row exists — loading must not imply development (Phase 2 hub flash).
  const deliveryPhase = projectRow ? coerceDeliveryPhase(projectRow.deliveryPhase) : null;
  const orgId = resolveProjectOrganizationId({
    search: searchParams,
    projectRow,
  });

  useEffect(() => {
    if (projectId) writeStoredLastProjectId(projectId);
  }, [projectId]);

  useEffect(() => {
    if (orgId) writeStoredLastOrganizationId(orgId);
  }, [orgId]);

  const onModuleChange = useCallback(
    (tabId) => {
      navigate(
        buildProjectsModulePath(projectId, tabId, {
          boardId: searchParams.get('boardId') || '',
        })
      );
    },
    [navigate, projectId, searchParams]
  );

  const onSwitchProject = useCallback(() => {
    navigate(buildProjectsPickerPath(orgId));
  }, [navigate, orgId]);

  if (!projectId) {
    return <Navigate to={buildProjectsPickerPath(orgId)} replace />;
  }

  if (projectPending && !projectRow) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (projectRow && !isModuleAllowedForPhase(module, deliveryPhase)) {
    return (
      <Navigate to={buildProjectsModulePath(projectId, phaseHomeModule(deliveryPhase))} replace />
    );
  }

  if (
    projectRow &&
    isPhase1DeliveryPhase(deliveryPhase) &&
    (PHASE1_MODULES.has(module) ||
      module === 'overview' ||
      module === 'chat' ||
      module === 'calendar' ||
      module === 'documents' ||
      module === 'members' ||
      module === 'settings')
  ) {
    return <Phase1Shell module={module} />;
  }

  const hubTab = MODULE_TO_HUB_TAB[module] || null;

  let body = null;
  if (module === 'chat') {
    body = <SpaceProjectChatModule />;
  } else if (module === 'calendar') {
    body = <SpaceCalendarModule />;
  } else if (module === 'documents') {
    body = <SpaceDocumentsModule />;
  } else if (module === 'requirements') {
    body = <CollaborateRequirementsPage />;
  } else if (hubTab) {
    body = (
      <ProjectHubPage
        controlledModule={hubTab}
        hideTabBar
        onModuleChange={onModuleChange}
        onSwitchProject={onSwitchProject}
      />
    );
  } else {
    body = <Navigate to={buildProjectsModulePath(projectId, 'overview')} replace />;
  }

  return (
    <SpaceProvider kind={SPACE_KIND.PROJECT} organizationId={orgId} projectId={projectId}>
      {body}
    </SpaceProvider>
  );
}

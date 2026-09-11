import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import ProjectHubPage from '../../../pages/Projects/ProjectHubPage';
import CollaborateRequirementsPage from '../../requirements/CollaborateRequirementsPage';
import SpaceCalendarModule from '../../spaceModules/SpaceCalendarModule';
import SpaceDocumentsModule from '../../spaceModules/SpaceDocumentsModule';
import SpaceProjectChatModule from '../../spaceModules/SpaceProjectChatModule';
import ProjectPhasePlaceholderPage from '../phase/ProjectPhasePlaceholderPage';
import { MODULE_TO_HUB_TAB, normalizeProjectModule } from '../../../utils/suiteNavConfig';
import {
  ANALYSIS_PLACEHOLDER_MODULES,
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  phaseHomeModule,
} from '../../../utils/projectPhaseNav';
import {
  buildProjectsModulePath,
  buildProjectsPickerPath,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../../utils/suitePathUtils';
import { writeStoredLastProjectId } from '../picker/projectPickerRemember';
import { SpaceProvider, SPACE_KIND } from '../../../context/SpaceContext';
import { fetchProjectHubProject } from './useProjectHubQueries';
import { queryKeys } from '../../../lib/queryKeys';

/**
 * Route /app/projects/:projectId/:module — data always scoped to projectId.
 */
export default function ProjectModuleRoute() {
  const { projectId: projectIdParam, module: moduleParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = String(projectIdParam || '').trim();
  const module = normalizeProjectModule(moduleParam);
  const orgId = orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();

  const { data: projectRow } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
  });
  const deliveryPhase = coerceDeliveryPhase(projectRow?.deliveryPhase);

  useEffect(() => {
    if (projectId) writeStoredLastProjectId(projectId);
  }, [projectId]);

  const onModuleChange = useCallback(
    (tabId) => {
      navigate(
        buildProjectsModulePath(projectId, tabId, {
          organizationId: orgId,
          boardId: searchParams.get('boardId') || '',
        })
      );
    },
    [navigate, projectId, orgId, searchParams]
  );

  const onSwitchProject = useCallback(() => {
    navigate(buildProjectsPickerPath(orgId));
  }, [navigate, orgId]);

  if (!projectId) {
    return <Navigate to={buildProjectsPickerPath(orgId)} replace />;
  }

  if (projectRow && !isModuleAllowedForPhase(module, deliveryPhase)) {
    return (
      <Navigate
        to={buildProjectsModulePath(projectId, phaseHomeModule(deliveryPhase), {
          organizationId: orgId,
        })}
        replace
      />
    );
  }

  const hubTab = MODULE_TO_HUB_TAB[module] || null;

  let body = null;
  if (ANALYSIS_PLACEHOLDER_MODULES.includes(module)) {
    body = <ProjectPhasePlaceholderPage />;
  } else if (module === 'chat') {
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
    body = (
      <Navigate
        to={buildProjectsModulePath(projectId, 'overview', { organizationId: orgId })}
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

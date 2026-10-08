import { useCallback, useEffect } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { SpaceProvider, SPACE_KIND } from '../../../../context/SpaceContext';
import { AdminLoadErrorState } from '../../../../components/adminUsers/adminPanelStates';
import { fetchProjectHubProject } from '../useProjectHubQueries';
import { queryKeys } from '../../../../lib/queryKeys';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import {
  coerceDeliveryPhase,
  isModuleAllowedForPhase,
  phaseHomeModule,
} from '../../../../utils/projectPhaseNav';
import {
  buildProjectsModulePath,
  buildProjectsPickerPath,
  resolveProjectOrganizationId,
  writeStoredLastOrganizationId,
} from '../../../../utils/suitePathUtils';
import { MODULE_TO_HUB_TAB, normalizeProjectModule } from '../../../../utils/suiteNavConfig';
import { useAppStrings } from '../../../../locales/appStrings';
import ProjectHubPage from '../../../../pages/Projects/ProjectHubPage';
import SpaceCalendarModule from '../../../spaceModules/SpaceCalendarModule';
import SpaceDocumentsModule from '../../../spaceModules/SpaceDocumentsModule';
import SpaceProjectChatModule from '../../../spaceModules/SpaceProjectChatModule';
import { isPhase4DeliveryPhase } from './phase4Ui';
import Phase4OverviewPage from './Phase4OverviewPage';
import Phase4HandoverChecklistPage from './Phase4HandoverChecklistPage';
import Phase4DeployEvidencePage from './Phase4DeployEvidencePage';
import Phase4ReleaseNotesPage from './Phase4ReleaseNotesPage';

/**
 * Phase 4 release_handover workspace — primary tabs + tra cứu (board/TC/CR).
 */
export default function Phase4Shell({ module: moduleProp } = {}) {
  const { projectId: projectIdParam, module: moduleParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const projectId = String(projectIdParam || '').trim();
  const module = normalizeProjectModule(moduleProp || moduleParam || 'overview');

  const {
    data: projectRow,
    isPending: projectPending,
    isError: projectError,
    error: projectQueryError,
    refetch: refetchProject,
  } = useQuery({
    queryKey: queryKeys.projectHub.project(projectId),
    queryFn: () => fetchProjectHubProject(projectId),
    enabled: Boolean(projectId),
    staleTime: 15_000,
  });

  const deliveryPhase = projectRow ? coerceDeliveryPhase(projectRow.deliveryPhase) : null;
  const orgId = resolveProjectOrganizationId({
    search: searchParams,
    projectRow,
  });

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
      <div
        className="flex min-h-[12rem] items-center justify-center gap-2 p-6 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
        <span>{t('common.loading')}</span>
      </div>
    );
  }

  if (projectError && !projectRow) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center p-6">
        <AdminLoadErrorState
          message={resolveApiErrorMessage(projectQueryError, {
            t,
            fallback: t('workspace.phase4LoadFail'),
          })}
          onRetry={() => void refetchProject()}
        />
      </div>
    );
  }

  if (projectRow && !isPhase4DeliveryPhase(deliveryPhase)) {
    return (
      <Navigate to={buildProjectsModulePath(projectId, phaseHomeModule(deliveryPhase))} replace />
    );
  }

  // Legacy tab /acceptance → gộp vào Checklist bàn giao
  if (module === 'acceptance') {
    return <Navigate to={buildProjectsModulePath(projectId, 'handover')} replace />;
  }

  if (projectRow && !isModuleAllowedForPhase(module, deliveryPhase)) {
    return <Navigate to={buildProjectsModulePath(projectId, 'overview')} replace />;
  }

  let body = null;
  if (module === 'overview') {
    body = <Phase4OverviewPage projectId={projectId} />;
  } else if (module === 'handover') {
    body = <Phase4HandoverChecklistPage projectId={projectId} />;
  } else if (module === 'deploy-evidence') {
    body = <Phase4DeployEvidencePage projectId={projectId} />;
  } else if (module === 'release-notes') {
    body = <Phase4ReleaseNotesPage projectId={projectId} />;
  } else if (module === 'chat') {
    body = <SpaceProjectChatModule />;
  } else if (module === 'calendar') {
    body = <SpaceCalendarModule />;
  } else if (module === 'documents') {
    body = <SpaceDocumentsModule />;
  } else if (MODULE_TO_HUB_TAB[module]) {
    body = (
      <ProjectHubPage
        controlledModule={MODULE_TO_HUB_TAB[module]}
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden overflow-y-auto">
        {body}
      </div>
    </SpaceProvider>
  );
}

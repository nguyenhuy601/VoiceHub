import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import ProjectsLandingGrid from '../../features/projects/landing/ProjectsLandingGrid';
import { isProjectActiveForUi } from '../../features/projects/landing/projectLandingActive';
import {
  buildCollaborateProjectHubPath,
  buildCollaborateProjectsNewAiPath,
  buildCollaborateProjectsNewPath,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';
import useRequirementAccess from '../../hooks/useRequirementAccess';
import useOrganizationDetail from '../../hooks/useOrganizationDetail';
import useOrgProjectsList from '../../hooks/useOrgProjectsList';
import useTaskWorkspaceScope from '../../hooks/useTaskWorkspaceScope';
import { resolveLandingCreateActions } from '../../features/projects/landing/projectsLandingCreateActions';

/**
 * Projects Landing — A/B/C/D:
 * A Bootstrap = App Shell only (auth restore), not page data.
 * B = org detail + projects list + task scope + requirement access.
 * C = organizationId from URL/storage (routing).
 * D page BFF = not used here (Hub overview only).
 */

function isMyProject(project) {
  const mb = project?.myMembership;
  if (!mb) return true; // fallback for legacy payloads
  if (typeof mb.isMember === 'boolean') return mb.isMember;
  if (Array.isArray(mb.projectRoleKeys)) return mb.projectRoleKeys.length > 0;
  return true;
}

export default function ProjectsLandingPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();

  const { organization } = useOrganizationDetail(orgId);
  const {
    projects: rawProjects,
    loading: projectsLoading,
    isError: projectsError,
    reload: reloadProjects,
  } = useOrgProjectsList(orgId, { excludeClosed: true });
  const { canCreateTask, loading: scopeLoading } = useTaskWorkspaceScope(orgId);
  const { access: requirementAccess, loading: requirementAccessLoading } =
    useRequirementAccess(orgId);

  const orgName = String(organization?.name || '').trim();
  const canCreate = Boolean(canCreateTask);
  const canCreateWithAi = canCreate && Boolean(requirementAccess?.canRunAiPlanning);

  /** Grid waits only on projects list; create actions resolve progressively. */
  const listLoading = Boolean(orgId) && projectsLoading;
  const { showCreate, createDisabled, showCreateWithAi, createWithAiDisabled } =
    resolveLandingCreateActions({
      scopeLoading,
      canCreate,
      requirementAccessLoading,
      canCreateWithAi,
    });

  const projects = useMemo(
    () => rawProjects.filter(isMyProject).filter(isProjectActiveForUi),
    [rawProjects]
  );

  const handleCreate = useCallback(() => {
    if (!orgId) {
      toast.error(t('organizations.selectOrgFirst'));
      return;
    }
    if (!canCreate) {
      toast.error(t('taskBoard.createBoardDenied'));
      return;
    }
    navigate(buildCollaborateProjectsNewPath(orgId, { from: 'hub' }));
  }, [canCreate, navigate, orgId, t]);

  const handleCreateWithAi = useCallback(() => {
    if (!orgId) {
      toast.error(t('organizations.selectOrgFirst'));
      return;
    }
    if (!canCreateWithAi) {
      toast.error(t('taskBoard.createBoardDenied'));
      return;
    }
    navigate(buildCollaborateProjectsNewAiPath(orgId, { from: 'hub' }));
  }, [canCreateWithAi, navigate, orgId, t]);

  const handleSelect = useCallback(
    (project) => {
      const projectId = String(project?._id || project?.projectId || '').trim();
      if (!projectId) return;
      const boardId = String(project?.defaultBoardId || project?.boards?.[0]?._id || '').trim();
      navigate(buildCollaborateProjectHubPath(projectId, { organizationId: orgId, boardId }));
    },
    [navigate, orgId]
  );

  if (!orgId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {t('organizations.selectOrgFirst')}
      </div>
    );
  }

  if (listLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (projectsError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{t('taskBoard.loadBoardFail')}</p>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => reloadProjects()}
        >
          {t('workspace.projectHubTimelineRetry')}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0">
      <ProjectsLandingGrid
        organizationName={orgName}
        projects={projects}
        onCreateProject={showCreate ? handleCreate : undefined}
        onCreateProjectWithAi={showCreateWithAi ? handleCreateWithAi : undefined}
        createProjectDisabled={createDisabled}
        createProjectWithAiDisabled={createWithAiDisabled}
        onSelectProject={handleSelect}
      />
    </div>
  );
}

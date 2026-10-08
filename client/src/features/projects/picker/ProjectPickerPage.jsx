import { useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectsLandingGrid from '../landing/ProjectsLandingGrid';
import { isProjectListableForUi } from '../landing/projectLandingActive';
import {
  buildProjectsNewPath,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../../utils/suitePathUtils';
import {
  readStoredLastProjectId,
  writeStoredLastProjectId,
  isRememberedProjectValid,
} from './projectPickerRemember';
import useRequirementAccess from '../../../hooks/useRequirementAccess';
import useOrganizationDetail from '../../../hooks/useOrganizationDetail';
import useOrgProjectsList from '../../../hooks/useOrgProjectsList';
import useTaskWorkspaceScope from '../../../hooks/useTaskWorkspaceScope';
import { resolveLandingCreateActions } from '../landing/projectsLandingCreateActions';
import { resolveAiProjectEntryPath } from '../phase1/aiHitl/aiHitlNavState';
import { loadLinkedPackForAiNav } from '../phase1/aiHitl/loadLinkedPackForAiNav';

function isMyProject(project) {
  const mb = project?.myMembership;
  if (!mb) return true;
  if (typeof mb.isMember === 'boolean') return mb.isMember;
  if (Array.isArray(mb.projectRoleKeys)) return mb.projectRoleKeys.length > 0;
  return true;
}

/** Project Picker gate — chọn dự án trước khi vào module. */
export default function ProjectPickerPage() {
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
  } = useOrgProjectsList(orgId, { excludeClosed: false });
  const { canCreateProjectCapability, loading: scopeLoading } = useTaskWorkspaceScope(orgId);
  const { access: requirementAccess, loading: requirementAccessLoading } =
    useRequirementAccess(orgId);

  const orgName = String(organization?.name || '').trim();
  const canCreate = Boolean(canCreateProjectCapability);
  const canCreateWithAi = canCreate && Boolean(requirementAccess?.canRunAiPlanning);

  const listLoading = Boolean(orgId) && projectsLoading;
  const { showCreate, createDisabled, showCreateWithAi, createWithAiDisabled } =
    resolveLandingCreateActions({
      scopeLoading,
      canCreate,
      requirementAccessLoading,
      canCreateWithAi,
    });

  const projects = useMemo(
    () => rawProjects.filter(isMyProject).filter(isProjectListableForUi),
    [rawProjects]
  );

  const rememberedId = readStoredLastProjectId();
  const continueProject = useMemo(() => {
    if (!isRememberedProjectValid(rememberedId, projects)) return null;
    return projects.find((p) => String(p?._id || p?.projectId || '') === rememberedId) || null;
  }, [rememberedId, projects]);

  const enterProject = useCallback(
    async (project) => {
      const projectId = String(project?._id || project?.projectId || '').trim();
      if (!projectId) return;
      writeStoredLastProjectId(projectId);
      const boardId = String(project?.defaultBoardId || project?.boards?.[0]?._id || '').trim();
      const phase = String(project?.deliveryPhase || '').trim().toLowerCase();
      let pack = null;
      if (!phase || phase === 'requirement_analysis') {
        try {
          pack = await loadLinkedPackForAiNav(orgId, projectId);
        } catch {
          pack = null;
        }
      }
      navigate(
        resolveAiProjectEntryPath({
          projectId,
          project,
          pack,
          boardId,
          organizationId: orgId,
        })
      );
    },
    [navigate, orgId]
  );

  const handleCreate = useCallback(() => {
    if (!orgId) {
      toast.error(t('organizations.selectOrgFirst'));
      return;
    }
    if (!canCreate) {
      toast.error(t('taskBoard.createProjectDenied'));
      return;
    }
    navigate(buildProjectsNewPath());
  }, [canCreate, navigate, orgId, t]);

  const handleCreateWithAi = useCallback(() => {
    if (!orgId) {
      toast.error(t('organizations.selectOrgFirst'));
      return;
    }
    navigate(buildProjectsNewPath(orgId, { analysisMode: 'ai' }));
  }, [navigate, orgId, t]);

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
        <p className="text-sm text-muted-foreground">{t('nav.projectsLoadFail')}</p>
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {continueProject ? (
        <div className="shrink-0 border-b border-border bg-muted/40 px-4 py-3">
          <button
            type="button"
            onClick={() => enterProject(continueProject)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            {t('nav.projectsContinue')}:{' '}
            {continueProject.title || continueProject.name || rememberedId}
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">
        <ProjectsLandingGrid
          organizationName={orgName}
          projects={projects}
          onCreateProject={showCreate ? handleCreate : undefined}
          onCreateProjectWithAi={showCreateWithAi ? handleCreateWithAi : undefined}
          createProjectDisabled={createDisabled}
          createProjectWithAiDisabled={createWithAiDisabled}
          onSelectProject={enterProject}
        />
      </div>
    </div>
  );
}

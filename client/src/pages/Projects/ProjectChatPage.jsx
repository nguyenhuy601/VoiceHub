import { useCallback } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import ProjectChatWorkspace from '../../features/projects/chat/ProjectChatWorkspace';
import {
  buildCollaborateProjectsChatPath,
  buildCollaborateProjectsNewPath,
  buildCollaborateProjectsPath,
  channelQueryFromSearch,
  isProjectChatTabEnabled,
  orgQueryFromSearch,
  projectQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';

export default function ProjectChatPage() {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orgId = orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();
  const channelId = channelQueryFromSearch(searchParams);
  const projectIdFilter = projectQueryFromSearch(searchParams);
  const chatEnabled = isProjectChatTabEnabled();

  const handleSelectChannel = useCallback(
    (id) => {
      navigate(
        buildCollaborateProjectsChatPath(orgId, {
          channelId: String(id || '').trim(),
          projectId: projectIdFilter,
        })
      );
    },
    [navigate, orgId, projectIdFilter]
  );

  if (!chatEnabled) {
    return <Navigate to={buildCollaborateProjectsPath(orgId)} replace />;
  }

  if (!orgId) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground">
        {t('organizations.selectOrgFirst')}
      </div>
    );
  }

  return (
    <ProjectChatWorkspace
      organizationId={orgId}
      projectIdFilter={projectIdFilter}
      channelId={channelId}
      onSelectChannel={handleSelectChannel}
      emptyCta={
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => navigate(buildCollaborateProjectsNewPath(orgId, { from: 'chat' }))}
        >
          {t('workspace.projectChatCreateProjectCta')}
        </button>
      }
    />
  );
}

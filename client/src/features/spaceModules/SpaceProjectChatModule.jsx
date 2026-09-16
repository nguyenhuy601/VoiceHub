import { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ProjectChatWorkspace from '../projects/chat/ProjectChatWorkspace';
import { useSpace, SPACE_KIND } from '../../context/SpaceContext';
import {
  buildProjectsModulePath,
  channelQueryFromSearch,
} from '../../utils/suitePathUtils';

/**
 * Project suite chat — mount ProjectChatWorkspace directly (no ProjectHub / boardId hop).
 */
export default function SpaceProjectChatModule() {
  const space = useSpace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const organizationId = String(space?.organizationId || '').trim();
  const projectId =
    space?.kind === SPACE_KIND.PROJECT ? String(space?.projectId || '').trim() : '';
  const channelId = channelQueryFromSearch(searchParams);

  const handleSelectChannel = useCallback(
    (id) => {
      if (!projectId) return;
      navigate(
        buildProjectsModulePath(projectId, 'chat', {
          organizationId,
          channelId: String(id || '').trim(),
        }),
        { replace: true }
      );
    },
    [navigate, projectId, organizationId]
  );

  return (
    <ProjectChatWorkspace
      organizationId={organizationId}
      projectIdFilter={projectId}
      channelId={channelId}
      onSelectChannel={handleSelectChannel}
      canViewMembers={Boolean(organizationId && projectId)}
    />
  );
}

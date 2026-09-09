import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import {
  buildCollaborateProjectHubPath,
  buildCollaborateProjectsPath,
  orgQueryFromSearch,
  projectQueryFromSearch,
  boardQueryFromSearch,
} from '../../utils/suitePathUtils';

/**
 * Legacy /app/collaborate/tasks → /app/collaborate/projects[/:projectId]
 */
export default function LegacyTasksRedirect() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const projectId = projectQueryFromSearch(location.search) || String(searchParams.get('projectId') || '').trim();
  const orgId = orgQueryFromSearch(location.search);
  const boardId = boardQueryFromSearch(location.search);
  const to = projectId
    ? buildCollaborateProjectHubPath(projectId, { organizationId: orgId, boardId })
    : buildCollaborateProjectsPath(orgId, { boardId });
  return <Navigate to={to} replace />;
}

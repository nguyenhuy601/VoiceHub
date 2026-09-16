import OrganizationsPage from '../../pages/Workspace/OrganizationsPage';
import { useSyncCompanyModuleSearch } from './useSyncCompanyModuleSearch';

/**
 * Company chat — reuse org workspaces chat/announcement surface.
 * Scoped by SpaceContext department (+ team when L2 team mode).
 */
export default function SpaceChatModule() {
  useSyncCompanyModuleSearch('chat');
  return <OrganizationsPage suiteMode="collaborate" suiteLayout />;
}

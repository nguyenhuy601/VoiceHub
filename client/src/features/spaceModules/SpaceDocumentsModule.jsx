import DocumentsPage from '../../pages/Documents/DocumentsPage';
import OrganizationsPage from '../../pages/Workspace/OrganizationsPage';
import { useSpace, SPACE_KIND } from '../../context/SpaceContext';
import ProjectFilesFallback from './ProjectFilesFallback';
import { useSyncCompanyModuleSearch } from './useSyncCompanyModuleSearch';

/** Shared documents module — org library, dept/team tabs, or project-scoped fallback. */
export default function SpaceDocumentsModule() {
  const space = useSpace();
  const organizationId = space?.organizationId || '';
  const projectId = space?.kind === SPACE_KIND.PROJECT ? space?.projectId || '' : '';
  const departmentId = String(space?.departmentId || '').trim();

  useSyncCompanyModuleSearch('documents');

  if (projectId) {
    return <ProjectFilesFallback projectId={projectId} organizationId={organizationId} />;
  }

  if (space?.kind === SPACE_KIND.COMPANY && departmentId) {
    return <OrganizationsPage suiteMode="collaborate" suiteLayout />;
  }

  return <DocumentsPage suiteLayout spaceOrganizationId={organizationId} />;
}

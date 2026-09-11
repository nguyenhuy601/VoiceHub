import CalendarPage from '../../pages/Calendar/CalendarPage';
import OrganizationsPage from '../../pages/Workspace/OrganizationsPage';
import { useSpace, SPACE_KIND } from '../../context/SpaceContext';
import { useSyncCompanyModuleSearch } from './useSyncCompanyModuleSearch';

/** Shared calendar module — dept workspace tab when company+dept; else CalendarPage. */
export default function SpaceCalendarModule() {
  const space = useSpace();
  const organizationId = space?.organizationId || '';
  const projectId = space?.kind === SPACE_KIND.PROJECT ? space?.projectId || '' : '';
  const departmentId = String(space?.departmentId || '').trim();

  useSyncCompanyModuleSearch('calendar');

  if (space?.kind === SPACE_KIND.COMPANY && departmentId) {
    return <OrganizationsPage suiteMode="collaborate" suiteLayout />;
  }

  return (
    <CalendarPage
      suiteLayout
      spaceOrganizationId={organizationId}
      spaceProjectId={projectId}
    />
  );
}

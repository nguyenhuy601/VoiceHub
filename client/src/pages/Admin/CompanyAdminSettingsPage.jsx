import { Navigate, useLocation } from 'react-router-dom';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { adminSettingsEmbedTabFromItem, findAdminNavItem } from '../../config/adminDomainsConfig';
import { useCompanyAdminContext } from './CompanyAdminLayout';

export default function CompanyAdminSettingsPage() {
  const location = useLocation();
  const match = findAdminNavItem(location.pathname);
  const settingsTab = adminSettingsEmbedTabFromItem(match?.item);
  const { organization, isFullAccess, refreshOrganization } = useCompanyAdminContext();

  if (!isFullAccess) {
    return <Navigate to="/app/admin" replace />;
  }

  if (!settingsTab || !organization) {
    return <Navigate to="/app/admin" replace />;
  }

  return (
    <OrganizationSettingsPanel
      organization={organization}
      initialTab={settingsTab}
      lockTab={settingsTab}
      hideChrome
      hideBranchUi
      suiteLayout={false}
      onOrganizationUpdated={refreshOrganization}
    />
  );
}

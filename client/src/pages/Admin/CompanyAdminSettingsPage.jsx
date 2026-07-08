import { Navigate, useLocation } from 'react-router-dom';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import { adminSettingsEmbedTab, resolveAdminSectionFromPath } from '../../config/adminNavConfig';
import { useCompanyAdminContext } from './CompanyAdminLayout';

export default function CompanyAdminSettingsPage() {
  const location = useLocation();
  const section = resolveAdminSectionFromPath(location.pathname);
  const { organization, isFullAccess, refreshOrganization } = useCompanyAdminContext();
  const settingsTab = adminSettingsEmbedTab(section);

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

import { Navigate, Outlet } from 'react-router-dom';
import AdminNavigationSidebar from './AdminNavigationSidebar';
import JoinOrganizationModal from './JoinOrganizationModal';
import NetworkOfflineBanner from './NetworkOfflineBanner';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { ShellLayoutProvider } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useGrantScopes } from '../../hooks/useGrantScopes';
import { getVisibleAdminDomains } from '../../config/adminDomainsConfig';
import { hasAnyAdminNavGrant } from '../../config/rbacUiGrantMap';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';
import { getDefaultPathForSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

function AdminShellLayoutInner() {
  const { isSystemAdmin, orgId } = useCompanyAdminAccess();
  const { hasGrant, scopeOf, loading, error } = useGrantScopes(orgId);
  const canEnter =
    isSystemAdmin || hasAnyAdminNavGrant(hasGrant, scopeOf, getVisibleAdminDomains());

  if (!isSystemAdmin && orgId && (loading || error)) {
    return <div className={FIGMA_SHELL_ROOT} />;
  }

  if (!canEnter) {
    return <Navigate to={getDefaultPathForSuite(SUITE.COLLABORATE)} replace />;
  }

  writeStoredSuite(SUITE.ADMIN);

  return (
    <div className={FIGMA_SHELL_ROOT}>
      <TopHeader />
      <ShellRoleBanner />
      <NetworkOfflineBanner />
      <JoinOrganizationModal />
      <div className={FIGMA_SHELL_BODY}>
        <AdminNavigationSidebar />
        <div className={FIGMA_SHELL_MAIN}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function AdminShellLayout() {
  return (
    <ShellLayoutProvider>
      <AdminShellLayoutInner />
    </ShellLayoutProvider>
  );
}

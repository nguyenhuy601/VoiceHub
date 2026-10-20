import { Navigate, Outlet } from 'react-router-dom';
import AdminNavigationSidebar from './AdminNavigationSidebar';
import JoinOrganizationModal from './JoinOrganizationModal';
import NetworkOfflineBanner from './NetworkOfflineBanner';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { ShellLayoutProvider } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import PageMotion from '../../motion/PageMotion';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';
import { getDefaultPathForSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

function AdminShellLayoutInner() {
  // canAccessHub = systemAdmin || hasAnyAdminNavGrant(hasGrant, scopeOf) — một nguồn với useCompanyAdminAccess
  const { isSystemAdmin, isFullAccess, orgId, canAccessHub, grantsLoading, grantsError } =
    useCompanyAdminAccess();

  if (!isSystemAdmin && orgId && (grantsLoading || grantsError)) {
    return <div className={FIGMA_SHELL_ROOT} />;
  }

  if (!canAccessHub) {
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
        <AdminNavigationSidebar isFullAccess={isFullAccess} />
        <div className={FIGMA_SHELL_MAIN}>
          <PageMotion className="flex min-h-0 min-w-0 flex-1 flex-col">
            <Outlet />
          </PageMotion>
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

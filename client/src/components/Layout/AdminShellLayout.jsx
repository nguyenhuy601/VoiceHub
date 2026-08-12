import { Navigate, Outlet } from 'react-router-dom';
import AdminNavigationSidebar from './AdminNavigationSidebar';
import JoinOrganizationModal from './JoinOrganizationModal';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { ShellLayoutProvider } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';
import { getDefaultPathForSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

function AdminShellLayoutInner() {
  const { canAccessHub, isFullAccess, isSystemAdmin } = useCompanyAdminAccess();

  if (!canAccessHub) {
    return <Navigate to={getDefaultPathForSuite(SUITE.COLLABORATE)} replace />;
  }

  if (isSystemAdmin) writeStoredSuite(SUITE.ADMIN);

  return (
    <div className={FIGMA_SHELL_ROOT}>
      <TopHeader />
      <ShellRoleBanner />
      <JoinOrganizationModal />
      <div className={FIGMA_SHELL_BODY}>
        <AdminNavigationSidebar isFullAccess={isFullAccess} />
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

import { Navigate, Outlet } from 'react-router-dom';
import AdminNavigationSidebar from './AdminNavigationSidebar';
import JoinOrganizationModal from './JoinOrganizationModal';
import NetworkOfflineBanner from './NetworkOfflineBanner';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { ShellLayoutProvider } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { AdminSystemGrantProvider } from '../../hooks/useGrantScopes';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';
import { getDefaultPathForSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

function AdminShellLayoutInner() {
  const { isSystemAdmin } = useCompanyAdminAccess();

  // Phân hệ /app/admin mở bằng systemRole=admin, không bằng mã vị trí tổ chức.
  if (!isSystemAdmin) {
    return <Navigate to={getDefaultPathForSuite(SUITE.COLLABORATE)} replace />;
  }

  writeStoredSuite(SUITE.ADMIN);

  return (
    <AdminSystemGrantProvider>
      <div className={FIGMA_SHELL_ROOT}>
        <TopHeader />
        <ShellRoleBanner />
        <NetworkOfflineBanner />
        <JoinOrganizationModal />
        <div className={FIGMA_SHELL_BODY}>
          <AdminNavigationSidebar isFullAccess={false} />
          <div className={FIGMA_SHELL_MAIN}>
            <Outlet />
          </div>
        </div>
      </div>
    </AdminSystemGrantProvider>
  );
}

export default function AdminShellLayout() {
  return (
    <ShellLayoutProvider>
      <AdminShellLayoutInner />
    </ShellLayoutProvider>
  );
}

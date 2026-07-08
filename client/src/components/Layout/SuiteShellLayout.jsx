import { Navigate, Outlet } from 'react-router-dom';
import { ShellLayoutProvider, useShellLayout } from '../../context/ShellLayoutContext';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import JoinOrganizationModal from './JoinOrganizationModal';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';
import { getDefaultPathForSuite, SUITE, writeStoredSuite } from '../../utils/suitePathUtils';

function SuiteShellLayoutInner({ sidebar, landingDemo = false }) {
  const { immersiveChrome } = useShellLayout();
  const { isSystemAdmin } = useCompanyAdminAccess();
  const hideChrome = !landingDemo && immersiveChrome;

  // Tài khoản hệ thống admin không dùng shell nhân viên (communicate/collaborate/me).
  if (!landingDemo && isSystemAdmin) {
    writeStoredSuite(SUITE.ADMIN);
    return <Navigate to={getDefaultPathForSuite(SUITE.ADMIN)} replace />;
  }

  return (
    <div className={FIGMA_SHELL_ROOT}>
      {!landingDemo && !hideChrome && <TopHeader />}
      {!landingDemo && !hideChrome && <ShellRoleBanner />}
      {!landingDemo && <JoinOrganizationModal />}
      <div className={FIGMA_SHELL_BODY}>
        {!hideChrome ? sidebar : null}
        <div className={FIGMA_SHELL_MAIN}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

const SuiteShellLayout = ({ sidebar, landingDemo = false }) => (
  <ShellLayoutProvider>
    <SuiteShellLayoutInner sidebar={sidebar} landingDemo={landingDemo} />
  </ShellLayoutProvider>
);

export default SuiteShellLayout;

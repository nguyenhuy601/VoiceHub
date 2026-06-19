import { Outlet } from 'react-router-dom';
import { ShellLayoutProvider } from '../../context/ShellLayoutContext';
import JoinOrganizationModal from './JoinOrganizationModal';
import ShellRoleBanner from './ShellRoleBanner';
import TopHeader from './TopHeader';
import { FIGMA_SHELL_BODY, FIGMA_SHELL_MAIN, FIGMA_SHELL_ROOT } from './figmaShellClasses';

function SuiteShellLayoutInner({ sidebar, landingDemo = false }) {
  return (
    <div className={FIGMA_SHELL_ROOT}>
      {!landingDemo && <TopHeader />}
      {!landingDemo && <ShellRoleBanner />}
      {!landingDemo && <JoinOrganizationModal />}
      <div className={FIGMA_SHELL_BODY}>
        {sidebar}
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

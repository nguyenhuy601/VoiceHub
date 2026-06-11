import { Outlet } from 'react-router-dom';
import AppSwitcher from './AppSwitcher';

/**
 * Layout shell cho mỗi suite: App Switcher + sidebar + nội dung con qua Outlet.
 */
const SuiteShellLayout = ({ sidebar, landingDemo = false }) => (
  <div className="flex h-screen overflow-hidden">
    {!landingDemo && <AppSwitcher />}
    {sidebar}
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Outlet />
    </div>
  </div>
);

export default SuiteShellLayout;

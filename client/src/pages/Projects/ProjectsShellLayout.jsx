import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import {
  buildCollaborateProjectsChatPath,
  buildCollaborateProjectsPath,
  isProjectChatTabEnabled,
  orgQueryFromSearch,
  readStoredLastOrganizationId,
} from '../../utils/suitePathUtils';

export default function ProjectsShellLayout() {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const orgId = orgQueryFromSearch(searchParams) || readStoredLastOrganizationId();
  const chatEnabled = isProjectChatTabEnabled();
  const listPath = buildCollaborateProjectsPath(orgId);
  const chatPath = buildCollaborateProjectsChatPath(orgId);

  const tabClass = ({ isActive }) =>
    `whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold transition-colors ${
      isActive
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {chatEnabled ? (
        <nav
          className="flex shrink-0 gap-0 border-b border-border px-4"
          aria-label={t('workspace.projectsTabsAria')}
        >
          <NavLink to={listPath} end className={tabClass}>
            {t('workspace.projectsTabList')}
          </NavLink>
          <NavLink to={chatPath} end className={tabClass}>
            {t('workspace.projectsTabChat')}
          </NavLink>
        </nav>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}

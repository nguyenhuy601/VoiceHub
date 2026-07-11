import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bell,
  Bot,
  Building2,
  Calendar,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Mic,
  Shield,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import useUiRole from '../../hooks/useUiRole';
import { useWorkspace } from '../../context/WorkspaceContext';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useShellLayout } from '../../context/ShellLayoutContext';
import { useWorkspaceSuite, SUITE } from '../../context/WorkspaceSuiteContext';
import { useAppStrings } from '../../locales/appStrings';
import { useFriendPending, useNotificationBadge } from '../../hooks/queries';
import {
  buildCollaborateDocumentsPath,
  buildCommunicateChannelsPath,
  getDefaultPathForSuite,
} from '../../utils/suitePathUtils';
import VoiceHubAIPanel from './VoiceHubAIPanel';
import {
  FIGMA_SIDEBAR,
  FIGMA_SIDEBAR_COLLAPSED,
  FIGMA_SIDEBAR_EXPANDED,
  FIGMA_SIDEBAR_NAV,
  FIGMA_SIDEBAR_SECTION_LABEL,
  FIGMA_SIDEBAR_SUITE_STRIP,
  SUITE_COLORS,
  figmaNavItemBg,
  figmaNavItemClass,
  FIGMA_SIDEBAR_EXPAND_BTN,
} from './figmaShellClasses';

const COLLAPSE_KEY = 'vh_sidebar_collapsed';

const NAV_ROLE_KEYS = {
  admin: 'nav.roleAdmin',
  orgAdmin: 'nav.roleOrgAdmin',
  owner: 'nav.roleOwner',
  manager: 'nav.roleManager',
  hr: 'nav.roleHr',
  deptHead: 'nav.roleDeptHead',
  teamLeader: 'nav.roleTeamLeader',
  member: 'nav.roleMember',
  guest: 'nav.roleGuest',
  personal: 'nav.rolePersonal',
};

const ROLE_COLORS = {
  admin: '#EF4444',
  orgAdmin: '#EF4444',
  owner: '#F59E0B',
  manager: '#3B82F6',
  hr: '#8B5CF6',
  deptHead: '#3B82F6',
  teamLeader: '#06B6D4',
  member: '#10B981',
  guest: '#9CA3AF',
  personal: '#2563EB',
};

/**
 * Sidebar footer:
 * owner/admin/hr org → membership;
 * member + trưởng phòng/nhóm → chức vụ cấu trúc;
 * không map systemRole employee → «Thành viên».
 */
function resolveSidebarDisplayRole({ uiRole, myOrgRole, myStructureRole, isSystemAdmin }) {
  const org = String(myOrgRole || '').toLowerCase();
  if (org === 'owner') return 'owner';
  if (org === 'admin') return 'orgAdmin';
  if (org === 'hr') return 'hr';
  if (org === 'manager') return 'manager';
  if (isSystemAdmin) return 'admin';
  const structure = String(myStructureRole || '').toLowerCase();
  if (structure === 'head') return 'deptHead';
  if (structure === 'leader') return 'teamLeader';
  if (org === 'member') return 'member';
  return String(uiRole || 'member').toLowerCase();
}

function filterNavForRole(items, roleKey, suiteProp) {
  if (roleKey === 'guest') {
    const allowed = new Set(['notifications', 'friends', 'profile', 'settings']);
    return items.filter((item) => allowed.has(item.key));
  }
  if (roleKey === 'personal') {
    if (suiteProp === 'collaborate') {
      return items.filter((item) => !['workspaces', 'tasks', 'documents'].includes(item.key));
    }
    if (suiteProp === 'communicate') {
      return items.filter((item) => item.key !== 'channels');
    }
  }
  return items;
}

function NavItem({ item, collapsed, suiteColor, isActive }) {
  const Icon = item.icon;
  const content = (
    <>
      {isActive && (
        <span
          className="absolute bottom-[18%] left-0 top-[18%] w-[3px] rounded-r-sm"
          style={{ background: suiteColor, boxShadow: `0 0 8px ${suiteColor}88` }}
        />
      )}
      <Icon size={15} className="shrink-0" style={{ color: isActive ? suiteColor : undefined }} />
      {!collapsed && (
        <span
          className="min-w-0 flex-1 text-left whitespace-nowrap text-[0.8125rem] tracking-tight"
          style={{ fontWeight: isActive ? 500 : 400, color: isActive ? '#E2E8F0' : undefined }}
        >
          {item.label}
        </span>
      )}
      {item.tag && !collapsed && (
        <span
          className="rounded px-1 py-px text-[0.5rem] font-bold tracking-wider"
          style={{ background: `${suiteColor}30`, color: suiteColor }}
        >
          {item.tag}
        </span>
      )}
      {item.badge > 0 && !collapsed && (
        <span
          className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[0.625rem] font-bold text-white"
          style={{ background: isActive ? `${suiteColor}44` : suiteColor }}
        >
          {item.badge > 99 ? '99+' : item.badge}
        </span>
      )}
      {item.badge > 0 && collapsed && (
        <span
          className="absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[0.5rem] font-bold text-white"
          style={{ background: suiteColor }}
        >
          {item.badge > 9 ? '9+' : item.badge}
        </span>
      )}
    </>
  );

  const className = figmaNavItemClass(isActive, suiteColor, collapsed);
  const style = figmaNavItemBg(isActive, suiteColor);

  if (item.externalNavigate) {
    return (
      <button
        type="button"
        onClick={item.onClick}
        className="group relative block w-full border-none bg-transparent p-0 text-left"
        title={collapsed ? item.label : undefined}
      >
        <div className={className} style={style}>
          {content}
        </div>
        {collapsed && (
          <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-sidebar-surface px-2.5 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
            {item.label}
          </div>
        )}
      </button>
    );
  }

  return (
    <Link to={item.path} className="group relative block" title={collapsed ? item.label : undefined}>
      <div className={className} style={style}>
        {content}
      </div>
      {collapsed && (
        <div className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-[100] -translate-y-1/2 whitespace-nowrap rounded-md border border-sidebar-border bg-sidebar-surface px-2.5 py-1 text-xs font-medium text-slate-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
          {item.label}
        </div>
      )}
    </Link>
  );
}

function segmentFromProp(suiteProp) {
  if (suiteProp === 'communicate') return 'communicate';
  if (suiteProp === 'collaborate') return 'collaborate';
  if (suiteProp === 'me') return 'me';
  return 'communicate';
}

export default function FigmaNavigationSidebar({ suite: suiteProp = 'communicate', landingDemo = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showSuitePicker, setShowSuitePicker] = useState(false);
  const [showAIPanel, setShowAIPanel] = useState(false);
  const aiButtonRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useAppStrings();
  const { navigateToSuite } = useWorkspaceSuite();
  const { activeWorkspace, singleOrgMode, company } = useWorkspace();
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  const activeOrgId = String(
    activeWorkspace?._id || activeWorkspace?.id || activeWorkspace?.organizationId || company?.id || company?._id || ''
  ).trim();

  const suiteSegment = segmentFromProp(suiteProp);
  const suiteColor = SUITE_COLORS[suiteSegment] || SUITE_COLORS.communicate;
  const suiteLabels = {
    label: t(`nav.suite.${suiteSegment}.label`),
    sublabel: t(`nav.suite.${suiteSegment}.sublabel`),
  };

  const { unreadCount } = useNotificationBadge({
    scope: suiteProp === 'collaborate' ? 'organization' : 'personal',
    organizationId: activeOrgId,
    enabled: !landingDemo,
  });
  const { pendingCount } = useFriendPending({
    enabled: !landingDemo && suiteProp === 'communicate',
  });

  useEffect(() => {
    closeMobileNav();
  }, [location.pathname, closeMobileNav]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(COLLAPSE_KEY);
      if (saved) setCollapsed(JSON.parse(saved));
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    if (next) setShowSuitePicker(false);
  };

  const { role, meta } = useUiRole();
  const isSingleCompany = singleOrgMode || readSingleOrgModeFlag();
  const { canAccessHub, isSystemAdmin, myOrgRole } = useCompanyAdminAccess();
  // System admin dùng shell /app/admin riêng; sidebar nhân viên chỉ hiện hub cho owner|admin|hr org.
  const showAdminSuite = canAccessHub && !isSystemAdmin;
  const showApprovalInbox =
    suiteProp === 'collaborate' &&
    (meta.isManagerOrAbove ||
      ['owner', 'admin', 'manager', 'hr'].includes(String(myOrgRole || role || '').toLowerCase()));
  const myStructureRole = String(
    company?.myStructureRole || activeWorkspace?.myStructureRole || ''
  ).toLowerCase();
  const displayRoleKey = resolveSidebarDisplayRole({
    uiRole: role,
    myOrgRole,
    myStructureRole,
    isSystemAdmin,
  });
  const metaRoleKey =
    displayRoleKey === 'hr' || displayRoleKey === 'orgAdmin'
      ? 'admin'
      : displayRoleKey === 'deptHead' || displayRoleKey === 'teamLeader'
        ? 'manager'
        : displayRoleKey;
  const displayMeta = getRoleMeta(metaRoleKey);
  const roleColor = displayMeta.color || ROLE_COLORS[displayRoleKey] || '#2563EB';
  const roleLabel = t(NAV_ROLE_KEYS[displayRoleKey] || 'nav.roleMember');

  const navItems = useMemo(() => {
    if (suiteProp === 'communicate') {
      const items = [
        {
          key: 'overview',
          icon: LayoutDashboard,
          label: t('nav.overview'),
          path: '/app/communicate/overview',
          badge: 0,
        },
        {
          key: 'notifications',
          icon: Bell,
          label: t('nav.notifications'),
          path: '/app/communicate/notifications',
          badge: landingDemo ? 0 : unreadCount,
        },
        {
          key: 'friends',
          icon: MessageCircle,
          label: t('nav.messages'),
          path: '/app/communicate/chat/friends',
          badge: landingDemo ? 0 : pendingCount,
        },
        {
          key: 'channels',
          icon: Building2,
          label: t('nav.workspaces'),
          path: buildCommunicateChannelsPath(),
          badge: 0,
        },
        {
          key: 'voice',
          icon: Mic,
          label: t('nav.voiceMeet'),
          path: '/app/communicate/voice',
          badge: 0,
        },
      ];
      if (showAdminSuite) {
        items.push({
          key: 'company-admin',
          icon: Shield,
          label: t('nav.companyAdmin'),
          externalNavigate: true,
          onClick: () => navigate('/app/admin'),
          path: '/app/admin',
          badge: 0,
        });
      }
      return items;
    }
    if (suiteProp === 'collaborate') {
      const items = [
        {
          key: 'overview',
          icon: LayoutDashboard,
          label: t('nav.overview'),
          path: '/app/collaborate/overview',
          badge: 0,
        },
        {
          key: 'workspaces',
          icon: Building2,
          label: isSingleCompany ? t('nav.companyWorkspaces') : t('nav.workspaces'),
          path: '/app/collaborate/workspaces',
          badge: 0,
        },
        {
          key: 'tasks',
          icon: ClipboardList,
          label: isSingleCompany ? t('nav.projects') : t('nav.kanbanTasks'),
          path: '/app/collaborate/tasks',
          tag: t('common.newBadge'),
          badge: 0,
        },
        {
          key: 'documents',
          icon: FileText,
          label: t('nav.documents'),
          path: buildCollaborateDocumentsPath(activeOrgId),
          badge: 0,
        },
        {
          key: 'calendar',
          icon: Calendar,
          label: t('nav.calendar'),
          path: '/app/me/calendar',
          badge: 0,
        },
      ];
      if (showApprovalInbox) {
        items.push({
          key: 'approvals',
          icon: ClipboardList,
          label: t('nav.approvals'),
          path: '/app/collaborate/approvals',
          badge: 0,
        });
      }
      if (showAdminSuite) {
        items.push({
          key: 'company-admin',
          icon: Shield,
          label: t('nav.companyAdmin'),
          externalNavigate: true,
          onClick: () => navigate('/app/admin'),
          path: '/app/admin',
          badge: 0,
        });
      }
      return items;
    }
    return [
      {
        key: 'profile',
        icon: User,
        label: t('nav.myProfile'),
        path: '/app/me/settings',
        badge: 0,
      },
      {
        key: 'overview',
        icon: LayoutDashboard,
        label: t('nav.overview'),
        path: '/app/me/dashboard',
        badge: 0,
      },
      {
        key: 'settings',
        icon: Settings,
        label: t('nav.systemSettings'),
        path: '/app/me/settings',
        badge: 0,
      },
    ];
  }, [suiteProp, t, landingDemo, unreadCount, pendingCount, activeOrgId, isSingleCompany, showApprovalInbox, showAdminSuite, navigate]);

  const visibleNavItems = useMemo(
    () => filterNavForRole(navItems, role, suiteProp),
    [navItems, role, suiteProp]
  );

  const isActivePath = (path) => {
    if (!path) return false;
    const base = path.split('?')[0];
    if (base === '/app/communicate/overview') return location.pathname === '/app/communicate/overview';
    if (base === '/app/collaborate/overview') return location.pathname === '/app/collaborate/overview';
    if (base === '/app/admin') return location.pathname === '/app/admin' || location.pathname.startsWith('/app/admin/');
    if (base === '/app/collaborate/approvals') return location.pathname === '/app/collaborate/approvals';
    if (base === '/app/me/dashboard') return location.pathname === '/app/me/dashboard';
    if (base === '/app/me/settings') return location.pathname === '/app/me/settings';
    if (base === '/app/collaborate/workspaces') {
      return location.pathname === '/app/collaborate/workspaces';
    }
    return location.pathname === base || location.pathname.startsWith(`${base}/`);
  };

  const isActiveNavItem = (item) => {
    const path = location.pathname;
    if (suiteProp === 'collaborate') {
      if (item.key === 'overview') return path === '/app/collaborate/overview';
      if (item.key === 'workspaces') {
        return (
          path === '/app/collaborate/workspaces' ||
          path.startsWith('/app/collaborate/organizations') ||
          path.startsWith('/app/collaborate/join')
        );
      }
      if (item.key === 'tasks') return path === '/app/collaborate/tasks';
      if (item.key === 'documents') return path === '/app/collaborate/documents';
      return isActivePath(item.path);
    }
    return isActivePath(item.path);
  };

  const handleLogout = async () => {
    if (landingDemo) {
      toast(t('nav.toastDemoLogout') || 'Demo mode', { icon: '🔒' });
      return;
    }
    try {
      await Promise.race([logout(), new Promise((r) => setTimeout(r, 1500))]);
    } catch {
      // ignore
    } finally {
      try {
        removeToken();
      } catch {
        // ignore
      }
      // Toast đăng xuất chỉ trong AuthContext.logout — tránh 2 thông báo
      navigate('/login');
    }
  };

  const allowedSuites = useMemo(() => {
    const base = ['communicate', 'collaborate', 'me'];
    if (showAdminSuite) return ['communicate', 'collaborate', 'admin', 'me'];
    return base;
  }, [showAdminSuite]);
  const widthClass =
    mobileNavOpen || !collapsed ? FIGMA_SIDEBAR_EXPANDED : FIGMA_SIDEBAR_COLLAPSED;
  const sidebarTranslate = mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';

  return (
    <>
      {mobileNavOpen ? (
        <button
          type="button"
          aria-label={t('common.close')}
          className="fixed inset-0 z-[240] bg-black/50 lg:hidden"
          onClick={closeMobileNav}
        />
      ) : null}
      <div
        className={`${FIGMA_SIDEBAR} ${widthClass} fixed inset-y-0 left-0 z-[250] transform transition-transform duration-200 ease-enterprise lg:relative lg:z-30 lg:translate-x-0 ${sidebarTranslate}`}
      >
      <div className={`relative ${FIGMA_SIDEBAR_SUITE_STRIP}`}>
        <div
          className={`flex w-full items-center gap-1.5 ${collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`}
        >
          {!collapsed ? (
            <>
              <button
                type="button"
                onClick={() => setShowSuitePicker((s) => !s)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 transition"
                style={{
                  background: showSuitePicker ? `${suiteColor}28` : `${suiteColor}18`,
                  borderColor: `${suiteColor}${showSuitePicker ? '44' : '22'}`,
                }}
                title={t('nav.switchSuite')}
              >
                <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: suiteColor }} />
                <span
                  className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.6875rem] font-bold uppercase tracking-wider"
                  style={{ color: suiteColor }}
                >
                  {suiteLabels.label}
                </span>
                <ChevronsRight
                  size={10}
                  className="shrink-0 opacity-70 transition-transform"
                  style={{ color: suiteColor, transform: showSuitePicker ? 'rotate(90deg)' : 'none' }}
                />
              </button>
              <button
                type="button"
                onClick={toggleCollapsed}
                className="shrink-0 rounded-[5px] border-none bg-transparent p-0.5 text-white/30 transition hover:text-white/70"
                title={t('nav.collapseSidebar')}
                aria-label={t('nav.collapseSidebar')}
              >
                <ChevronsLeft size={14} />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={toggleCollapsed}
              title={t('nav.expandSidebar')}
              aria-label={t('nav.expandSidebar')}
              className={FIGMA_SIDEBAR_EXPAND_BTN}
              style={{
                background: `${suiteColor}18`,
                borderColor: `${suiteColor}44`,
                color: suiteColor,
              }}
            >
              <ChevronsRight size={14} strokeWidth={2.25} />
            </button>
          )}
        </div>

        {showSuitePicker && !collapsed && (
          <div className="absolute left-2 right-2 top-[calc(100%+4px)] z-[200] animate-scale-in overflow-hidden rounded-xl border border-white/10 bg-[#0D0D1A] shadow-2xl">
            <div className="px-2.5 pb-1 pt-2 text-[0.575rem] font-bold uppercase tracking-widest text-white/25">
              {t('nav.chooseSpace')}
            </div>
            {allowedSuites.map((sId) => {
              const isCurrent = sId === suiteSegment;
              const labels = {
                label: t(`nav.suite.${sId}.label`),
                sublabel: t(`nav.suite.${sId}.sublabel`),
              };
              const sc = SUITE_COLORS[sId];
              return (
                <button
                  key={sId}
                  type="button"
                  onClick={() => {
                    const suiteMap = {
                      communicate: SUITE.COMMUNICATE,
                      collaborate: SUITE.COLLABORATE,
                      me: SUITE.ME,
                      admin: SUITE.ADMIN,
                    };
                    navigateToSuite(suiteMap[sId], { path: getDefaultPathForSuite(suiteMap[sId]) });
                    setShowSuitePicker(false);
                  }}
                  className="flex w-full items-center gap-2.5 border-none px-3 py-2 text-left transition"
                  style={{
                    background: isCurrent ? `${sc}18` : 'transparent',
                    borderLeft: `3px solid ${isCurrent ? sc : 'transparent'}`,
                  }}
                >
                  <div
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={{ background: sc, boxShadow: isCurrent ? `0 0 6px ${sc}` : 'none' }}
                  />
                  <div>
                    <div
                      className="text-[0.7812rem]"
                      style={{
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? sc : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {labels.label}
                    </div>
                    <div className="text-[0.625rem] text-white/25">{labels.sublabel}</div>
                  </div>
                  {isCurrent && <ChevronsRight size={11} className="ml-auto" style={{ color: sc }} />}
                </button>
              );
            })}
            <div className="h-1.5" />
          </div>
        )}
      </div>

      {!collapsed && <div className={FIGMA_SIDEBAR_SECTION_LABEL}>{t('nav.mainMenu')}</div>}

      <nav className={FIGMA_SIDEBAR_NAV}>
        {visibleNavItems.map((item) => (
          <NavItem
            key={item.key}
            item={item}
            collapsed={collapsed}
            suiteColor={suiteColor}
            isActive={isActiveNavItem(item)}
          />
        ))}

        {suiteProp === 'communicate' && !collapsed && (
          <div className="mt-2.5">
            <div className="px-1 pb-1 text-[0.5875rem] font-bold uppercase tracking-[0.1em] text-white/20">
              {t('nav.aiAssistant')}
            </div>
            <button
              ref={aiButtonRef}
              type="button"
              onClick={() => setShowAIPanel((v) => !v)}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] border px-2.5 py-[7px] transition"
              style={{
                background: showAIPanel ? 'rgba(249,115,22,0.18)' : 'rgba(249,115,22,0.08)',
                borderColor: showAIPanel ? 'rgba(249,115,22,0.45)' : 'rgba(249,115,22,0.25)',
                borderStyle: showAIPanel ? 'solid' : 'dashed',
                color: '#FB923C',
              }}
            >
              <Bot size={14} className="shrink-0 text-orange-500" />
              <div className="flex-1 text-left">
                <div className="text-[0.7812rem] font-semibold text-orange-500">@VoiceHubAI</div>
                <div className="mt-px text-[0.625rem] text-orange-400/60">
                  {t('nav.aiSmartAssistant')}
                </div>
              </div>
              <span className="rounded bg-orange-500/20 px-1 py-px text-[0.5rem] font-bold tracking-wider text-orange-500">
                BETA
              </span>
            </button>
          </div>
        )}
      </nav>

      {showAIPanel ? (
        <VoiceHubAIPanel
          onClose={() => setShowAIPanel(false)}
          anchorRef={aiButtonRef}
          collapsed={collapsed}
        />
      ) : null}
    </div>
    </>
  );
}

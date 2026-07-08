import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  LayoutDashboard,
  Lock,
  LogOut,
  Settings,
  Shield,
  User,
  UserCheck,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ADMIN_SECTIONS, ADMIN_SUITE_COLOR } from '../../config/adminNavConfig';
import { useAuth } from '../../context/AuthContext';
import { useShellLayout } from '../../context/ShellLayoutContext';
import { useAppStrings } from '../../locales/appStrings';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { organizationAPI } from '../../services/api/organizationAPI';
import { getInitials, getUserDisplayName } from '../../utils/helpers';
import { removeToken } from '../../utils/tokenStorage';
import {
  FIGMA_SIDEBAR,
  FIGMA_SIDEBAR_COLLAPSED,
  FIGMA_SIDEBAR_EXPANDED,
  FIGMA_SIDEBAR_EXPAND_BTN,
  FIGMA_SIDEBAR_FOOTER,
  FIGMA_SIDEBAR_NAV,
  FIGMA_SIDEBAR_SECTION_LABEL,
  FIGMA_SIDEBAR_SUITE_STRIP,
  figmaNavItemBg,
  figmaNavItemClass,
} from './figmaShellClasses';

const COLLAPSE_KEY = 'vh_admin_sidebar_collapsed';
const ADMIN_COLOR = ADMIN_SUITE_COLOR;

const ICONS = {
  overview: LayoutDashboard,
  people: Users,
  approvals: UserCheck,
  general: Settings,
  structure: Building2,
  roles: Shield,
  policy: ClipboardList,
  security: Lock,
};

const unwrap = (payload) => payload?.data ?? payload;

function AdminNavItem({ item, collapsed, isActive, badge = 0 }) {
  const { t } = useAppStrings();
  const Icon = ICONS[item.id] || Settings;
  const label = t(item.labelKey);

  return (
    <Link
      to={item.path}
      className={figmaNavItemClass(isActive, ADMIN_COLOR, collapsed)}
      style={figmaNavItemBg(isActive, ADMIN_COLOR)}
      title={collapsed ? label : undefined}
    >
      <Icon size={15} className="shrink-0" style={{ color: isActive ? ADMIN_COLOR : undefined }} />
      {!collapsed ? (
        <>
          <span className="flex-1 truncate text-[0.8125rem]">{label}</span>
          {badge > 0 ? (
            <span
              className="rounded-full px-1.5 py-px text-[0.625rem] font-bold text-white"
              style={{ background: ADMIN_COLOR }}
            >
              {badge > 99 ? '99+' : badge}
            </span>
          ) : null}
        </>
      ) : null}
    </Link>
  );
}

export default function AdminNavigationSidebar({ isFullAccess = false }) {
  const { t } = useAppStrings();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { mobileNavOpen, closeMobileNav } = useShellLayout();
  const { isSystemAdmin, orgId } = useCompanyAdminAccess();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || 'false');
    } catch {
      return false;
    }
  });
  const [pendingJoinCount, setPendingJoinCount] = useState(0);

  const displayName = getUserDisplayName(user);
  const initials = getInitials(displayName);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getJoinApplicationsToReview();
        const data = unwrap(res);
        const list = Array.isArray(data) ? data : data?.data || [];
        const count = list.filter(
          (a) => String(a.organizationId || a.organization?._id || '') === String(orgId)
        ).length;
        if (!cancelled) setPendingJoinCount(count);
      } catch {
        if (!cancelled) setPendingJoinCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, location.pathname]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
  };

  const handleLogout = async () => {
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
      navigate('/login');
      toast.success(t('nav.loggedOut'));
    }
  };

  const navSections = useMemo(
    () => ADMIN_SECTIONS.filter((section) => !section.adminOnly || isFullAccess),
    [isFullAccess]
  );

  const isActivePath = (item) => {
    const base = String(item.path || '').split('?')[0].replace(/\/+$/, '');
    const current = location.pathname.replace(/\/+$/, '');
    if (item.end) return current === base;
    return current === base || current.startsWith(`${base}/`);
  };

  const badgeForItem = (item) => {
    if (item.badgeKey === 'pendingJoin') return pendingJoinCount;
    return 0;
  };

  const widthClass = mobileNavOpen || !collapsed ? FIGMA_SIDEBAR_EXPANDED : FIGMA_SIDEBAR_COLLAPSED;
  const sidebarTranslate = mobileNavOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0';
  const roleBadge = isSystemAdmin ? t('adminNav.systemRoleBadge') : t('adminNav.roleBadge');

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
        className={`${FIGMA_SIDEBAR} ${widthClass} fixed inset-y-0 left-0 z-[250] transform border-r-[#EF444422] transition-transform duration-200 ease-enterprise lg:relative lg:z-30 lg:translate-x-0 ${sidebarTranslate}`}
        style={{ background: 'linear-gradient(180deg, #12080A 0%, #0D0D1A 55%, #0A0A14 100%)' }}
      >
        <div className={`relative ${FIGMA_SIDEBAR_SUITE_STRIP}`}>
          <div
            className={`flex w-full items-center gap-1.5 ${collapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'}`}
          >
            {!collapsed ? (
              <>
                <div
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1"
                  style={{
                    background: `${ADMIN_COLOR}18`,
                    borderColor: `${ADMIN_COLOR}22`,
                  }}
                >
                  <div className="h-[5px] w-[5px] shrink-0 rounded-full" style={{ background: ADMIN_COLOR }} />
                  <span
                    className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-left text-[0.6875rem] font-bold uppercase tracking-wider"
                    style={{ color: ADMIN_COLOR }}
                  >
                    {t('nav.suite.admin.label')}
                  </span>
                </div>
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
                  background: `${ADMIN_COLOR}18`,
                  borderColor: `${ADMIN_COLOR}44`,
                  color: ADMIN_COLOR,
                }}
              >
                <ChevronsRight size={14} strokeWidth={2.25} />
              </button>
            )}
          </div>
        </div>

        <nav className={FIGMA_SIDEBAR_NAV}>
          {navSections.map((section) => (
            <div key={section.id} className="mb-2">
              {!collapsed ? (
                <div className={FIGMA_SIDEBAR_SECTION_LABEL}>{t(section.labelKey)}</div>
              ) : null}
              {section.items.map((item) => (
                <AdminNavItem
                  key={item.id}
                  item={item}
                  collapsed={collapsed}
                  isActive={isActivePath(item)}
                  badge={badgeForItem(item)}
                />
              ))}
            </div>
          ))}

          {/* Chỉ owner/admin/hr công ty (không phải system admin) có lối về shell nhân viên. */}
          {!collapsed && !isSystemAdmin ? (
            <Link
              to="/app/collaborate/workspaces"
              className="mt-2 block rounded-lg border border-dashed border-white/10 px-2.5 py-2 text-[0.75rem] text-white/45 transition hover:border-white/20 hover:text-white/70"
            >
              {t('companyAdmin.backToWork')}
            </Link>
          ) : null}
        </nav>

        <div className={FIGMA_SIDEBAR_FOOTER}>
          <Link to="/app/admin/general" className="mb-0.5 block">
            <div
              className={`flex items-center gap-2.5 rounded-[7px] transition ${
                collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
              } ${
                location.pathname.startsWith('/app/admin/general') ||
                location.pathname.startsWith('/app/admin/security')
                  ? 'bg-red-500/15 text-red-300'
                  : 'text-white/40 hover:bg-white/[0.06]'
              }`}
            >
              <Settings size={15} className="shrink-0" />
              {!collapsed ? <span className="text-[0.8125rem] font-normal">{t('nav.settings')}</span> : null}
            </div>
          </Link>

          <div
            className={`flex items-center gap-2 rounded-[7px] ${
              collapsed ? 'justify-center px-0 py-1.5' : 'px-2 py-1.5'
            }`}
            style={{ background: `${ADMIN_COLOR}0A`, border: `1px solid ${ADMIN_COLOR}18` }}
          >
            <div
              className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-[0.5625rem] font-bold text-white"
              style={{
                background: `linear-gradient(135deg, ${ADMIN_COLOR}, ${ADMIN_COLOR}CC)`,
                boxShadow: `0 2px 6px ${ADMIN_COLOR}44`,
              }}
            >
              {initials || <User size={10} />}
            </div>
            {!collapsed ? (
              <>
                <div className="min-w-0 flex-1 overflow-hidden">
                  <div className="truncate text-[0.7rem] font-semibold leading-tight text-white/80">{displayName}</div>
                  <div className="mt-0.5 truncate text-[0.575rem] font-bold tracking-wide" style={{ color: ADMIN_COLOR }}>
                    {roleBadge}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[5px] border-none bg-transparent text-white/25 transition hover:bg-red-400/10 hover:text-red-400"
                  title={t('nav.logout')}
                >
                  <LogOut size={12} />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}

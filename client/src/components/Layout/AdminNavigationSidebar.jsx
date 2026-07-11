import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Database,
  FolderOpen,
  Hash,
  Kanban,
  LayoutGrid,
  Lock,
  LogOut,
  MessageSquare,
  Mic,
  ScrollText,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  ADMIN_DOMAIN_STORAGE_KEY,
  ADMIN_SUITE_COLOR,
  getVisibleAdminDomains,
  normalizeAdminPath,
  resolveAdminDomainFromPath,
} from '../../config/adminDomainsConfig';
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

const DOMAIN_ICONS = {
  Users,
  Building2,
  Shield,
  Hash,
  MessageSquare,
  Mic,
  Kanban,
  FolderOpen,
  Bell,
  Sparkles,
  Lock,
  ScrollText,
  Database,
  Settings,
  Activity,
  BarChart3,
  LayoutGrid,
};

const unwrap = (payload) => payload?.data ?? payload;

function AdminDomainPicker({ domains, selectedDomain, onSelect }) {
  const { t } = useAppStrings();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [selectedDomain?.id]);

  const Icon = selectedDomain ? DOMAIN_ICONS[selectedDomain.icon] || LayoutGrid : LayoutGrid;

  return (
    <div ref={rootRef} className="relative z-20 mb-3 px-1">
      <label className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-wider text-white/35">
        {t('adminDomains.selectDomain')}
      </label>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex w-full items-center gap-2 rounded-lg border border-red-500/25 bg-[#0f0a12] py-2 pl-2.5 pr-2 text-left outline-none transition hover:border-red-500/40 focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30"
      >
        <Icon size={14} className="shrink-0 text-red-400" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-white/90">
          {selectedDomain ? t(selectedDomain.labelKey) : t('adminDomains.allDomains')}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 text-white/40 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 z-30 cursor-default bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute left-1 right-1 z-40 mt-1 max-h-[min(16rem,42vh)] overflow-y-auto rounded-lg border border-red-500/30 bg-[#12080A] py-1 shadow-[0_12px_32px_rgba(0,0,0,0.65)]"
          >
            {domains.map((domain) => {
              const DomainItemIcon = DOMAIN_ICONS[domain.icon] || LayoutGrid;
              const active = domain.id === selectedDomain?.id;
              return (
                <button
                  key={domain.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(domain);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-[0.8125rem] transition ${
                    active
                      ? 'bg-red-500/20 font-medium text-red-100'
                      : 'text-white/80 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  <DomainItemIcon
                    size={14}
                    className={`shrink-0 ${active ? 'text-red-400' : 'text-white/45'}`}
                    aria-hidden
                  />
                  <span className="truncate">{t(domain.labelKey)}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AdminNavItem({ item, collapsed, isActive, badge = 0 }) {
  const { t } = useAppStrings();
  const label = t(item.labelKey);

  return (
    <Link
      to={item.path}
      className={`${figmaNavItemClass(isActive, ADMIN_COLOR, collapsed)} ${isActive ? '!text-white' : ''}`}
      style={figmaNavItemBg(isActive, ADMIN_COLOR)}
      title={collapsed ? label : undefined}
    >
      <span
        className={`h-[6px] w-[6px] shrink-0 rounded-full ${isActive ? 'bg-red-400' : 'bg-white/25'}`}
        aria-hidden
      />
      {!collapsed ? (
        <>
          <span className={`flex-1 truncate text-[0.8125rem] ${isActive ? 'font-medium text-white' : ''}`}>
            {label}
          </span>
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

function AdminNavSectionGroup({
  section,
  collapsed,
  isAccordion,
  isExpanded,
  onToggle,
  isActivePath,
  badgeForItem,
}) {
  const { t } = useAppStrings();
  const hasActive = section.items.some((item) => isActivePath(item));

  if (!section.labelKey || !isAccordion) {
    return (
      <div className="mb-2">
        {!collapsed && section.labelKey ? (
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
    );
  }

  return (
    <div className="mb-1">
      {!collapsed ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          className={`flex w-full items-center justify-between gap-2 rounded-[7px] px-2.5 py-2 text-left transition ${
            hasActive
              ? 'bg-red-500/15 text-red-200'
              : 'text-white/50 hover:bg-white/[0.05] hover:text-white/75'
          }`}
        >
          <span className="text-[0.625rem] font-bold uppercase tracking-[0.08em]">{t(section.labelKey)}</span>
          <ChevronDown
            size={13}
            className={`shrink-0 opacity-70 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </button>
      ) : null}
      {isExpanded && !collapsed ? (
        <div className="mb-1 ml-1.5 mt-0.5 space-y-px border-l border-red-500/20 pl-1">
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
      ) : null}
    </div>
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
  const [expandedSectionByDomain, setExpandedSectionByDomain] = useState({});

  const displayName = getUserDisplayName(user);
  const initials = getInitials(displayName);

  const visibleDomains = useMemo(
    () => getVisibleAdminDomains(isFullAccess),
    [isFullAccess]
  );

  const currentPath = normalizeAdminPath(location.pathname);
  const activeDomain = resolveAdminDomainFromPath(currentPath);

  const [selectedDomainId, setSelectedDomainId] = useState(() => {
    if (activeDomain?.id) return activeDomain.id;
    try {
      return localStorage.getItem(ADMIN_DOMAIN_STORAGE_KEY) || visibleDomains[0]?.id || 'users';
    } catch {
      return visibleDomains[0]?.id || 'users';
    }
  });

  useEffect(() => {
    if (activeDomain?.id) {
      setSelectedDomainId(activeDomain.id);
      localStorage.setItem(ADMIN_DOMAIN_STORAGE_KEY, activeDomain.id);
    }
  }, [activeDomain?.id]);

  const selectedDomain = useMemo(
    () => visibleDomains.find((d) => d.id === selectedDomainId) || visibleDomains[0] || null,
    [visibleDomains, selectedDomainId]
  );

  const isActivePath = (item) => {
    const base = String(item.path || '').split('?')[0].replace(/\/+$/, '');
    const current = currentPath.replace(/\/+$/, '');
    if (item.end) return current === base;
    return current === base || current.startsWith(`${base}/`);
  };

  useEffect(() => {
    if (!selectedDomain?.navAccordion) return;
    const activeSection = selectedDomain.sections.find((section) =>
      section.items.some((item) => isActivePath(item))
    );
    if (!activeSection) return;
    setExpandedSectionByDomain((prev) => ({
      ...prev,
      [selectedDomain.id]: activeSection.id,
    }));
  }, [selectedDomain, currentPath]);

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
      // Toast đăng xuất chỉ trong AuthContext.logout — tránh 2 thông báo
      navigate('/login');
    }
  };

  const handleDomainSelect = (domain) => {
    setSelectedDomainId(domain.id);
    localStorage.setItem(ADMIN_DOMAIN_STORAGE_KEY, domain.id);
    navigate(domain.path);
  };

  const toggleNavSection = (sectionId) => {
    if (!selectedDomain) return;
    setExpandedSectionByDomain((prev) => ({
      ...prev,
      [selectedDomain.id]: prev[selectedDomain.id] === sectionId ? null : sectionId,
    }));
  };

  const isSectionExpanded = (section) => {
    if (!selectedDomain?.navAccordion || !section.labelKey) return true;
    return expandedSectionByDomain[selectedDomain.id] === section.id;
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
                <Link
                  to="/app/admin"
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 py-1 transition hover:opacity-90"
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
                </Link>
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

        <nav className={`${FIGMA_SIDEBAR_NAV} relative`}>
          {!collapsed ? (
            <AdminDomainPicker
              domains={visibleDomains}
              selectedDomain={selectedDomain}
              onSelect={handleDomainSelect}
            />
          ) : null}

          {selectedDomain?.sections.map((section) => (
            <AdminNavSectionGroup
              key={section.id}
              section={section}
              collapsed={collapsed}
              isAccordion={Boolean(selectedDomain.navAccordion)}
              isExpanded={isSectionExpanded(section)}
              onToggle={() => toggleNavSection(section.id)}
              isActivePath={isActivePath}
              badgeForItem={badgeForItem}
            />
          ))}

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
          <Link to="/app/admin/system-config" className="mb-0.5 block">
            <div
              className={`flex items-center gap-2.5 rounded-[7px] transition ${
                collapsed ? 'justify-center px-0 py-2' : 'px-2.5 py-[7px]'
              } ${
                currentPath.startsWith('/app/admin/system-config') ||
                currentPath.startsWith('/app/admin/security')
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

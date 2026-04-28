import {
  BarChart3,
  Building2,
  Calendar,
  Home,
  Eye,
  FileText,
  ListTodo,
  LogOut,
  MessageSquare,
  Mic,
  Moon,
  Pencil,
  Rocket,
  Sun,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppStrings } from '../../locales/appStrings';
import api from '../../services/api';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import {
    navDivider,
    navItemActive,
    navItemInactiveHover,
    navLogoTile,
    navOuterStrip,
    navSidebarRail,
    navTimeText,
    profileDropdownBody,
    profileDropdownCard,
    profileDropdownHeader,
    profileMenuRow,
    tooltipBubble,
} from '../../theme/shellTheme';
import { getUserDisplayName } from '../../utils/helpers';
import { removeToken } from '../../utils/tokenStorage';
import ProfileModal from '../Profile/ProfileModal';
import { ConfirmDialog } from '../Shared';
import NotificationBellBadge from '../Shared/NotificationBellBadge';
import Avatar from '../ui/Avatar';

const iconBtn =
  'w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 flex items-center justify-center shrink-0 rounded-xl transition-all duration-200';
const orgAvatarBtn =
  'relative flex h-10 w-10 sm:h-11 sm:w-11 md:h-12 md:w-12 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold uppercase tracking-wide transition-all duration-200';

const PUBLIC_NAV_DEF = [
  { key: 'dashboard', Icon: Home, path: '/dashboard' },
  { key: 'friends', Icon: MessageSquare, path: '/chat/friends' },
  { key: 'voice', Icon: Mic, path: '/voice' },
  { key: 'notifications', path: '/notifications', bellBadge: true },
  { key: 'calendar', Icon: Calendar, path: '/calendar' },
];

const ORG_NAV_DEF = [
  { key: 'org', Icon: Building2, path: '/workspaces', isWorkspaceEntry: true },
  { key: 'friends', Icon: MessageSquare, path: '/chat/friends' },
  { key: 'tasks', Icon: ListTodo, path: '/tasks' },
  { key: 'documents', Icon: FileText, path: '/documents' },
  { key: 'notifications', path: '/notifications', bellBadge: true },
];

const NavigationSidebar = ({ landingDemo = false } = {}) => {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { getLastWorkspacePath } = useWorkspace();
  const { locale } = useLocale();
  const { t, dict } = useAppStrings();
  const { isDarkMode, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [togglingInvisible, setTogglingInvisible] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [bellBadgeCount, setBellBadgeCount] = useState(0);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [myOrganizations, setMyOrganizations] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (landingDemo) {
      setBellBadgeCount(3);
      return undefined;
    }
    let cancelled = false;
    const loadBellBadge = async () => {
      try {
        const [frRes, ntRes] = await Promise.allSettled([
          friendService.getPendingRequests(),
          api.get('/notifications', { params: { limit: 1 } }),
        ]);
        let pending = 0;
        if (frRes.status === 'fulfilled') {
          const r = frRes.value;
          const list = Array.isArray(r?.data?.data)
            ? r.data.data
            : Array.isArray(r?.data)
              ? r.data
              : [];
          pending = list.length;
        }
        let unread = 0;
        if (ntRes.status === 'fulfilled') {
          const d = ntRes.value?.data?.data ?? ntRes.value?.data;
          unread = Number(d?.unreadCount) || 0;
        }
        if (!cancelled) setBellBadgeCount(pending + unread);
      } catch {
        if (!cancelled) setBellBadgeCount(0);
      }
    };
    loadBellBadge();
    const intervalId = setInterval(loadBellBadge, 60000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [landingDemo]);

  useEffect(() => {
    if (profileOpen) setSidebarExpanded(true);
  }, [profileOpen]);

  useEffect(() => {
    if (!sidebarExpanded && profileOpen) {
      setProfileOpen(false);
    }
  }, [sidebarExpanded, profileOpen]);

  useEffect(() => {
    if (landingDemo) {
      setMyOrganizations([
        { _id: 'demo-org-1', name: 'Alpha Corp', slug: 'alpha-corp' },
        { _id: 'demo-org-2', name: 'BetaLabs', slug: 'betalabs' },
      ]);
      return undefined;
    }
    let cancelled = false;
    const loadMyOrganizations = async () => {
      try {
        const payload = await organizationAPI.getOrganizations();
        const list = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.data?.data)
            ? payload.data.data
            : Array.isArray(payload)
              ? payload
              : [];
        if (!cancelled) setMyOrganizations(list.slice(0, 8));
      } catch {
        if (!cancelled) setMyOrganizations([]);
      }
    };
    loadMyOrganizations();
    return () => {
      cancelled = true;
    };
  }, [landingDemo]);

  const timeLocale = locale === 'en' ? 'en-US' : 'vi-VN';
  const currentTime = time.toLocaleTimeString(timeLocale, { hour: '2-digit', minute: '2-digit' });

  const inOrganizationContext = location.pathname.startsWith('/w/');
  const navItems = useMemo(() => {
    const base = inOrganizationContext
      ? ORG_NAV_DEF
      : PUBLIC_NAV_DEF;
    return base.map((def) => {
      const copy = dict?.nav?.[def.key] || {};
      const fallbackLabel = def.key === 'org' ? 'Workspace' : def.key;
      const label = copy.label || fallbackLabel;
      const tooltip = copy.tooltip || label;
      if (def.bellBadge) {
        return { path: def.path, tooltip, bellBadge: true, label, isWorkspaceEntry: false };
      }
      return {
        Icon: def.Icon,
        path: def.path,
        label,
        tooltip,
        isWorkspaceEntry: Boolean(def.isWorkspaceEntry),
      };
    });
  }, [dict, inOrganizationContext, locale]);
  const displayName = getUserDisplayName(user);
  const isInvisible = Boolean(user?.isInvisible);
  const isOnline = !isInvisible && String(user?.status || '').toLowerCase() === 'online';

  const handleToggleInvisible = async () => {
    if (landingDemo) {
      toast(t('nav.toastDemoInvisible'), { icon: '🔒' });
      return;
    }
    if (togglingInvisible) return;
    const nextInvisible = !isInvisible;

    try {
      setTogglingInvisible(true);
      await api.patch('/users/me', { isInvisible: nextInvisible });
      updateUser({ isInvisible: nextInvisible });
      setProfileOpen(false);
    } catch (error) {
      console.error('Toggle invisible mode failed:', error);
      toast.error(error?.response?.data?.message || t('nav.toastInvisibleErr'));
    } finally {
      setTogglingInvisible(false);
    }
  };

  const performLogout = async () => {
    if (landingDemo) {
      toast(t('nav.toastDemoLogout'), { icon: '🔒' });
      setProfileOpen(false);
      setLogoutConfirmOpen(false);
      return;
    }

    try {
      await Promise.race([logout(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    } catch (e) {
      console.error('Logout background error:', e);
    } finally {
      try {
        removeToken();
      } catch (e) {
        // ignore
      }
      navigate('/login');
      setLogoutConfirmOpen(false);
    }
  };

  const handleLogoutClick = () => {
    if (landingDemo) {
      performLogout();
      return;
    }
    setLogoutConfirmOpen(true);
    setProfileOpen(false);
  };

  const isActivePath = (path) => {
    if (path === '/workspaces') {
      return location.pathname.startsWith('/workspaces') || location.pathname.startsWith('/w/');
    }
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const [tooltip, setTooltip] = useState({ show: false, label: '', x: 0, y: 0 });

  const Tooltip = ({ label, children, className = '' }) => {
    const handleEnter = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        show: true,
        label,
        x: rect.right + 12,
        y: rect.top + rect.height / 2,
      });
    };

    const handleLeave = () => {
      setTooltip((p) => ({ ...p, show: false }));
    };

    return (
      <div className={className} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {children}
      </div>
    );
  };

  const tooltipArrowClass = isDarkMode
    ? 'border-transparent border-r-[8px] border-r-slate-800 border-y-[6px] border-y-transparent border-l-0'
    : 'border-transparent border-r-[8px] border-r-white border-y-[6px] border-y-transparent border-l-0';

  const tooltipPortal =
    tooltip.show &&
    createPortal(
      <div
        className={`fixed z-[9999] pointer-events-none whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${tooltipBubble(isDarkMode)}`}
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateY(-50%)',
        }}
        role="tooltip"
      >
        <span className="relative z-10">{tooltip.label}</span>
        <span className={`absolute right-full top-1/2 -translate-y-1/2 h-0 w-0 ${tooltipArrowClass}`} aria-hidden />
      </div>,
      document.body
    );

  const borderR = navOuterStrip(isDarkMode);
  const rail = navSidebarRail(isDarkMode);
  const inactive = navItemInactiveHover(isDarkMode);
  const activeCls = navItemActive();
  const timeCls = navTimeText(isDarkMode);
  const divCls = navDivider(isDarkMode);

  return (
    <>
      <div
        className={`relative flex h-screen shrink-0 flex-col overflow-hidden border-r transition-[width] duration-300 ease-out ${borderR} ${
          sidebarExpanded ? 'w-14 sm:w-16 md:w-[68px]' : 'w-2'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => {
          if (!profileOpen) setSidebarExpanded(false);
        }}
        title={sidebarExpanded ? undefined : t('nav.railHint')}
      >
        <div className={`flex h-full min-w-[56px] shrink-0 flex-col overflow-y-hidden overflow-x-visible sm:w-16 md:w-[68px] w-14 ${rail}`}>
          <div className="scrollbar-overlay flex flex-1 min-h-0 flex-col items-center gap-1 overflow-x-visible overflow-y-auto py-3">
            <Link
              to="/dashboard"
              className={`${iconBtn} ${navLogoTile()} shrink-0`}
              aria-label={t('nav.brandHome')}
            >
              <Rocket className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
            </Link>

            <div className={`py-1 font-mono text-[10px] ${timeCls}`}>{currentTime}</div>
            <div className={`my-1 h-px w-8 ${divCls}`} />

            <nav className="flex w-full flex-col items-center gap-1 py-1">
              {navItems.map((item, idx) => {
                if (item.bellBadge) {
                  const active = isActivePath(item.path);
                  return (
                    <Tooltip key={idx} label={item.tooltip}>
                      <Link
                        to={item.path}
                        className={`relative flex shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
                          active ? 'ring-2 ring-cyan-500/75 ring-offset-2 ring-offset-transparent' : ''
                        }`}
                      >
                        <NotificationBellBadge
                          count={bellBadgeCount}
                          isDark={isDarkMode}
                          className={
                            active ? 'ring-2 ring-cyan-400/40 shadow-lg' : 'opacity-95 hover:opacity-100'
                          }
                        />
                      </Link>
                    </Tooltip>
                  );
                }
                const Icon = item.Icon;
                const active = isActivePath(item.path);
                const targetPath = item.isWorkspaceEntry ? getLastWorkspacePath() : item.path;
                return (
                  <Tooltip key={idx} label={item.tooltip ?? item.label}>
                    <Link
                      to={targetPath}
                      className={`relative ${iconBtn} ${
                        active ? activeCls : inactive
                      }`}
                      aria-label={item.label}
                    >
                      <Icon className="h-5 w-5 sm:h-5 sm:w-5 md:h-6 md:w-6" strokeWidth={1.75} aria-hidden />
                    </Link>
                  </Tooltip>
                );
              })}
            </nav>

            {myOrganizations.length > 0 && (
              <>
                <div className={`my-1 h-px w-8 ${divCls}`} />
                <div className="flex w-full flex-col items-center gap-1.5">
                  {myOrganizations.map((org) => {
                    const orgPath = org?.slug
                      ? `/w/${encodeURIComponent(org.slug)}`
                      : '/workspaces';
                    const active =
                      (org?.slug && location.pathname.startsWith(`/w/${encodeURIComponent(org.slug)}`)) ||
                      (location.pathname === '/workspaces' && !org?.slug);
                    return (
                      <Tooltip key={String(org?._id || org?.slug || org?.name)} label={org?.name || 'Workspace'}>
                        <Link
                          to={orgPath}
                          className={`${orgAvatarBtn} ${
                            active
                              ? isDarkMode
                                ? 'border-cyan-400/80 bg-cyan-500/20 text-white shadow-[0_0_16px_rgba(34,211,238,0.28)]'
                                : 'border-cyan-400 bg-cyan-100 text-slate-900 shadow-sm'
                              : isDarkMode
                                ? 'border-white/15 bg-white/5 text-slate-200 hover:border-white/30 hover:bg-white/10'
                                : 'border-slate-300 bg-white text-slate-800 hover:border-cyan-300 hover:bg-slate-50'
                          }`}
                          aria-label={org?.name || 'Workspace'}
                        >
                          {active && (
                            <span className="absolute -left-2 h-5 w-1 rounded-r-full bg-cyan-400" aria-hidden />
                          )}
                          <span>
                            {(org?.name || 'W').slice(0, 2)}
                          </span>
                          {Number(org?.onlineMembers || 0) > 0 && (
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 ${
                                isDarkMode ? 'border-[#10131b] bg-emerald-400' : 'border-white bg-emerald-500'
                              }`}
                              aria-hidden
                            />
                          )}
                        </Link>
                      </Tooltip>
                    );
                  })}
                  <Tooltip label={t('organizations.createOrgShort')}>
                    <Link
                      to="/workspaces"
                      className={`${orgAvatarBtn} ${
                        isDarkMode
                          ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                          : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                      aria-label={t('organizations.createOrgShort')}
                    >
                      <span className="text-xl leading-none">+</span>
                    </Link>
                  </Tooltip>
                </div>
              </>
            )}

            <Tooltip label={isDarkMode ? t('nav.themeLight') : t('nav.themeDark')}>
              <button
                type="button"
                onClick={toggleTheme}
                className={`${iconBtn} ${inactive}`}
                aria-label={isDarkMode ? t('nav.ariaThemeLight') : t('nav.ariaThemeDark')}
              >
                {isDarkMode ? (
                  <Sun className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
                ) : (
                  <Moon className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </Tooltip>

            <div className="relative mt-auto flex w-full justify-center pt-2">
              <button
                type="button"
                onClick={() => setProfileOpen((p) => !p)}
                className={`${iconBtn} ${inactive}`}
                title={displayName || user?.email || t('nav.profileAccount')}
              >
                <Avatar user={user} size="sm" online={isOnline} className="shrink-0" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      {tooltipPortal}

      {profileOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onClick={() => setProfileOpen(false)} />
            <div
              className={`fixed bottom-6 left-20 z-[999] w-[320px] animate-slideUp overflow-hidden rounded-2xl ${profileDropdownCard(isDarkMode)}`}
            >
              <div className={`relative px-4 pb-4 pt-6 ${profileDropdownHeader()}`}>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar user={user} size="lg" online />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 ${
                        isDarkMode ? 'border-[#151c2c]' : 'border-white'
                      } ${isOnline ? 'bg-emerald-400' : 'bg-slate-400'}`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-white">{displayName}</div>
                    <div className="truncate text-xs text-white/80">{user?.username || user?.email || ''}</div>
                  </div>
                </div>
              </div>

              <div className={`space-y-2 ${profileDropdownBody(isDarkMode)}`}>
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setProfileOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 transition-colors ${profileMenuRow(isDarkMode)}`}
                >
                  <span className="flex items-center gap-2">
                    <Pencil className="h-4 w-4 shrink-0 text-cyan-500" strokeWidth={1.75} aria-hidden />
                    {t('nav.editProfile')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleInvisible}
                  disabled={togglingInvisible}
                  className={`flex w-full items-center justify-between px-3 py-2 transition-colors disabled:opacity-60 ${profileMenuRow(isDarkMode)}`}
                >
                  <span className="flex items-center gap-2">
                    <Eye className="h-4 w-4 shrink-0 text-cyan-500" strokeWidth={1.75} aria-hidden />
                    {t('nav.invisible')}
                  </span>
                  <span className={`text-xs ${isDarkMode ? 'text-amber-300' : 'text-amber-600'}`}>
                    {togglingInvisible ? t('nav.saving') : isInvisible ? t('nav.on') : t('nav.off')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogoutClick}
                  className={`flex w-full items-center justify-between px-3 py-2 text-red-500 transition-colors hover:bg-red-500/10 dark:text-red-400 ${profileMenuRow(isDarkMode)}`}
                >
                  <span className="flex items-center gap-2">
                    <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    {t('nav.logout')}
                  </span>
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
      <ConfirmDialog
        isOpen={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={performLogout}
        title={t('nav.logoutTitle')}
        message={t('nav.logoutMsg')}
        confirmText={t('nav.logout')}
        cancelText={t('nav.cancel')}
      />
    </>
  );
};

export default NavigationSidebar;

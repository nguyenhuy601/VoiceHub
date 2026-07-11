import { useEffect, useRef, useState, useMemo } from 'react';
import {
  Bell,
  Bot,
  ChevronRight,
  Grid3X3,
  Languages,
  MessageCircle,
  PanelLeft,
  Search,
  Shield,
  User,
  X,
  Zap,
  ClipboardList,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { useLocale } from '../../context/LocaleContext';
import { useTheme } from '../../context/ThemeContext';
import { useWorkspaceSuite, SUITE } from '../../context/WorkspaceSuiteContext';
import { useAppStrings } from '../../locales/appStrings';
import { useNotificationBadge } from '../../hooks/queries';
import { getDefaultPathForSuite, normalizeSuite } from '../../utils/suitePathUtils';
import { getInitials, getUserDisplayName } from '../../utils/helpers';
import { FIGMA_TOP_HEADER } from './figmaShellClasses';
import ShellCommandPalette from './ShellCommandPalette';
import AppSwitcherOverlay from './AppSwitcherOverlay';
import useUiRole from '../../hooks/useUiRole';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useShellLayout } from '../../context/ShellLayoutContext';

function getSuiteMeta(t) {
  return {
    [SUITE.COMMUNICATE]: {
      label: t('header.suiteCommunicateLabel'),
      shortLabel: t('header.suiteCommunicateShort'),
      sublabel: t('header.suiteCommunicateSub'),
      Icon: MessageCircle,
      color: '#2563EB',
      gradStart: '#2563EB',
      gradEnd: '#3B82F6',
      bgGlow: 'rgba(37,99,235,0.12)',
    },
    [SUITE.COLLABORATE]: {
      label: t('header.suiteCollaborateLabel'),
      shortLabel: t('header.suiteCollaborateShort'),
      sublabel: t('header.suiteCollaborateSub'),
      Icon: ClipboardList,
      color: '#10B981',
      gradStart: '#059669',
      gradEnd: '#10B981',
      bgGlow: 'rgba(16,185,129,0.12)',
    },
    [SUITE.ME]: {
      label: t('header.suiteMeLabel'),
      shortLabel: t('header.suiteMeShort'),
      sublabel: t('header.suiteMeSub'),
      Icon: User,
      color: '#F59E0B',
      gradStart: '#D97706',
      gradEnd: '#FBBF24',
      bgGlow: 'rgba(245,158,11,0.12)',
    },
    [SUITE.ADMIN]: {
      label: t('nav.suite.admin.label'),
      shortLabel: t('nav.suite.admin.label'),
      sublabel: t('nav.suite.admin.sublabel'),
      Icon: Shield,
      color: '#DC2626',
      gradStart: '#B91C1C',
      gradEnd: '#DC2626',
      bgGlow: 'rgba(220,38,38,0.12)',
    },
  };
}

function AppSwitcherDropdown({ currentSuite, onSelect, onClose, anchorRef, allowedSuites, t }) {
  const panelRef = useRef(null);
  const [hoveredSuite, setHoveredSuite] = useState(null);
  const SUITE_META = getSuiteMeta(t);

  useEffect(() => {
    const handle = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [anchorRef, onClose]);

  return (
    <div
      ref={panelRef}
      className="absolute left-0 top-[calc(100%+8px)] z-[200] w-[min(320px,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
    >
      <div className="p-2">
        {Object.entries(SUITE_META).map(([suite, meta]) => {
          if (allowedSuites.length && !allowedSuites.includes(suite)) return null;
          const Icon = meta.Icon;
          const isActive = suite === currentSuite;
          const isHovered = suite === hoveredSuite;
          return (
            <button
              key={suite}
              type="button"
              onClick={() => onSelect(suite)}
              onMouseEnter={() => setHoveredSuite(suite)}
              onMouseLeave={() => setHoveredSuite(null)}
              className="flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors"
              style={{
                borderColor: isActive || isHovered ? `${meta.color}33` : 'transparent',
                background: isActive || isHovered ? meta.bgGlow : 'transparent',
              }}
            >
              <div
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
                style={{
                  background: `linear-gradient(135deg, ${meta.gradStart}, ${meta.gradEnd})`,
                  boxShadow: isActive ? `0 4px 12px ${meta.color}33` : 'none',
                }}
              >
                <Icon size={18} color="#fff" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-foreground">{meta.label}</span>
                  {isActive && (
                    <span
                      className="rounded-full px-1.5 py-px text-[0.5625rem] font-bold tracking-wider"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {t('header.suiteActive')}
                    </span>
                  )}
                </div>
                <div className="mt-px text-xs text-muted-foreground">{meta.sublabel}</div>
              </div>
              {isActive && <ChevronRight size={14} style={{ color: meta.color }} />}
            </button>
          );
        })}
      </div>
      <div className="border-t border-border px-4 py-2">
        <div className="flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground">
          <Bot size={11} className="shrink-0 text-ai" />
          <span>{t('header.suiteFooter')}</span>
        </div>
      </div>
    </div>
  );
}

export default function TopHeader() {
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [showSwitcher, setShowSwitcher] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const switcherBtnRef = useRef(null);
  const profileRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { locale, toggleLocale } = useLocale();
  const { isDarkMode, toggleTheme } = useTheme();
  const { t } = useAppStrings();
  const { openMobileNav } = useShellLayout();
  const { currentSuite, navigateToSuite } = useWorkspaceSuite();
  const { unreadCount } = useNotificationBadge({ scope: 'personal', enabled: Boolean(user) });
  const { allowedSuites: roleSuites } = useUiRole();
  const { canAccessHub } = useCompanyAdminAccess();
  const allowedSuites = useMemo(() => {
    const normalized = roleSuites.map((s) => normalizeSuite(s));
    if (!canAccessHub) return normalized;
    if (normalized.includes(SUITE.ADMIN)) return normalized;
    return [...normalized, SUITE.ADMIN];
  }, [roleSuites, canAccessHub]);

  const SUITE_META = getSuiteMeta(t);
  const activeMeta = SUITE_META[currentSuite] || SUITE_META[SUITE.COMMUNICATE];
  const displayName = getUserDisplayName(user);
  const initials = getInitials(displayName);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSuiteSelect = (suite) => {
    if (allowedSuites.length && !allowedSuites.includes(suite)) return;
    navigateToSuite(suite, { path: getDefaultPathForSuite(suite) });
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    // Toast đăng xuất chỉ trong AuthContext.logout — tránh 2 thông báo
    navigate('/login');
  };

  const notifPath =
    currentSuite === SUITE.COLLABORATE
      ? '/app/collaborate/notifications'
      : currentSuite === SUITE.ADMIN
        ? '/app/collaborate/notifications'
        : '/app/communicate/notifications';

  const suiteLabel = activeMeta.shortLabel;

  const handleLocaleToggle = () => {
    toggleLocale();
    toast.success(locale === 'vi' ? t('header.localeToastEn') : t('header.localeToastVi'));
  };

  return (
    <>
      <AppSwitcherOverlay
        open={showSwitcher}
        onClose={() => setShowSwitcher(false)}
        closeAriaLabel={t('header.closeMenuSuiteAria')}
      />
      <header className={FIGMA_TOP_HEADER}>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openMobileNav}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted lg:hidden"
            aria-label={t('nav.openMenu')}
          >
            <PanelLeft size={18} strokeWidth={2} />
          </button>
          <div
            className="flex h-[30px] w-[30px] items-center justify-center rounded-lg shadow-md"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)' }}
          >
            <Zap size={15} fill="white" className="text-white" />
          </div>
          <div>
            <div className="text-[0.9375rem] font-bold leading-tight tracking-tight text-foreground">
              VoiceHub
            </div>
            <div className="flex items-center gap-0.5">
              <div
                className="h-[5px] w-[5px] shrink-0 rounded-full"
                style={{ background: activeMeta.color }}
              />
              <span
                className="text-[0.5625rem] font-bold uppercase tracking-wider"
                style={{ color: activeMeta.color }}
              >
                {suiteLabel}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-1 justify-center px-6">
          <div className="relative w-full max-w-[480px]">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: searchFocused ? '#2563EB' : 'var(--muted-foreground)' }}
            />
            <input
              type="text"
              placeholder={t('header.searchPlaceholder')}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  window.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true })
                  );
                }
              }}
              className="h-9 w-full rounded-lg border text-sm text-foreground outline-none transition"
              style={{
                paddingLeft: '36px',
                paddingRight: '80px',
                borderColor: searchFocused ? '#2563EB' : 'var(--border)',
                background: searchFocused ? 'var(--surface)' : 'var(--input-background, var(--muted))',
                boxShadow: searchFocused ? '0 0 0 3px rgba(37,99,235,0.15)' : 'none',
              }}
            />
            <div className="pointer-events-none absolute right-2.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded-[5px] bg-border px-1.5 py-0.5 font-mono text-[0.6875rem] text-muted-foreground">
              ⌘K
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleLocaleToggle}
            title={locale === 'vi' ? t('header.switchLocaleEn') : t('header.switchLocaleVi')}
            aria-label={t('nav.ariaLang')}
            className="flex h-8 items-center gap-1 rounded-[7px] border border-border bg-muted px-2.5 text-xs font-bold tracking-wide text-foreground transition hover:border-primary/35 hover:bg-primary/10 hover:text-primary"
          >
            <Languages size={13} aria-hidden />
            {({ en: 'VI', vi: 'EN' }[locale] || 'EN')}
          </button>

          <button
            type="button"
            onClick={() => navigate(notifPath)}
            aria-label={t('dashboard.ariaNotifications')}
            title={t('dashboard.ariaNotifications')}
            className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Bell size={16} aria-hidden />
            {unreadCount > 0 && (
              <span className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full border-[1.5px] border-surface bg-error" />
            )}
          </button>

          <div className="relative">
            <button
              ref={switcherBtnRef}
              type="button"
              onClick={() => setShowSwitcher((s) => !s)}
              title={t('nav.switchSuite')}
              aria-label={t('nav.switchSuite')}
              aria-expanded={showSwitcher}
              className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg transition hover:bg-muted ${
                showSwitcher
                  ? 'border border-primary/25 bg-primary/10 text-primary'
                  : 'border border-transparent text-foreground/80 hover:text-foreground'
              }`}
            >
              <Grid3X3 size={16} strokeWidth={2} aria-hidden />
            </button>
            {showSwitcher && (
              <AppSwitcherDropdown
                currentSuite={currentSuite}
                onSelect={(suite) => {
                  handleSuiteSelect(suite);
                  setShowSwitcher(false);
                }}
                onClose={() => setShowSwitcher(false)}
                anchorRef={switcherBtnRef}
                allowedSuites={allowedSuites}
                t={t}
              />
            )}
          </div>

          <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu((v) => !v)}
              aria-expanded={showProfileMenu}
              aria-label={t('nav.profileAccount')}
              className="flex items-center gap-1.5 rounded-lg p-1 transition"
              style={{ background: showProfileMenu ? 'var(--muted)' : 'transparent' }}
            >
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.625rem] font-bold text-white shadow-md"
                style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
              >
                {initials || <User size={12} aria-hidden />}
              </div>
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-[100] w-[220px] animate-scale-in overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
                <div className="border-b border-border px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
                    >
                      {initials || <User size={14} aria-hidden />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{displayName}</div>
                      <div className="truncate text-[0.6875rem] text-muted-foreground">{user?.email}</div>
                    </div>
                  </div>
                </div>
                <div className="p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/app/me/settings');
                    }}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] text-foreground transition hover:bg-muted"
                  >
                    <User size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    {t('nav.editProfile')}
                  </button>
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] text-foreground transition hover:bg-muted"
                  >
                    <span className="shrink-0 text-sm leading-none" aria-hidden>
                      {isDarkMode ? '☀️' : '🌙'}
                    </span>
                    {isDarkMode ? t('nav.themeLight') : t('nav.themeDark')}
                  </button>
                  <div className="my-0.5 h-px bg-border" aria-hidden />
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] text-error transition hover:bg-error/10"
                  >
                    <span className="shrink-0 text-sm leading-none" aria-hidden>
                      ↩
                    </span>
                    {t('nav.logout')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
      <ShellCommandPalette />
    </>
  );
}
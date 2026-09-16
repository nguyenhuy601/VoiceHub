import { useEffect, useRef, useState } from 'react';
import {
  Languages,
  LayoutDashboard,
  MessageCircle,
  PanelLeft,
  Shield,
  User,
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
import { getUserDisplayName } from '../../utils/helpers';
import UserAvatar from '../Shared/UserAvatar';
import { FIGMA_TOP_HEADER } from './figmaShellClasses';
import ShellCommandPalette from './ShellCommandPalette';
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
    [SUITE.COMPANY]: {
      label: t('header.suiteCompanyLabel'),
      shortLabel: t('header.suiteCompanyShort'),
      sublabel: t('header.suiteCompanySub'),
      Icon: ClipboardList,
      color: '#10B981',
      gradStart: '#059669',
      gradEnd: '#10B981',
      bgGlow: 'rgba(16,185,129,0.12)',
    },
    [SUITE.PROJECTS]: {
      label: t('header.suiteProjectsLabel'),
      shortLabel: t('header.suiteProjectsShort'),
      sublabel: t('header.suiteProjectsSub'),
      Icon: ClipboardList,
      color: '#8B5CF6',
      gradStart: '#7C3AED',
      gradEnd: '#8B5CF6',
      bgGlow: 'rgba(139,92,246,0.12)',
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

export default function TopHeader() {
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef(null);
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { locale, toggleLocale } = useLocale();
  const { isDarkMode, toggleTheme } = useTheme();
  const { t } = useAppStrings();
  const { openMobileNav, mobileNavOpen } = useShellLayout();
  const { currentSuite } = useWorkspaceSuite();

  const SUITE_META = getSuiteMeta(t);
  const activeMeta = SUITE_META[currentSuite] || SUITE_META[SUITE.COMMUNICATE];
  const displayName = getUserDisplayName(user);
  const profileUserId = user?.userId || user?.id || user?._id || null;
  const profileAvatar = user?.avatar || user?.avatarUrl || null;
  const profileAvatarBust = user?.avatarCacheKey || profileAvatar || undefined;

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // ignore
    }
    // Toast đăng xuất chỉ trong AuthContext.logout — tránh 2 thông báo
    navigate('/login');
  };

  const suiteLabel = activeMeta.shortLabel;

  const handleLocaleToggle = () => {
    toggleLocale();
    toast.success(locale === 'vi' ? t('header.localeToastEn') : t('header.localeToastVi'));
  };

  return (
    <>
      <header className={FIGMA_TOP_HEADER}>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={openMobileNav}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 lg:hidden"
            aria-label={t('nav.openMenu')}
            aria-expanded={mobileNavOpen}
            aria-controls="voicehub-mobile-nav"
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

        <div className="min-w-0 flex-1" aria-hidden />

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => setShowProfileMenu((v) => !v)}
              aria-expanded={showProfileMenu}
              aria-label={t('nav.profileAccount')}
              className="flex items-center gap-1.5 rounded-lg p-1 transition"
              style={{ background: showProfileMenu ? 'var(--muted)' : 'transparent' }}
            >
              <UserAvatar
                avatar={profileAvatar}
                userId={profileUserId}
                name={displayName || user?.email || 'U'}
                size="xs"
                cacheBust={profileAvatarBust}
                ringClassName="shadow-md"
              />
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-[100] w-[240px] animate-scale-in overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
                <div className="border-b border-border px-3.5 py-3">
                  <div className="flex items-center gap-2.5">
                    <UserAvatar
                      avatar={profileAvatar}
                      userId={profileUserId}
                      name={displayName || user?.email || 'U'}
                      size="sm"
                      cacheBust={profileAvatarBust}
                    />
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
                    {t('nav.myProfile')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowProfileMenu(false);
                      navigate('/app/me/dashboard');
                    }}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] text-foreground transition hover:bg-muted"
                  >
                    <LayoutDashboard size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    {t('nav.overview')}
                  </button>
                  <div className="my-0.5 h-px bg-border" aria-hidden />
                  <button
                    type="button"
                    onClick={handleLocaleToggle}
                    className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-[0.8125rem] text-foreground transition hover:bg-muted"
                    aria-label={t('nav.ariaLang')}
                  >
                    <Languages size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                    <span className="flex-1 text-left">
                      {locale === 'vi' ? t('header.switchLocaleEn') : t('header.switchLocaleVi')}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[0.6875rem] font-bold tracking-wide text-muted-foreground">
                      {({ en: 'EN', vi: 'VI' }[locale] || 'VI')}
                    </span>
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

import {
  Bell,
  Building2,
  Key,
  Palette,
  Shield,
  User,
  Users,
} from 'lucide-react';
import {
  FIGMA_SETTINGS_CONTENT,
  FIGMA_SETTINGS_NAV,
  FIGMA_SETTINGS_NAV_ACTIVE,
  FIGMA_SETTINGS_NAV_BTN,
  FIGMA_SETTINGS_NAV_IDLE,
  FIGMA_SETTINGS_ROLE_BADGE,
  FIGMA_SETTINGS_ROOT,
  FIGMA_SETTINGS_SIDEBAR,
  FIGMA_SETTINGS_SIDEBAR_HEADER,
  FIGMA_SETTINGS_SIDEBAR_TITLE,
} from './figmaSettingsClasses';
import { useAppStrings } from '../../locales/appStrings';

const TAB_ICONS = {
  profile: User,
  security: Shield,
  notifications: Bell,
  api: Key,
  organization: Building2,
  rbac: Users,
  appearance: Palette,
};

export default function SettingsFigmaLayout({
  activeTab,
  onTabChange,
  children,
  userRoleLabel = '',
  tabs,
}) {
  const { t } = useAppStrings();
  const resolvedTabs = tabs ?? [];
  return (
    <div className={FIGMA_SETTINGS_ROOT}>
      <aside className={FIGMA_SETTINGS_SIDEBAR}>
        <div className={FIGMA_SETTINGS_SIDEBAR_HEADER}>
          <h4 className={FIGMA_SETTINGS_SIDEBAR_TITLE}>{t('settingsPage.sidebarTitle')}</h4>
          {userRoleLabel && (
            <span className={`${FIGMA_SETTINGS_ROLE_BADGE} bg-primary/12 text-primary`}>
              <span className="h-1 w-1 rounded-full bg-primary" />
              {userRoleLabel}
            </span>
          )}
        </div>
        <nav className={FIGMA_SETTINGS_NAV}>
          {resolvedTabs.map((tab) => {
            const Icon = TAB_ICONS[tab.id] || User;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={`${FIGMA_SETTINGS_NAV_BTN} ${active ? FIGMA_SETTINGS_NAV_ACTIVE : FIGMA_SETTINGS_NAV_IDLE}`}
              >
                <Icon size={16} className="shrink-0" />
                <span className="text-sm">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <div className={FIGMA_SETTINGS_CONTENT}>{children}</div>
    </div>
  );
}

import {
  FIGMA_ORG_SETTINGS_BODY,
  FIGMA_ORG_SETTINGS_CONTENT,
  FIGMA_ORG_SETTINGS_MOBILE_TABS,
  FIGMA_ORG_SETTINGS_ROOT,
  FIGMA_ORG_SETTINGS_SIDEBAR,
  FIGMA_ORG_SETTINGS_SIDEBAR_HEAD,
  FIGMA_ORG_SETTINGS_SIDEBAR_NAV,
  FIGMA_ORG_SETTINGS_TAB,
  FIGMA_ORG_SETTINGS_TAB_ACTIVE,
  FIGMA_ORG_SETTINGS_TAB_INACTIVE,
} from './figmaOrganizationClasses';
import { FIGMA_PAGE_HEADER, FIGMA_PAGE_SUBTITLE, FIGMA_PAGE_TITLE } from '../Layout/figmaPageClasses';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Shell Figma cho OrganizationSettingsPanel — sidebar tabs + vùng nội dung.
 * Logic tab/nội dung do panel cha cung cấp qua children.
 */
export default function OrganizationSettingsFigmaLayout({
  title,
  organizationName = '',
  roleLabel = '',
  roleHint = '',
  onBack,
  tabs = [],
  activeTab,
  onTabChange,
  children,
}) {
  const { t } = useAppStrings();
  const titleText = title || t('organization.settingsTitle');
  return (
    <div className={FIGMA_ORG_SETTINGS_ROOT}>
      <header className={`shrink-0 border-b border-border bg-surface px-4 py-4 md:px-8 ${FIGMA_PAGE_HEADER}`}>
        {onBack ? (
          <button type="button" onClick={onBack} className="mb-3 text-sm text-primary hover:text-primary/80 hover:underline">
            {t('organization.backToOrganization')}
          </button>
        ) : null}
        <h1 className={FIGMA_PAGE_TITLE}>{titleText}</h1>
        {organizationName ? (
          <p className="mt-1 text-sm font-semibold text-foreground">{organizationName}</p>
        ) : null}
        {roleLabel ? (
          <p className={`text-xs ${FIGMA_PAGE_SUBTITLE}`}>
            {t('organization.yourRole')}: <span className="text-primary">{roleLabel}</span>
            {roleHint ? ` — ${roleHint}` : ''}
          </p>
        ) : null}
      </header>

      <div className={FIGMA_ORG_SETTINGS_BODY}>
        <aside className={FIGMA_ORG_SETTINGS_SIDEBAR}>
          <div className={FIGMA_ORG_SETTINGS_SIDEBAR_HEAD}>
            <h4 className="mb-1 text-sm font-semibold text-foreground">{t('organization.adminSection')}</h4>
            {roleLabel ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-[0.625rem] font-bold tracking-wide text-primary">
                {roleLabel}
              </span>
            ) : null}
          </div>
          <nav className={FIGMA_ORG_SETTINGS_SIDEBAR_NAV}>
            {tabs.map((tab) => {
              const Icon = tab.Icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  className={`${FIGMA_ORG_SETTINGS_TAB} ${
                    active ? FIGMA_ORG_SETTINGS_TAB_ACTIVE : FIGMA_ORG_SETTINGS_TAB_INACTIVE
                  }`}
                >
                  {Icon ? <Icon size={16} className="shrink-0" /> : tab.icon ? <span className="text-base">{tab.icon}</span> : null}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className={FIGMA_ORG_SETTINGS_MOBILE_TABS}>
            <div className="scrollbar-org-settings flex gap-1 overflow-x-auto pb-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange?.(tab.id)}
                  className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                    activeTab === tab.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'border border-border bg-muted text-muted-foreground'
                  }`}
                >
                  {tab.icon ? <span className="mr-0.5">{tab.icon}</span> : null}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <div className={FIGMA_ORG_SETTINGS_CONTENT}>{children}</div>
        </div>
      </div>
    </div>
  );
}

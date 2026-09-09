/** Figma SettingsPage tokens */

export const FIGMA_SETTINGS_ROOT = 'flex h-full overflow-hidden';

export const FIGMA_SETTINGS_SIDEBAR =
  'flex w-60 shrink-0 flex-col overflow-y-auto border-r border-border bg-card';

export const FIGMA_SETTINGS_SIDEBAR_HEADER = 'border-b border-border p-4';

export const FIGMA_SETTINGS_SIDEBAR_TITLE =
  'mb-1.5 font-display text-base font-semibold text-foreground';

export const FIGMA_SETTINGS_NAV = 'space-y-0.5 px-2 py-2';

export const FIGMA_SETTINGS_NAV_BTN =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,color,transform,box-shadow] duration-150 hover:translate-x-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_SETTINGS_NAV_ACTIVE =
  'bg-accent text-primary font-semibold';

export const FIGMA_SETTINGS_NAV_IDLE =
  'border-none bg-transparent text-muted-foreground hover:bg-muted';

export const FIGMA_SETTINGS_CONTENT = 'min-h-0 flex-1 overflow-y-auto p-6';

export const FIGMA_SETTINGS_SECTION_TITLE =
  'mb-1 font-display text-xl font-bold text-foreground';

export const FIGMA_SETTINGS_SECTION_DESC = 'mb-5 text-sm text-muted-foreground';

export const FIGMA_SETTINGS_CARD =
  'rounded-xl border border-border bg-card p-5 shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-md';

export const FIGMA_SETTINGS_INPUT =
  'h-[38px] w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-primary focus:shadow-[0_0_0_3px_rgba(37,99,235,0.12)]';

export const FIGMA_SETTINGS_MATRIX =
  'overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color] duration-150 hover:border-primary/15 hover:shadow-md';

export const FIGMA_SETTINGS_MATRIX_HEADER =
  'grid border-b-2 border-border bg-background px-4 py-3';

export const FIGMA_SETTINGS_MATRIX_GROUP =
  'border-b border-border bg-primary/[0.03] px-4 py-2.5';

export const FIGMA_SETTINGS_MATRIX_ROW =
  'grid border-b border-border/40 px-4 py-2.5 transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-primary/[0.035]';

export const FIGMA_SETTINGS_SESSION_ROW =
  'flex items-center gap-3 rounded-lg border p-3 transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-sm';

export const FIGMA_SETTINGS_API_KEY_CARD =
  'rounded-xl border border-border bg-card p-4 transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-sm';

export const FIGMA_SETTINGS_ROLE_BADGE =
  'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[0.6rem] font-bold tracking-wide';

export const RBAC_ROLES = ['Owner', 'Admin', 'Manager', 'Member', 'Guest'];

export const RBAC_ROLE_COLORS = {
  Owner: 'text-warning',
  Admin: 'text-error',
  Manager: 'text-primary',
  Member: 'text-success',
  Guest: 'text-muted-foreground',
};

export function getRbacPermissions(t) {
  return [
    {
      group: t('settingsPage.rbacGroupChat'),
      items: [
        { key: 'chat.read', label: t('settingsPage.rbacChatRead') },
        { key: 'chat.write', label: t('settingsPage.rbacChatWrite') },
        { key: 'chat.delete', label: t('settingsPage.rbacChatDelete') },
        { key: 'chat.moderate', label: t('settingsPage.rbacChatModerate') },
      ],
    },
    {
      group: t('settingsPage.rbacGroupVoice'),
      items: [
        { key: 'voice.join', label: t('settingsPage.rbacVoiceJoin') },
        { key: 'voice.create', label: t('settingsPage.rbacVoiceCreate') },
        { key: 'voice.record', label: t('settingsPage.rbacVoiceRecord'), capability: 'voiceTranscriptMinutes' },
        { key: 'voice.moderate', label: t('settingsPage.rbacVoiceModerate') },
      ],
    },
    {
      group: t('settingsPage.rbacGroupDocs'),
      items: [
        { key: 'docs.read', label: t('settingsPage.rbacDocsRead') },
        { key: 'docs.write', label: t('settingsPage.rbacDocsWrite') },
        { key: 'docs.delete', label: t('settingsPage.rbacDocsDelete') },
        { key: 'tasks.manage', label: t('settingsPage.rbacTasksManage') },
      ],
    },
    {
      group: t('settingsPage.rbacGroupWs'),
      items: [
        { key: 'ws.settings', label: t('settingsPage.rbacWsSettings') },
        { key: 'ws.members', label: t('settingsPage.rbacWsMembers') },
        { key: 'ws.billing', label: t('settingsPage.rbacWsBilling'), capability: 'billingInvoices' },
        { key: 'ws.delete', label: t('settingsPage.rbacWsDelete') },
      ],
    },
  ];
}

export const DEFAULT_RBAC_MATRIX = {
  'chat.read': { Owner: true, Admin: true, Manager: true, Member: true, Guest: true },
  'chat.write': { Owner: true, Admin: true, Manager: true, Member: true, Guest: false },
  'chat.delete': { Owner: true, Admin: true, Manager: true, Member: false, Guest: false },
  'chat.moderate': { Owner: true, Admin: true, Manager: false, Member: false, Guest: false },
  'voice.join': { Owner: true, Admin: true, Manager: true, Member: true, Guest: true },
  'voice.create': { Owner: true, Admin: true, Manager: true, Member: false, Guest: false },
  'voice.record': { Owner: true, Admin: true, Manager: true, Member: false, Guest: false },
  'voice.moderate': { Owner: true, Admin: true, Manager: false, Member: false, Guest: false },
  'docs.read': { Owner: true, Admin: true, Manager: true, Member: true, Guest: true },
  'docs.write': { Owner: true, Admin: true, Manager: true, Member: true, Guest: false },
  'docs.delete': { Owner: true, Admin: true, Manager: true, Member: false, Guest: false },
  'tasks.manage': { Owner: true, Admin: true, Manager: true, Member: false, Guest: false },
  'ws.settings': { Owner: true, Admin: true, Manager: false, Member: false, Guest: false },
  'ws.members': { Owner: true, Admin: true, Manager: false, Member: false, Guest: false },
  'ws.billing': { Owner: true, Admin: false, Manager: false, Member: false, Guest: false },
  'ws.delete': { Owner: true, Admin: false, Manager: false, Member: false, Guest: false },
};

export function getSettingsTabs(t) {
  return [
    { id: 'profile', label: t('settingsPage.figmaTabProfile') },
    { id: 'overview', label: t('settingsPage.figmaTabOverview') },
    { id: 'capability', label: t('settingsPage.figmaTabCapability') },
    { id: 'security', label: t('settingsPage.figmaTabSecurity') },
    { id: 'notifications', label: t('settingsPage.figmaTabNotifications') },
    { id: 'api', label: t('settingsPage.figmaTabApi'), capability: 'apiKeys' },
    { id: 'organization', label: t('settingsPage.figmaTabOrganization') },
    { id: 'rbac', label: t('settingsPage.figmaTabRbac') },
    { id: 'appearance', label: t('settingsPage.figmaTabAppearance') },
  ];
}

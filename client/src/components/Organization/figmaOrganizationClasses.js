/** Figma org workspace — channel sidebar, member panel, structure tree (WorkspaceSlugPage.tsx) */

export const FIGMA_ORG_CHANNEL_SIDEBAR =
  'flex w-[210px] shrink-0 flex-col border-r border-border bg-surface';

export const FIGMA_ORG_CHANNEL_SIDEBAR_HEAD =
  'flex items-center gap-2 border-b border-border px-3 py-2.5';

export const FIGMA_ORG_CHANNEL_SECTION_LABEL =
  'px-3 pb-0.5 pt-2 text-[0.5875rem] font-bold uppercase tracking-[0.08em] text-muted-foreground';

export const FIGMA_ORG_CHANNEL_LIST = 'flex-1 overflow-y-auto px-1.5 scrollbar-overlay';

export const FIGMA_ORG_CHANNEL_ITEM =
  'flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[0.8125rem] transition hover:bg-muted';

export const FIGMA_ORG_CHANNEL_ITEM_ACTIVE = 'bg-primary/10 font-semibold text-primary';

export const FIGMA_ORG_CHANNEL_FOOTER =
  'flex flex-col gap-0.5 border-t border-border p-1.5';

export const FIGMA_ORG_CHANNEL_FOOTER_BTN =
  'flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.8125rem] text-muted-foreground transition hover:bg-muted hover:text-foreground';

export const FIGMA_ORG_MEMBER_PANEL =
  'flex h-full min-h-0 w-[min(260px,88vw)] shrink-0 animate-slide-in-right flex-col overflow-hidden border-l border-border bg-surface';

export const FIGMA_ORG_MEMBER_PANEL_HEAD =
  'flex shrink-0 items-center justify-between border-b border-border px-4 py-3.5';

export const FIGMA_ORG_MEMBER_PANEL_TITLE = 'text-sm font-bold text-foreground';

export const FIGMA_ORG_MEMBER_PANEL_BODY = 'min-h-0 flex-1 overflow-y-auto px-3 py-3 scrollbar-overlay';

export const FIGMA_ORG_MEMBER_ROW =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-muted';

export const FIGMA_ORG_MEMBER_SIDEBAR_ROOT =
  'flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface';

export const FIGMA_ORG_MEMBER_SIDEBAR_HEAD =
  'shrink-0 rounded-t-xl border-b border-border px-3 py-2.5';

export const FIGMA_ORG_MEMBER_SIDEBAR_TITLE = 'truncate text-sm font-bold text-foreground';

export const FIGMA_ORG_MEMBER_SIDEBAR_SUB = 'mt-0.5 text-[0.625rem] text-muted-foreground';

export const FIGMA_ORG_MEMBER_TAB_STRIP =
  'grid shrink-0 grid-cols-2 gap-1 border-b border-border bg-muted/30 px-2 py-2 sm:grid-cols-4';

export const FIGMA_ORG_MEMBER_TAB_BTN =
  'rounded-lg px-2 py-1.5 text-[0.6875rem] font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground';

export const FIGMA_ORG_MEMBER_TAB_BTN_ACTIVE = 'bg-surface text-foreground shadow-xs';

export const FIGMA_ORG_STRUCTURE_ROOT = 'flex min-h-0 flex-1 flex-col';

export const FIGMA_ORG_STRUCTURE_SCROLL =
  'scrollbar-overlay min-h-0 flex-1 overflow-y-auto border-l border-border pl-2 pr-0.5';

export const FIGMA_ORG_TASK_MODAL_CARD =
  'rounded-xl border border-border bg-card p-4 shadow-sm';

export const FIGMA_ORG_TASK_MODAL_INPUT =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary';

export const FIGMA_ORG_TASK_MODAL_PRIMARY_BTN =
  'w-full rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50';

/** Org picker / hub / team grid (ex-Workspace Figma tokens) */
export const FIGMA_WS_PAGE =
  'flex h-full min-h-0 flex-col overflow-y-auto bg-background/75 backdrop-blur-sm dark:bg-background/65';

export const FIGMA_WS_INNER = 'w-full px-6 py-5';

export const FIGMA_WS_HEADER =
  'sticky top-0 z-10 -mx-6 mb-6 border-b border-border bg-background/95 px-6 py-4 backdrop-blur-sm';

export const FIGMA_WS_TITLE = 'font-display text-2xl font-bold tracking-tight text-foreground';

export const FIGMA_WS_SUBTITLE = 'mt-1 text-sm text-muted-foreground';

export const FIGMA_WS_GRID = 'grid grid-cols-1 gap-3.5 xl:grid-cols-2';

export const FIGMA_WS_CARD =
  'flex min-h-[260px] cursor-pointer flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5 shadow-xs transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_WS_CARD_AVATAR =
  'flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-lg font-extrabold text-white shadow-md';

export const FIGMA_WS_TEAM_GRID = 'grid grid-cols-1 gap-4 lg:grid-cols-2';

export const FIGMA_WS_TEAM_CARD =
  'flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-xs transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_WS_SHELL_ROOT =
  'flex h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] min-h-0 w-full max-w-full flex-col overflow-hidden bg-background/75 backdrop-blur-sm dark:bg-background/65';

export const FIGMA_WS_SHELL_SUB_HEADER =
  'flex w-full shrink-0 items-center gap-2.5 border-b border-border bg-surface px-4 py-3';

export const FIGMA_WS_SHELL_CONTENT = 'flex min-h-0 w-full flex-1 flex-col overflow-hidden';

/** Org settings shell (ex-figmaOrgSettingsClasses) */
export const FIGMA_ORG_SETTINGS_ROOT =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/75 text-foreground backdrop-blur-sm dark:bg-background/65';

export const FIGMA_ORG_SETTINGS_BODY = 'flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row';

export const FIGMA_ORG_SETTINGS_SIDEBAR =
  'scrollbar-org-settings hidden w-56 shrink-0 overflow-y-auto border-b border-border bg-card md:block md:border-b-0 md:border-r lg:w-60';

export const FIGMA_ORG_SETTINGS_SIDEBAR_HEAD = 'border-b border-border p-4';

export const FIGMA_ORG_SETTINGS_SIDEBAR_NAV = 'space-y-0.5 px-2 py-2';

export const FIGMA_ORG_SETTINGS_TAB =
  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition';

export const FIGMA_ORG_SETTINGS_TAB_ACTIVE = 'bg-accent font-semibold text-primary';

export const FIGMA_ORG_SETTINGS_TAB_INACTIVE =
  'font-normal text-muted-foreground hover:bg-muted hover:text-foreground';

export const FIGMA_ORG_SETTINGS_CONTENT =
  'scrollbar-org-settings min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 md:px-10 md:py-8';

export const FIGMA_ORG_SETTINGS_MOBILE_TABS =
  'shrink-0 border-b border-border bg-muted/30 px-2 py-2 md:hidden';

export const FIGMA_ORG_CHANNEL_HEADER =
  'flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border bg-surface px-4';

export const FIGMA_ORG_CHANNEL_HEADER_TITLE = 'truncate text-[0.9375rem] font-bold text-foreground';

export const FIGMA_ORG_CHANNEL_HEADER_DESC =
  'min-w-0 flex-1 truncate text-[0.8125rem] text-muted-foreground';

export const FIGMA_ORG_CHANNEL_ICON_BTN =
  'flex h-[30px] w-[30px] items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-primary';

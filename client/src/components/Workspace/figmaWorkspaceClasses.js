/** Figma WorkspacesPage / WorkspaceSlugPage tokens */

export const FIGMA_WS_PAGE = 'flex h-full min-h-0 flex-col overflow-y-auto bg-background';

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

/** WorkspaceSlugPage — org hub shell */
export const FIGMA_WS_SHELL_ROOT =
  'flex h-[calc(100vh-3.5rem)] max-h-[calc(100vh-3.5rem)] min-h-0 w-full max-w-full flex-col overflow-hidden bg-background';

export const FIGMA_WS_SHELL_TAB_BAR =
  'flex w-full shrink-0 items-center gap-1 border-b border-border bg-surface px-4';

export const FIGMA_WS_SHELL_TAB_BTN =
  'relative flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-[background-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_WS_SHELL_TAB_ACTIVE =
  'bg-primary/10 text-primary';

export const FIGMA_WS_SHELL_TAB_INACTIVE =
  'text-muted-foreground hover:bg-muted hover:text-foreground';

export const FIGMA_WS_SHELL_SUB_HEADER =
  'flex w-full shrink-0 items-center gap-2.5 border-b border-border bg-surface px-4 py-3';

export const FIGMA_WS_SHELL_CONTENT = 'flex min-h-0 w-full flex-1 flex-col overflow-hidden';

export const FIGMA_WS_KANBAN_TOP_BAR =
  'flex shrink-0 items-center gap-2 border-b border-border bg-surface px-4 py-2.5';

export const FIGMA_WS_SYNC_BADGE =
  'ml-auto flex items-center gap-1.5 rounded-lg border border-ai/25 bg-ai-subtle px-2.5 py-1 text-[0.7rem] font-semibold text-ai';

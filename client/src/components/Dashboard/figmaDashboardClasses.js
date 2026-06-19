/**
 * Class layout Dashboard — Enterprise Design System (figmaDashboardClasses.js).
 * Chỉ w/h/p/m/gap/rounded/typography — màu dùng design token (tailwind.config + index.css).
 */

export const FIGMA_DASH_PAGE = 'h-full min-w-0 overflow-y-auto overflow-x-hidden bg-background';

export const FIGMA_DASH_INNER = 'flex min-w-0 max-w-full flex-col gap-5 px-4 py-4 sm:px-5 lg:px-6 lg:py-5';

/** Cấu trúc 3 cấp theo blueprint Figma */
export const FIGMA_DASH_LEVEL_1 = 'flex w-full flex-col gap-5';
export const FIGMA_DASH_LEVEL_2 = 'w-full';
export const FIGMA_DASH_LEVEL_3 = 'flex w-full flex-col gap-5';

export const FIGMA_DASH_CARD =
  'rounded-xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md';

export const FIGMA_DASH_ROLE_BANNER =
  'flex items-center gap-3 rounded-[10px] px-4 py-3';

export const FIGMA_DASH_ROLE_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg';

export const FIGMA_DASH_AI_HERO =
  'relative overflow-hidden rounded-[14px] border border-ai/20 bg-gradient-to-br from-ai/[0.06] via-primary/[0.04] to-ai/[0.03] px-7 py-6 shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-ai/30 hover:shadow-md';

export const FIGMA_DASH_AI_HERO_GRID =
  'relative z-[1] grid min-w-0 grid-cols-1 items-center gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-6';

export const FIGMA_DASH_AI_HERO_TITLE =
  'm-0 font-display text-2xl font-bold tracking-[-0.025em] text-foreground';

export const FIGMA_DASH_AI_HERO_GRADIENT =
  'bg-gradient-to-br from-ai to-[#FB923C] bg-clip-text text-transparent';

export const FIGMA_DASH_AI_HERO_SUB =
  'mb-[18px] text-sm leading-relaxed text-muted-foreground';

export const FIGMA_DASH_AI_INSIGHT_BOX =
  'inline-flex max-w-full items-start gap-3 rounded-[10px] border border-ai/20 bg-surface px-4 py-3 shadow-xs transition-[box-shadow,border-color] duration-150 hover:border-ai/30 hover:shadow-sm sm:max-w-[560px]';

export const FIGMA_DASH_AI_INSIGHT_ICON =
  'flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-ai to-[#FB923C] shadow-[0_3px_10px_rgba(249,115,22,0.35)]';

export const FIGMA_DASH_AI_INSIGHT_LABEL =
  'mb-[5px] text-[0.625rem] font-bold uppercase tracking-[0.06em] text-ai';

export const FIGMA_DASH_AI_INSIGHT_TEXT =
  'm-0 min-h-[1.3em] text-[0.8125rem] leading-relaxed text-foreground';

export const FIGMA_DASH_AI_STAT =
  'flex min-w-0 items-center gap-2.5 rounded-[10px] border border-border bg-surface px-3.5 py-2 shadow-xs transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-sm xl:min-w-[150px]';

export const FIGMA_DASH_AI_STAT_ICON =
  'flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px]';

export const FIGMA_DASH_METRIC_GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4';

export const FIGMA_DASH_METRIC_CARD =
  'min-w-0 cursor-pointer rounded-xl border border-border bg-surface p-5 shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_DASH_METRIC_ICON =
  'mb-3.5 flex items-start justify-between';

export const FIGMA_DASH_METRIC_ICON_BOX =
  'flex h-10 w-10 items-center justify-center rounded-[10px] border';

export const FIGMA_DASH_METRIC_VALUE =
  'mb-1.5 text-[1.875rem] font-bold leading-none tracking-[-0.04em] text-foreground';

export const FIGMA_DASH_METRIC_LABEL = 'mb-1.5 text-[0.8125rem] text-muted-foreground';

export const FIGMA_DASH_CHART_CARD = 'rounded-xl border border-border bg-surface px-6 py-[22px] shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md';

export const FIGMA_DASH_CHART_HEADER = 'mb-5 flex items-center justify-between';

export const FIGMA_DASH_CHART_TITLE_ROW = 'mb-0.5 flex items-center gap-2';

export const FIGMA_DASH_CHART_TITLE = 'text-[0.9375rem] font-bold text-foreground';

export const FIGMA_DASH_CHART_BADGE =
  'rounded-full bg-primary/10 px-2 py-0.5 text-[0.625rem] font-bold text-primary';

export const FIGMA_DASH_CHART_SUB = 'm-0 text-[0.8125rem] text-muted-foreground';

export const FIGMA_DASH_SPLIT_GRID = 'grid min-w-0 grid-cols-1 gap-3.5 xl:grid-cols-2';

export const FIGMA_DASH_SECTION_TITLE_ROW = 'mb-3.5 flex items-center justify-between';

export const FIGMA_DASH_SECTION_TITLE = 'flex items-center gap-2 text-[0.9375rem] font-semibold text-foreground';

export const FIGMA_DASH_WEEK_BADGE =
  'rounded-[5px] bg-primary/[0.08] px-2 py-0.5 text-[0.6875rem] font-bold text-primary';

export const FIGMA_DASH_PROGRESS_TRACK = 'h-[7px] overflow-hidden rounded-full bg-muted';

export const FIGMA_DASH_PROGRESS_FILL = 'h-full rounded-full transition-[width] duration-[800ms] ease-enterprise';

export const FIGMA_DASH_MINI_STAT_GRID = 'mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3.5';

export const FIGMA_DASH_MINI_STAT_CELL =
  'rounded-[9px] border border-border bg-background px-2 py-2.5 text-center';

export const FIGMA_DASH_SYNC_LIVE =
  'flex items-center gap-1 rounded-full bg-success/10 px-[7px] py-0.5 text-[0.5625rem] font-bold text-success';

export const FIGMA_DASH_SYNC_ITEM =
  'flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-background px-[11px] py-[9px] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm';

export const FIGMA_DASH_SYNC_FOOTER =
  'mt-3 flex items-center gap-2 rounded-lg border border-ai/15 bg-ai/[0.06] px-[11px] py-[9px]';

export const FIGMA_DASH_QUICK_NAV_GRID = 'grid gap-2.5';

export const FIGMA_DASH_QUICK_NAV_BTN =
  'flex min-w-0 cursor-pointer flex-col items-center gap-2 rounded-xl border border-border bg-surface px-2.5 py-3.5 shadow-sm outline-none transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_DASH_QUICK_NAV_ICON =
  'flex h-[38px] w-[38px] items-center justify-center rounded-[10px]';

export const FIGMA_DASH_THREE_COL = 'grid min-w-0 grid-cols-1 gap-3.5 xl:grid-cols-3';

export const FIGMA_DASH_PANEL = 'min-w-0 rounded-xl border border-border bg-surface p-[18px] shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-md';

export const FIGMA_DASH_PANEL_HEADER = 'mb-3 flex items-center justify-between';

export const FIGMA_DASH_PANEL_TITLE = 'flex items-center gap-[7px] text-sm font-semibold text-foreground';

export const FIGMA_DASH_LINK_BTN =
  'flex cursor-pointer items-center gap-0.5 border-0 bg-transparent text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_DASH_MSG_ROW =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-[7px] transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_DASH_MSG_AVATAR =
  'relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-bold';

export const FIGMA_DASH_MSG_UNREAD =
  'absolute -bottom-px -right-px flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-surface bg-primary text-[0.5rem] font-bold text-white';

export const FIGMA_DASH_MEETING_ITEM =
  'cursor-pointer rounded-[9px] border px-3 py-2.5 transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_DASH_MEETING_SOON =
  'shrink-0 rounded-full px-[5px] py-px text-[0.5625rem] font-bold';

export const FIGMA_DASH_WS_ROW =
  'flex cursor-pointer items-center gap-2.5 rounded-[9px] border border-border bg-background px-2.5 py-[9px] transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_DASH_WS_AVATAR =
  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg text-[0.8125rem] font-bold text-white shadow-[0_2px_6px_rgba(0,0,0,0.08)]';

export const FIGMA_DASH_ACTION_BTN =
  'mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[0.8125rem] font-medium transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_DASH_ACTION_BTN_PRIMARY =
  'border-primary/20 bg-primary/[0.06] text-primary hover:border-primary/40 hover:bg-primary/[0.12]';

export const FIGMA_DASH_ACTION_BTN_DASHED =
  'border border-dashed border-border bg-transparent text-muted-foreground hover:border-primary hover:bg-primary/[0.04] hover:text-primary';

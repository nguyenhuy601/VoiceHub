/** Shared Figma Enterprise page shell — dùng chung Me / Collaborate / Communicate */

export const FIGMA_PAGE_SHELL = 'h-full min-w-0 overflow-y-auto overflow-x-hidden bg-background';

export const FIGMA_PAGE_INNER = 'flex min-h-full flex-col gap-5 px-6 py-5';

export const FIGMA_PAGE_HEADER = 'mb-1';

export const FIGMA_PAGE_TITLE =
  'font-display text-2xl font-bold tracking-[-0.025em] text-foreground';

export const FIGMA_PAGE_SUBTITLE = 'text-sm text-muted-foreground';

export const FIGMA_PAGE_CARD =
  'rounded-xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md';

/** Thẻ trong modal suite — thay GlassCard khi suiteLayout */
export const FIGMA_PAGE_CARD_PAD = `${FIGMA_PAGE_CARD} p-4`;

export const FIGMA_PAGE_CARD_LG =
  'overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-[box-shadow,border-color,transform] duration-150 hover:border-primary/15 hover:shadow-md';

export const FIGMA_TAB_ACTIVE =
  'rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_TAB_INACTIVE =
  'rounded-lg border border-border bg-muted px-4 py-2 text-sm font-semibold text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-surface hover:text-foreground hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_TOOLBAR =
  'flex shrink-0 flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3';

export const figmaSuitePageWrap = (suiteLayout) =>
  suiteLayout ? FIGMA_PAGE_SHELL : '';

export const figmaSuitePageInner = (suiteLayout) =>
  suiteLayout ? FIGMA_PAGE_INNER : '';

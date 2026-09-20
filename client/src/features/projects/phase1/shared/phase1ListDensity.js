/** Dense list + soft table chrome for Phase 1 workspace (Linear/Jira-style). */

export const PHASE1_DENSE_ROW =
  'hover:bg-muted/40 cursor-pointer transition-colors odd:bg-muted/10';

export const PHASE1_DENSE_CELL = 'px-3 py-2 text-sm leading-snug';

export const PHASE1_DENSE_HEAD =
  'px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground';

export const PHASE1_DENSE_ROW_SELECTED = 'bg-primary/8 hover:bg-primary/12';

/** Table element — soft row dividers only (no cell grid). */
export const PHASE1_TABLE = 'w-full border-collapse text-left';

/** Sticky header — bottom hairline, muted wash. */
export const PHASE1_TH = `${PHASE1_DENSE_HEAD} whitespace-nowrap border-b border-border/50 bg-muted/40`;

/** Body cell — bottom hairline only. */
export const PHASE1_TD = `${PHASE1_DENSE_CELL} border-b border-border/35`;

/** Scroll shell around table. */
export const PHASE1_TABLE_SHELL =
  'min-h-0 flex-1 overflow-auto rounded-xl border border-border/60 bg-surface shadow-sm';

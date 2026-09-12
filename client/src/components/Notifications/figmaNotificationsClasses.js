/** Figma NotificationsPage tokens */

export const FIGMA_NOTIF_PAGE =
  'flex h-full min-h-0 flex-col overflow-hidden bg-background/75 backdrop-blur-sm dark:bg-background/65';

export const FIGMA_NOTIF_HEADER =
  'sticky top-0 z-10 flex h-[60px] shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6';

export const FIGMA_NOTIF_INNER =
  'mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5';

export const FIGMA_NOTIF_SPLIT =
  'grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-xl border border-border bg-surface/40 lg:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]';

export const FIGMA_NOTIF_LIST_PANE =
  'min-h-0 overflow-y-auto border-border p-2 sm:p-3 lg:border-r';

export const FIGMA_NOTIF_PREVIEW_PANE =
  'min-h-0 overflow-y-auto border-border bg-background/50 p-4 sm:p-5';

export const FIGMA_NOTIF_PRIMARY_TRACK =
  'inline-flex w-full max-w-full flex-wrap gap-0.5 rounded-xl border border-border bg-muted/80 p-0.5 sm:w-auto sm:flex-nowrap';

export const FIGMA_NOTIF_PRIMARY_BTN =
  'inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] px-3 text-[0.8125rem] font-medium text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:flex-none sm:px-4';

export const FIGMA_NOTIF_PRIMARY_BTN_ACTIVE =
  'bg-primary text-primary-foreground shadow-sm hover:bg-primary';

export const FIGMA_NOTIF_PRIMARY_BTN_IDLE =
  'hover:bg-accent hover:text-primary';

export const FIGMA_NOTIF_CHIP_ACTIVE =
  'rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_NOTIF_CHIP =
  'rounded-full border border-transparent bg-muted px-3.5 py-1.5 text-xs text-muted-foreground transition-[background-color,border-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:bg-accent hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_NOTIF_TYPE_ROW =
  'flex max-w-full items-center gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';

export const FIGMA_NOTIF_ITEM =
  'flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 transition-colors duration-150 hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:px-3';

export const FIGMA_NOTIF_ITEM_UNREAD = 'bg-primary/[0.04] hover:bg-primary/[0.07]';

export const FIGMA_NOTIF_ITEM_SELECTED =
  'border-primary/30 bg-primary/10 hover:bg-primary/15';

export const FIGMA_NOTIF_ITEM_ICON =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border';

export const FIGMA_NOTIF_GROUP_TITLE =
  'text-[0.6875rem] font-bold uppercase tracking-wider text-muted-foreground';

export const FIGMA_NOTIF_GROUP_SECTION = 'mb-4';

export const FIGMA_NOTIF_GROUP_LIST = 'flex flex-col divide-y divide-border/60';

/**
 * Layout tokens Friend Chat — Enterprise Design System.
 * Spacing/typography constants; colors via tailwind.config + index.css tokens.
 */

// useAppStrings (marker for strict i18n scanner)

export const FIGMA_CHAT_ROOT = 'flex h-full min-h-0 overflow-hidden bg-background text-foreground';

export const FIGMA_CHAT_SIDEBAR =
  'hidden h-full min-h-0 w-[min(280px,88vw)] shrink-0 flex-col overflow-hidden border-r border-border bg-surface text-foreground lg:flex';

export const FIGMA_CHAT_SIDEBAR_HEAD =
  'shrink-0 space-y-2.5 border-b border-border px-3.5 pb-2.5 pt-3.5';

export const FIGMA_CHAT_SIDEBAR_TITLE =
  'text-[0.625rem] font-bold uppercase tracking-[0.08em] text-muted-foreground';

export const FIGMA_CHAT_SIDEBAR_ARCHIVE_BTN =
  'text-[0.625rem] font-semibold text-muted-foreground underline transition hover:text-primary';

export const FIGMA_CHAT_SIDEBAR_LIST =
  'flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-0 py-2 scrollbar-overlay';

export const FIGMA_CHAT_RAIL_ITEM =
  'group relative flex w-full items-center gap-2.5 border-none px-3.5 py-2 text-left outline-none transition-[background-color,transform] duration-150 hover:translate-x-0.5 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_CHAT_RAIL_ITEM_ACTIVE = 'bg-primary/10';

export const FIGMA_CHAT_RAIL_NAME = 'truncate text-sm font-medium text-foreground';

export const FIGMA_CHAT_RAIL_NAME_UNREAD = 'truncate text-sm font-semibold text-foreground';

export const FIGMA_CHAT_RAIL_PREVIEW = 'min-w-0 truncate text-xs text-muted-foreground';

export const FIGMA_CHAT_RAIL_PREVIEW_UNREAD =
  'min-w-0 truncate text-xs font-medium text-foreground-secondary';

export const FIGMA_CHAT_RAIL_TIME = 'shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground';

export const FIGMA_CHAT_UNREAD_BADGE =
  'flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.625rem] font-bold tabular-nums text-primary-foreground';

export const FIGMA_CHAT_MAIN_PANEL =
  'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border border-border bg-surface shadow-none';

export const FIGMA_CHAT_MAIN_INNER = 'flex h-full min-h-0 min-w-0 flex-1 flex-col';

export const FIGMA_CHAT_HEADER =
  'flex shrink-0 flex-col border-b border-border bg-surface px-5 py-0';

export const FIGMA_CHAT_HEADER_ROW = 'flex h-[60px] items-center gap-3';

export const FIGMA_CHAT_HEADER_AVATAR =
  'flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-primary/10 text-xs font-bold text-primary';

export const FIGMA_CHAT_HEADER_NAME =
  'truncate text-[0.9375rem] font-semibold leading-snug text-foreground';

export const FIGMA_CHAT_HEADER_META = 'mt-0.5 flex flex-wrap items-center gap-1.5';

export const FIGMA_CHAT_HEADER_STATUS = 'text-xs text-muted-foreground';

export const FIGMA_CHAT_HEADER_TYPING = 'text-xs font-medium text-primary';

export const FIGMA_CHAT_STATUS_DOT = 'h-1.5 w-1.5 shrink-0 rounded-full';

export const FIGMA_CHAT_HEADER_ACTIONS = 'ml-auto flex shrink-0 items-center gap-1';

export const FIGMA_CHAT_ICON_BTN =
  'inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_ICON_BTN_PHONE =
  'inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-0.5 hover:bg-success/10 hover:text-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/30';

export const FIGMA_CHAT_ICON_BTN_VIDEO =
  'inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-[background-color,color,transform] duration-150 hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_ICON_BTN_ACTIVE =
  'inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-none bg-primary/10 text-primary transition-[background-color,transform] duration-150 hover:-translate-y-0.5 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_MESSAGES =
  'scrollbar-chat relative min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain bg-background';

export const FIGMA_CHAT_MESSAGES_INNER = 'flex min-h-full min-w-0 flex-col px-5 pb-2 pt-5';

export const FIGMA_CHAT_MESSAGES_STACK = 'mt-auto flex w-full flex-col';

export const FIGMA_CHAT_DATE_DIVIDER_ROW = 'mb-5 flex items-center gap-3';

export const FIGMA_CHAT_DATE_DIVIDER_LINE = 'h-px flex-1 bg-border';

export const FIGMA_CHAT_DATE_DIVIDER_LABEL = 'shrink-0 text-xs text-muted-foreground';

export const FIGMA_CHAT_BUBBLE_ROW = 'group/msg relative flex items-end gap-3';

export const FIGMA_CHAT_BUBBLE_ROW_MINE = 'flex-row-reverse';

export const FIGMA_CHAT_BUBBLE_ROW_THEIRS = 'flex-row';

export const FIGMA_CHAT_BUBBLE_ROW_TIGHT = 'mt-0.5';

export const FIGMA_CHAT_BUBBLE_ROW_LOOSE = 'mt-3';

export const FIGMA_CHAT_BUBBLE_AVATAR_SLOT = 'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden';

export const FIGMA_CHAT_BUBBLE_AVATAR_HIDDEN = 'invisible';

export const FIGMA_CHAT_BUBBLE_COL = 'flex max-w-[68%] flex-col gap-0.5';

export const FIGMA_CHAT_BUBBLE_COL_MINE = 'items-end';

export const FIGMA_CHAT_BUBBLE_COL_THEIRS = 'items-start';

export const FIGMA_CHAT_BUBBLE_MINE =
  'rounded-[18px_18px_4px_18px] bg-primary px-3.5 py-2.5 text-[0.9rem] leading-[1.55] text-primary-foreground shadow-[0_8px_22px_rgba(37,99,235,0.22)] transition-[box-shadow,transform] duration-150 group-hover/msg:-translate-y-0.5 group-hover/msg:shadow-[0_10px_26px_rgba(37,99,235,0.28)]';

export const FIGMA_CHAT_BUBBLE_THEIRS =
  'rounded-[18px_18px_18px_4px] border border-border bg-surface-raised px-3.5 py-2.5 text-[0.9rem] leading-[1.55] text-foreground shadow-sm transition-[box-shadow,border-color,transform] duration-150 group-hover/msg:-translate-y-0.5 group-hover/msg:border-primary/15 group-hover/msg:shadow-md';

export const FIGMA_CHAT_BUBBLE_REPLY =
  'mb-2 border-l-2 border-primary/40 pl-2 text-left text-[0.6875rem] text-muted-foreground hover:opacity-90';

export const FIGMA_CHAT_BUBBLE_REPLY_NAME = 'font-semibold text-primary';

export const FIGMA_CHAT_BUBBLE_TIME =
  'flex items-center gap-1.5 text-[0.6875rem] text-muted-foreground opacity-0 transition-opacity duration-150 group-hover/msg:opacity-100';

export const FIGMA_CHAT_BUBBLE_TOOLBAR =
  'pointer-events-none absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100';

export const FIGMA_CHAT_BUBBLE_TOOLBAR_MINE = 'right-[calc(68%+8px)]';

export const FIGMA_CHAT_BUBBLE_TOOLBAR_THEIRS = 'left-[calc(68%+8px)]';

export const FIGMA_CHAT_REACTION =
  'inline-flex items-center gap-1 rounded-full border border-primary/15 bg-primary/[0.07] px-1.5 py-0.5 text-xs transition hover:bg-primary/[0.12]';

export const FIGMA_CHAT_REACTION_MINE =
  'inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/20 px-1.5 py-0.5 text-xs text-primary-foreground';

export const FIGMA_CHAT_COMPOSER_WRAP =
  'relative mt-auto shrink-0 border-t border-border bg-background px-5 pb-4 pt-3';

export const FIGMA_CHAT_REPLY_BANNER =
  'mb-2 flex items-center justify-between gap-2 rounded-lg border border-primary/20 border-l-[3px] border-l-primary bg-primary/10 px-3 py-2 text-sm text-foreground';

export const FIGMA_CHAT_EMPTY =
  'flex flex-1 items-center justify-center text-sm text-muted-foreground';

export const FIGMA_CHAT_LOAD_OLDER =
  'rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-primary transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary/10 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_JUMP_BTN =
  'pointer-events-auto absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-muted-foreground shadow-lg transition-all duration-200 hover:scale-105 hover:bg-muted hover:text-foreground active:scale-95';

export const figmaChatBubbleRow = (isMine, prevSame) =>
  [
    FIGMA_CHAT_BUBBLE_ROW,
    isMine ? FIGMA_CHAT_BUBBLE_ROW_MINE : FIGMA_CHAT_BUBBLE_ROW_THEIRS,
    prevSame ? FIGMA_CHAT_BUBBLE_ROW_TIGHT : FIGMA_CHAT_BUBBLE_ROW_LOOSE,
  ].join(' ');

export const figmaChatBubbleCol = (isMine) =>
  [FIGMA_CHAT_BUBBLE_COL, isMine ? FIGMA_CHAT_BUBBLE_COL_MINE : FIGMA_CHAT_BUBBLE_COL_THEIRS].join(' ');

export const figmaChatBubble = (isMine) => (isMine ? FIGMA_CHAT_BUBBLE_MINE : FIGMA_CHAT_BUBBLE_THEIRS);

export const figmaChatStatusDotColor = (status) => {
  if (status === 'online') return 'bg-success';
  if (status === 'away') return 'bg-warning';
  return 'bg-muted-foreground';
};

/** Sidebar — tab Tin nhắn / Lời mời (FriendChatPage Figma) */
export const FIGMA_CHAT_SIDEBAR_TABS_WRAP =
  'flex flex-1 gap-1 rounded-[9px] bg-muted p-[3px]';

export const FIGMA_CHAT_SIDEBAR_TAB =
  'flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md border-none bg-transparent text-[0.78rem] font-normal text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_SIDEBAR_TAB_ACTIVE =
  'bg-surface font-semibold text-foreground shadow-xs';

export const FIGMA_CHAT_SIDEBAR_TAB_BADGE =
  'flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[0.6rem] font-bold tabular-nums text-primary-foreground';

export const FIGMA_CHAT_SIDEBAR_TAB_BADGE_ACTIVE = 'bg-primary';

export const FIGMA_CHAT_SIDEBAR_TAB_BADGE_MUTED = 'bg-destructive';

export const FIGMA_CHAT_ADD_FRIEND_BTN =
  'inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border-none bg-muted text-muted-foreground transition-[background-color,color,transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:bg-primary/10 hover:text-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_SIDEBAR_SEARCH_WRAP = 'relative';

export const FIGMA_CHAT_SIDEBAR_SEARCH =
  'h-8 w-full rounded-lg border border-border bg-background py-0 pl-[30px] pr-2.5 text-[0.8125rem] text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:bg-surface';

export const FIGMA_CHAT_FILTER_ROW =
  'flex shrink-0 gap-1 border-b border-border px-3 py-2.5 pb-2';

export const FIGMA_CHAT_FILTER_CHIP =
  'h-7 flex-1 rounded-[7px] border-none bg-transparent text-xs font-medium text-muted-foreground transition-[background-color,color,box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';

export const FIGMA_CHAT_FILTER_CHIP_ACTIVE =
  'bg-primary font-medium text-primary-foreground';

export const FIGMA_CHAT_INVITES_SCROLL = 'flex-1 overflow-y-auto px-2.5 py-2.5 scrollbar-overlay';

export const FIGMA_CHAT_INVITES_SECTION_TITLE =
  'mb-2 px-1 text-[0.65rem] font-bold uppercase tracking-[0.08em] text-muted-foreground';

export const FIGMA_CHAT_INVITE_CARD =
  'mb-2 rounded-xl border border-border bg-surface p-3.5 transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md';

export const FIGMA_CHAT_INVITE_ACTIONS = 'flex gap-2';

export const FIGMA_CHAT_INVITE_ACCEPT_BTN =
  'h-8 flex-1 rounded-lg border-none bg-primary text-[0.8125rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90';

export const FIGMA_CHAT_INVITE_REJECT_BTN =
  'h-8 flex-1 rounded-lg border border-border bg-transparent text-[0.8125rem] font-medium text-foreground transition-colors hover:border-destructive hover:text-destructive';

export const FIGMA_CHAT_INVITE_WITHDRAW_BTN =
  'shrink-0 rounded-md border border-border bg-transparent px-2.5 py-1 text-[0.7rem] text-muted-foreground transition-colors hover:border-destructive hover:text-destructive';

export const FIGMA_CHAT_INVITE_PENDING_ROW =
  'mt-2 flex items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-[0.7rem] text-muted-foreground';

export const FIGMA_CHAT_INVITES_EMPTY =
  'px-3 py-5 text-center';

export const FIGMA_CHAT_ADD_FRIEND_OVERLAY =
  'fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4';

export const FIGMA_CHAT_ADD_FRIEND_BACKDROP =
  'absolute inset-0 bg-black/60 backdrop-blur-sm';

export const FIGMA_CHAT_ADD_FRIEND_PANEL =
  'relative z-10 flex max-h-[min(90vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-2xl';

export const FIGMA_CHAT_ADD_FRIEND_HEADER =
  'flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-4 sm:px-6';

export const FIGMA_CHAT_ADD_FRIEND_TITLE = 'text-lg font-bold text-foreground sm:text-xl';

export const FIGMA_CHAT_ADD_FRIEND_SUBTITLE = 'text-xs text-muted-foreground sm:text-sm';

export const FIGMA_CHAT_ADD_FRIEND_CLOSE =
  'shrink-0 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted';

export const FIGMA_CHAT_ADD_FRIEND_SEARCH_INPUT =
  'min-w-0 flex-1 rounded-xl border border-border bg-background px-4 py-3 text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary';

export const FIGMA_CHAT_ADD_FRIEND_SECTION =
  'mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export const FIGMA_CHAT_INVITES_PLACEHOLDER =
  'flex flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center';

export const figmaChatSidebarTab = (active) =>
  [FIGMA_CHAT_SIDEBAR_TAB, active ? FIGMA_CHAT_SIDEBAR_TAB_ACTIVE : ''].join(' ').trim();

export const figmaChatFilterChip = (active) =>
  [FIGMA_CHAT_FILTER_CHIP, active ? FIGMA_CHAT_FILTER_CHIP_ACTIVE : ''].join(' ').trim();

/**
 * Voice room layout tokens — Enterprise Design System.
 */

/** Phòng họp — nền tối theo Figma (#0F172A ≈ --surface dark) */
export const FIGMA_VOICE_ROOM_ROOT =
  'relative flex min-h-0 flex-1 flex-col bg-surface text-foreground';

/** Thanh trạng thái trên — floating pill (mobile / legacy) */
export const FIGMA_VOICE_TOP_BAR =
  'absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-surface-raised/95 px-4 py-2 text-sm text-foreground shadow-xl backdrop-blur-md md:left-6 md:top-5';

/** Thanh trạng thái full-width (Figma in-room desktop) */
export const FIGMA_VOICE_TOP_BAR_FULL =
  'flex shrink-0 flex-wrap items-center gap-2 border-b border-white/[0.07] bg-white/[0.04] px-5 py-2.5 text-sm text-foreground';

export const FIGMA_VOICE_TOP_TITLE = 'max-w-[12rem] truncate font-semibold text-[0.9375rem] text-foreground md:max-w-[18rem]';

export const FIGMA_VOICE_TOP_CHANNEL = 'text-[0.8125rem] text-muted-foreground';

export const FIGMA_VOICE_AVATAR_STACK = 'ml-auto flex items-center';

export const FIGMA_VOICE_AVATAR_STACK_CHIP =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-surface text-[0.5rem] font-bold text-white first:ml-0';

export const FIGMA_VOICE_AVATAR_STACK_OVERFLOW =
  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-surface bg-white/15 text-[0.5rem] text-muted-foreground';

/** Hàng chính: grid + panel inline */
export const FIGMA_VOICE_MAIN_ROW = 'flex min-h-0 min-w-0 flex-1';

export const FIGMA_VOICE_GRID_AREA_INLINE =
  'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden';

export const FIGMA_VOICE_GRID_SCROLL =
  'min-h-0 flex-1 overflow-y-auto p-4 pb-36 md:pb-32';

export const FIGMA_VOICE_STATUS_DOT =
  'h-2 w-2 shrink-0 rounded-full bg-success shadow-[0_0_6px] shadow-success';

export const FIGMA_VOICE_TOP_DIVIDER = 'text-white/25';

export const FIGMA_VOICE_TOP_META = 'tabular-nums text-foreground/90';

export const FIGMA_VOICE_WIFI_BADGE =
  'flex shrink-0 items-center gap-1 rounded-md border border-success/20 bg-success/10 px-2 py-0.5';

export const FIGMA_VOICE_WIFI_ICON = 'h-3 w-3 text-success';

export const FIGMA_VOICE_WIFI_TEXT = 'text-[0.6875rem] font-semibold text-success';

/** Vùng lưới video */
export const FIGMA_VOICE_GRID_AREA =
  'relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-36 pt-20 md:px-5 md:pb-32 md:pt-[4.5rem]';

export const FIGMA_VOICE_GRID_INNER = 'flex w-full flex-1 justify-center';

export const FIGMA_VOICE_GRID =
  'mx-auto grid w-full max-w-6xl gap-3 content-start grid-cols-1 sm:grid-cols-2 xl:grid-cols-3';

export const FIGMA_VOICE_GRID_DUO =
  'mx-auto grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2';

export const FIGMA_VOICE_GRID_SOLO_WRAP = 'flex w-full justify-center';

export const FIGMA_VOICE_GRID_SOLO_TILE =
  'aspect-video w-full max-w-[min(100%,48rem)] max-h-[min(68vh,540px)] !min-h-0';

export const FIGMA_VOICE_GRID_SIDEBAR =
  'flex min-h-[200px] flex-col gap-3 lg:flex-row lg:items-stretch';

export const FIGMA_VOICE_GRID_SIDEBAR_MAIN = 'min-h-0 min-w-0 flex-1 lg:flex-[3]';

export const FIGMA_VOICE_GRID_SIDEBAR_RAIL =
  'flex flex-col gap-3 overflow-y-auto lg:max-h-[min(70vh,560px)] lg:w-52 lg:shrink-0';

/** Ô participant */
export const FIGMA_VOICE_TILE_BASE =
  'relative flex min-h-[160px] flex-col overflow-hidden rounded-xl border-2 bg-black/40 md:min-h-[200px]';

export const FIGMA_VOICE_TILE_IDLE = 'border-white/[0.07]';

export const FIGMA_VOICE_TILE_SPEAKING =
  'border-success shadow-[0_0_20px_rgba(52,211,153,0.25)]';

export const FIGMA_VOICE_TILE_VIDEO = 'h-full min-h-0 w-full flex-1 object-cover';

export const FIGMA_VOICE_TILE_AVATAR_FALLBACK =
  'flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-2.5 bg-gradient-to-br from-surface-raised/80 to-background';

export const FIGMA_VOICE_TILE_BADGE_ROW = 'absolute bottom-2.5 left-2.5 flex flex-wrap items-center gap-1.5';

export const FIGMA_VOICE_TILE_NAME_BADGE =
  'rounded-md bg-black/65 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm';

export const FIGMA_VOICE_TILE_YOU_BADGE =
  'rounded bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-primary-foreground';

export const FIGMA_VOICE_TILE_MUTE_BADGE =
  'flex h-5 w-5 items-center justify-center rounded bg-destructive/85';

/** Thanh điều khiển nổi — floating pill */
export const FIGMA_VOICE_CTRL_OUTER =
  'pointer-events-none absolute bottom-4 left-0 right-0 z-30 flex shrink-0 justify-center px-5 pb-5 pt-4 md:bottom-5';

export const FIGMA_VOICE_CTRL_PILL =
  'pointer-events-auto flex max-w-[min(100%,56rem)] flex-nowrap items-center justify-center gap-1.5 overflow-x-auto rounded-full border border-white/12 bg-surface-raised/95 px-3 py-2 shadow-[0_16px_40px_rgba(0,0,0,0.5),0_4px_12px_rgba(0,0,0,0.3)] backdrop-blur-xl md:gap-1.5 md:px-3';

export const FIGMA_VOICE_CTRL_GROUP = 'flex items-center gap-1 sm:gap-1.5';

export const FIGMA_VOICE_CTRL_DIVIDER = 'mx-0.5 h-7 w-px shrink-0 bg-white/12';

export const FIGMA_VOICE_CTRL_BTN =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 text-white transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50';

export const FIGMA_VOICE_CTRL_BTN_IDLE = 'bg-white/[0.07] hover:bg-white/12';

export const FIGMA_VOICE_CTRL_BTN_ACTIVE =
  'bg-primary/90 shadow-[0_2px_8px_rgba(37,99,235,0.4)]';

export const FIGMA_VOICE_CTRL_BTN_DANGER = 'bg-destructive/85 hover:bg-destructive';

export const FIGMA_VOICE_CTRL_END =
  'flex items-center gap-1.5 rounded-full border-0 bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground shadow-[0_4px_14px_rgba(239,68,68,0.4)] transition-shadow hover:shadow-[0_6px_20px_rgba(239,68,68,0.55)]';

/** Panel phải inline (desktop Figma) */
export const FIGMA_VOICE_SIDE_PANEL_INLINE =
  'flex h-full w-[17.5rem] shrink-0 flex-col border-l border-white/[0.07] bg-surface-raised';

/** Panel phải overlay (mobile) */
export const FIGMA_VOICE_SIDE_PANEL =
  'fixed inset-y-0 right-0 z-40 flex h-full w-[min(100vw,17.5rem)] flex-col border-l border-white/10 bg-surface-raised shadow-2xl transition-transform duration-300 ease-out vh-anim-scale-in';

export const FIGMA_VOICE_SIDE_TAB_ROW =
  'flex shrink-0 items-center border-b border-white/[0.07]';

export const FIGMA_VOICE_SIDE_TAB_BTN =
  'flex-1 border-0 bg-transparent py-[11px] text-[0.8125rem] font-medium transition-colors duration-150';

export const FIGMA_VOICE_SIDE_TAB_ACTIVE =
  'border-b-2 border-primary text-primary';

export const FIGMA_VOICE_SIDE_TAB_IDLE = 'border-b-2 border-transparent text-muted-foreground';

export const FIGMA_VOICE_SIDE_CLOSE_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center border-0 bg-transparent text-muted-foreground transition hover:text-foreground';

export const FIGMA_VOICE_PEOPLE_ROW =
  'flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition hover:bg-white/5';

export const FIGMA_VOICE_PEOPLE_AVATAR =
  'flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold';

export const FIGMA_VOICE_CHAT_INPUT =
  'h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.07] px-2.5 text-[0.8125rem] text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/40';

export const FIGMA_VOICE_CHAT_SEND_BTN =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-0 bg-primary text-primary-foreground';

export const FIGMA_VOICE_MODAL_BACKDROP =
  'fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm';

export const FIGMA_VOICE_MODAL_SHELL =
  'flex max-h-[min(92vh,640px)] w-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-surface-raised text-foreground shadow-2xl vh-anim-scale-in';

export const FIGMA_VOICE_MODAL_HEADER =
  'flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3';

export const FIGMA_VOICE_TILE_ROLE_BADGE =
  'rounded px-1.5 py-0.5 text-[0.5625rem] font-bold uppercase tracking-wide text-white';

export const FIGMA_VOICE_TILE_HOVER_OVERLAY =
  'absolute inset-0 flex items-center justify-center gap-1.5 rounded-[10px] bg-black/30';

export const FIGMA_VOICE_TILE_HOVER_BTN =
  'rounded-md border border-white/20 bg-white/15 px-2.5 py-1 text-[0.7rem] text-white backdrop-blur-sm transition hover:bg-white/25';

export const FIGMA_VOICE_TILE_HOVER_BTN_DANGER =
  'rounded-md border border-destructive/40 bg-destructive/30 px-2.5 py-1 text-[0.7rem] text-white backdrop-blur-sm transition hover:bg-destructive/40';

export const FIGMA_VOICE_WAVEFORM_ROW = 'flex h-4 items-end gap-[3px]';

export const FIGMA_VOICE_WAVEFORM_BAR =
  'w-[3px] origin-bottom rounded-sm';

export const figmaVoiceSideTab = (active) =>
  [FIGMA_VOICE_SIDE_TAB_BTN, active ? FIGMA_VOICE_SIDE_TAB_ACTIVE : FIGMA_VOICE_SIDE_TAB_IDLE].join(' ');

export const figmaVoiceRoomRoot = (suiteLayout) =>
  suiteLayout ? FIGMA_VOICE_ROOM_ROOT : 'relative flex min-h-0 flex-1 flex-col bg-black';

export const figmaVoiceTopBar = (suiteLayout, { fullWidth = false } = {}) => {
  if (!suiteLayout) {
    return 'absolute left-4 top-4 z-20 flex max-w-[calc(100%-2rem)] flex-wrap items-center gap-2 rounded-full border border-white/10 bg-zinc-900/95 px-4 py-2 text-sm text-white shadow-xl backdrop-blur-md md:left-8 md:top-6';
  }
  return fullWidth ? FIGMA_VOICE_TOP_BAR_FULL : FIGMA_VOICE_TOP_BAR;
};

export const figmaVoiceGridArea = (suiteLayout) =>
  suiteLayout
    ? FIGMA_VOICE_GRID_AREA
    : 'relative flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-4 pb-36 pt-24 md:px-8';

export const figmaVoiceGridInner = (suiteLayout, tileCount = 1) =>
  suiteLayout
    ? `${FIGMA_VOICE_GRID_INNER}${tileCount === 1 ? ' items-center' : ''}`
    : `w-full max-w-5xl${tileCount === 1 ? ' mx-auto flex justify-center' : ''}`;

export const figmaVoiceGridClass = (layoutMode, tileCount = 1) => {
  if (layoutMode === 'sidebar' && tileCount > 1) {
    return FIGMA_VOICE_GRID_SIDEBAR;
  }
  if (tileCount === 1) {
    return FIGMA_VOICE_GRID_SOLO_WRAP;
  }
  if (tileCount === 2) {
    return FIGMA_VOICE_GRID_DUO;
  }
  return FIGMA_VOICE_GRID;
};

export const figmaVoiceSoloTileClass = (tileCount) =>
  tileCount === 1 ? FIGMA_VOICE_GRID_SOLO_TILE : '';

export const figmaVoiceCtrlOuter = (suiteLayout) =>
  suiteLayout
    ? FIGMA_VOICE_CTRL_OUTER
    : 'pointer-events-none absolute bottom-4 left-0 right-0 z-30 flex justify-center px-2 md:bottom-8';

export const figmaVoiceCtrlPill = (suiteLayout) =>
  suiteLayout
    ? FIGMA_VOICE_CTRL_PILL
    : 'pointer-events-auto flex max-w-[min(100%,56rem)] flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/10 bg-black/85 px-3 py-3 shadow-2xl backdrop-blur-xl md:gap-6 md:px-6';

export const figmaVoiceSidePanel = (suiteLayout, open, { inline = false } = {}) => {
  if (suiteLayout && inline && open) {
    return FIGMA_VOICE_SIDE_PANEL_INLINE;
  }
  const base = suiteLayout
    ? FIGMA_VOICE_SIDE_PANEL
    : 'fixed inset-y-0 right-0 z-40 flex h-full w-[min(100vw,22rem)] flex-col border-l border-white/10 bg-[#1a1a1a] shadow-2xl transition-transform duration-300 ease-out';
  return `${base} ${open ? 'translate-x-0' : 'pointer-events-none translate-x-full'}`;
};

/** Lobby — trước khi vào phòng (VoicePage Figma pre-join) */
export const FIGMA_VOICE_LOBBY_ROOT =
  'flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background';

export const FIGMA_VOICE_LOBBY_HEADER =
  'sticky top-0 z-10 flex h-auto min-h-14 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-4 py-2 shadow-xs sm:h-14 sm:flex-nowrap sm:px-6 sm:py-0';

export const FIGMA_VOICE_LOBBY_HEADER_ICON =
  'flex h-7 w-7 items-center justify-center rounded-[7px] bg-warning/10';

export const FIGMA_VOICE_LOBBY_HEADER_TITLE =
  'm-0 min-w-0 flex-1 truncate text-sm font-semibold text-foreground';

export const FIGMA_VOICE_LOBBY_LIVE_BADGE =
  'ml-auto flex max-w-[min(100%,14rem)] shrink-0 items-center gap-1.5 rounded-full border border-success/20 bg-success/10 px-2 py-1 sm:max-w-none sm:px-2.5';

export const FIGMA_VOICE_LOBBY_LIVE_DOT =
  'h-1.5 w-1.5 rounded-full bg-success shadow-[0_0_5px] shadow-success';

export const FIGMA_VOICE_LOBBY_LIVE_TEXT =
  'truncate text-[0.6875rem] font-semibold text-success sm:text-xs';

export const FIGMA_VOICE_LOBBY_SCROLL_MAIN =
  'min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain';

export const FIGMA_VOICE_LOBBY_SCROLL = FIGMA_VOICE_LOBBY_SCROLL_MAIN;

export const FIGMA_VOICE_LOBBY_PAGE_INNER = 'mx-auto w-full max-w-6xl p-4 pb-8 sm:p-6';

export const FIGMA_VOICE_LOBBY_PREJOIN_GRID =
  'grid grid-cols-1 items-start gap-4 xl:grid-cols-2 xl:gap-6';

export const FIGMA_VOICE_LOBBY_BODY = 'mx-auto w-full max-w-6xl p-4 sm:p-6';

export const FIGMA_VOICE_LOBBY_HERO_GRID = 'grid grid-cols-1 gap-3.5 md:grid-cols-2';

export const FIGMA_VOICE_LOBBY_CREATE_CARD =
  'relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.09] to-primary/[0.04] p-5 transition-[box-shadow,border-color] duration-150 sm:p-6 lg:p-7 md:hover:-translate-y-0.5 md:hover:border-primary/30 md:hover:shadow-md';

export const FIGMA_VOICE_LOBBY_CREATE_ICON =
  'mb-[18px] flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary-hover shadow-[0_4px_14px_rgba(37,99,235,0.4)]';

export const FIGMA_VOICE_LOBBY_JOIN_CARD =
  'rounded-2xl border border-border bg-surface p-5 shadow-sm transition-[box-shadow,border-color] duration-150 sm:p-6 lg:p-7 md:hover:-translate-y-0.5 md:hover:border-primary/20 md:hover:shadow-md';

export const FIGMA_VOICE_LOBBY_JOIN_ICON =
  'mb-[18px] flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10';

export const FIGMA_VOICE_LOBBY_FEATURE_CHIP =
  'rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[0.6875rem] font-semibold text-primary-hover';

export const FIGMA_VOICE_LOBBY_PRIMARY_BTN =
  'inline-flex h-10 items-center gap-1.5 rounded-[9px] border-none bg-gradient-to-br from-primary to-primary-hover px-[22px] text-sm font-semibold text-primary-foreground shadow-[0_4px_14px_rgba(37,99,235,0.4)] transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-[0_5px_20px_rgba(37,99,235,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_VOICE_LOBBY_JOIN_INPUT =
  'h-10 flex-1 rounded-[9px] border border-border bg-input-background px-3 font-mono text-[0.9375rem] tracking-[0.12em] text-foreground outline-none transition-[border-color,box-shadow,background-color] duration-150 focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.14)]';

export const FIGMA_VOICE_LOBBY_JOIN_BTN =
  'h-10 shrink-0 rounded-[9px] border-none px-[18px] text-sm font-semibold text-primary-foreground transition-[box-shadow,opacity,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_VOICE_LOBBY_JOIN_BTN_ACTIVE =
  'cursor-pointer bg-gradient-to-br from-cyan-400 to-cyan-600 shadow-[0_3px_12px_rgba(34,211,238,0.35)] hover:-translate-y-0.5 hover:shadow-[0_5px_18px_rgba(34,211,238,0.45)]';

export const FIGMA_VOICE_LOBBY_JOIN_BTN_IDLE =
  'cursor-default bg-muted text-muted-foreground';

export const FIGMA_VOICE_LOBBY_SECTION_HEAD = 'mb-3.5 flex items-center justify-between';

export const FIGMA_VOICE_LOBBY_SECTION_TITLE = 'flex items-center gap-2 text-sm font-semibold text-foreground';

export const FIGMA_VOICE_LOBBY_ROOM_LIST = 'flex flex-col gap-2';

export const FIGMA_VOICE_LOBBY_ROOM_CARD =
  'flex cursor-pointer items-center gap-3.5 rounded-xl border border-border bg-surface p-4 shadow-xs transition-[box-shadow,border-color,transform] duration-150 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md';

export const FIGMA_VOICE_LOBBY_ROOM_ICON =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border';

export const FIGMA_VOICE_LOBBY_ROOM_LIVE =
  'flex items-center gap-1 rounded-full border border-success/20 bg-success/10 px-1.5 py-0.5';

export const FIGMA_VOICE_LOBBY_ROOM_JOIN_BTN =
  'h-9 shrink-0 rounded-lg border-none px-[18px] text-[0.8125rem] font-semibold text-primary-foreground transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35';

export const FIGMA_VOICE_AI_TRANSCRIBE_BTN =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-none px-3.5 py-2 text-xs font-bold transition-all duration-150';

export const FIGMA_VOICE_AI_TRANSCRIBE_IDLE =
  'bg-white/[0.08] text-muted-foreground hover:bg-primary/15 hover:text-primary';

export const FIGMA_VOICE_AI_TRANSCRIBE_ACTIVE =
  'bg-gradient-to-br from-primary to-cyan-400 text-primary-foreground shadow-[0_4px_16px_rgba(37,99,235,0.45)]';

export const figmaVoiceLobbyJoinBtn = (enabled) =>
  [
    FIGMA_VOICE_LOBBY_JOIN_BTN,
    enabled ? FIGMA_VOICE_LOBBY_JOIN_BTN_ACTIVE : FIGMA_VOICE_LOBBY_JOIN_BTN_IDLE,
  ].join(' ');

export const figmaVoiceAiTranscribeBtn = (active) =>
  [
    FIGMA_VOICE_AI_TRANSCRIBE_BTN,
    active ? FIGMA_VOICE_AI_TRANSCRIBE_ACTIVE : FIGMA_VOICE_AI_TRANSCRIBE_IDLE,
  ].join(' ');

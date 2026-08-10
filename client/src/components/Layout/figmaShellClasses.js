/** Figma Enterprise shell tokens — sidebar + top header */

export const SUITE_COLORS = {
  communicate: '#3B82F6',
  collaborate: '#10B981',
  me: '#F59E0B',
  admin: '#DC2626',
};

export const SUITE_SEGMENT = {
  communicate: 'communicate',
  collaborate: 'collaborate',
  me: 'me',
  admin: 'admin',
};

export const FIGMA_SHELL_ROOT = 'flex h-screen flex-col overflow-hidden bg-transparent';

export const FIGMA_SHELL_BODY = 'flex min-h-0 flex-1 overflow-hidden';

export const FIGMA_SHELL_MAIN = 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden';

export const FIGMA_TOP_HEADER =
  'relative z-[200] flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-5 shadow-xs';

export const FIGMA_SIDEBAR =
  'relative z-30 flex h-full shrink-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-[220ms] ease-enterprise';

export const FIGMA_SIDEBAR_EXPANDED = 'w-[210px]';
export const FIGMA_SIDEBAR_COLLAPSED = 'w-14';

/** Nút mở rộng khi sidebar thu gọn (accent theo suite — style inline) */
export const FIGMA_SIDEBAR_EXPAND_BTN =
  'flex h-8 w-8 items-center justify-center rounded-md border transition hover:brightness-110';

export const FIGMA_SIDEBAR_SUITE_STRIP =
  'flex min-h-[44px] shrink-0 items-center gap-1.5 border-b border-sidebar-border';

export const FIGMA_SIDEBAR_SECTION_LABEL =
  'px-3 pb-0.5 pt-2.5 text-[0.5875rem] font-bold uppercase tracking-[0.1em] text-white/20';

export const FIGMA_SIDEBAR_NAV = 'flex flex-1 flex-col gap-px overflow-y-auto px-1.5 py-0.5';

export const FIGMA_SIDEBAR_FOOTER =
  'shrink-0 border-t border-sidebar-border p-1.5';

export const figmaNavItemClass = (isActive, suiteColor, collapsed) => {
  const base =
    'group relative flex cursor-pointer select-none items-center rounded-[7px] transition-[background,color] duration-[120ms]';
  const pad = collapsed ? 'justify-center px-0 py-2' : 'gap-2.5 px-2.5 py-[7px]';
  const state = isActive
    ? 'text-white'
    : 'text-white/50 hover:bg-white/[0.07]';
  return `${base} ${pad} ${state}`;
};

export const figmaNavItemBg = (isActive, suiteColor) =>
  isActive ? { background: `${suiteColor}22` } : undefined;

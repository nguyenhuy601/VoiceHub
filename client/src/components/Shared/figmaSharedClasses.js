/** Shared modal / toast tokens — đồng bộ Figma shadcn surface + Enterprise Motion SoT */

/** Above shell nav rail (z-1200) / ProjectsSidebar mobile (z-250); below ProfileModal (z-99990). */
export const FIGMA_MODAL_OVERLAY =
  'fixed inset-0 z-[10050] flex items-center justify-center p-2 sm:p-4 vh-presence-overlay vh-motion-respect';

export const FIGMA_MODAL_BACKDROP =
  'absolute inset-0 bg-black/60 backdrop-blur-sm vh-presence-backdrop';

export const FIGMA_MODAL_PANEL =
  'relative flex max-h-[min(90dvh,90vh)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl vh-presence-panel';

export const FIGMA_MODAL_HEADER =
  'flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-6 sm:py-4';

export const FIGMA_MODAL_TITLE =
  'min-w-0 flex-1 truncate text-base font-bold text-foreground sm:text-lg md:text-xl';

export const FIGMA_MODAL_CLOSE_BTN =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground vh-motion-btn hover:bg-muted hover:text-foreground motion-reduce:transform-none';

export const FIGMA_MODAL_BODY =
  'scrollbar-overlay max-h-[calc(min(90dvh,90vh)-8rem)] overflow-y-auto p-4 text-foreground sm:p-6';

export const FIGMA_MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-[min(95vw,72rem)]',
};

export const FIGMA_TOAST_ROOT =
  'fixed bottom-6 right-6 z-[300] flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md vh-motion-respect motion-safe:animate-fade-in motion-reduce:animate-none';

export const FIGMA_TOAST_SUCCESS = 'border-emerald-500/30 bg-card text-foreground';

export const FIGMA_TOAST_ERROR = 'border-destructive/40 bg-card text-destructive';

export const FIGMA_TOAST_INFO = 'border-primary/30 bg-card text-foreground';

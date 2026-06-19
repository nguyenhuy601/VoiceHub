/** Shared modal / toast tokens — đồng bộ Figma shadcn surface */

export const FIGMA_MODAL_OVERLAY = 'fixed inset-0 z-[200] flex animate-fadeIn items-center justify-center p-4';

export const FIGMA_MODAL_BACKDROP = 'absolute inset-0 bg-black/60 backdrop-blur-sm';

export const FIGMA_MODAL_PANEL =
  'relative flex max-h-[90vh] w-full animate-scaleIn flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl';

export const FIGMA_MODAL_HEADER =
  'flex shrink-0 items-center justify-between border-b border-border px-6 py-4';

export const FIGMA_MODAL_TITLE = 'text-lg font-bold text-foreground sm:text-xl';

export const FIGMA_MODAL_CLOSE_BTN =
  'flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground';

export const FIGMA_MODAL_BODY = 'scrollbar-overlay max-h-[calc(90vh-8rem)] overflow-y-auto p-6';

export const FIGMA_MODAL_SIZES = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-[95vw]',
};

export const FIGMA_TOAST_ROOT =
  'fixed bottom-6 right-6 z-[300] flex max-w-sm items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md';

export const FIGMA_TOAST_SUCCESS = 'border-emerald-500/30 bg-card text-foreground';

export const FIGMA_TOAST_ERROR = 'border-destructive/40 bg-card text-destructive';

export const FIGMA_TOAST_INFO = 'border-primary/30 bg-card text-foreground';

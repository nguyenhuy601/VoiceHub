/** Enterprise Project Intake Workspace — shared layout tokens. */
export const intakeUi = {
  shell: 'fixed inset-0 z-[80] flex flex-col overflow-hidden bg-background text-foreground',
  pageGrid:
    'flex min-h-0 flex-1 flex-col overflow-hidden lg:grid lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]',
  mainScroll: 'min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8',
  mainInner: 'mx-auto w-full max-w-[760px] space-y-10 pb-2',
  summaryColumn:
    'min-h-0 overflow-hidden border-t border-border bg-muted/30 lg:border-l lg:border-t-0 lg:bg-muted/20 xl:bg-muted/25',
  summarySticky: 'h-full max-h-full overflow-y-auto p-4 lg:p-6 xl:p-8',
  summaryMobileWrap: 'shrink-0 border-t border-border bg-muted/20 px-4 py-4 lg:hidden',
  header: 'shrink-0 border-b border-border bg-background px-4 py-4 sm:px-6 lg:px-8',
  backLink:
    'inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground',
  pageTitle: 'text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]',
  pageSubtitle: 'mt-1.5 max-w-2xl text-sm text-muted-foreground',
  section: 'scroll-mt-24 space-y-4 animate-[intakeSectionIn_180ms_ease-out]',
  sectionHead: 'flex flex-wrap items-baseline justify-between gap-2',
  sectionIndex: 'text-xs font-semibold uppercase tracking-wider text-primary',
  sectionTitle: 'text-base font-semibold text-foreground',
  sectionStatus: 'text-xs text-muted-foreground',
  fieldLabel: 'mb-1.5 block text-xs font-medium text-muted-foreground',
  input:
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30',
  inputError: 'border-destructive focus:border-destructive focus:ring-destructive/30',
  textarea:
    'min-h-[88px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30',
  select:
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30',
  fieldError: 'mt-1.5 text-xs text-destructive',
  uploadZone:
    'flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/10 px-4 py-10 text-center text-sm text-muted-foreground transition hover:border-primary/40 hover:bg-muted/20 disabled:opacity-60',
  uploadZoneActive: 'border-primary/50 bg-primary/5',
  roleCard:
    'rounded-xl border border-border bg-card p-4 transition hover:border-border/80',
  roleCardOpen: 'ring-1 ring-primary/30 border-primary/40',
  modeGrid: 'grid gap-3 sm:grid-cols-2',
  modeCard:
    'rounded-xl border border-border bg-card p-4 text-left transition duration-150 hover:border-primary/35',
  modeCardSelected: 'border-primary bg-primary/10 ring-1 ring-primary/35',
  summaryPanel: 'space-y-5 rounded-xl border border-border bg-card/80 p-4 shadow-sm',
  summaryLabel: 'text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
  summaryRow: 'mt-1 text-sm text-foreground',
  summaryChecklist: 'space-y-1.5 text-sm',
  actionBar:
    'relative z-10 shrink-0 border-t border-border bg-background px-4 py-3 sm:px-6 lg:px-8',
  primaryBtn:
    'rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50',
  secondaryBtn:
    'rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50',
  highlightFlash: 'animate-[intakeHighlight_150ms_ease-out]',
  submitOverlay:
    'absolute inset-0 z-[90] flex items-center justify-center bg-background/80 backdrop-blur-sm',
  submitOverlayCard:
    'mx-4 w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-lg',
};

export const intakeKeyframes = `
  @keyframes intakeSectionIn {
    from { opacity: 0; transform: translateY(4px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes intakeHighlight {
    from { background-color: hsl(var(--primary) / 0.12); }
    to { background-color: transparent; }
  }
`;

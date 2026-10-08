/**
 * Phase 1 table palette — design-system tokens (W7-8 Step 3f).
 */
export const PHASE1_TABLE_COLORS = Object.freeze({
  toolbar: 'bg-primary/5',
  toolbarDark: '',
  thead: 'bg-primary/15',
  theadDark: '',
  theadText: 'text-foreground',
  theadBorder: 'border-border',
  primaryBtn:
    'bg-primary text-primary-foreground transition-colors hover:bg-primary/90 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  rowEven: 'bg-surface',
  rowOdd: 'bg-muted/40',
  rowHover: 'hover:bg-primary/5',
  rowBorder: 'border-border',
  priorityHigh: 'bg-warning text-warning-foreground border-transparent',
  priorityCritical: 'bg-destructive text-destructive-foreground border-transparent',
  priorityMedium: 'bg-amber-500/90 text-primary-foreground border-transparent',
  priorityLow: 'bg-muted text-muted-foreground border-transparent',
  keyChip:
    'rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-foreground',
});

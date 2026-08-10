/**
 * Shared Tailwind classes for Project Setup Wizard — follow ThemeContext
 * (bg-background / html.dark) instead of hardcoded slate-950.
 */
export const wizardUi = {
  shell: 'fixed inset-0 z-[80] flex flex-col bg-background/75 text-foreground backdrop-blur-sm dark:bg-background/65',
  formPane: 'flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r lg:border-border',
  backLink:
    'inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground',
  footer:
    'flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-background/90 px-5 py-4 sm:px-8',
  stepMeta: 'text-xs text-muted-foreground',
  primaryBtn:
    'rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50',
  secondaryBtn:
    'rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted/40 disabled:opacity-50',
  previewPane:
    'relative hidden min-h-0 flex-col bg-muted/40 bg-gradient-to-br from-muted/60 via-background to-primary/5 p-6 dark:from-slate-900 dark:via-slate-950 dark:to-indigo-950/40 lg:flex lg:p-10',
  previewLabel: 'text-xs font-medium uppercase tracking-wider text-muted-foreground',
  previewHint: 'mt-1 text-sm text-muted-foreground',
  title: 'text-2xl font-semibold tracking-tight text-foreground',
  subtitle: 'mt-2 text-sm text-muted-foreground',
  fieldLabel: 'mb-1.5 block text-xs font-medium text-muted-foreground',
  input:
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
  textarea:
    'min-h-[96px] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary',
  select:
    'w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary',
  rowCard:
    'flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition hover:bg-muted/40',
  checkRow:
    'flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5',
  statusCard:
    'rounded-xl border border-border bg-card p-4 text-left transition hover:bg-muted/40',
  statusCardActive: 'rounded-xl border border-primary bg-primary/10 p-4 text-left ring-1 ring-primary/40',
  sampleRow:
    'flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3',
  previewBoard:
    'relative flex h-full min-h-[420px] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl shadow-black/10 dark:shadow-black/40',
  previewCol: 'flex min-w-[140px] flex-1 flex-col rounded-lg bg-muted/50 p-2',
  previewCard: 'rounded-md border border-border bg-background px-2 py-2 shadow-sm',
  emptyPage:
    'flex min-h-screen flex-col items-center justify-center gap-4 bg-background/75 px-6 text-foreground backdrop-blur-sm dark:bg-background/65',
  link: 'text-sm text-primary hover:underline',
};

/**
 * Phase 3 Hub UI color SSOT — TC result / CR status·priority / issue-type card tint.
 * Pure class maps; no API. Unknown keys → muted fallback.
 */

const BADGE_BASE =
  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap';

/** Test case lastResult. */
export const TC_RESULT_TONE = Object.freeze({
  pass: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  fail: 'border-destructive/35 bg-destructive/10 text-destructive',
  none: 'border-border/60 bg-muted/50 text-muted-foreground',
});

/** Card / row shell tint by TC result. */
export const TC_RESULT_ROW_TONE = Object.freeze({
  pass: 'border-emerald-500/35 bg-emerald-500/5',
  fail: 'border-destructive/35 bg-destructive/5',
  none: 'border-border bg-background',
});

/** Filter chip when active — keep primary for selected; inactive uses result tint. */
export const TC_FILTER_CHIP_TONE = Object.freeze({
  pass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  fail: 'border-destructive/40 bg-destructive/10 text-destructive',
  none: 'border-border bg-muted/40 text-muted-foreground',
  all: 'border-border bg-background text-muted-foreground',
});

/** Change request approval status. */
export const CR_STATUS_TONE = Object.freeze({
  draft: 'border-border/60 bg-muted/50 text-muted-foreground',
  pending: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  reviewing: 'border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  approved: 'border-primary/35 bg-primary/10 text-primary',
  applied: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  rejected: 'border-destructive/35 bg-destructive/10 text-destructive',
  deferred: 'border-slate-500/35 bg-slate-500/10 text-slate-800 dark:text-slate-200',
});

export const CR_STATUS_ROW_TONE = Object.freeze({
  draft: '',
  pending: 'bg-amber-500/[0.04]',
  reviewing: 'bg-sky-500/[0.04]',
  approved: 'bg-primary/[0.04]',
  applied: 'bg-emerald-500/[0.06]',
  rejected: 'bg-destructive/[0.05]',
  deferred: 'bg-muted/30',
});

/** Change request priority. */
export const CR_PRIORITY_TONE = Object.freeze({
  low: 'border-border/60 bg-muted/50 text-muted-foreground',
  medium: 'border-sky-500/35 bg-sky-500/10 text-sky-900 dark:text-sky-200',
  high: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
});

/** Kanban card shell tint by issue type (additive on base cardShell). */
export const ISSUE_TYPE_CARD_TONE = Object.freeze({
  bug: 'border-rose-500/40 bg-rose-500/[0.07]',
  task: 'border-slate-400/40 bg-slate-500/[0.04]',
  story: 'border-sky-500/40 bg-sky-500/[0.07]',
  feature: 'border-sky-500/40 bg-sky-500/[0.07]',
  epic: 'border-violet-500/40 bg-violet-500/[0.07]',
  subtask: 'border-border/50 bg-muted/20',
});

/** Overview Release Ready metric chips. */
export const RELEASE_METRIC_TONE = Object.freeze({
  tc: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  bugs_ok: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  bugs_open: 'border-destructive/35 bg-destructive/10 text-destructive',
  cards_ok: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  cards_pending: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  cr_ok: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  cr_pending: 'border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-200',
});

const READY_TO_DONE_ACCENT = 'ring-1 ring-warning/50 border-l-4 border-l-warning';

function norm(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function tcResultKey(value) {
  const r = norm(value);
  if (r === 'pass' || r === 'fail') return r;
  return 'none';
}

export function tcResultBadgeClass(value) {
  return `${BADGE_BASE} ${TC_RESULT_TONE[tcResultKey(value)] || TC_RESULT_TONE.none}`;
}

export function tcResultRowClass(value) {
  return TC_RESULT_ROW_TONE[tcResultKey(value)] || TC_RESULT_ROW_TONE.none;
}

export function tcFilterChipClass(filterId, { active = false } = {}) {
  if (active) {
    return 'border-primary bg-primary text-primary-foreground';
  }
  const key = norm(filterId) || 'all';
  return TC_FILTER_CHIP_TONE[key] || TC_FILTER_CHIP_TONE.all;
}

export function crStatusBadgeClass(status) {
  const key = norm(status);
  return `${BADGE_BASE} ${CR_STATUS_TONE[key] || CR_STATUS_TONE.draft}`;
}

export function crStatusRowClass(status) {
  const key = norm(status);
  return CR_STATUS_ROW_TONE[key] || '';
}

export function crPriorityBadgeClass(priority) {
  const key = norm(priority) || 'medium';
  return `${BADGE_BASE} ${CR_PRIORITY_TONE[key] || CR_PRIORITY_TONE.medium}`;
}

export function issueTypeCardClass(type) {
  const key = norm(type) || 'task';
  if (key === 'feature') return ISSUE_TYPE_CARD_TONE.feature;
  return ISSUE_TYPE_CARD_TONE[key] || ISSUE_TYPE_CARD_TONE.task;
}

export function readyToDoneCardAccentClass(ready) {
  return ready ? READY_TO_DONE_ACCENT : '';
}

export function releaseMetricClass(kind, { count = 0 } = {}) {
  const k = norm(kind);
  if (k === 'tc') return RELEASE_METRIC_TONE.tc;
  if (k === 'bugs') return count > 0 ? RELEASE_METRIC_TONE.bugs_open : RELEASE_METRIC_TONE.bugs_ok;
  if (k === 'cards') return count > 0 ? RELEASE_METRIC_TONE.cards_pending : RELEASE_METRIC_TONE.cards_ok;
  if (k === 'cr') return count > 0 ? RELEASE_METRIC_TONE.cr_pending : RELEASE_METRIC_TONE.cr_ok;
  return 'border-border bg-background text-foreground';
}

/** Soft List/CR cell — padding only (row hairline on parent). */
export const HUB_GRID_CELL = 'min-w-0 px-2 py-1.5';

export const HUB_GRID_CELL_COMPACT = 'min-w-0 px-1.5 py-1';

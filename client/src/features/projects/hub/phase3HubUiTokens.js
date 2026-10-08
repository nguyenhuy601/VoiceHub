/**
 * Phase 3 Hub UI color SSOT — TC result / CR status·priority / issue-type card tint.
 * Pure class maps; no API. Unknown keys → muted fallback.
 */

const BADGE_BASE =
  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap';

/** Test case lastResult. */
export const TC_RESULT_TONE = Object.freeze({
  pass: 'border-success/35 bg-success/10 text-success',
  fail: 'border-destructive/35 bg-destructive/10 text-destructive',
  none: 'border-border bg-muted/50 text-muted-foreground',
});

/** Card / row shell tint by TC result. */
export const TC_RESULT_ROW_TONE = Object.freeze({
  pass: 'border-success/35 bg-success/5',
  fail: 'border-destructive/35 bg-destructive/5',
  none: 'border-border bg-background',
});

/** Filter chip when active — keep primary for selected; inactive uses result tint. */
export const TC_FILTER_CHIP_TONE = Object.freeze({
  pass: 'border-success/40 bg-success/10 text-success',
  fail: 'border-destructive/40 bg-destructive/10 text-destructive',
  none: 'border-border bg-muted/40 text-muted-foreground',
  all: 'border-border bg-background text-muted-foreground',
});

/** Change request approval status. */
export const CR_STATUS_TONE = Object.freeze({
  draft: 'border-border bg-muted/50 text-muted-foreground',
  pending: 'border-warning/35 bg-warning/10 text-warning',
  reviewing: 'border-info/35 bg-info/10 text-info',
  approved: 'border-primary/35 bg-primary/10 text-primary',
  applied: 'border-success/35 bg-success/10 text-success',
  rejected: 'border-destructive/35 bg-destructive/10 text-destructive',
  deferred: 'border-border bg-muted/40 text-muted-foreground',
});

export const CR_STATUS_ROW_TONE = Object.freeze({
  draft: '',
  pending: 'bg-warning/5',
  reviewing: 'bg-info/5',
  approved: 'bg-primary/5',
  applied: 'bg-success/5',
  rejected: 'bg-destructive/5',
  deferred: 'bg-muted/30',
});

/** Change request priority. */
export const CR_PRIORITY_TONE = Object.freeze({
  low: 'border-border bg-muted/50 text-muted-foreground',
  medium: 'border-info/35 bg-info/10 text-info',
  high: 'border-warning/40 bg-warning/10 text-warning',
  critical: 'border-destructive/40 bg-destructive/10 text-destructive',
});

/** Kanban card shell tint by issue type (additive on base cardShell). */
export const ISSUE_TYPE_CARD_TONE = Object.freeze({
  bug: 'border-destructive/40 bg-destructive/5',
  task: 'border-border bg-muted/20',
  story: 'border-info/40 bg-info/5',
  feature: 'border-info/40 bg-info/5',
  epic: 'border-primary/40 bg-primary/5',
  subtask: 'border-border bg-muted/20',
});

/** Overview Release Ready metric chips. */
export const RELEASE_METRIC_TONE = Object.freeze({
  tc: 'border-success/35 bg-success/10 text-success',
  bugs_ok: 'border-success/35 bg-success/10 text-success',
  bugs_open: 'border-destructive/35 bg-destructive/10 text-destructive',
  cards_ok: 'border-success/35 bg-success/10 text-success',
  cards_pending: 'border-warning/35 bg-warning/10 text-warning',
  cr_ok: 'border-success/35 bg-success/10 text-success',
  cr_pending: 'border-warning/35 bg-warning/10 text-warning',
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

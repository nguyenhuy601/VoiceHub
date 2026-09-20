/**
 * Phase 1 UI color SSOT — status / kind / queue / priority badges & cards.
 * Pure class maps; no API. Unknown keys → muted/draft fallback.
 */

const BADGE_BASE =
  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap';

const CHIP_BASE =
  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap';

/** Status pill backgrounds (analysis + planning + import-set aliases). */
export const STATUS_TONE = Object.freeze({
  draft: 'bg-muted text-muted-foreground border border-border/50',
  ba_review: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25',
  tech_review: 'bg-sky-500/15 text-sky-800 dark:text-sky-200 border border-sky-500/25',
  pm_review: 'bg-indigo-500/15 text-indigo-800 dark:text-indigo-200 border border-indigo-500/25',
  po_review: 'bg-violet-500/15 text-violet-800 dark:text-violet-200 border border-violet-500/25',
  approved: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/25',
  rejected: 'bg-destructive/15 text-destructive border border-destructive/30',
  // Import-set / gate aliases
  pending_review: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25',
  active: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border border-emerald-500/25',
  trashed: 'bg-muted text-muted-foreground border border-border/50 line-through opacity-80',
});

/** Kind chips — analysis + planning. */
export const KIND_TONE = Object.freeze({
  SCOPE: 'border-slate-500/40 bg-slate-500/10 text-slate-800 dark:text-slate-200',
  BG: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-800 dark:text-indigo-200',
  BR: 'border-teal-500/40 bg-teal-500/10 text-teal-800 dark:text-teal-200',
  BPM: 'border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-200',
  FR: 'border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200',
  UC: 'border-purple-500/40 bg-purple-500/10 text-purple-800 dark:text-purple-200',
  NFR: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-800 dark:text-cyan-200',
  WBS: 'border-lime-600/40 bg-lime-500/10 text-lime-900 dark:text-lime-200',
  ARCHITECTURE: 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200',
  RESOURCE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
  DEPENDENCY: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  SCHEDULE: 'border-violet-500/40 bg-violet-500/10 text-violet-800 dark:text-violet-200',
  MILESTONE: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-200',
  RELEASE: 'border-blue-600/40 bg-blue-500/10 text-blue-900 dark:text-blue-200',
  RISK: 'border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200',
});

const KIND_FALLBACK = 'border-border/60 bg-muted/40 text-muted-foreground';

/** Queue / stage card shell (border + tint). */
export const QUEUE_TONE = Object.freeze({
  draft: 'border-border bg-muted/20',
  ba_review: 'border-amber-500/35 bg-amber-500/5',
  tech_review: 'border-sky-500/35 bg-sky-500/5',
  pm_review: 'border-indigo-500/35 bg-indigo-500/5',
  po_review: 'border-violet-500/35 bg-violet-500/5',
  approved: 'border-emerald-500/35 bg-emerald-500/5',
  rejected: 'border-destructive/35 bg-destructive/5',
  pending_review: 'border-amber-500/35 bg-amber-500/5',
  set_queue: 'border-orange-500/35 bg-orange-500/5',
});

const QUEUE_FALLBACK = 'border-border bg-surface';

/** Optional priority chips. */
export const PRIORITY_TONE = Object.freeze({
  high: 'bg-rose-500/15 text-rose-800 dark:text-rose-200 border border-rose-500/25',
  medium: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25',
  med: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/25',
  low: 'bg-muted text-muted-foreground border border-border/50',
  critical: 'bg-destructive/15 text-destructive border border-destructive/30',
});

/** Gate step card tint: done | pending | locked */
export const GATE_STEP_TONE = Object.freeze({
  done: 'rounded-lg border border-emerald-500/35 bg-emerald-500/5 px-2 py-1',
  pending: 'rounded-lg border border-amber-500/35 bg-amber-500/5 px-2 py-1',
  locked: 'rounded-lg border border-border/60 bg-muted/20 px-2 py-1 opacity-80',
});

function normStatus(status) {
  return String(status || '')
    .trim()
    .toLowerCase();
}

function normKind(kind) {
  return String(kind || '')
    .trim()
    .toUpperCase();
}

/**
 * @param {string} [status]
 * @returns {string} full badge className
 */
export function statusBadgeClass(status) {
  const key = normStatus(status);
  const tone = STATUS_TONE[key] || STATUS_TONE.draft;
  return `${BADGE_BASE} ${tone}`;
}

/**
 * @param {string} [kind]
 * @returns {string} full kind chip className
 */
export function kindChipClass(kind) {
  const key = normKind(kind);
  const tone = KIND_TONE[key] || KIND_FALLBACK;
  return `${CHIP_BASE} ${tone}`;
}

/**
 * Card shell for approval queues / readiness blocks.
 * @param {string} [stage]
 */
export function queueCardClass(stage) {
  const key = normStatus(stage);
  return QUEUE_TONE[key] || QUEUE_FALLBACK;
}

/**
 * @param {string} [priority]
 */
export function priorityBadgeClass(priority) {
  const key = normStatus(priority);
  const tone = PRIORITY_TONE[key] || PRIORITY_TONE.low;
  return `${BADGE_BASE} ${tone}`;
}

/**
 * @param {'done'|'pending'|'locked'} state
 */
export function gateStepClass(state) {
  const key = String(state || 'locked').toLowerCase();
  return GATE_STEP_TONE[key] || GATE_STEP_TONE.locked;
}

/**
 * Left-accent card for Trace FR/UC items.
 * @param {string} [kind]
 */
export function kindAccentCardClass(kind) {
  const key = normKind(kind);
  const accent =
    {
      FR: 'border-l-4 border-l-blue-500 border border-border/60 bg-blue-500/5',
      UC: 'border-l-4 border-l-purple-500 border border-border/60 bg-purple-500/5',
      BR: 'border-l-4 border-l-teal-500 border border-border/60 bg-teal-500/5',
      BG: 'border-l-4 border-l-indigo-500 border border-border/60 bg-indigo-500/5',
    }[key] || 'border border-border/60 bg-surface';
  return `rounded-lg p-3 text-sm ${accent}`;
}

/** Row tint for import-set list by status. */
export function statusRowTintClass(status) {
  const key = normStatus(status);
  const map = {
    pending_review: 'bg-amber-500/5',
    active: 'bg-emerald-500/5',
    rejected: 'bg-destructive/5',
    trashed: 'bg-muted/40 opacity-75',
    approved: 'bg-emerald-500/5',
  };
  return map[key] || '';
}

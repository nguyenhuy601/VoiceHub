/**
 * Staffing fallback MVP — pure classify helpers (Wave 5).
 * remaining < 1 calendar day → fail_short_horizon; else overdue/due_soon → suggest_replace.
 */

const { DAY_MS, startOfUtcDay, DONE_STATUSES } = require('./taskDueReminder');

/**
 * @param {object} task
 * @param {{ now?: Date }} [opts]
 * @returns {'fail_short_horizon' | 'suggest_replace' | null}
 */
function classifyStaffingFallback(task, opts = {}) {
  if (!task || task.isActive === false) return null;
  const status = String(task.status || '').toLowerCase();
  if (DONE_STATUSES.includes(status)) return null;
  if (!task.dueDate) return null;

  const due = startOfUtcDay(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const remainingMs = due.getTime() - startOfUtcDay(now).getTime();

  if (remainingMs < DAY_MS) {
    return 'fail_short_horizon';
  }
  // Still due but ≥ 1 day left — only nudge replace when already in due window / overdue path caller
  return 'suggest_replace';
}

function remainingCalendarDays(task, now = new Date()) {
  if (!task?.dueDate) return null;
  const due = startOfUtcDay(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;
  return Math.round((due.getTime() - startOfUtcDay(now).getTime()) / DAY_MS);
}

/** Whitelist selective audit actions (ops) — Wave 5b. */
const SELECTIVE_AUDIT_ACTIONS = Object.freeze([
  'task_reassign',
  'fallback_override',
  'sprint_extend',
  're_estimate_hours',
  'gate_review',
  'failed_short_horizon',
]);

function isSelectiveAuditAction(action) {
  return SELECTIVE_AUDIT_ACTIONS.includes(String(action || '').trim());
}

module.exports = {
  DAY_MS,
  classifyStaffingFallback,
  remainingCalendarDays,
  SELECTIVE_AUDIT_ACTIONS,
  isSelectiveAuditAction,
};

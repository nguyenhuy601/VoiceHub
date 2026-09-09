/**
 * Pure helpers for task due-soon / overdue reminders (UTC day).
 * Used by taskDueReminders.job and unit tests.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_DUE_SOON_DAYS = 2;
const DONE_STATUSES = Object.freeze(['done', 'cancelled']);

function startOfUtcDay(date) {
  const d = date instanceof Date ? date : new Date(date);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function resolveDueSoonDays() {
  const raw = Number(process.env.TASK_DUE_SOON_DAYS);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 30) return Math.floor(raw);
  return DEFAULT_DUE_SOON_DAYS;
}

/**
 * @param {object} task
 * @param {{ now?: Date, dueSoonDays?: number }} [opts]
 * @returns {'due_soon' | 'overdue' | null}
 */
function classifyTaskDueReminder(task, opts = {}) {
  if (!task || task.isActive === false) return null;
  const status = String(task.status || '').toLowerCase();
  if (DONE_STATUSES.includes(status)) return null;
  if (!task.dueDate) return null;

  const due = startOfUtcDay(task.dueDate);
  if (Number.isNaN(due.getTime())) return null;

  const today = startOfUtcDay(opts.now || new Date());
  const dueSoonDays = opts.dueSoonDays != null ? opts.dueSoonDays : resolveDueSoonDays();
  const windowEnd = new Date(today.getTime() + dueSoonDays * DAY_MS);

  if (due.getTime() < today.getTime()) {
    if (task.overdueNotifiedAt) return null;
    return 'overdue';
  }
  if (due.getTime() >= today.getTime() && due.getTime() <= windowEnd.getTime()) {
    if (task.dueSoonNotifiedAt) return null;
    return 'due_soon';
  }
  return null;
}

function dueDatesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();
}

module.exports = {
  DAY_MS,
  DEFAULT_DUE_SOON_DAYS,
  DONE_STATUSES,
  startOfUtcDay,
  resolveDueSoonDays,
  classifyTaskDueReminder,
  dueDatesEqual,
};

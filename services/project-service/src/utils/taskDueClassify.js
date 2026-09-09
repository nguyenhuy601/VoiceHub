const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ dueDate?: Date|string|null, now?: Date|string, soonMs?: number }} args
 * @returns {'overdue'|'due_soon'|null}
 */
function classifyDue({ dueDate, now, soonMs } = {}) {
  if (!dueDate) return null;
  const due = dueDate instanceof Date ? dueDate : new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const t = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(t.getTime())) return null;
  if (due.getTime() < t.getTime()) return 'overdue';
  if (due.getTime() <= t.getTime() + Number(soonMs || DAY_MS)) return 'due_soon';
  return null;
}

module.exports = { classifyDue, DAY_MS };

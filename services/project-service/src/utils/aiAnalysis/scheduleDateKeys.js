/**
 * Calendar date helpers shared by blueprint import (schedule lives on APS).
 */

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

/** Derive min/max dateKey from schedule rows when taskDates missing. */
function taskDatesFromSchedule(schedule = []) {
  const byTask = new Map();
  for (const row of schedule || []) {
    const taskId = String(row?.taskId || '').trim();
    const dateKey = toDateKey(row?.dateKey);
    if (!taskId || !dateKey) continue;
    if (!byTask.has(taskId)) {
      byTask.set(taskId, { startDate: dateKey, dueDate: dateKey });
    } else {
      const current = byTask.get(taskId);
      if (dateKey < current.startDate) current.startDate = dateKey;
      if (dateKey > current.dueDate) current.dueDate = dateKey;
    }
  }
  return Object.fromEntries(byTask);
}

module.exports = {
  toDateKey,
  taskDatesFromSchedule,
};

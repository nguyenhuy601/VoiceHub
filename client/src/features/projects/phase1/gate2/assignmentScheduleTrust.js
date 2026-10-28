/**
 * Derive schedule dates / trust / conflicts for Gate2 Assignments rows
 * (Lịch folded into Phân công — resource.schedule remains SoT).
 *
 * When SoT schedule/dates are missing but assignees exist (common on packs
 * where matching ran without capacity stamp), derive provisional display
 * dates from effort + projectStart so Start/Due are not blank.
 */

export const UNASSIGNED_SCHEDULE_USER_ID = 'UNASSIGNED';

export const SCHEDULE_TRUST = Object.freeze({
  NONE: 'none',
  PLACEHOLDER: 'placeholder',
  PROVISIONAL: 'provisional',
  CONFIRMED: 'confirmed',
});

const DEFAULT_LEAF_HOURS = 8;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function isoDay(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function todayVnKey() {
  return new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextWorkingDay(dateKey) {
  let current = dateKey;
  for (let i = 0; i < 14; i += 1) {
    const dow = new Date(`${current}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return current;
    current = addDays(current, 1);
  }
  return current;
}

/**
 * @param {object} container — pack.aiAnalysis
 * @returns {Map<string, { startDate: string, dueDate: string }>}
 */
export function dateSpanByTaskFromSchedule(container) {
  const map = new Map();
  for (const row of asArray(container?.resource?.schedule)) {
    const id = String(row?.taskId || '').trim();
    const day = isoDay(row?.dateKey || row?.day || row?.date);
    if (!id || !day) continue;
    const current = map.get(id);
    if (!current) {
      map.set(id, { startDate: day, dueDate: day });
      continue;
    }
    if (day < current.startDate) current.startDate = day;
    if (day > current.dueDate) current.dueDate = day;
  }
  return map;
}

/**
 * @param {object} container
 * @param {string} taskId
 * @returns {object[]}
 */
export function scheduleDaysForTask(container, taskId) {
  const id = String(taskId || '').trim();
  if (!id) return [];
  return asArray(container?.resource?.schedule)
    .filter((row) => String(row?.taskId || '').trim() === id)
    .map((row) => ({
      taskId: id,
      dateKey: isoDay(row?.dateKey || row?.day || row?.date) || '',
      hours: row?.hours != null && Number.isFinite(Number(row.hours)) ? Number(row.hours) : null,
      userId: String(row?.userId || '').trim(),
      displayName: String(row?.displayName || '').trim(),
    }))
    .filter((row) => row.dateKey)
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

/**
 * @param {object} container
 * @param {string[]} taskIds
 * @returns {number}
 */
export function conflictCountForTasks(container, taskIds = []) {
  const idSet = new Set((taskIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  if (!idSet.size) return 0;
  return asArray(container?.resource?.capacityConflicts).filter((c) =>
    idSet.has(String(c?.taskId || '').trim())
  ).length;
}

function taskDatesFromPlanning(container, taskId) {
  const tasks = asArray(container?.planning?.tasks);
  const task = tasks.find((t) => String(t?.id || t?.taskId || '').trim() === String(taskId));
  if (!task) return { startDate: '', dueDate: '', effortHours: null };
  return {
    startDate: isoDay(task.startDate),
    dueDate: isoDay(task.dueDate),
    effortHours:
      task.effortHours != null && Number.isFinite(Number(task.effortHours))
        ? Number(task.effortHours)
        : null,
  };
}

function scheduleUserIdsForTasks(container, taskIds = []) {
  const idSet = new Set((taskIds || []).map((id) => String(id || '').trim()).filter(Boolean));
  const users = new Set();
  for (const row of asArray(container?.resource?.schedule)) {
    const tid = String(row?.taskId || '').trim();
    if (!idSet.has(tid)) continue;
    const uid = String(row?.userId || '').trim();
    if (uid) users.add(uid);
  }
  return users;
}

export function resolveProjectStartKey(container, projectStart = null) {
  return (
    isoDay(projectStart) ||
    isoDay(container?.planning?.completion?.projectStart) ||
    isoDay(container?.planning?.schedulePlan?.projectStart) ||
    isoDay(container?.resource?.assignmentsMeta?.projectStart) ||
    todayVnKey()
  );
}

/**
 * True when assignment rows lack SoT dates (schedule + task stamps empty).
 * @param {object} container
 * @param {object[]} rows
 */
export function assignmentsNeedScheduleRefresh(container, rows = []) {
  const spans = dateSpanByTaskFromSchedule(container);
  if (spans.size > 0) return false;
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return false;
  let hasAssignee = false;
  for (const row of list) {
    const assignee = String(row?.assigneeUserId || '').trim();
    if (assignee && assignee !== UNASSIGNED_SCHEDULE_USER_ID) hasAssignee = true;
    const ids =
      Array.isArray(row?.taskIds) && row.taskIds.length
        ? row.taskIds
        : [String(row?.id || '').trim()].filter(Boolean);
    for (const id of ids) {
      const fromTask = taskDatesFromPlanning(container, id);
      if (fromTask.startDate || fromTask.dueDate) return false;
    }
  }
  return hasAssignee;
}

/**
 * Place effort on consecutive working days (display-only provisional).
 * @param {number} effortHours
 * @param {string} startKey
 * @returns {{ startDate: string, dueDate: string }}
 */
export function placeEffortOnCalendar(effortHours, startKey) {
  const start = nextWorkingDay(isoDay(startKey) || todayVnKey());
  let remaining = Math.max(DEFAULT_LEAF_HOURS, Number(effortHours) || DEFAULT_LEAF_HOURS);
  let day = start;
  let last = start;
  let guard = 0;
  while (remaining > 0 && guard < 366) {
    guard += 1;
    day = nextWorkingDay(day);
    const hours = Math.min(remaining, DEFAULT_LEAF_HOURS);
    remaining -= hours;
    last = day;
    if (remaining > 0) day = addDays(day, 1);
  }
  return { startDate: start, dueDate: last };
}

/**
 * Build provisional start/due map for leaf ids when SoT schedule is empty.
 * Cursor advances per assignee so same person does not fully overlap.
 *
 * @param {object[]} rows
 * @param {object} container
 * @param {string|null} projectStart
 * @returns {Map<string, { startDate: string, dueDate: string }>}
 */
export function buildProvisionalDateMap(rows, container, projectStart = null) {
  const cursorByUser = new Map();
  const map = new Map();
  const startBase = resolveProjectStartKey(container, projectStart);
  const ordered = [...(Array.isArray(rows) ? rows : [])].sort((a, b) =>
    String(a?.id || '').localeCompare(String(b?.id || ''))
  );

  for (const row of ordered) {
    const assignee = String(row?.assigneeUserId || '').trim() || UNASSIGNED_SCHEDULE_USER_ID;
    const ids =
      Array.isArray(row?.taskIds) && row.taskIds.length
        ? row.taskIds.map(String)
        : [String(row?.id || '').trim()].filter(Boolean);
    let rowStart = '';
    let rowDue = '';
    for (const id of ids) {
      if (!id || map.has(id)) {
        const existing = map.get(id);
        if (existing) {
          if (!rowStart || existing.startDate < rowStart) rowStart = existing.startDate;
          if (!rowDue || existing.dueDate > rowDue) rowDue = existing.dueDate;
        }
        continue;
      }
      const fromTask = taskDatesFromPlanning(container, id);
      const effort =
        fromTask.effortHours != null
          ? fromTask.effortHours
          : row?.effortHours != null && Number.isFinite(Number(row.effortHours))
            ? Number(row.effortHours) / Math.max(1, ids.length)
            : DEFAULT_LEAF_HOURS;
      const cursor = cursorByUser.get(assignee) || startBase;
      const placed = placeEffortOnCalendar(effort, cursor);
      map.set(id, placed);
      cursorByUser.set(assignee, addDays(placed.dueDate, 1));
      if (!rowStart || placed.startDate < rowStart) rowStart = placed.startDate;
      if (!rowDue || placed.dueDate > rowDue) rowDue = placed.dueDate;
    }
  }
  return map;
}

/**
 * Resolve start/due/trust/status overlay for an assignment row.
 *
 * @param {{
 *   taskIds?: string[],
 *   assigneeUserId?: string,
 *   status?: string,
 *   overload?: boolean,
 *   container?: object,
 *   scheduleDirty?: boolean,
 *   provisionalByTask?: Map<string, { startDate: string, dueDate: string }>,
 * }} opts
 */
export function resolveAssignmentScheduleFields({
  taskIds = [],
  assigneeUserId = '',
  status = '',
  overload = false,
  container = null,
  scheduleDirty = false,
  provisionalByTask = null,
} = {}) {
  const ids = (Array.isArray(taskIds) ? taskIds : []).map((id) => String(id || '').trim()).filter(Boolean);
  const spans = dateSpanByTaskFromSchedule(container);
  let startDate = '';
  let dueDate = '';
  let usedProvisional = false;
  for (const id of ids) {
    const fromTask = taskDatesFromPlanning(container, id);
    const span = spans.get(id);
    const provisional = provisionalByTask?.get(id);
    const s = fromTask.startDate || span?.startDate || provisional?.startDate || '';
    const d = fromTask.dueDate || span?.dueDate || provisional?.dueDate || '';
    if (provisional && !fromTask.startDate && !span?.startDate) usedProvisional = true;
    if (s && (!startDate || s < startDate)) startDate = s;
    if (d && (!dueDate || d > dueDate)) dueDate = d;
  }

  const assignee = String(assigneeUserId || '').trim();
  const hasAssignee = Boolean(assignee) && assignee !== UNASSIGNED_SCHEDULE_USER_ID;
  const scheduleUsers = scheduleUserIdsForTasks(container, ids);
  const onlyPlaceholder =
    scheduleUsers.size > 0 &&
    [...scheduleUsers].every((uid) => uid === UNASSIGNED_SCHEDULE_USER_ID);
  const hasPlaceholder = scheduleUsers.has(UNASSIGNED_SCHEDULE_USER_ID);
  const conflictCount = conflictCountForTasks(container, ids);
  const hasDates = Boolean(startDate || dueDate);
  const hasSotSchedule = spans.size > 0;

  let scheduleTrust = SCHEDULE_TRUST.NONE;
  if (scheduleDirty) {
    scheduleTrust = SCHEDULE_TRUST.PROVISIONAL;
  } else if (!hasDates) {
    scheduleTrust = SCHEDULE_TRUST.NONE;
  } else if (usedProvisional || (!hasSotSchedule && hasDates)) {
    scheduleTrust = SCHEDULE_TRUST.PROVISIONAL;
  } else if (!hasAssignee || onlyPlaceholder || (hasPlaceholder && !hasAssignee)) {
    scheduleTrust = SCHEDULE_TRUST.PLACEHOLDER;
  } else if (hasPlaceholder) {
    scheduleTrust = SCHEDULE_TRUST.PROVISIONAL;
  } else {
    scheduleTrust = SCHEDULE_TRUST.CONFIRMED;
  }

  const baseStatus = String(status || '').toUpperCase();
  let displayStatus = baseStatus || (hasAssignee ? 'READY' : 'UNASSIGNED');
  if (overload || baseStatus === 'OVERLOAD') {
    displayStatus = 'OVERLOAD';
  } else if (!hasAssignee) {
    displayStatus = 'UNASSIGNED';
  } else if (
    scheduleTrust === SCHEDULE_TRUST.PLACEHOLDER ||
    scheduleTrust === SCHEDULE_TRUST.PROVISIONAL
  ) {
    displayStatus = 'PROVISIONAL';
  } else if (displayStatus === 'SCHEDULED') {
    displayStatus = 'READY';
  }

  return {
    startDate: startDate || null,
    dueDate: dueDate || null,
    conflictCount,
    scheduleTrust,
    scheduleStale: Boolean(scheduleDirty) || usedProvisional,
    scheduleDerived: usedProvisional,
    status: displayStatus,
  };
}

/**
 * Enrich assignment proposal rows with schedule fields.
 * @param {object[]} rows
 * @param {object} container
 * @param {{ scheduleDirty?: boolean, projectStart?: string|null }} [opts]
 */
export function enrichAssignmentRowsWithSchedule(rows, container, opts = {}) {
  const scheduleDirty = Boolean(opts.scheduleDirty);
  const list = Array.isArray(rows) ? rows : [];
  const spans = dateSpanByTaskFromSchedule(container);
  const needProvisional = spans.size === 0;
  const provisionalByTask = needProvisional
    ? buildProvisionalDateMap(list, container, opts.projectStart || null)
    : null;

  return list.map((row) => {
    const taskIds =
      Array.isArray(row?.taskIds) && row.taskIds.length
        ? row.taskIds
        : [String(row?.id || '').trim()].filter(Boolean);
    const fields = resolveAssignmentScheduleFields({
      taskIds,
      assigneeUserId: row?.assigneeUserId,
      status: row?.status,
      overload: row?.overload,
      container,
      scheduleDirty,
      provisionalByTask,
    });
    return {
      ...row,
      ...fields,
      status: fields.status,
    };
  });
}

/**
 * Fields that mark schedule dirty when edited in Gate2 Assignments.
 * @param {string} field
 */
export function isScheduleDirtyField(field) {
  return ['assigneeUserId', 'startDate', 'dueDate'].includes(String(field || ''));
}

/** Empty edited date should not mask row dates after enrich. */
export function isEmptyScheduleDateValue(value) {
  return value == null || String(value).trim() === '';
}

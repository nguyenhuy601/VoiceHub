/**
 * Chia đều giờ thẻ theo ngày làm việc T2–T6, cộng lịch theo người (mọi board),
 * cảnh báo ngày (8h) và tuần (40h) độc lập. Không HTTP, không Redis.
 */

const DAILY_LIMIT = 8;
const WEEKLY_LIMIT = 40;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const WEEKDAY_CODE = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function roundHours(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

/** @returns {number|null|undefined} */
function normalizeEstimateHours(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    const err = Object.assign(new Error('estimateHours phải là số >= 0'), {
      statusCode: 400,
      errorCode: 'ESTIMATE_HOURS_INVALID',
    });
    throw err;
  }
  return roundHours(n, 2);
}

/** Calendar YYYY-MM-DD. Chuỗi giữ prefix; Date dùng múi VN (UTC+7). */
function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function utcNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function addDays(dateKey, n) {
  const d = utcNoon(dateKey);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex(dateKey) {
  return utcNoon(dateKey).getUTCDay();
}

function isWeekday(dateKey) {
  const dow = weekdayIndex(dateKey);
  return dow >= 1 && dow <= 5;
}

function mondayOfWeek(dateKey) {
  const dow = weekdayIndex(dateKey);
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(dateKey, offset);
}

function listWeekdays(startKey, dueKey) {
  const out = [];
  let cur = startKey;
  while (cur <= dueKey) {
    if (isWeekday(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Date UTC noon — ISO prefix = calendar day (tránh lệch TZ). */
function parseStartDate(raw) {
  if (raw == null || raw === '') return null;
  const key = toDateKey(raw);
  if (!key) {
    const err = Object.assign(new Error('startDate không hợp lệ'), {
      statusCode: 400,
      errorCode: 'VALIDATION_INVALID_DATE',
    });
    throw err;
  }
  return utcNoon(key);
}

function resolveCardWindow(card) {
  const due = toDateKey(card?.dueDate);
  const start = toDateKey(card?.startDate) || due;
  const end = due || start;
  if (!start || !end) return null;
  return { start, end };
}

/**
 * giờ/ngày = giờ ghi ÷ số ngày T2–T6. 1 ngày = cả cục.
 * Range chỉ T7–CN: đổ cả giờ vào startDate.
 */
function spreadCardHours(card) {
  const hours = Number(card?.estimateHours);
  if (!Number.isFinite(hours) || hours <= 0) return {};
  const window = resolveCardWindow(card);
  if (!window) return {};
  if (window.start > window.end) return {};

  const days = listWeekdays(window.start, window.end);
  if (!days.length) {
    return { [window.start]: roundHours(hours, 4) };
  }
  const per = roundHours(hours / days.length, 4);
  const map = {};
  for (const day of days) map[day] = per;
  return map;
}

function addSpreadToSchedule(schedule, spread) {
  for (const [day, hours] of Object.entries(spread)) {
    schedule[day] = roundHours((schedule[day] || 0) + hours, 4);
  }
}

function evaluateSchedule(cards) {
  const schedule = {};
  for (const card of cards || []) {
    addSpreadToSchedule(schedule, spreadCardHours(card));
  }

  const daily = [];
  const weeklyMap = {};
  for (const [date, rawHours] of Object.entries(schedule)) {
    const hours = roundHours(rawHours, 2);
    if (hours > DAILY_LIMIT) {
      daily.push({
        date,
        weekday: WEEKDAY_CODE[weekdayIndex(date)],
        hours,
        overBy: roundHours(hours - DAILY_LIMIT, 2),
        limit: DAILY_LIMIT,
      });
    }
    if (isWeekday(date)) {
      const weekStart = mondayOfWeek(date);
      weeklyMap[weekStart] = (weeklyMap[weekStart] || 0) + rawHours;
    }
  }

  const weekly = [];
  for (const [weekStart, rawHours] of Object.entries(weeklyMap)) {
    const hours = roundHours(rawHours, 2);
    if (hours > WEEKLY_LIMIT) {
      weekly.push({
        weekStart,
        hours,
        overBy: roundHours(hours - WEEKLY_LIMIT, 2),
        limit: WEEKLY_LIMIT,
      });
    }
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  weekly.sort((a, b) => a.weekStart.localeCompare(b.weekStart));

  return {
    shouldWarn: daily.length > 0 || weekly.length > 0,
    daily,
    weekly,
    schedule,
  };
}

function hoursFieldsTouched(patch = {}) {
  return (
    patch.assigneeId !== undefined ||
    patch.assignments !== undefined ||
    patch.estimateHours !== undefined ||
    patch.startDate !== undefined ||
    patch.dueDate !== undefined
  );
}

function throwHoursSoftWarning({ daily, weekly, assigneeId }) {
  const err = Object.assign(new Error('Hours soft warning: vượt 8h/ngày hoặc 40h/tuần'), {
    statusCode: 409,
    errorCode: 'HOURS_SOFT_WARNING',
    messageUser: 'Thẻ này làm lịch người được gán vượt 8h/ngày hoặc 40h/tuần.',
    daily,
    weekly,
    assigneeId: assigneeId ? String(assigneeId) : null,
  });
  throw err;
}

async function loadOpenCardsForAssignee(assigneeId, excludeCardId) {
  const Task = require('../models/Task');
  const q = {
    assigneeId,
    isActive: true,
    status: { $ne: 'done' },
    estimateHours: { $gt: 0 },
  };
  if (excludeCardId) q._id = { $ne: excludeCardId };
  return Task.find(q).select('_id estimateHours startDate dueDate').lean();
}

/**
 * Lố lần 1 → throw 409 (chưa lưu). Lố + override + lý do → ghi nhật ký, caller mới persist.
 */
async function assertHoursCapacityOrThrow({
  assigneeId,
  excludeCardId = null,
  proposed,
  hoursOverride = false,
  hoursRationale = '',
  organizationId,
  boardId,
  overriddenBy,
}) {
  const hours = Number(proposed?.estimateHours);
  if (!assigneeId || !Number.isFinite(hours) || hours <= 0) {
    return { skipped: true, shouldWarn: false, daily: [], weekly: [] };
  }

  const window = resolveCardWindow(proposed);
  if (!window) {
    return { skipped: true, shouldWarn: false, daily: [], weekly: [] };
  }
  if (window.start > window.end) {
    const err = Object.assign(new Error('startDate phải trước hoặc bằng dueDate'), {
      statusCode: 400,
      errorCode: 'VALIDATION_INVALID_DATE_RANGE',
    });
    throw err;
  }

  const existing = await loadOpenCardsForAssignee(assigneeId, excludeCardId);
  const result = evaluateSchedule([...existing, proposed]);
  if (!result.shouldWarn) return result;

  if (!hoursOverride) {
    throwHoursSoftWarning({ ...result, assigneeId });
  }

  const rationale = String(hoursRationale || '').trim();
  if (!rationale) {
    const err = Object.assign(new Error('hoursRationale bắt buộc khi override giờ'), {
      statusCode: 400,
      errorCode: 'VALIDATION_REQUIRED',
    });
    throw err;
  }

  const OtOverrideLog = require('../models/OtOverrideLog');
  await OtOverrideLog.create({
    organizationId,
    boardId,
    targetUserId: assigneeId,
    overriddenBy,
    rationale,
    source: 'hours_soft_warning',
    hoursPayload: { daily: result.daily, weekly: result.weekly },
  });

  return result;
}

module.exports = {
  DAILY_LIMIT,
  WEEKLY_LIMIT,
  normalizeEstimateHours,
  toDateKey,
  parseStartDate,
  listWeekdays,
  spreadCardHours,
  evaluateSchedule,
  hoursFieldsTouched,
  assertHoursCapacityOrThrow,
};

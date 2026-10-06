/**
 * Feasible layer — day-window + cumulative Σ effort on REAL booked hours (HARD-03).
 * Never invents booked data; missing map → 0 booked (not fake load).
 */

const DAILY_CAP_DEFAULT = 8;
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

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextWeekday(dateKey) {
  let current = dateKey;
  for (let i = 0; i < 14; i += 1) {
    const dow = new Date(`${current}T12:00:00Z`).getUTCDay();
    if (dow !== 0 && dow !== 6) return current;
    current = addDays(current, 1);
  }
  return current;
}

function bookedForUserDay(bookedHoursByUserDay, userId, dateKey) {
  if (!bookedHoursByUserDay || typeof bookedHoursByUserDay !== 'object') return 0;
  const key = `${userId}|${dateKey}`;
  const n = Number(bookedHoursByUserDay[key] ?? bookedHoursByUserDay[dateKey] ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Simulate packing effortHours into working days from startDate.
 * @returns {{ feasible: boolean, reasons: string[], reservedHours?: number }}
 */
function simulateTaskCapacity({
  userId,
  effortHours,
  bookedHoursByUserDay = null,
  startDate = null,
  dailyCap = DAILY_CAP_DEFAULT,
  reservedHoursByUser = null,
} = {}) {
  const reasons = [];
  const hours = Math.max(0, Number(effortHours) || 0);
  if (!userId || hours <= 0) {
    return { feasible: true, reasons };
  }

  const reservedMap =
    reservedHoursByUser && typeof reservedHoursByUser === 'object' ? reservedHoursByUser : {};
  const alreadyReserved = Math.max(0, Number(reservedMap[userId]) || 0);

  // Cumulative: reserved + this task vs soft horizon (10 working days * dailyCap)
  const horizonDays = Math.max(5, Math.ceil(hours / Math.max(1, dailyCap)) + 5);
  const horizonCap = horizonDays * dailyCap;
  if (alreadyReserved + hours > horizonCap) {
    reasons.push('cumulative_overload');
  }

  const start = nextWeekday(toDateKey(startDate) || toDateKey(new Date()) || '1970-01-01');
  const idealDays = Math.max(1, Math.ceil(hours / Math.max(1, dailyCap)));
  // Bound search window — fully booked calendar within window ⇒ day_overload
  const maxWorkingDays = Math.max(idealDays * 4 + 5, 12);
  let remaining = hours;
  let day = start;
  let workedDays = 0;
  let blockedBookedDays = 0;

  while (remaining > 0 && workedDays < maxWorkingDays) {
    workedDays += 1;
    const booked = bookedForUserDay(bookedHoursByUserDay, userId, day);
    const reservedShare = Math.min(
      dailyCap,
      alreadyReserved > 0 ? alreadyReserved / horizonDays : 0
    );
    const available = Math.max(0, dailyCap - booked - reservedShare);
    if (available <= 0) {
      if (booked > 0 || reservedShare > 0) blockedBookedDays += 1;
      day = nextWeekday(addDays(day, 1));
      continue;
    }
    const use = Math.min(remaining, available);
    remaining -= use;
    if (remaining > 0) day = nextWeekday(addDays(day, 1));
  }

  if (remaining > 0) {
    reasons.push('day_overload');
  } else if (blockedBookedDays > 0 && blockedBookedDays >= idealDays) {
    // Packed only after skipping many fully-booked days beyond ideal — still overload signal
    // Only when packing required stretching past 2× ideal working days
    if (workedDays > idealDays * 2) reasons.push('day_overload');
  }

  return {
    feasible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    reservedHours: hours,
  };
}

/**
 * Mutates reservedHoursByUser when candidate is accepted.
 */
function reserveHours(reservedHoursByUser, userId, hours) {
  if (!reservedHoursByUser || !userId) return;
  const n = Math.max(0, Number(hours) || 0);
  reservedHoursByUser[userId] = (Number(reservedHoursByUser[userId]) || 0) + n;
}

module.exports = {
  DAILY_CAP_DEFAULT,
  simulateTaskCapacity,
  reserveHours,
  toDateKey,
  bookedForUserDay,
};

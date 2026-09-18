/**
 * Lightweight Planning Gantt helpers (no external lib).
 */

function parseIsoDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return raw;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s.length <= 10 ? `${s}T00:00:00` : s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Resolve bar range from PlanningArtifact structured fields.
 * @param {object} artifact
 * @returns {{ start: Date, end: Date, isMilestone: boolean }|null}
 */
export function resolvePlanningBarRange(artifact) {
  const st = artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  const kind = String(artifact?.kind || '').toUpperCase();
  const start =
    parseIsoDate(st.startDate) ||
    parseIsoDate(st.start) ||
    (kind === 'MILESTONE' ? parseIsoDate(st.targetDate) : null);
  let end =
    parseIsoDate(st.endDate) ||
    parseIsoDate(st.end) ||
    parseIsoDate(st.targetDate) ||
    parseIsoDate(st.dueDate);
  if (!start && !end) return null;
  if (start && !end) {
    end = new Date(start.getTime());
    if (kind === 'MILESTONE') {
      /* same day */
    } else {
      end.setDate(end.getDate() + 7);
    }
  }
  if (!start && end) {
    const s = new Date(end.getTime());
    if (kind !== 'MILESTONE') s.setDate(s.getDate() - 7);
    return { start: s, end, isMilestone: kind === 'MILESTONE' };
  }
  if (end < start) return { start, end: new Date(start.getTime()), isMilestone: kind === 'MILESTONE' };
  return { start, end, isMilestone: kind === 'MILESTONE' || start.getTime() === end.getTime() };
}

export function unionPlanningBounds(items = []) {
  let min = null;
  let max = null;
  for (const item of items) {
    const r = resolvePlanningBarRange(item);
    if (!r) continue;
    if (!min || r.start < min) min = r.start;
    if (!max || r.end > max) max = r.end;
  }
  if (!min || !max) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() + 42);
    return { start: today, end };
  }
  const padStart = new Date(min);
  padStart.setDate(padStart.getDate() - 3);
  const padEnd = new Date(max);
  padEnd.setDate(padEnd.getDate() + 7);
  return { start: padStart, end: padEnd };
}

export function daysBetween(a, b) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / ms));
}

/**
 * @param {{ start: Date, end: Date }} range
 * @param {{ start: Date, end: Date }} window
 * @param {number} widthPx
 */
export function barStyleInWindow(range, window, widthPx) {
  const total = Math.max(1, daysBetween(window.start, window.end));
  const leftDays = daysBetween(window.start, range.start);
  const spanDays = Math.max(range.isMilestone ? 1 : 1, daysBetween(range.start, range.end) || 1);
  const left = (leftDays / total) * widthPx;
  const width = Math.max(range.isMilestone ? 12 : 8, (spanDays / total) * widthPx);
  return {
    left: `${Math.max(0, left)}px`,
    width: `${Math.min(widthPx - Math.max(0, left), width)}px`,
  };
}

export function formatPlanningDay(d) {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function buildWeekTicks(window, maxTicks = 12) {
  const ticks = [];
  const cur = new Date(window.start);
  cur.setHours(0, 0, 0, 0);
  const total = daysBetween(window.start, window.end) || 1;
  const step = Math.max(1, Math.ceil(total / maxTicks));
  while (cur <= window.end && ticks.length < maxTicks + 2) {
    ticks.push(new Date(cur));
    cur.setDate(cur.getDate() + step);
  }
  return ticks;
}

/**
 * Pure helpers — Resource Allocation overlap / overallocated gate.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toDayMs(raw) {
  if (raw == null || raw === '') return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function clampPct(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n * 100) / 100;
}

/**
 * Normalize allocation segments from API body.
 * @returns {{ ok: true, segments: Array } | { ok: false, message: string }}
 */
function normalizeAllocationSegments(raw) {
  if (raw === undefined) return { ok: true, segments: undefined };
  if (raw === null) return { ok: true, segments: [] };
  if (!Array.isArray(raw)) {
    return { ok: false, message: 'allocations phải là mảng' };
  }
  const segments = [];
  for (const row of raw.slice(0, 24)) {
    if (!row || typeof row !== 'object') continue;
    const startMs = toDayMs(row.startDate);
    if (startMs == null) {
      return { ok: false, message: 'allocation.startDate không hợp lệ' };
    }
    const endMs = row.endDate == null || row.endDate === '' ? null : toDayMs(row.endDate);
    if (row.endDate != null && row.endDate !== '' && endMs == null) {
      return { ok: false, message: 'allocation.endDate không hợp lệ' };
    }
    if (endMs != null && endMs < startMs) {
      return { ok: false, message: 'allocation.endDate phải >= startDate' };
    }
    const pct = clampPct(row.allocationPct);
    if (pct == null) {
      return { ok: false, message: 'allocationPct không hợp lệ' };
    }
    segments.push({
      startDate: new Date(startMs),
      endDate: endMs == null ? null : new Date(endMs),
      allocationPct: pct,
    });
  }
  segments.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return { ok: true, segments };
}

/**
 * Flatten segments from many project-member rows into { startMs, endMs|Infinity, pct }.
 */
function flattenSegments(memberRows = []) {
  const out = [];
  for (const row of memberRows || []) {
    const segs = Array.isArray(row?.allocations) ? row.allocations : [];
    for (const s of segs) {
      const startMs = toDayMs(s.startDate);
      if (startMs == null) continue;
      const endRaw = s.endDate == null || s.endDate === '' ? null : toDayMs(s.endDate);
      const endMs = endRaw == null ? Number.POSITIVE_INFINITY : endRaw;
      const pct = clampPct(s.allocationPct);
      if (pct == null || pct <= 0) continue;
      out.push({ startMs, endMs, pct });
    }
  }
  return out;
}

/**
 * Sweep-line: true if any day has total pct > 100.
 */
function isOverallocatedFromSegments(flatSegments = []) {
  const events = [];
  for (const s of flatSegments) {
    events.push({ t: s.startMs, delta: s.pct });
    // endDate inclusive → unload on next day
    const unload =
      s.endMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : s.endMs + DAY_MS;
    events.push({ t: unload, delta: -s.pct });
  }
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);

  let running = 0;
  for (const ev of events) {
    running += ev.delta;
    // floating tolerance
    if (running > 100.0001) return true;
  }
  return false;
}

/**
 * Compute allocationStatus for a user across all their ProjectMember rows.
 * @param {Array<{ allocations?: Array }>} memberRows
 * @returns {'ok'|'overallocated'}
 */
function computeAllocationStatus(memberRows = []) {
  const flat = flattenSegments(memberRows);
  if (!flat.length) return 'ok';
  return isOverallocatedFromSegments(flat) ? 'overallocated' : 'ok';
}

/**
 * Sum allocation % active on a UTC day (inclusive endDate).
 */
function allocatedPctOnDay(flatSegments = [], dayMs) {
  const day = toDayMs(dayMs);
  if (day == null) return 0;
  let sum = 0;
  for (const s of flatSegments || []) {
    if (s.startMs > day) continue;
    if (s.endMs < day) continue;
    sum += Number(s.pct) || 0;
  }
  return Math.round(sum * 100) / 100;
}

function availablePctOnDay(flatSegments = [], dayMs) {
  return Math.max(0, Math.round((100 - allocatedPctOnDay(flatSegments, dayMs)) * 100) / 100);
}

/**
 * @returns {'available'|'partial'|'overallocated'}
 */
function classifyAvailability(allocatedPct) {
  const n = Number(allocatedPct) || 0;
  if (n > 100.0001) return 'overallocated';
  if (n > 0.0001) return 'partial';
  return 'available';
}

/**
 * Pure capacity math for one department (unit-testable).
 * @param {string[]} memberUserIds
 * @param {Map<string, number>|Record<string, number>} allocatedPctByUserId — % on asOf day
 */
function computeDepartmentCapacityRow({
  departmentId,
  name = '',
  memberUserIds = [],
  allocatedPctByUserId = {},
} = {}) {
  const ids = [...new Set((memberUserIds || []).map(String).filter(Boolean))];
  const headcount = ids.length;
  let allocatedFtePct = 0;
  let availablePeople = 0;
  let partialPeople = 0;
  let overallocatedPeople = 0;
  const getPct = (uid) => {
    if (allocatedPctByUserId instanceof Map) return Number(allocatedPctByUserId.get(uid)) || 0;
    return Number(allocatedPctByUserId[uid]) || 0;
  };
  for (const uid of ids) {
    const pct = getPct(uid);
    allocatedFtePct += pct;
    const bucket = classifyAvailability(pct);
    if (bucket === 'available') availablePeople += 1;
    else if (bucket === 'partial') partialPeople += 1;
    else overallocatedPeople += 1;
  }
  allocatedFtePct = Math.round(allocatedFtePct * 100) / 100;
  const capacityFtePct = headcount * 100;
  const availableFtePct = Math.max(0, Math.round((capacityFtePct - allocatedFtePct) * 100) / 100);
  return {
    departmentId: String(departmentId || ''),
    name: String(name || ''),
    headcount,
    capacityFtePct,
    allocatedFtePct,
    availableFtePct,
    availablePeople,
    partialPeople,
    overallocatedPeople,
    approx: true,
  };
}

/**
 * Pure — scope planner/candidates theo related department member ids.
 */
function filterUsersToRelatedDepartments(userIds = [], relatedUserIds, { isOrgAdmin = false } = {}) {
  if (isOrgAdmin || relatedUserIds == null) return [...userIds].map(String);
  const set =
    relatedUserIds instanceof Set
      ? relatedUserIds
      : new Set([...relatedUserIds].map(String));
  if (!set.size) return [];
  return userIds.map(String).filter((id) => set.has(id));
}

module.exports = {
  DAY_MS,
  toDayMs,
  clampPct,
  normalizeAllocationSegments,
  flattenSegments,
  isOverallocatedFromSegments,
  computeAllocationStatus,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeDepartmentCapacityRow,
  filterUsersToRelatedDepartments,
};

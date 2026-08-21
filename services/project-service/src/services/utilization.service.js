const mongoose = require('../db');
const ProjectMember = require('../models/ProjectMember');
const Worklog = require('../models/Worklog');
const {
  assertTimeTrackingEnabled,
  DEFAULT_HOURS_PER_DAY,
} = require('../utils/timeTracking');
const { toDayMs, flattenSegments } = require('../utils/allocationOverlap');
const {
  plannedAvailableHoursInRange,
  utilizationPct,
  DAY_MS,
} = require('../utils/utilizationMath');
const { assertCanViewOrgCapacity } = require('./resourceCapacity.service');
const { fetchOrgWorkingCalendar } = require('./governance.service');

/**
 * Org-wide utilization: planned (P3 allocations) ∩ actual (worklogs).
 * Does not mutate ProjectMember.
 */
async function getUtilizationReport({
  organizationId,
  from,
  to,
  userId,
  projectId,
  actorUserId,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
} = {}) {
  assertTimeTrackingEnabled();
  const orgId = String(organizationId || '').trim();
  if (!mongoose.isValidObjectId(orgId)) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  await assertCanViewOrgCapacity(actorUserId, orgId);

  const { workingCalendar, holidays } = await fetchOrgWorkingCalendar(orgId).catch(() => ({
    workingCalendar: null,
    holidays: [],
  }));
  const effectiveHoursPerDay =
    Number(workingCalendar?.hoursPerDay) > 0
      ? Number(workingCalendar.hoursPerDay)
      : Number(hoursPerDay) || DEFAULT_HOURS_PER_DAY;

  const fromMs = toDayMs(from);
  const toMs = toDayMs(to);
  if (fromMs == null || toMs == null || toMs < fromMs) {
    const err = new Error('from/to (YYYY-MM-DD) không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const filterUserId = userId && mongoose.isValidObjectId(String(userId)) ? String(userId) : '';
  const filterProjectId =
    projectId && mongoose.isValidObjectId(String(projectId)) ? String(projectId) : '';

  const memberQuery = {
    organizationId: orgId,
    status: 'active',
  };
  if (filterUserId) memberQuery.userId = filterUserId;
  if (filterProjectId) memberQuery.projectId = filterProjectId;

  const members = await ProjectMember.find(memberQuery)
    .select('userId projectId allocations')
    .lean();

  const byUser = new Map();
  for (const row of members) {
    const uid = String(row.userId || '');
    if (!uid) continue;
    const list = byUser.get(uid) || [];
    list.push(row);
    byUser.set(uid, list);
  }

  const userIds = filterUserId ? [filterUserId] : [...byUser.keys()];

  const worklogQuery = {
    organizationId: orgId,
    userId: { $in: userIds },
    workDate: {
      $gte: new Date(fromMs),
      $lte: new Date(toMs + DAY_MS - 1),
    },
  };
  if (filterProjectId) worklogQuery.projectId = filterProjectId;

  const logs = userIds.length
    ? await Worklog.find(worklogQuery).select('userId hours').lean()
    : [];

  const actualByUser = new Map();
  for (const row of logs) {
    const uid = String(row.userId);
    actualByUser.set(uid, (actualByUser.get(uid) || 0) + (Number(row.hours) || 0));
  }

  const items = [];
  for (const uid of userIds) {
    const rows = byUser.get(uid) || [];
    const flat = flattenSegments(rows);
    const plannedAvailableHours = plannedAvailableHoursInRange({
      flatSegments: flat,
      fromMs,
      toMs,
      hoursPerDay: effectiveHoursPerDay,
      calendar: workingCalendar,
      holidays,
    });
    const actualHours = Math.round((actualByUser.get(uid) || 0) * 100) / 100;
    const util = utilizationPct(actualHours, plannedAvailableHours);
    items.push({
      userId: uid,
      plannedAvailableHours,
      actualHours,
      utilizationPct: util,
      projectCount: rows.length,
    });
  }

  items.sort((a, b) => (b.utilizationPct ?? -1) - (a.utilizationPct ?? -1));

  return {
    organizationId: orgId,
    from: new Date(fromMs).toISOString().slice(0, 10),
    to: new Date(toMs).toISOString().slice(0, 10),
    hoursPerDay: effectiveHoursPerDay,
    calendarApplied: Boolean(workingCalendar),
    approx: true,
    metric: 'planned_vs_actual_hours',
    items,
    totals: {
      plannedAvailableHours:
        Math.round(items.reduce((s, r) => s + r.plannedAvailableHours, 0) * 100) / 100,
      actualHours: Math.round(items.reduce((s, r) => s + r.actualHours, 0) * 100) / 100,
      people: items.length,
    },
  };
}

module.exports = {
  getUtilizationReport,
  plannedAvailableHoursInRange,
  utilizationPct,
  DEFAULT_HOURS_PER_DAY,
};

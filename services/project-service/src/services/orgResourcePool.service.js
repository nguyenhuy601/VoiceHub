const mongoose = require('../db');
const RequirementPack = require('../models/RequirementPack');
const { fetchOrganizationMemberships } = require('../clients/orgMemberships.client');
const { fetchDepartmentRoster } = require('../clients/orgStructure.client');
const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
const {
  assertCanViewOrgCapacity,
  loadAllocationRowsByUser,
} = require('./resourceCapacity.service');
const { fetchOrgWorkingCalendar } = require('./governance.service');
const {
  toDayMs,
  flattenSegments,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeAllocationStatus,
} = require('../utils/allocationOverlap');
const { stripVerifiedCapabilityForPool } = require('../utils/verifiedCapabilityStrip');
const {
  emptyPlacement,
  buildPlacementByUser,
  uniqueMemberships,
  clampPoolLimit,
  filterPoolItems,
  sortPoolItems,
  sortPoolItemsByRange,
  computePoolTotals,
  computePoolRangeTotals,
} = require('../utils/orgResourcePoolMerge');
const { coalesceJobTitle } = require('../utils/jobTitleProfile');
const { resolvePlanningWindow } = require('../utils/resolvePlanningWindow');
const {
  computeUserRangeCapacity,
  buildWindowMeta,
} = require('../utils/rangeCapacityMath');
const { loadPerformanceByUserIds } = require('./userPerformance.service');
const { toSlimPerformance } = require('../utils/performanceMatch');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function parseBool(raw, defaultValue = false) {
  if (raw == null || raw === '') return defaultValue;
  const s = String(raw).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(s)) return true;
  if (['0', 'false', 'no', 'n'].includes(s)) return false;
  return defaultValue;
}

function profileIdentity(profile, userId) {
  const p = profile || {};
  const displayName =
    p.displayName ||
    p.fullName ||
    p.username ||
    (p.email ? String(p.email).split('@')[0] : '') ||
    String(userId).slice(-6);
  return {
    displayName,
    email: p.email || '',
    avatar: p.avatar || p.avatarUrl || '',
    employeeCode: p.employeeCode || '',
    jobTitle: coalesceJobTitle(p),
    isActive: p.isActive !== false,
    resourceConfig:
      p.resourceConfig && typeof p.resourceConfig === 'object'
        ? { maxConcurrentProjects: p.resourceConfig.maxConcurrentProjects ?? null }
        : null,
    capability: stripVerifiedCapabilityForPool(p.capability),
  };
}

async function loadPackForWindow(packId, orgId) {
  const id = asOid(packId);
  const organizationId = asOid(orgId);
  if (!id || !organizationId) return null;
  return RequirementPack.findOne({
    _id: id,
    organizationId,
    isActive: true,
  })
    .select('overview.startDate overview.deadline staffingPlan.startDate')
    .lean();
}

/**
 * Org-wide employee resource pool for AI staffing / RM views.
 * Membership SoT; roster for placement; verified capability only.
 * Optional fromDate/toDate or requirementPackId → capacityRange per item.
 */
async function listOrgResourcePool({
  organizationId,
  actorUserId,
  asOf,
  verifiedOnly = false,
  departmentId = '',
  limit,
  fromDate,
  toDate,
  requirementPackId,
  /** Internal: caller already asserted capacity / AI-planning permission */
  skipCapacityAuth = false,
} = {}) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  if (!skipCapacityAuth) {
    await assertCanViewOrgCapacity(actorUserId, orgId);
  }

  const planningWindow = await resolvePlanningWindow({
    fromDate,
    toDate,
    requirementPackId,
    organizationId: orgId,
    loadPack: loadPackForWindow,
  });

  const asOfMs = toDayMs(asOf || new Date()) ?? toDayMs(new Date());
  const asOfDate = new Date(asOfMs).toISOString().slice(0, 10);
  const softLimit = clampPoolLimit(limit);

  const rangeMode = planningWindow != null;
  const calendarPromise = rangeMode
    ? fetchOrgWorkingCalendar(orgId).catch(() => ({
        workingCalendar: {},
        holidays: [],
      }))
    : Promise.resolve(null);

  const [membershipsRaw, departments, calendarPack] = await Promise.all([
    fetchOrganizationMemberships(orgId, actorUserId),
    fetchDepartmentRoster(orgId, { actorUserId }),
    calendarPromise,
  ]);

  const memberships = uniqueMemberships(membershipsRaw);
  const placementByUser = buildPlacementByUser(departments);
  const userIds = memberships.map((m) => m.userId);

  const [profileMap, rowsByUser] = await Promise.all([
    fetchProfilesByUserIds(userIds),
    loadAllocationRowsByUser({ organizationId: orgId, userIds }),
  ]);

  const workingCalendar = calendarPack?.workingCalendar || {};
  const holidays = Array.isArray(calendarPack?.holidays) ? calendarPack.holidays : [];

  let items = memberships.map((m) => {
    const uid = m.userId;
    const identity = profileIdentity(profileMap.get(uid), uid);
    const rows = rowsByUser.get(uid) || [];
    const flat = flattenSegments(rows);
    const allocatedPct = allocatedPctOnDay(flat, asOfMs);
    const availablePct = availablePctOnDay(flat, asOfMs);
    const statusFromRows = computeAllocationStatus(rows);
    let availability = classifyAvailability(allocatedPct);
    if (statusFromRows === 'overallocated') availability = 'overallocated';

    const item = {
      userId: uid,
      displayName: identity.displayName,
      email: identity.email,
      avatar: identity.avatar,
      employeeCode: identity.employeeCode,
      jobTitle: identity.jobTitle,
      isActive: identity.isActive,
      membershipRole: m.role || '',
      placement: placementByUser.get(uid) || emptyPlacement(),
      capability: identity.capability,
      resourceConfig: identity.resourceConfig,
      allocatedPct,
      availablePct,
      availability,
      allocationStatus: statusFromRows,
      projectCount: rows.length,
    };

    if (rangeMode) {
      item.capacityRange = computeUserRangeCapacity({
        flatSegments: flat,
        fromMs: planningWindow.fromMs,
        toMs: planningWindow.toMs,
        calendar: workingCalendar,
        holidays,
      });
    }

    return item;
  });

  items = filterPoolItems(items, {
    verifiedOnly: parseBool(verifiedOnly, false),
    departmentId,
  });
  items = rangeMode ? sortPoolItemsByRange(items) : sortPoolItems(items);
  if (items.length > softLimit) {
    items = items.slice(0, softLimit);
  }

  const perfUserIds = items.map((row) => row.userId).filter(Boolean);
  if (perfUserIds.length) {
    const performanceByUserId = await loadPerformanceByUserIds({
      organizationId: orgId,
      userIds: perfUserIds,
      windowDays: 90,
      asOf: asOfDate,
    }).catch(() => new Map());
    items = items.map((row) => ({
      ...row,
      performance: toSlimPerformance(performanceByUserId.get(row.userId) || null),
    }));
  }

  const totals = computePoolTotals(items);
  if (rangeMode) {
    totals.rangeTotals = computePoolRangeTotals(items);
  }

  const result = {
    organizationId: orgId,
    asOf: asOfDate,
    metric: 'planned_allocation',
    items,
    totals,
  };

  if (rangeMode) {
    result.window = buildWindowMeta({
      fromMs: planningWindow.fromMs,
      toMs: planningWindow.toMs,
      from: planningWindow.from,
      to: planningWindow.to,
      calendar: workingCalendar,
      holidays,
    });
    result.calendarApplied = true;
  }

  return result;
}

module.exports = {
  listOrgResourcePool,
};

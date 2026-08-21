const mongoose = require('../db');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { fetchUserPlacement } = require('../clients/orgStructure.client');
const { fetchOrgWorkingCalendar } = require('./governance.service');
const { assertCanViewOrgCapacity, assertOrgMember } = require('./resourceCapacity.service');
const {
  resolveEmployeeProfileAccessMode,
  collectValidProjectIds,
} = require('../utils/employeeProfileAccess');
const {
  toDayMs,
  flattenSegments,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeAllocationStatus,
} = require('../utils/allocationOverlap');
const {
  billingMonthCapacityHours,
  workingCapacityHoursInRange,
} = require('../utils/workingCalendar');
const { stripVerifiedCapability } = require('../utils/verifiedCapabilityStrip');
const { coalesceJobTitle } = require('../utils/jobTitleProfile');

function monthRangeUtc(asOf = new Date()) {
  const d = new Date(asOf);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const fromMs = Date.UTC(y, m, 1);
  const toMs = Date.UTC(y, m + 1, 0);
  return { fromMs, toMs, year: y, month: m + 1 };
}

async function getEmployeeResourceProfile({
  organizationId,
  userId,
  actorUserId,
  asOf,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const targetUserId = String(userId || '').trim();
  if (!mongoose.isValidObjectId(orgId) || !mongoose.isValidObjectId(targetUserId)) {
    const err = new Error('organizationId và userId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const accessMode = resolveEmployeeProfileAccessMode(actorUserId, targetUserId);
  if (accessMode === 'invalid') {
    const err = new Error('Không có quyền truy cập tổ chức');
    err.statusCode = 403;
    throw err;
  }
  if (accessMode === 'self') {
    await assertOrgMember(actorUserId, orgId);
  } else {
    await assertCanViewOrgCapacity(actorUserId, orgId);
  }

  const asOfMs = toDayMs(asOf || new Date());
  const { fromMs, toMs, year, month } = monthRangeUtc(asOf || new Date());

  const [profileRes, placement, memberRows, memberships, calendarPack] = await Promise.all([
    fetchUserProfileByIdInternal(targetUserId).catch(() => null),
    fetchUserPlacement(orgId, targetUserId, actorUserId),
    ProjectMember.find({
      organizationId: orgId,
      userId: targetUserId,
      status: 'active',
    })
      .select('projectId allocations allocationStatus billable joinDate leaveDate')
      .lean(),
    ProjectMembership.find({ organizationId: orgId, userId: targetUserId })
      .select('projectId projectRoleId projectRoleKey')
      .lean(),
    fetchOrgWorkingCalendar(orgId).catch(() => ({
      workingCalendar: {},
      holidays: [],
    })),
  ]);

  const profile = profileRes?.data?.data ?? profileRes?.data ?? null;
  const flat = flattenSegments(memberRows);
  const allocatedPct = allocatedPctOnDay(flat, asOfMs);
  const availablePct = availablePctOnDay(flat, asOfMs);
  const allocationStatus = computeAllocationStatus(memberRows);
  const availability =
    allocationStatus === 'overallocated'
      ? 'overallocated'
      : classifyAvailability(allocatedPct);

  const { workingCalendar, holidays } = calendarPack;
  const billingCapacityHours = billingMonthCapacityHours(workingCalendar);
  const monthWorkingHours = workingCapacityHoursInRange({
    fromMs,
    toMs,
    calendar: workingCalendar,
    holidays,
  });
  const availableHoursMonth =
    Math.round(((availablePct / 100) * monthWorkingHours) * 100) / 100;
  const allocatedHoursMonth =
    Math.round(((allocatedPct / 100) * monthWorkingHours) * 100) / 100;

  const projectIds = collectValidProjectIds([
    ...(memberRows || []).map((r) => r.projectId),
    ...(memberships || []).map((r) => r.projectId),
  ]);

  const [projects, roles] = await Promise.all([
    projectIds.length
      ? Project.find({ _id: { $in: projectIds }, organizationId: orgId })
          .select('_id title projectCode')
          .lean()
      : [],
    ProjectRole.find({ organizationId: orgId }).select('_id key label').lean(),
  ]);

  const projectById = new Map(projects.map((p) => [String(p._id), p]));
  const roleById = new Map(roles.map((r) => [String(r._id), r]));

  const projectAllocations = memberRows.map((row) => {
    const pid = String(row.projectId);
    const segs = Array.isArray(row.allocations) ? row.allocations : [];
    const pctOnDay = segs.reduce((sum, s) => {
      const startMs = toDayMs(s.startDate);
      const endMs = s.endDate ? toDayMs(s.endDate) : Number.POSITIVE_INFINITY;
      if (startMs == null || startMs > asOfMs || endMs < asOfMs) return sum;
      return sum + (Number(s.allocationPct) || 0);
    }, 0);
    const proj = projectById.get(pid);
    return {
      projectId: pid,
      title: proj?.title || '',
      projectCode: proj?.projectCode || '',
      allocationPct: Math.round(pctOnDay * 100) / 100,
      allocatedHoursMonth:
        Math.round(((pctOnDay / 100) * monthWorkingHours) * 100) / 100,
      billable: Boolean(row.billable),
      joinDate: row.joinDate || null,
      leaveDate: row.leaveDate || null,
      segments: segs,
    };
  });

  const projectRoles = memberships.map((m) => {
    const pid = String(m.projectId);
    const proj = projectById.get(pid);
    const role = m.projectRoleId ? roleById.get(String(m.projectRoleId)) : null;
    return {
      projectId: pid,
      title: proj?.title || '',
      projectCode: proj?.projectCode || '',
      projectRoleKey: m.projectRoleKey || role?.key || '',
      projectRoleLabel: role?.label || m.projectRoleKey || '',
    };
  });

  const computedAvailability =
    availability === 'available'
      ? 'available'
      : availability === 'partial'
        ? 'partial'
        : 'busy';

  return {
    userId: targetUserId,
    organizationId: orgId,
    asOf: new Date(asOfMs).toISOString().slice(0, 10),
    identity: {
      displayName: profile?.displayName || profile?.username || '',
      email: profile?.email || '',
      avatar: profile?.avatar || null,
      employeeCode: profile?.employeeCode || '',
    },
    employee: {
      jobTitle: coalesceJobTitle(profile),
      isActive: profile?.isActive !== false,
    },
    placement: placement || {
      departmentIds: [],
      teamIds: [],
      primaryDepartmentId: null,
      departmentName: null,
      teamName: null,
    },
    capability: stripVerifiedCapability(profile?.capability),
    resourceConfig: profile?.resourceConfig || null,
    projectRoles,
    capacity: {
      workingCalendar,
      holidaysCount: (holidays || []).length,
      billingCapacityHours,
      month: { year, month, workingHours: monthWorkingHours },
      allocatedPct,
      availablePct,
      allocationStatus,
      availability: computedAvailability,
      allocatedHoursMonth,
      availableHoursMonth,
      projectAllocations,
      maxConcurrentProjects: profile?.resourceConfig?.maxConcurrentProjects ?? null,
    },
  };
}

module.exports = {
  getEmployeeResourceProfile,
  monthRangeUtc,
};

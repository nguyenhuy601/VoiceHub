const ProjectMembership = require('../models/ProjectMembership');
const ProjectMember = require('../models/ProjectMember');
const ProjectRole = require('../models/ProjectRole');
const Project = require('../models/Project');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { fetchDepartmentRoster } = require('../clients/orgStructure.client');
const { fetchEnabledPositionKeys } = require('../clients/orgMasterData.client');
const { summarizeProjectRoleStaffing } = require('../utils/projectStaffingSummary');
const { scorePositionMatch } = require('../utils/positionCandidateMatch');
const { scoreVerifiedCapability } = require('../utils/capabilityMatch');
const {
  flattenSegments,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeAllocationStatus,
  toDayMs,
  filterUsersToRelatedDepartments,
} = require('../utils/allocationOverlap');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { coalesceJobTitle } = require('../utils/jobTitleProfile');
const { loadPerformanceByUserIds } = require('./userPerformance.service');
const { scoreHistoricalPerformance } = require('../utils/performanceMatch');

async function enrichProfiles(userIds = []) {
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const rows = await Promise.all(
    unique.map(async (uid) => {
      let displayName = uid.slice(-6);
      let jobTitle = '';
      let verifiedCapability = null;
      try {
        const res = await fetchUserProfileByIdInternal(uid);
        const profile = res?.data?.data ?? res?.data ?? null;
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          profile?.email?.split('@')[0] ||
          displayName;
        jobTitle = coalesceJobTitle(profile);
        const cap = profile?.capability;
        if (cap && String(cap.verificationStatus || '') === 'verified') {
          verifiedCapability = cap;
        }
      } catch {
        /* optional enrich */
      }
      return { userId: uid, displayName, jobTitle, verifiedCapability };
    })
  );
  return new Map(rows.map((row) => [row.userId, row]));
}

async function listMemberCandidates({ organizationId, projectId, projectRoleKey, actorUserId }) {
  const targetRoleKey = String(projectRoleKey || '').trim().toLowerCase();
  if (!targetRoleKey) {
    const err = new Error('projectRoleKey là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const [project, existingMemberships] = await Promise.all([
    Project.findOne({ _id: projectId, organizationId, isActive: true })
      .select('requiredProjectRoles title projectCode relatedDepartmentIds')
      .lean(),
    ProjectMembership.find({ projectId })
      .select('userId projectRoleKey')
      .lean(),
  ]);
  if (!project) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const existingUserIds = new Set(existingMemberships.map((row) => String(row.userId || '')).filter(Boolean));
  const staffingSummary = summarizeProjectRoleStaffing(
    project.requiredProjectRoles,
    existingMemberships,
    targetRoleKey
  );

  const roleRow = await ProjectRole.findOne({
    organizationId,
    key: targetRoleKey,
  })
    .select('_id key')
    .lean();

  let priorRoleUserIds = [];
  if (roleRow?._id) {
    const priorRows = await ProjectMembership.find({
      organizationId,
      projectRoleId: roleRow._id,
      projectId: { $ne: projectId },
    })
      .select('userId')
      .lean();
    priorRoleUserIds = [...new Set(priorRows.map((row) => String(row.userId || '')).filter(Boolean))];
  }

  let unionUserIds = [...new Set(priorRoleUserIds.filter((id) => !existingUserIds.has(id)))];

  const relatedDeptIds = (Array.isArray(project.relatedDepartmentIds)
    ? project.relatedDepartmentIds
    : []
  )
    .map(String)
    .filter(Boolean);

  const scope = await fetchTaskWorkspaceScope(actorUserId, organizationId);
  const isOrgAdmin =
    String(scope?.membershipRole || '').toLowerCase() === 'owner' ||
    String(scope?.membershipRole || '').toLowerCase() === 'admin';

  /** Scope gợi ý theo related departments (trừ org admin). */
  let relatedUserIds = null;
  if (relatedDeptIds.length) {
    const roster = await fetchDepartmentRoster(organizationId, {
      departmentIds: relatedDeptIds,
      actorUserId,
    });
    relatedUserIds = new Set(roster.flatMap((d) => (d.memberIds || []).map(String)));
    unionUserIds = filterUsersToRelatedDepartments(unionUserIds, relatedUserIds, {
      isOrgAdmin,
    });
  }

  if (!unionUserIds.length) {
    return {
      project: {
        projectId: String(project._id),
        title: project.title,
        projectCode: project.projectCode,
        requiredProjectRoles: Array.isArray(project.requiredProjectRoles) ? project.requiredProjectRoles : [],
        relatedDepartmentIds: relatedDeptIds,
      },
      staffingSummary,
      metric: 'planned_allocation',
      items: [],
    };
  }

  const [allocationRows, enabledPositionKeys, profileByUserId, performanceByUserId] =
    await Promise.all([
      ProjectMember.find({
        organizationId,
        userId: { $in: unionUserIds },
        status: 'active',
      })
        .select('userId allocations allocationStatus')
        .lean(),
      fetchEnabledPositionKeys(organizationId).catch(() => null),
      enrichProfiles(unionUserIds),
      loadPerformanceByUserIds({
        organizationId,
        userIds: unionUserIds,
        windowDays: 90,
      }).catch(() => new Map()),
    ]);

  const rowsByUser = new Map();
  for (const row of allocationRows) {
    const uid = String(row.userId || '');
    if (!uid) continue;
    const list = rowsByUser.get(uid) || [];
    list.push(row);
    rowsByUser.set(uid, list);
  }

  const asOfMs = toDayMs(new Date());

  const items = unionUserIds.map((userId) => {
    const hasPriorRole = priorRoleUserIds.includes(userId);
    const rows = rowsByUser.get(userId) || [];
    const flat = flattenSegments(rows);
    const allocatedPct = allocatedPctOnDay(flat, asOfMs);
    const availablePct = availablePctOnDay(flat, asOfMs);
    const allocationStatus = computeAllocationStatus(rows);
    const availability =
      allocationStatus === 'overallocated'
        ? 'overallocated'
        : classifyAvailability(allocatedPct);

    const profile = profileByUserId.get(userId);
    const jobTitle = profile?.jobTitle || '';
    const positionMatch = scorePositionMatch({
      jobTitle,
      projectRoleKey: targetRoleKey,
      enabledPositionKeys,
    });

    const capabilityMatch = scoreVerifiedCapability({
      verifiedCapability: profile?.verifiedCapability,
      projectRoleKey: targetRoleKey,
    });

    const performanceMatch = scoreHistoricalPerformance(
      performanceByUserId.get(userId) || null
    );

    const suggestReasons = [];
    if (hasPriorRole) suggestReasons.push('prior_role');
    if (relatedUserIds?.has(userId)) suggestReasons.push('related_department');
    if (availability === 'available') suggestReasons.push('capacity_available');
    if (positionMatch.reason) suggestReasons.push(positionMatch.reason);
    for (const r of capabilityMatch.reasons || []) suggestReasons.push(r);
    for (const r of performanceMatch.reasons || []) suggestReasons.push(r);

    const capacityScore = Math.round(
      availablePct +
        (availability === 'available' ? 25 : availability === 'partial' ? 5 : -50) +
        (hasPriorRole ? 5 : 0) +
        positionMatch.boost +
        capabilityMatch.boost +
        performanceMatch.boost
    );

    return {
      userId,
      displayName: profile?.displayName || userId.slice(-6),
      jobTitle,
      positionKey: positionMatch.matchKey || null,
      priorRoleKeys: hasPriorRole ? [targetRoleKey] : [],
      allocationStatus,
      allocatedPct,
      availablePct,
      availability,
      capabilityBoost: capabilityMatch.boost,
      matchedSkills: capabilityMatch.skillMatch?.matched || [],
      matchedDomains: capabilityMatch.domainMatch?.matched || [],
      performanceBoost: performanceMatch.boost,
      performance: performanceMatch.slim,
      suggestReasons,
      score: capacityScore,
      capacityScore,
    };
  });

  const rank = { available: 0, partial: 1, overallocated: 2 };
  items.sort((a, b) => {
    const ra = rank[a.availability] ?? 9;
    const rb = rank[b.availability] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.score !== b.score) return b.score - a.score;
    return String(a.displayName || a.userId).localeCompare(String(b.displayName || b.userId), 'vi');
  });

  return {
    project: {
      projectId: String(project._id),
      title: project.title,
      projectCode: project.projectCode,
      requiredProjectRoles: Array.isArray(project.requiredProjectRoles) ? project.requiredProjectRoles : [],
      relatedDepartmentIds: relatedDeptIds,
    },
    staffingSummary,
    metric: 'planned_allocation',
    items,
  };
}

module.exports = {
  listMemberCandidates,
};

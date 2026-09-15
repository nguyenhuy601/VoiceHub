const ProjectMembership = require('../models/ProjectMembership');
const ProjectMember = require('../models/ProjectMember');
const ProjectRole = require('../models/ProjectRole');
const Project = require('../models/Project');
const { logger } = require('@enterprise/shared');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { fetchDepartmentRoster } = require('../clients/orgStructure.client');
const { fetchEnabledPositionKeys } = require('../clients/orgMasterData.client');
const { fetchOrganizationMemberships } = require('../clients/orgMemberships.client');
const { fetchProfilesByUserIds } = require('../clients/userProfilesBatch.client');
const { uniqueMemberships, clampPoolLimit } = require('../utils/staffing/orgResourcePoolMerge');
const {
  INTAKE_LEAD_ROLE_KEYS,
  resolveRequestedIntakeRoleKeys,
  parseRoleSuggestOffset,
  sliceRoleSuggestPage,
  parseRoleSuggestFitAvailable,
  filterRoleSuggestFitAvailable,
  rankRoleSuggestCandidate,
  toRoleSuggestPublicItem,
  sortRoleSuggestItems,
} = require('../utils/staffing/rankRoleSuggestCandidates');
const { summarizeProjectRoleStaffing } = require('../utils/project/projectStaffingSummary');
const { scorePositionMatch } = require('../utils/staffing/positionCandidateMatch');
const { scoreVerifiedCapability } = require('../utils/staffing/capabilityMatch');
const {
  flattenSegments,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeAllocationStatus,
  toDayMs,
  filterUsersToRelatedDepartments,
} = require('../utils/staffing/allocationOverlap');
const { fetchTaskWorkspaceScope, canCreateTaskInScope } = require('./taskWorkspaceScope');
const { coalesceJobTitle } = require('../utils/common/jobTitleProfile');
const { loadPerformanceByUserIds } = require('./userPerformance.service');
const { scoreHistoricalPerformance } = require('../utils/staffing/performanceMatch');
const { loadAllocationRowsByUser } = require('./resourceCapacity.service');

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

function emptyRoleSuggestByRole() {
  const byRole = {};
  for (const key of INTAKE_LEAD_ROLE_KEYS) byRole[key] = [];
  return byRole;
}

function emptyHasMoreByRole() {
  const out = {};
  for (const key of INTAKE_LEAD_ROLE_KEYS) out[key] = false;
  return out;
}

function emptyRoleSuggestResult({ limit = 3, offset = 0, total = 0 } = {}) {
  return {
    byRole: emptyRoleSuggestByRole(),
    paging: {
      limit,
      offset,
      total,
      hasMoreByRole: emptyHasMoreByRole(),
    },
  };
}

function identityFromProfile(profile, userId) {
  const p = profile || {};
  const displayName =
    p.displayName ||
    p.fullName ||
    p.username ||
    (p.email ? String(p.email).split('@')[0] : '') ||
    String(userId).slice(-6);
  const jobTitle = coalesceJobTitle(p);
  const cap = p.capability;
  const verifiedCapability =
    cap && String(cap.verificationStatus || '') === 'verified' ? cap : null;
  return { displayName, jobTitle, verifiedCapability };
}

async function assertCanSuggestIntakeRoles(actorUserId, organizationId) {
  const scope = await fetchTaskWorkspaceScope(actorUserId, organizationId);
  if (!scope) {
    const err = new Error('Không có quyền truy cập tổ chức');
    err.statusCode = 403;
    throw err;
  }
  if (!canCreateTaskInScope(scope)) {
    const err = new Error('Bạn không có quyền tạo dự án');
    err.statusCode = 403;
    err.errorCode = 'PROJECT_CREATE_FORBIDDEN';
    throw err;
  }
  return scope;
}

/**
 * Org-wide ranked candidates for wizard intake (PO / PM / BA).
 * Auth: org member + canCreateTask — not org-wide capacity admin.
 */
async function listOrgRoleSuggestCandidates({
  organizationId,
  actorUserId,
  projectRoleKeys,
  limit,
  offset,
  fitAvailable,
} = {}) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const requestedKeys = resolveRequestedIntakeRoleKeys(projectRoleKeys);
  if (!requestedKeys) {
    const err = new Error(
      'projectRoleKeys phải là 1–3 vai trò intake: product_owner, project_manager, business_analyst'
    );
    err.statusCode = 400;
    err.errorCode = 'VALIDATION_REQUIRED';
    throw err;
  }

  const pageOffset = parseRoleSuggestOffset(offset);
  const pageLimit = clampPoolLimit(limit, { defaultLimit: 3, maxLimit: 50 });
  const onlyFitAvailable = parseRoleSuggestFitAvailable(fitAvailable, false);

  await assertCanSuggestIntakeRoles(actorUserId, orgId);

  let membershipsRaw = [];
  try {
    membershipsRaw = await fetchOrganizationMemberships(orgId, actorUserId);
  } catch (err) {
    logger.warn('[roleSuggest] memberships S2S failed: %s', err?.message || err);
    return emptyRoleSuggestResult({ limit: pageLimit, offset: pageOffset, total: 0 });
  }

  const memberships = uniqueMemberships(membershipsRaw);
  if (!memberships.length) {
    logger.warn('[roleSuggest] memberships empty org=%s', orgId);
    return emptyRoleSuggestResult({ limit: pageLimit, offset: pageOffset, total: 0 });
  }

  const userIds = memberships.map((m) => m.userId);

  let profileMap = new Map();
  try {
    profileMap = await fetchProfilesByUserIds(userIds);
  } catch (err) {
    logger.warn('[roleSuggest] profiles S2S failed: %s', err?.message || err);
    return emptyRoleSuggestResult({ limit: pageLimit, offset: pageOffset, total: 0 });
  }

  const [enabledPositionKeys, roleDocs] = await Promise.all([
    fetchEnabledPositionKeys(orgId).catch(() => null),
    ProjectRole.find({ organizationId: orgId, key: { $in: [...INTAKE_LEAD_ROLE_KEYS] } })
      .select('_id key')
      .lean(),
  ]);

  const roleIdToKey = new Map();
  for (const doc of roleDocs || []) {
    const key = String(doc.key || '').trim().toLowerCase();
    if (key) roleIdToKey.set(String(doc._id), key);
  }
  const roleIds = [...roleIdToKey.keys()];

  let priorRows = [];
  if (roleIds.length) {
    priorRows = await ProjectMembership.find({
      organizationId: orgId,
      projectRoleId: { $in: roleIds },
    })
      .select('userId projectRoleId')
      .lean();
  }

  const priorKeysByUser = new Map();
  for (const row of priorRows) {
    const uid = String(row.userId || '').trim();
    const roleKey = roleIdToKey.get(String(row.projectRoleId || ''));
    if (!uid || !roleKey) continue;
    const set = priorKeysByUser.get(uid) || new Set();
    set.add(roleKey);
    priorKeysByUser.set(uid, set);
  }

  const asOfMs = toDayMs(new Date());
  const rowsByUser = await loadAllocationRowsByUser({
    organizationId: orgId,
    userIds,
  }).catch((err) => {
    logger.warn('[roleSuggest] allocation load failed: %s', err?.message || err);
    return new Map();
  });

  const loadByUser = new Map();
  for (const uid of userIds) {
    const rows = rowsByUser.get(uid) || [];
    const allocatedPct = allocatedPctOnDay(flattenSegments(rows), asOfMs);
    const allocationStatus = computeAllocationStatus(rows);
    const availability =
      allocationStatus === 'overallocated'
        ? 'overallocated'
        : classifyAvailability(allocatedPct);
    loadByUser.set(uid, { allocatedPct, availability });
  }

  const requested = new Set(requestedKeys);
  const byRole = emptyRoleSuggestByRole();
  const hasMoreByRole = emptyHasMoreByRole();
  let total = memberships.length;

  for (const roleKey of requestedKeys) {
    const ranked = memberships.map((m) => {
      const uid = m.userId;
      const identity = identityFromProfile(profileMap.get(uid), uid);
      const priorSet = priorKeysByUser.get(uid);
      const load = loadByUser.get(uid) || { allocatedPct: 0, availability: 'available' };
      const scored = rankRoleSuggestCandidate(
        {
          userId: uid,
          displayName: identity.displayName,
          jobTitle: identity.jobTitle,
          verifiedCapability: identity.verifiedCapability,
          hasPriorRole: Boolean(priorSet && priorSet.has(roleKey)),
        },
        { projectRoleKey: roleKey, enabledPositionKeys }
      );
      return toRoleSuggestPublicItem({
        ...scored,
        allocatedPct: load.allocatedPct,
        availability: load.availability,
      });
    });
    const sorted = sortRoleSuggestItems(ranked);
    const pool = onlyFitAvailable ? filterRoleSuggestFitAvailable(sorted) : sorted;
    const page = sliceRoleSuggestPage(pool, {
      offset: pageOffset,
      limit: pageLimit,
    });
    byRole[roleKey] = page.items;
    hasMoreByRole[roleKey] = page.hasMore;
    total = page.total;
  }

  for (const key of INTAKE_LEAD_ROLE_KEYS) {
    if (!requested.has(key)) {
      byRole[key] = [];
      hasMoreByRole[key] = false;
    }
  }

  return {
    byRole,
    paging: {
      limit: pageLimit,
      offset: pageOffset,
      total,
      hasMoreByRole,
    },
  };
}

module.exports = {
  listMemberCandidates,
  listOrgRoleSuggestCandidates,
};

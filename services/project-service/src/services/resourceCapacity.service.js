const mongoose = require('../db');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const { fetchDepartmentRoster } = require('../clients/orgStructure.client');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const {
  toDayMs,
  flattenSegments,
  allocatedPctOnDay,
  availablePctOnDay,
  classifyAvailability,
  computeDepartmentCapacityRow,
  computeAllocationStatus,
} = require('../utils/allocationOverlap');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function isOrgAdminScope(scope) {
  const role = String(scope?.membershipRole || '').toLowerCase();
  return role === 'owner' || role === 'admin';
}

async function assertOrgMember(userId, organizationId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope) {
    const err = new Error('Không có quyền truy cập tổ chức');
    err.statusCode = 403;
    throw err;
  }
  return scope;
}

async function enrichProfiles(userIds = []) {
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const rows = await Promise.all(
    unique.map(async (uid) => {
      let displayName = uid.slice(-6);
      let jobTitle = '';
      try {
        const res = await fetchUserProfileByIdInternal(uid);
        const profile = res?.data?.data ?? res?.data ?? null;
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          profile?.email?.split('@')[0] ||
          displayName;
        jobTitle = String(
          profile?.jobTitle || profile?.preferences?.jobTitle || ''
        ).trim();
      } catch {
        /* optional */
      }
      return { userId: uid, displayName, jobTitle };
    })
  );
  return new Map(rows.map((r) => [r.userId, r]));
}

/**
 * Load active ProjectMember rows for users and group by userId.
 */
async function loadAllocationRowsByUser({ organizationId, userIds }) {
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return new Map();
  const rows = await ProjectMember.find({
    organizationId,
    userId: { $in: ids },
    status: 'active',
  })
    .select('userId projectId allocations allocationStatus')
    .lean();

  const byUser = new Map();
  for (const row of rows) {
    const uid = String(row.userId || '');
    if (!uid) continue;
    const list = byUser.get(uid) || [];
    list.push(row);
    byUser.set(uid, list);
  }
  return byUser;
}

function pctMapForDay(rowsByUser, asOfMs) {
  const out = new Map();
  for (const [uid, rows] of rowsByUser.entries()) {
    const flat = flattenSegments(rows);
    out.set(uid, allocatedPctOnDay(flat, asOfMs));
  }
  return out;
}

/**
 * Department capacity board for an organization.
 */
async function getDepartmentCapacity({
  organizationId,
  departmentIds,
  asOf,
  actorUserId,
} = {}) {
  const orgId = asOid(organizationId);
  if (!orgId) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  await assertOrgMember(actorUserId, orgId);

  const asOfMs = toDayMs(asOf || new Date()) ?? toDayMs(new Date());
  const filterDeptIds = (Array.isArray(departmentIds) ? departmentIds : [])
    .map(asOid)
    .filter(Boolean);

  const departments = await fetchDepartmentRoster(orgId, {
    departmentIds: filterDeptIds,
    actorUserId,
  });

  const allUserIds = [
    ...new Set(departments.flatMap((d) => (d.memberIds || []).map(String))),
  ];
  const rowsByUser = await loadAllocationRowsByUser({
    organizationId: orgId,
    userIds: allUserIds,
  });
  const allocatedPctByUserId = pctMapForDay(rowsByUser, asOfMs);

  const items = departments.map((dep) =>
    computeDepartmentCapacityRow({
      departmentId: dep.departmentId,
      name: dep.name,
      memberUserIds: dep.memberIds,
      allocatedPctByUserId,
    })
  );

  items.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));

  return {
    organizationId: orgId,
    asOf: new Date(asOfMs).toISOString().slice(0, 10),
    approx: true,
    items,
    totals: {
      headcount: items.reduce((s, r) => s + r.headcount, 0),
      allocatedFtePct: Math.round(items.reduce((s, r) => s + r.allocatedFtePct, 0) * 100) / 100,
      availableFtePct: Math.round(items.reduce((s, r) => s + r.availableFtePct, 0) * 100) / 100,
      availablePeople: items.reduce((s, r) => s + r.availablePeople, 0),
      overallocatedPeople: items.reduce((s, r) => s + r.overallocatedPeople, 0),
    },
  };
}

/**
 * Resource planner: users ranked Available → Partial → Overallocated.
 * Scope: project.relatedDepartmentIds or explicit departmentId.
 */
async function getResourcePlanner({
  organizationId,
  projectId,
  departmentId,
  asOf,
  actorUserId,
  includeOverallocated = true,
} = {}) {
  const orgId = asOid(organizationId);
  const pid = asOid(projectId);
  const deptId = asOid(departmentId);
  if (!orgId && !pid) {
    const err = new Error('organizationId hoặc projectId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  let project = null;
  let resolvedOrgId = orgId;
  if (pid) {
    project = await Project.findById(pid).lean();
    if (!project || project.isActive === false) {
      const err = new Error('Project không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    resolvedOrgId = String(project.organizationId);
  }
  if (!resolvedOrgId) {
    const err = new Error('organizationId không hợp lệ');
    err.statusCode = 400;
    throw err;
  }

  const scope = await assertOrgMember(actorUserId, resolvedOrgId);
  const isAdmin = isOrgAdminScope(scope);

  if (pid) {
    const { userCanAdminProject } = require('./project.service');
    const canManage = await userCanAdminProject(actorUserId, project);
    if (!canManage && !isAdmin) {
      const err = new Error('Không có quyền xem Resource Planner');
      err.statusCode = 403;
      throw err;
    }
  }

  const asOfMs = toDayMs(asOf || new Date()) ?? toDayMs(new Date());

  let relatedDeptIds = [];
  if (deptId) {
    relatedDeptIds = [deptId];
  } else if (project) {
    relatedDeptIds = (Array.isArray(project.relatedDepartmentIds)
      ? project.relatedDepartmentIds
      : []
    )
      .map(String)
      .filter(Boolean);
  }

  // Không có related depts + không admin → không liệt kê toàn org (tránh lộ PII).
  if (!relatedDeptIds.length && !isAdmin && !deptId) {
    return {
      organizationId: resolvedOrgId,
      projectId: pid || null,
      relatedDepartmentIds: [],
      asOf: new Date(asOfMs).toISOString().slice(0, 10),
      items: [],
      hint: 'related_departments_empty',
    };
  }

  const departments = await fetchDepartmentRoster(resolvedOrgId, {
    departmentIds: relatedDeptIds.length ? relatedDeptIds : undefined,
    actorUserId,
  });

  // Non-admin + project: chỉ related depts (đã filter ở roster). Admin không filter vẫn thấy hết nếu không truyền related.
  const scopedDepts =
    !isAdmin && relatedDeptIds.length
      ? departments.filter((d) => relatedDeptIds.includes(String(d.departmentId)))
      : relatedDeptIds.length
        ? departments.filter((d) => relatedDeptIds.includes(String(d.departmentId)))
        : departments;

  const deptByUser = new Map();
  for (const dep of scopedDepts) {
    for (const uid of dep.memberIds || []) {
      if (!deptByUser.has(uid)) {
        deptByUser.set(uid, {
          departmentId: dep.departmentId,
          departmentName: dep.name,
        });
      }
    }
  }

  const userIds = [...deptByUser.keys()];
  const rowsByUser = await loadAllocationRowsByUser({
    organizationId: resolvedOrgId,
    userIds,
  });

  let existingMemberIds = new Set();
  if (pid) {
    const existing = await ProjectMember.find({ projectId: pid, status: 'active' })
      .select('userId')
      .lean();
    existingMemberIds = new Set(existing.map((r) => String(r.userId)));
  }

  const profileByUserId = await enrichProfiles(userIds);

  const rank = { available: 0, partial: 1, overallocated: 2 };
  const items = [];
  for (const uid of userIds) {
    const rows = rowsByUser.get(uid) || [];
    const flat = flattenSegments(rows);
    const allocatedPct = allocatedPctOnDay(flat, asOfMs);
    const availablePct = availablePctOnDay(flat, asOfMs);
    const statusFromRows = computeAllocationStatus(rows);
    let availability = classifyAvailability(allocatedPct);
    if (statusFromRows === 'overallocated') availability = 'overallocated';
    if (!includeOverallocated && availability === 'overallocated') continue;

    const place = deptByUser.get(uid) || {};
    items.push({
      userId: uid,
      displayName: profileByUserId.get(uid)?.displayName || uid.slice(-6),
      jobTitle: profileByUserId.get(uid)?.jobTitle || '',
      departmentId: place.departmentId || null,
      departmentName: place.departmentName || null,
      allocatedPct,
      availablePct,
      availability,
      allocationStatus: statusFromRows,
      alreadyMember: existingMemberIds.has(uid),
      projectCount: rows.length,
      capacityScore: Math.round(availablePct + (availability === 'available' ? 20 : 0)),
    });
  }

  items.sort((a, b) => {
    const ra = rank[a.availability] ?? 9;
    const rb = rank[b.availability] ?? 9;
    if (ra !== rb) return ra - rb;
    if (a.availablePct !== b.availablePct) return b.availablePct - a.availablePct;
    return String(a.displayName).localeCompare(String(b.displayName), 'vi');
  });

  return {
    organizationId: resolvedOrgId,
    projectId: pid || null,
    relatedDepartmentIds: relatedDeptIds,
    asOf: new Date(asOfMs).toISOString().slice(0, 10),
    items,
  };
}

/**
 * Multi-project allocation timeline for one user (Members editor / audit).
 */
async function getUserAllocationTimeline({
  organizationId,
  userId,
  actorUserId,
} = {}) {
  const orgId = asOid(organizationId);
  const uid = asOid(userId);
  if (!orgId || !uid) {
    const err = new Error('organizationId và userId là bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  await assertOrgMember(actorUserId, orgId);

  const rows = await ProjectMember.find({
    organizationId: orgId,
    userId: uid,
    status: 'active',
  })
    .select('projectId allocations allocationStatus joinDate leaveDate billable')
    .lean();

  const projectIds = rows.map((r) => r.projectId).filter(Boolean);
  const projects = projectIds.length
    ? await Project.find({ _id: { $in: projectIds } })
        .select('title projectCode isActive')
        .lean()
    : [];
  const projectById = new Map(projects.map((p) => [String(p._id), p]));

  const asOfMs = toDayMs(new Date());
  const flat = flattenSegments(rows);
  const allocatedPct = allocatedPctOnDay(flat, asOfMs);

  return {
    userId: uid,
    organizationId: orgId,
    asOf: new Date(asOfMs).toISOString().slice(0, 10),
    allocatedPct,
    availablePct: Math.max(0, 100 - allocatedPct),
    allocationStatus: computeAllocationStatus(rows),
    projects: rows.map((r) => {
      const p = projectById.get(String(r.projectId)) || {};
      return {
        projectId: String(r.projectId),
        title: p.title || '',
        projectCode: p.projectCode || '',
        allocations: r.allocations || [],
        allocationStatus: r.allocationStatus || 'ok',
        billable: Boolean(r.billable),
        joinDate: r.joinDate || null,
        leaveDate: r.leaveDate || null,
      };
    }),
  };
}

module.exports = {
  getDepartmentCapacity,
  getResourcePlanner,
  getUserAllocationTimeline,
  computeDepartmentCapacityRow,
  allocatedPctOnDay,
  classifyAvailability,
  filterUsersToRelatedDepartments: require('../utils/allocationOverlap').filterUsersToRelatedDepartments,
};

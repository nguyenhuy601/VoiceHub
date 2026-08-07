const ProjectRole = require('../models/ProjectRole');
const ProjectMembership = require('../models/ProjectMembership');
const TaskBoardMember = require('../models/TaskBoardMember');
const TaskBoard = require('../models/TaskBoard');
const Project = require('../models/Project');
const { DEFAULT_PROJECT_ROLES } = require('../config/projectRoleDefaults');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const {
  isMasterDataV1Enabled,
  isMasterDataCatalogSyncEnabled,
  resolveCanonicalProjectRoleKey,
} = require('@enterprise/shared/config/masterData');
const { fetchEnabledProjectRoleKeys } = require('../clients/orgMasterData.client');
const { assertResolvedProjectRoleKeys } = require('../utils/assertResolvedProjectRoleKeys');

const LEGACY_TO_PROJECT_ROLE = Object.freeze({
  owner: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  editor: DEFAULT_PROJECT_ROLE_KEYS.BACKEND_DEVELOPER,
  watcher: DEFAULT_PROJECT_ROLE_KEYS.OBSERVER,
  viewer: DEFAULT_PROJECT_ROLE_KEYS.OBSERVER,
});

async function ensureOrgProjectRoles(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) throw new Error('organizationId bắt buộc');

  const enabledKeys = isMasterDataV1Enabled()
    ? await fetchEnabledProjectRoleKeys(oid)
    : null;
  const enabledSet = enabledKeys ? new Set(enabledKeys.map(String)) : null;
  const syncOn = !isMasterDataV1Enabled() || isMasterDataCatalogSyncEnabled();
  const roleDefs = DEFAULT_PROJECT_ROLES.filter(
    (def) => !enabledSet || enabledSet.has(def.key)
  );

  const byKey = new Map();
  if (syncOn) {
    for (const def of roleDefs) {
      let row = await ProjectRole.findOneAndUpdate(
        { organizationId: oid, key: def.key },
        {
          $set: {
            label: def.label,
            isSystem: true,
          },
          $setOnInsert: {
            organizationId: oid,
            key: def.key,
            canAssign: def.canAssign,
            sortOrder: def.sortOrder,
            permissions: def.permissions || [],
          },
        },
        { upsert: true, new: true }
      ).lean();

      if (!Array.isArray(row?.permissions) || row.permissions.length === 0) {
        row = await ProjectRole.findOneAndUpdate(
          { _id: row._id },
          { $set: { permissions: def.permissions || [] } },
          { new: true }
        ).lean();
      }
      byKey.set(def.key, row);
    }
  } else if (enabledSet) {
    const existing = await ProjectRole.find({
      organizationId: oid,
      key: { $in: [...enabledSet] },
    }).lean();
    for (const row of existing) byKey.set(row.key, row);
  }

  if (isMasterDataV1Enabled()) {
    const listed = [...byKey.values()].map((r) => ({
      ...r,
      enabled: true,
      legacyOutsideMaster: false,
    }));
    const extras = await ProjectRole.find({
      organizationId: oid,
      key: { $nin: [...byKey.keys()] },
      isSystem: { $ne: true },
    }).lean();
    for (const row of extras) {
      listed.push({ ...row, enabled: false, legacyOutsideMaster: true });
    }
    return listed.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }

  const extras = await ProjectRole.find({
    organizationId: oid,
    key: { $nin: DEFAULT_PROJECT_ROLES.map((d) => d.key) },
  }).lean();
  for (const row of extras) byKey.set(row.key, row);
  return [...byKey.values()].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

async function getRoleByKey(organizationId, key) {
  await ensureOrgProjectRoles(organizationId);
  return ProjectRole.findOne({ organizationId, key: String(key) }).lean();
}

/**
 * Resolve projectId from board (greenfield: board.projectId required).
 */
async function resolveProjectContext(boardId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board) throw new Error('Board không tồn tại');
  const projectId = board.projectId ? String(board.projectId) : '';
  if (!projectId) throw new Error('Board thiếu projectId — tạo lại dự án qua POST /api/projects');
  return { board, projectId, organizationId: board.organizationId };
}

/**
 * Migrate TaskBoardMember → ProjectMembership (idempotent).
 */
async function migrateBoardMembersToProjectRoles(boardId, actorId) {
  const { board, projectId } = await resolveProjectContext(boardId);
  await ensureOrgProjectRoles(board.organizationId);
  const roles = await ProjectRole.find({ organizationId: board.organizationId }).lean();
  const roleByKey = new Map(roles.map((r) => [r.key, r]));

  const members = await TaskBoardMember.find({ boardId }).lean();
  let upserted = 0;
  for (const m of members) {
    const key = LEGACY_TO_PROJECT_ROLE[m.role] || DEFAULT_PROJECT_ROLE_KEYS.WATCHER;
    const role = roleByKey.get(key);
    if (!role) continue;
    // boardId chỉ trong $set — MongoDB conflict nếu cùng path ở $set + $setOnInsert
    const res = await ProjectMembership.updateOne(
      {
        projectId,
        userId: m.userId,
        projectRoleId: role._id,
      },
      {
        $setOnInsert: {
          organizationId: board.organizationId,
          projectId,
          userId: m.userId,
          projectRoleId: role._id,
          legacyBoardRole: m.role || null,
          addedBy: actorId || m.addedBy || m.userId,
        },
        $set: { boardId },
      },
      { upsert: true }
    );
    if (res.upsertedCount) upserted += 1;
  }
  return { migrated: upserted, totalMembers: members.length };
}

async function ensureProjectMembership({
  projectId,
  boardId,
  userId,
  projectRoleKey,
  addedBy,
  organizationId,
}) {
  let orgId = organizationId;
  let pid = projectId ? String(projectId) : '';
  let bid = boardId || null;

  if (!pid && boardId) {
    const ctx = await resolveProjectContext(boardId);
    pid = ctx.projectId;
    orgId = ctx.organizationId;
    bid = boardId;
  }
  if (!pid) throw new Error('projectId bắt buộc');
  if (!orgId) {
    const project = await Project.findById(pid).lean();
    if (!project) throw new Error('Project không tồn tại');
    orgId = project.organizationId;
  }

  const role = await getRoleByKey(orgId, projectRoleKey);
  if (!role) throw new Error(`Project Role không tồn tại: ${projectRoleKey}`);
  // boardId chỉ một operator — tránh conflict $set + $setOnInsert cùng path
  const row = await ProjectMembership.findOneAndUpdate(
    { projectId: pid, userId, projectRoleId: role._id },
    {
      $setOnInsert: {
        organizationId: orgId,
        projectId: pid,
        userId,
        projectRoleId: role._id,
        addedBy: addedBy || userId,
        ...(!bid ? { boardId: null } : {}),
      },
      ...(bid ? { $set: { boardId: bid } } : {}),
    },
    { upsert: true, new: true }
  ).lean();
  return row;
}

/**
 * Hydrate displayName/avatar cho roster — tránh FE hiện 6 ký tự ObjectId.
 */
async function enrichMembershipUserLabels(userIds = []) {
  const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
  const unique = [...new Set((userIds || []).map(String).filter(Boolean))];
  const entries = await Promise.all(
    unique.map(async (uid) => {
      let displayName = uid.slice(-6);
      let avatar = null;
      let email = '';
      let username = null;
      try {
        const res = await fetchUserProfileByIdInternal(uid);
        const profile = res?.data?.data ?? res?.data ?? null;
        displayName =
          profile?.displayName ||
          profile?.fullName ||
          profile?.username ||
          (profile?.email ? String(profile.email).split('@')[0] : '') ||
          displayName;
        avatar = profile?.avatar || null;
        email = String(profile?.email || '').trim();
        username = profile?.username || null;
      } catch {
        /* optional — giữ fallback mã ngắn */
      }
      return [uid, { displayName, avatar, email, username }];
    })
  );
  return new Map(entries);
}

async function listProjectMemberships(projectOrBoardId) {
  let projectId = String(projectOrBoardId || '').trim();
  const asProject = await Project.findById(projectId).select('_id').lean();
  if (!asProject) {
    const ctx = await resolveProjectContext(projectId);
    projectId = ctx.projectId;
  }
  const rows = await ProjectMembership.find({ projectId }).lean();
  const roleIds = [...new Set(rows.map((r) => String(r.projectRoleId)))];
  const roles = await ProjectRole.find({ _id: { $in: roleIds } }).lean();
  const roleMap = new Map(roles.map((r) => [String(r._id), r]));
  const { mapProjectMembersByUser } = require('./projectMember.service');
  const resourceByUser = await mapProjectMembersByUser(projectId);
  const profileByUser = await enrichMembershipUserLabels(rows.map((r) => r.userId));
  return rows.map((r) => {
    const resource = resourceByUser.get(String(r.userId)) || null;
    const profile = profileByUser.get(String(r.userId)) || null;
    return {
      ...r,
      displayName: profile?.displayName || undefined,
      avatar: profile?.avatar || undefined,
      email: profile?.email || undefined,
      username: profile?.username || undefined,
      user: profile
        ? {
            _id: String(r.userId),
            id: String(r.userId),
            displayName: profile.displayName,
            avatar: profile.avatar,
            email: profile.email,
            username: profile.username,
          }
        : undefined,
      projectRole: roleMap.get(String(r.projectRoleId)) || null,
      resource: resource
        ? {
            status: resource.status,
            billable: resource.billable,
            joinDate: resource.joinDate,
            leaveDate: resource.leaveDate,
            allocations: resource.allocations || [],
            allocationStatus: resource.allocationStatus || 'ok',
          }
        : null,
      allocations: resource?.allocations || [],
      allocationStatus: resource?.allocationStatus || 'ok',
      joinDate: resource?.joinDate || null,
      leaveDate: resource?.leaveDate || null,
      billable: resource?.billable ?? false,
      memberStatus: resource?.status || null,
    };
  });
}

async function listUserProjectRolesOnBoard(boardId, userId) {
  const { projectId } = await resolveProjectContext(boardId);
  const rows = await ProjectMembership.find({ projectId, userId }).lean();
  if (!rows.length) return [];
  const roles = await ProjectRole.find({
    _id: { $in: rows.map((r) => r.projectRoleId) },
  }).lean();
  return roles;
}

async function listUserProjectRolesOnProject(projectId, userId) {
  const rows = await ProjectMembership.find({ projectId, userId }).lean();
  if (!rows.length) return [];
  const roles = await ProjectRole.find({
    _id: { $in: rows.map((r) => r.projectRoleId) },
  }).lean();
  return roles;
}

/**
 * Dual-write board ACL when assigning Project Roles.
 */
async function ensureBoardMemberAcl({ boardId, userId, boardRole = 'editor', addedBy }) {
  const uid = String(userId || '').trim();
  const bid = String(boardId || '').trim();
  if (!uid || !bid) return null;

  let role = String(boardRole || 'editor').trim().toLowerCase();
  if (!['owner', 'editor', 'viewer'].includes(role)) role = 'editor';
  if (role === 'owner') role = 'editor';

  const canEdit = role !== 'viewer';
  const existing = await TaskBoardMember.findOne({ boardId: bid, userId: uid }).lean();
  if (existing) {
    if (existing.role === 'owner') return existing;
    const nextRole =
      existing.role === 'editor' || role === 'editor' ? 'editor' : role === 'viewer' ? 'viewer' : 'editor';
    const nextCanEdit = nextRole !== 'viewer';
    if (existing.role === nextRole && Boolean(existing.canEdit) === nextCanEdit && existing.canView) {
      return existing;
    }
    return TaskBoardMember.findOneAndUpdate(
      { boardId: bid, userId: uid },
      {
        $set: {
          role: nextRole,
          canView: true,
          canEdit: nextCanEdit,
        },
      },
      { new: true }
    ).lean();
  }

  return TaskBoardMember.findOneAndUpdate(
    { boardId: bid, userId: uid },
    {
      $set: {
        role,
        canView: true,
        canEdit,
      },
      $setOnInsert: {
        boardId: bid,
        userId: uid,
        addedBy: addedBy || uid,
      },
    },
    { upsert: true, new: true }
  ).lean();
}

async function setUserProjectRoles({
  projectId,
  boardId,
  userId,
  projectRoleKeys,
  addedBy,
  boardRole,
  allocations,
  joinDate,
  leaveDate,
  billable,
  status,
}) {
  let pid = projectId ? String(projectId) : '';
  let board = null;
  let orgId = null;
  let aclBoardId = boardId || null;

  if (boardId) {
    const ctx = await resolveProjectContext(boardId);
    board = ctx.board;
    pid = ctx.projectId;
    orgId = ctx.organizationId;
    aclBoardId = boardId;
  } else if (pid) {
    const project = await Project.findById(pid).lean();
    if (!project) throw new Error('Project không tồn tại');
    orgId = project.organizationId;
    if (!aclBoardId) {
      const main = await TaskBoard.findOne({ projectId: pid, isActive: true }).sort({ createdAt: 1 }).lean();
      aclBoardId = main?._id || null;
    }
  } else {
    throw new Error('projectId hoặc boardId bắt buộc');
  }

  const actorId = String(addedBy || '').trim();
  if (actorId) {
    const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
    if (isProjectRbacV2Enabled()) {
      const { resolveUserProjectPermissions } = require('./projectAccess.service');
      const resolved = await resolveUserProjectPermissions({
        userId: actorId,
        projectId: pid,
        boardId: aclBoardId,
      });
      if (
        !hasPermission(resolved.permissions, 'members:manage') &&
        !resolved.isOrgAdmin &&
        !resolved.isCreator
      ) {
        const err = new Error('Không có quyền gán Project Roles (members:manage)');
        err.statusCode = 403;
        throw err;
      }
    }
  }

  await ensureOrgProjectRoles(orgId);
  const keys = [...new Set((projectRoleKeys || []).map((k) => String(k).trim()).filter(Boolean))];
  if (isMasterDataV1Enabled()) {
    const enabled = await fetchEnabledProjectRoleKeys(orgId);
    const enabledSet = new Set((enabled || []).map(String));
    for (const k of keys) {
      const canonical = resolveCanonicalProjectRoleKey(k);
      if (!enabledSet.has(k) && !enabledSet.has(canonical)) {
        const err = new Error(`Project role chưa được bật trong Master Data: ${k}`);
        err.statusCode = 400;
        err.errorCode = 'MASTER_DATA_PROJECT_ROLE_DISABLED';
        throw err;
      }
    }
  }
  const beforeRoles = pid
    ? await listUserProjectRolesOnProject(pid, userId)
    : [];
  const beforeKeys = (beforeRoles || [])
    .map((r) => String(r.key || r.roleKey || '').trim())
    .filter(Boolean)
    .sort();
  const roles = await ProjectRole.find({
    organizationId: orgId,
    key: { $in: keys.map((k) => resolveCanonicalProjectRoleKey(k) || k) },
  }).lean();
  assertResolvedProjectRoleKeys(keys, roles);
  const roleIds = new Set(roles.map((r) => String(r._id)));

  await ProjectMembership.deleteMany({
    projectId: pid,
    userId,
    projectRoleId: { $nin: [...roleIds] },
  });

  for (const role of roles) {
    await ProjectMembership.updateOne(
      { projectId: pid, userId, projectRoleId: role._id },
      {
        $setOnInsert: {
          organizationId: orgId,
          projectId: pid,
          userId,
          projectRoleId: role._id,
          addedBy: addedBy || userId,
          ...(!aclBoardId ? { boardId: null } : {}),
        },
        ...(aclBoardId ? { $set: { boardId: aclBoardId } } : {}),
      },
      { upsert: true }
    );
  }

  if (keys.length && aclBoardId) {
    const { inferBoardRoleFromProjectKeys } = require('../utils/createBoardSeed');
    const aclRole = boardRole || inferBoardRoleFromProjectKeys(keys);
    await ensureBoardMemberAcl({
      boardId: aclBoardId,
      userId,
      boardRole: aclRole,
      addedBy: addedBy || userId,
    });
  }

  const {
    hasAllocationPayload,
    upsertProjectMemberAllocation,
  } = require('./projectMember.service');
  let resource = null;
  const allocationBody = { allocations, joinDate, leaveDate, billable, status };
  if (hasAllocationPayload(allocationBody) || keys.length) {
    // Khi chỉ add role (không gửi allocations), vẫn tạo ProjectMember active tối thiểu.
    const body = hasAllocationPayload(allocationBody)
      ? allocationBody
      : { status: 'active', joinDate: new Date() };
    resource = await upsertProjectMemberAllocation({
      organizationId: orgId,
      projectId: pid,
      userId,
      body,
      updatedBy: addedBy || userId,
    });
  }

  const roleRows = boardId
    ? await listUserProjectRolesOnBoard(boardId, userId)
    : await listUserProjectRolesOnProject(pid, userId);

  try {
    const auditService = require('./audit.service');
    const afterKeys = (roleRows || [])
      .map((r) => String(r.key || r.roleKey || '').trim())
      .filter(Boolean)
      .sort();
    await auditService.recordAudit({
      organizationId: orgId,
      actorUserId: addedBy || userId,
      action: 'project.members.roles_updated',
      resourceType: 'project_member',
      resourceId: `${pid}:${userId}`,
      before: { projectRoleKeys: beforeKeys },
      after: { projectRoleKeys: afterKeys },
      meta: { projectId: String(pid), memberUserId: String(userId) },
    });
  } catch {
    /* best-effort */
  }

  return {
    roles: roleRows,
    resource,
    allocationStatus: resource?.allocationStatus || 'ok',
  };
}

async function ensurePmMembershipFromBrief({ boardId, projectId, pmUserId, addedBy }) {
  if (!pmUserId) return null;
  return ensureProjectMembership({
    boardId,
    projectId,
    userId: pmUserId,
    projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
    addedBy,
  });
}

module.exports = {
  ensureOrgProjectRoles,
  getRoleByKey,
  resolveProjectContext,
  migrateBoardMembersToProjectRoles,
  ensureProjectMembership,
  ensureBoardMemberAcl,
  listProjectMemberships,
  listUserProjectRolesOnBoard,
  listUserProjectRolesOnProject,
  setUserProjectRoles,
  ensurePmMembershipFromBrief,
  LEGACY_TO_PROJECT_ROLE,
};

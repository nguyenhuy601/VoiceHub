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
const { assertResolvedProjectRoleKeys } = require('../utils/project/assertResolvedProjectRoleKeys');
const { enrichMembershipUserLabels } = require('../utils/common/userProfileLabels');
const { createTtlCoalesceCache } = require('../utils/ttlCoalesceCache');

const LEGACY_TO_PROJECT_ROLE = Object.freeze({
  owner: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  editor: DEFAULT_PROJECT_ROLE_KEYS.BACKEND_DEVELOPER,
  watcher: DEFAULT_PROJECT_ROLE_KEYS.OBSERVER,
  viewer: DEFAULT_PROJECT_ROLE_KEYS.OBSERVER,
});

const PROJECT_ROLES_LIST_TTL_MS = 15_000;
const projectRolesListCache = createTtlCoalesceCache({ ttlMs: PROJECT_ROLES_LIST_TTL_MS });
const projectRolesEnsureCache = createTtlCoalesceCache({ ttlMs: PROJECT_ROLES_LIST_TTL_MS });

let projectRoleIndexesSynced = false;

/** Drop legacy unique (organizationId,key) and apply partial indexes for org vs project scopes. */
async function ensureProjectRoleIndexes() {
  if (projectRoleIndexesSynced) return;
  projectRoleIndexesSynced = true;
  try {
    await ProjectRole.syncIndexes();
  } catch (err) {
    projectRoleIndexesSynced = false;
    const { logger } = require('@enterprise/shared');
    logger.warn('[projectRole] syncIndexes failed: %s', err.message);
  }
}

function orgDefaultFilter(organizationId, extra = {}) {
  return { organizationId, projectId: null, ...extra };
}

function invalidateProjectRolesListCache(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return;
  projectRolesListCache.deleteKey(pid);
  projectRolesEnsureCache.deleteKey(pid);
}

async function ensureOrgProjectRoles(organizationId) {
  const oid = String(organizationId || '').trim();
  if (!oid) throw new Error('organizationId bắt buộc');
  await ensureProjectRoleIndexes();

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
        orgDefaultFilter(oid, { key: def.key }),
        {
          $set: {
            label: def.label,
            isSystem: true,
            projectId: null,
          },
          $setOnInsert: {
            organizationId: oid,
            projectId: null,
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
    const existing = await ProjectRole.find(
      orgDefaultFilter(oid, { key: { $in: [...enabledSet] } })
    ).lean();
    for (const row of existing) byKey.set(row.key, row);
  }

  if (isMasterDataV1Enabled()) {
    const listed = [...byKey.values()].map((r) => ({
      ...r,
      enabled: true,
      legacyOutsideMaster: false,
    }));
    const extras = await ProjectRole.find({
      ...orgDefaultFilter(oid),
      key: { $nin: [...byKey.keys()] },
      isSystem: { $ne: true },
    }).lean();
    for (const row of extras) {
      listed.push({ ...row, enabled: false, legacyOutsideMaster: true });
    }
    return listed.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }

  const extras = await ProjectRole.find({
    ...orgDefaultFilter(oid),
    key: { $nin: DEFAULT_PROJECT_ROLES.map((d) => d.key) },
  }).lean();
  for (const row of extras) byKey.set(row.key, row);
  return [...byKey.values()].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

async function getRoleByKey(organizationId, key) {
  await ensureOrgProjectRoles(organizationId);
  const canonical = resolveCanonicalProjectRoleKey(key) || String(key);
  return ProjectRole.findOne(orgDefaultFilter(organizationId, { key: canonical })).lean();
}

/**
 * Remap ProjectMembership rows that still point at org-default role ids → project-scoped ids.
 */
async function remapMembershipsToProjectRoles(projectId, organizationId, projectRoles) {
  const pid = String(projectId || '').trim();
  const oid = String(organizationId || '').trim();
  if (!pid || !oid || !Array.isArray(projectRoles) || !projectRoles.length) return { remapped: 0 };

  const orgDefaults = await ProjectRole.find(orgDefaultFilter(oid)).select('_id key').lean();
  const orgKeyById = new Map(orgDefaults.map((r) => [String(r._id), r.key]));
  const projectByKey = new Map(projectRoles.map((r) => [String(r.key), r]));
  const projectIdSet = new Set(projectRoles.map((r) => String(r._id)));

  const memberships = await ProjectMembership.find({ projectId: pid }).lean();
  let remapped = 0;
  for (const m of memberships) {
    const currentId = String(m.projectRoleId || '');
    if (!currentId || projectIdSet.has(currentId)) continue;
    const key = orgKeyById.get(currentId);
    if (!key) continue;
    const target = projectByKey.get(key);
    if (!target) continue;

    const existing = await ProjectMembership.findOne({
      projectId: pid,
      userId: m.userId,
      projectRoleId: target._id,
    })
      .select('_id')
      .lean();
    if (existing) {
      await ProjectMembership.deleteOne({ _id: m._id });
    } else {
      await ProjectMembership.updateOne({ _id: m._id }, { $set: { projectRoleId: target._id } });
    }
    remapped += 1;
  }
  return { remapped };
}

/**
 * Clone org default ProjectRoles into a project-scoped catalog (idempotent).
 * Does not overwrite permissions on existing project rows.
 */
async function cloneOrgRolesToProject(projectId, organizationId) {
  const pid = String(projectId || '').trim();
  let oid = String(organizationId || '').trim();
  if (!pid) throw new Error('projectId bắt buộc');
  await ensureProjectRoleIndexes();
  if (!oid) {
    const project = await Project.findById(pid).select('organizationId').lean();
    if (!project) throw new Error('Project không tồn tại');
    oid = String(project.organizationId);
  }

  const orgRoles = await ensureOrgProjectRoles(oid);
  const cloned = [];
  for (const def of orgRoles) {
    if (def.enabled === false) continue;
    const key = String(def.key || '').trim();
    if (!key) continue;

    let row = await ProjectRole.findOne({ projectId: pid, key }).lean();
    if (!row) {
      row = await ProjectRole.findOneAndUpdate(
        { projectId: pid, key },
        {
          $setOnInsert: {
            organizationId: oid,
            projectId: pid,
            key,
            label: def.label,
            canAssign: Boolean(def.canAssign),
            permissions: Array.isArray(def.permissions) ? [...def.permissions] : [],
            isSystem: Boolean(def.isSystem),
            sortOrder: Number(def.sortOrder) || 100,
          },
        },
        { upsert: true, new: true }
      ).lean();
    }
    cloned.push(row);
  }

  await remapMembershipsToProjectRoles(pid, oid, cloned);
  invalidateProjectRolesListCache(pid);
  return cloned.sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
}

/**
 * Ensure project has cloned roles; coalesce + short TTL to avoid N+1 on Hub/resolve.
 */
async function ensureProjectRolesCloned(projectId, organizationId) {
  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId bắt buộc');

  return projectRolesEnsureCache.getOrLoad(pid, async () => {
    const existing = await ProjectRole.find({ projectId: pid }).select('_id').limit(1).lean();
    if (existing.length) {
      const list = await ProjectRole.find({ projectId: pid })
        .sort({ sortOrder: 1 })
        .lean();
      let oid = String(organizationId || '').trim();
      if (!oid) {
        const project = await Project.findById(pid).select('organizationId').lean();
        oid = String(project?.organizationId || '');
      }
      if (oid) await remapMembershipsToProjectRoles(pid, oid, list);
      return list;
    }
    return cloneOrgRolesToProject(pid, organizationId);
  });
}

async function listProjectRolesCached(projectId, organizationId) {
  const pid = String(projectId || '').trim();
  if (!pid) throw new Error('projectId bắt buộc');
  return projectRolesListCache.getOrLoad(pid, async () => {
    await ensureProjectRolesCloned(pid, organizationId);
    return ProjectRole.find({ projectId: pid }).sort({ sortOrder: 1 }).lean();
  });
}

async function getProjectRoleByKey(projectId, key, organizationId) {
  const pid = String(projectId || '').trim();
  const canonical = resolveCanonicalProjectRoleKey(key) || String(key || '').trim();
  if (!pid || !canonical) return null;
  await ensureProjectRolesCloned(pid, organizationId);
  return ProjectRole.findOne({ projectId: pid, key: canonical }).lean();
}

/**
 * Ensure a single project role exists (clone one key from org default if missing).
 */
async function ensureProjectRoleKey(projectId, organizationId, roleKey) {
  const pid = String(projectId || '').trim();
  const oid = String(organizationId || '').trim();
  const canonical = resolveCanonicalProjectRoleKey(roleKey) || String(roleKey || '').trim();
  if (!pid || !canonical) return null;

  let row = await ProjectRole.findOne({ projectId: pid, key: canonical }).lean();
  if (row) return row;

  const orgRole = await getRoleByKey(oid, canonical);
  if (!orgRole) return null;

  row = await ProjectRole.findOneAndUpdate(
    { projectId: pid, key: canonical },
    {
      $setOnInsert: {
        organizationId: oid,
        projectId: pid,
        key: canonical,
        label: orgRole.label,
        canAssign: Boolean(orgRole.canAssign),
        permissions: Array.isArray(orgRole.permissions) ? [...orgRole.permissions] : [],
        isSystem: Boolean(orgRole.isSystem),
        sortOrder: Number(orgRole.sortOrder) || 100,
      },
    },
    { upsert: true, new: true }
  ).lean();
  invalidateProjectRolesListCache(pid);
  return row;
}

function _clearProjectRolesCachesForTests() {
  projectRolesListCache.clear();
  projectRolesEnsureCache.clear();
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
  const roles = await ensureProjectRolesCloned(projectId, board.organizationId);
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

  const role = await getProjectRoleByKey(pid, projectRoleKey, orgId);
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
    const { isProjectRbacV2Enabled, hasPermission } = require('../utils/project/projectPermissionMatrix');
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

  await ensureProjectRolesCloned(pid, orgId);
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

  const resolvedKeys = keys.map((k) => resolveCanonicalProjectRoleKey(k) || k);
  const roles = [];
  for (const k of resolvedKeys) {
    const role = await ensureProjectRoleKey(pid, orgId, k);
    if (role) roles.push(role);
  }
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
    const { inferBoardRoleFromProjectKeys } = require('../utils/project/createBoardSeed');
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

  if (!beforeKeys.length && String(userId) !== String(addedBy || userId)) {
    const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
    const titleDoc = await Project.findById(pid).select('title').lean();
    const pname = String(titleDoc?.title || 'dự án').trim() || 'dự án';
    void notifySystemKind({
      userIds: [userId],
      kind: 'project_member_added',
      title: 'Bạn được thêm vào dự án',
      content: `Bạn đã được thêm vào dự án “${pname}”.`,
      data: {
        organizationId: String(orgId || ''),
        projectId: String(pid),
        boardId: aclBoardId ? String(aclBoardId) : '',
      },
      actionUrl: projectHubActionUrl({
        projectId: pid,
        boardId: aclBoardId,
        organizationId: orgId,
      }),
    });
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
  cloneOrgRolesToProject,
  ensureProjectRolesCloned,
  listProjectRolesCached,
  getProjectRoleByKey,
  ensureProjectRoleKey,
  invalidateProjectRolesListCache,
  remapMembershipsToProjectRoles,
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
  _clearProjectRolesCachesForTests,
};

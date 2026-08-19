const axios = require('axios');
const mongoose = require('../db');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const TaskBoardMember = require('../models/TaskBoardMember');
const TaskBoardListWatcher = require('../models/TaskBoardListWatcher');
const Task = require('../models/Task');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const { logger } = require('@enterprise/shared');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const { enrichAssignableProfiles } = require('../utils/userProfileLabels');
const {
  fetchTaskWorkspaceScope,
  canCreateTaskInScope,
  canAssignUser,
} = require('./taskWorkspaceScope');
const { canAssignOwnerTeam, normalizeOwnerTeamId } = require('./ownerTeamId');
const { emitTeamChannelProvisionIfNeeded } = require('../utils/projectTeamChannelProvision');
const { isDoneListTitle, buildBoardCapabilities } = require('./boardCapabilities');
const { assertProjectWritable } = require('../utils/projectCloseGate');
const { assertCanSetCardAssignee } = require('./goldenAssignPolicy');
const {
  assertCanAssign,
  isAssignmentEngineEnabled,
} = require('./assignmentEngine.service');
const {
  ensureOrgProjectRoles,
  ensureProjectMembership,
  setUserProjectRoles,
} = require('./projectTeam.service');
const { applyDelegationTemplate } = require('./delegation.service');
const { syncPrimaryAssignment, normalizeAssignmentsPayload } = require('../utils/taskAssignments');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const {
  isProjectVisibilityV2Enabled,
  resolveProjectAccess,
} = require('../utils/projectVisibility');
const {
  isOrgElevatedMembershipRole,
  memberScopedProjectFilter,
} = require('../utils/projectListMembershipScope');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const {
  isCreateBoardSeedEnabled,
  normalizeDelegationTemplateId,
  normalizeSeedMembers,
} = require('../utils/createBoardSeed');
const {
  buildProjectCodeBase,
  allocateUniqueProjectCode,
} = require('@enterprise/shared/utils/projectCodeGenerate');
const {
  normalizeEstimateHours: normalizeHoursEstimate,
  parseStartDate,
  hoursFieldsTouched,
  assertHoursCapacityOrThrow,
} = require('./hoursCapacityGuard.service');
const { parseIncludeCardsFlag, buildBoardCardMongoFilter } = require('../utils/listLazyQuery');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oidToStr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v._id) return String(v._id);
  return String(v);
}

/** Gắn subtasks[] trên card cha từ cùng list (không N+1). */
function attachSubtasksToSanitizedCards(cards = []) {
  const list = Array.isArray(cards) ? cards : [];
  const byParent = new Map();
  for (const c of list) {
    const pid = oidToStr(c.parentTaskId);
    if (!pid) continue;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid).push({
      _id: oidToStr(c._id),
      title: c.title,
      status: c.status || null,
      listId: oidToStr(c.listId),
      assigneeId: oidToStr(c.assigneeId),
    });
  }
  return list.map((c) => ({
    ...c,
    _id: oidToStr(c._id) || c._id,
    boardId: oidToStr(c.boardId) || c.boardId,
    listId: oidToStr(c.listId) || c.listId,
    parentTaskId: oidToStr(c.parentTaskId),
    epicId: oidToStr(c.epicId),
    featureId: oidToStr(c.featureId),
    projectId: oidToStr(c.projectId) || c.projectId,
    sprintId: oidToStr(c.sprintId),
    subtasks: byParent.get(String(oidToStr(c._id) || c._id || '')) || [],
  }));
}

/**
 * Đảm bảo projectCode unique trong org (base, rồi base-2, …).
 * @param {string} organizationId
 * @param {string} preferred
 * @returns {Promise<string>}
 */
async function ensureUniqueProjectCode(organizationId, preferred) {
  const base = String(preferred || '').trim().slice(0, 64);
  if (!base) return base;
  const rows = await TaskBoard.find({
    organizationId,
    projectCode: { $regex: `^${escapeRegex(base)}(-[0-9]+)?$` },
  })
    .select('projectCode')
    .lean();
  const existing = rows.map((r) => String(r.projectCode || '').trim()).filter(Boolean);
  return allocateUniqueProjectCode(base, existing);
}
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function hasScopeRolePermission(permissions) {
  const p = permissions || {};
  return Boolean(p.canSee || p.canRead || p.canWrite || p.canDelete || p.canVoice);
}

/**
 * Authorize gán người trên card: Assignment Engine (Delegation Graph) khi flag bật;
 * shim goldenAssignPolicy khi flag tắt (rollback).
 */
async function authorizeCardAssignee({
  userId,
  board,
  assigneeId,
  ownerTeamId,
  scope,
  taskType = '*',
  slot = 'primary',
}) {
  if (!assigneeId) return;
  if (isAssignmentEngineEnabled()) {
    await ensureAssigneeBoardAccess({
      boardId: board._id,
      assigneeId,
      actorId: userId,
    });
    const check = await assertCanAssign({
      actorUserId: userId,
      targetUserId: assigneeId,
      boardId: board._id,
      taskType,
      slot,
      systemMembershipRole: scope?.membershipRole,
    });
    if (!check.ok) throw new Error(check.message || 'Không được phép giao việc');
    return;
  }
  if (!canAssignUser(scope, assigneeId)) {
    throw new Error('Không thể gán task cho thành viên ngoài phạm vi quản lý');
  }
  const assignCheck = assertCanSetCardAssignee(scope, ownerTeamId);
  if (!assignCheck.ok) throw new Error(assignCheck.message);
}

async function fetchTeamRoleAccessIds(actorId, organizationId, teamId) {
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/hierarchy/teams/${encodeURIComponent(String(teamId))}/role-access`,
      {
        headers: buildTrustedGatewayHeaders(actorId),
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    const entries = res.data?.data?.entries;
    if (!Array.isArray(entries)) return [];
    return entries
      .filter((row) => hasScopeRolePermission(row?.permissions))
      .map((row) => String(row.roleId || '').trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toOid(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

async function fetchActiveLists(boardOid) {
  return TaskBoardList.find({ boardId: boardOid, isArchived: false })
    .sort({ order: 1, createdAt: 1 })
    .lean();
}

async function reindexListOrders(boardOid, orderedIds) {
  const ops = orderedIds.map((id, idx) =>
    TaskBoardList.updateOne({ _id: id, boardId: boardOid }, { $set: { order: (idx + 1) * 1000 } })
  );
  if (ops.length) await Promise.all(ops);
}

async function notifyListWatchers({ listId, board, actorId, title, content }) {
  if (!NOTIFICATION_INTERNAL_TOKEN) return;
  const listOid = toOid(listId);
  if (!listOid) return;
  const rows = await TaskBoardListWatcher.find({ listId: listOid }).select('userId').lean();
  const userIds = [
    ...new Set(
      rows
        .map((r) => String(r.userId))
        .filter((uid) => uid && uid !== String(actorId || ''))
    ),
  ];
  if (!userIds.length) return;
  const orgId = board?.organizationId ? String(board.organizationId) : '';
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds,
        type: 'task_board_list',
        title,
        content,
        data: {
          organizationId: orgId,
          boardId: String(board?._id || ''),
          listId: String(listId),
        },
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    logger.warn('[task-board] notify watchers failed: %s', err.message);
  }
}

const PROJECT_BOARD_ADMIN_KEYS = new Set([
  DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
  DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER,
  DEFAULT_PROJECT_ROLE_KEYS.TECHNICAL_LEAD,
  DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD,
]);

/**
 * ACL từ ProjectMembership (SSOT) — bổ sung TaskBoardMember legacy.
 * @returns {{ canView: boolean, canEdit: boolean, isAdmin: boolean, permissions?: string[] }}
 */
async function projectMembershipBoardCaps(userId, board) {
  const empty = { canView: false, canEdit: false, isAdmin: false, permissions: [] };
  if (!userId || !board?.projectId) return empty;
  const userOid = toOid(userId);
  if (!userOid) return empty;

  const {
    isProjectRbacV2Enabled,
    unionPermissionsFromRoles,
    hasPermission,
  } = require('../utils/projectPermissionMatrix');

  const rows = await ProjectMembership.find({
    projectId: board.projectId,
    userId: userOid,
  })
    .select('projectRoleId legacyBoardRole')
    .lean();
  if (!rows.length) return empty;
  const roleIds = rows.map((r) => r.projectRoleId).filter(Boolean);
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key canAssign permissions').lean()
    : [];

  if (isProjectRbacV2Enabled()) {
    const permissions = unionPermissionsFromRoles(roles);
    for (const row of rows) {
      const legacy = String(row.legacyBoardRole || '');
      if (legacy === 'owner' || legacy === 'editor') {
        if (!permissions.includes('task:update')) permissions.push('task:update');
        if (!permissions.includes('task:create')) permissions.push('task:create');
      }
    }
    return {
      canView: hasPermission(permissions, 'task:view') || hasPermission(permissions, 'project:view'),
      canEdit:
        hasPermission(permissions, 'task:update') ||
        hasPermission(permissions, 'task:create') ||
        hasPermission(permissions, 'task:assign'),
      isAdmin:
        hasPermission(permissions, 'project:edit') ||
        hasPermission(permissions, 'members:manage') ||
        hasPermission(permissions, 'sprint:create'),
      permissions,
    };
  }

  let canEdit = false;
  let isAdmin = false;
  const { resolveCanonicalProjectRoleKey } = require('@enterprise/shared/config/masterData');
  for (const r of roles) {
    const key = resolveCanonicalProjectRoleKey(String(r?.key || '')) || String(r?.key || '');
    if (r?.canAssign || PROJECT_BOARD_ADMIN_KEYS.has(key) || PROJECT_BOARD_ADMIN_KEYS.has(String(r?.key || ''))) {
      canEdit = true;
    }
    if (key === DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER) isAdmin = true;
  }
  for (const row of rows) {
    const legacy = String(row.legacyBoardRole || '');
    if (legacy === 'owner' || legacy === 'editor') canEdit = true;
    if (legacy === 'owner') isAdmin = true;
  }
  return { canView: true, canEdit, isAdmin, permissions: [] };
}

async function userCanAdminBoard(userId, board) {
  if (!userId || !board) return false;
  const userOid = toOid(userId);
  if (!userOid) return false;
  if (String(board.createdBy) === String(userId)) return true;
  const member = await TaskBoardMember.findOne({ boardId: board._id, userId: userOid })
    .select('role')
    .lean();
  if (member?.role === 'owner') return true;
  const pmCaps = await projectMembershipBoardCaps(userId, board);
  if (pmCaps.isAdmin) return true;
  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  return orgRole === 'owner' || orgRole === 'admin';
}

/**
 * Capability matrix cho FE + policy BE (P0).
 * elevated = creator | org owner/admin | canCreateTask (PM/TL/head).
 */
async function resolveBoardCapabilities(userId, board) {
  if (!userId || !board) {
    return buildBoardCapabilities({});
  }
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    try {
      const { resolveUserProjectPermissions } = require('./projectAccess.service');
      const resolved = await resolveUserProjectPermissions({
        userId,
        projectId: board.projectId,
        boardId: board._id,
      });
      if (resolved?.capabilities) {
        return resolved.capabilities;
      }
    } catch {
      /* fall through legacy */
    }
  }

  const userOid = toOid(userId);
  const isCreator = String(board.createdBy) === String(userId);
  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  const canCreateTask = canCreateTaskInScope(scope);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  let memberCanView = false;
  let memberCanEdit = false;
  if (userOid) {
    const member = await TaskBoardMember.findOne({ boardId: board._id, userId: userOid })
      .select('canView canEdit role')
      .lean();
    if (member) {
      memberCanView = member.canView !== false;
      memberCanEdit = Boolean(member.canEdit) || member.role === 'owner' || member.role === 'editor';
    }
    const pmCaps = await projectMembershipBoardCaps(userId, board);
    if (pmCaps.canView) memberCanView = true;
    if (pmCaps.canEdit) memberCanEdit = true;
  }
  const inWorkspaceScope = await userMatchesWorkspaceBoardScope(board, userId);
  return buildBoardCapabilities({
    isCreator,
    isOrgAdmin,
    canCreateTask,
    inWorkspaceScope,
    memberCanView,
    memberCanEdit,
  });
}

function resolveListArchivePolicy({ list, cardCount, activeListCount, canAdmin }) {
  if (!canAdmin) {
    return { canArchive: false, archiveBlockReason: 'Chỉ Owner/Admin board hoặc tổ chức mới được lưu trữ danh sách' };
  }
  if (activeListCount <= 1) {
    return { canArchive: false, archiveBlockReason: 'Board phải giữ ít nhất một danh sách' };
  }
  if (cardCount > 0) {
    return {
      canArchive: false,
      archiveBlockReason: `Danh sách còn ${cardCount} thẻ — hãy chuyển hoặc lưu trữ thẻ trước`,
    };
  }
  return { canArchive: true, archiveBlockReason: null };
}

function boardScopeTaskFields(_board) {
  // Project org-level: không derive department/team/division ownership từ board scope.
  return {
    teamId: null,
    departmentId: null,
    divisionId: null,
  };
}

async function fetchOrganizationMembers(userId, organizationId) {
  const res = await axios.get(
    `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(String(organizationId))}/members`,
    {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 15000,
      validateStatus: () => true,
    }
  );
  const ok =
    res.status === 200 &&
    (res.data?.success === true || res.data?.status === 'success');
  if (!ok) {
    throw new Error('Không thể lấy danh sách thành viên tổ chức để seed board');
  }
  const rows = Array.isArray(res.data?.data) ? res.data.data : [];
  return rows
    .map((m) => {
      const u = String(m?.user?._id || m?.user?.id || m?.userId || '');
      const team = m?.team ? String(m.team) : '';
      const department = m?.department ? String(m.department) : '';
      const division = m?.division ? String(m.division) : '';
      if (!/^[a-f0-9]{24}$/i.test(u)) return null;
      return { userId: u, teamId: team, departmentId: department, divisionId: division };
    })
    .filter(Boolean);
}

/** Project IDs user can discover via org visibility policy (V2). */
async function discoverableProjectIdsForUser(userId, organizationId) {
  const orgOid = mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(String(organizationId))
    : null;
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!orgOid || !userOid) return [];

  const ctx = await fetchProjectVisibilityContext(organizationId, userId);
  if (!ctx.isOrgMember) return [];

  const Project = require('../models/Project');
  const base = { organizationId: orgOid, isActive: true };
  const elevated = isOrgElevatedMembershipRole(ctx.membershipRole);

  const membershipRowsEarly = await ProjectMembership.find({ userId: userOid })
    .select('projectId projectRoleId')
    .lean();
  const memberProjectIds = [
    ...new Set(
      membershipRowsEarly
        .map((r) => String(r.projectId || ''))
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
    ),
  ].map((id) => new mongoose.Types.ObjectId(id));

  const projects = elevated
    ? await Project.find(base).lean()
    : await Project.find(memberScopedProjectFilter(base, userOid, memberProjectIds)).lean();
  if (!projects.length) return [];

  const projectIds = projects.map((p) => p._id);
  const membershipRows = await ProjectMembership.find({
    userId: userOid,
    projectId: { $in: projectIds },
  })
    .select('projectId projectRoleId')
    .lean();
  const roleIds = [...new Set(membershipRows.map((r) => r.projectRoleId).filter(Boolean))];
  const roleDocs = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('_id key').lean()
    : [];
  const roleKeyById = new Map(roleDocs.map((r) => [String(r._id), String(r.key || '').trim()]));
  const rolesByProject = new Map();
  for (const row of membershipRows) {
    const pid = String(row.projectId);
    if (!rolesByProject.has(pid)) rolesByProject.set(pid, []);
    const key = roleKeyById.get(String(row.projectRoleId));
    if (key) rolesByProject.get(pid).push(key);
  }

  const actor = {
    userId: String(userId),
    isOrgMember: ctx.isOrgMember,
    membershipRole: ctx.membershipRole,
    organizationRoleKeys: ctx.organizationRoleKeys,
    headedDepartmentIds: ctx.headedDepartmentIds,
    memberDepartmentIds: ctx.memberDepartmentIds,
  };

  const out = [];
  for (const project of projects) {
    const pid = String(project._id);
    const projectRoleKeys = rolesByProject.get(pid) || [];
    const isMember =
      membershipRows.some((r) => String(r.projectId) === pid) ||
      projectRoleKeys.length > 0 ||
      String(project.createdBy || '') === String(userId);
    const access = resolveProjectAccess({
      actor,
      project,
      membership: { isMember, projectRoleKeys },
      orgPolicy: ctx.policy,
    });
    if (access.discover) out.push(project._id);
  }
  return out;
}

/** Board discover: V2 policy or legacy workspace binary. */
async function userMatchesWorkspaceBoardScope(board, userId) {
  if (!board) return false;
  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  if (!scope) return false;

  if (board.projectId) {
    const Project = require('../models/Project');
    const project = await Project.findById(board.projectId).lean();
    if (project && isProjectVisibilityV2Enabled()) {
      const ctx = await fetchProjectVisibilityContext(board.organizationId, userId);
      const membershipRows = await ProjectMembership.find({
        projectId: project._id,
        userId,
      })
        .select('projectRoleId')
        .lean();
      const roleIds = membershipRows.map((r) => r.projectRoleId).filter(Boolean);
      const roleDocs = roleIds.length
        ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key').lean()
        : [];
      const projectRoleKeys = roleDocs.map((r) => String(r.key || '').trim()).filter(Boolean);
      const isMember =
        membershipRows.length > 0 ||
        projectRoleKeys.length > 0 ||
        String(project.createdBy || '') === String(userId);
      const access = resolveProjectAccess({
        actor: {
          userId: String(userId),
          isOrgMember: ctx.isOrgMember,
          membershipRole: ctx.membershipRole,
          organizationRoleKeys: ctx.organizationRoleKeys,
          headedDepartmentIds: ctx.headedDepartmentIds,
          memberDepartmentIds: ctx.memberDepartmentIds,
        },
        project,
        membership: { isMember, projectRoleKeys },
        orgPolicy: ctx.policy,
      });
      return access.discover;
    }
    if (project && String(project.visibility || '') === 'workspace') return true;
    if (project && String(project.visibility || '') === 'private') return false;
  }

  // Legacy denorm trên board (hiếm) + dual-read unit scope trước migrate.
  if (String(board.visibility || '') === 'workspace') {
    if (scope.visibility === 'org') return true;
    const scopeId = String(board.scopeId || board.teamId || '');
    const type = String(board.scopeType || (board.teamId ? 'team' : '')).toLowerCase();
    if (type === 'organization') return true;
    if (!scopeId) return false;
    if (type === 'department') {
      return (scope.departmentIds || []).map(String).includes(scopeId);
    }
    if (type === 'team') {
      return (scope.teamIds || []).map(String).includes(scopeId);
    }
    if (type === 'division') {
      return (scope.divisionIds || []).map(String).includes(scopeId);
    }
  }
  return false;
}

async function assertBoardProjectWritable(board) {
  if (!board?.projectId) return;
  const Project = require('../models/Project');
  const project = await Project.findById(board.projectId).select('status').lean();
  if (project) assertProjectWritable(project);
}

async function ensureBoardViewAccess(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  if (String(board.createdBy) === String(userId)) return board;
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  if (!userOid) return null;
  const member = await TaskBoardMember.findOne({
    boardId: board._id,
    userId: userOid,
    canView: true,
  })
    .select('_id canEdit')
    .lean();
  if (member) return board;
  const pmCaps = await projectMembershipBoardCaps(userId, board);
  if (pmCaps.canView) return board;
  if (await userMatchesWorkspaceBoardScope(board, userId)) return board;
  return null;
}

async function ensureBoardEditAccess(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({
      userId,
      projectId: board.projectId,
      boardId,
    });
    const ok =
      hasPermission(resolved.permissions, 'task:update') ||
      hasPermission(resolved.permissions, 'task:create') ||
      hasPermission(resolved.permissions, 'task:assign') ||
      hasPermission(resolved.permissions, 'task:delete') ||
      hasPermission(resolved.permissions, 'task:estimate') ||
      hasPermission(resolved.permissions, 'story:create') ||
      hasPermission(resolved.permissions, 'story:update') ||
      hasPermission(resolved.permissions, 'bug:create') ||
      hasPermission(resolved.permissions, 'backlog:prioritize') ||
      hasPermission(resolved.permissions, 'project:edit');
    if (!ok) return null;
    await assertBoardProjectWritable(board);
    return board;
  }
  const caps = await resolveBoardCapabilities(userId, board);
  // Edit “nặng” (tạo thẻ/list/sửa) — không còn workspace-scope = full edit
  if (caps.canCreateCards || caps.canManageLists || caps.canEditCards || caps.canManageBoard) {
    await assertBoardProjectWritable(board);
    return board;
  }
  return null;
}

async function ensureBoardManageLists(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  const caps = await resolveBoardCapabilities(userId, board);
  if (!caps.canManageLists) return null;
  await assertBoardProjectWritable(board);
  return board;
}

async function ensureBoardCreateCards(boardId, userId) {
  const board = await TaskBoard.findById(boardId).lean();
  if (!board || !board.isActive) return null;
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({
      userId,
      projectId: board.projectId,
      boardId,
    });
    if (
      !hasPermission(resolved.permissions, 'task:create') &&
      !hasPermission(resolved.permissions, 'story:create') &&
      !hasPermission(resolved.permissions, 'bug:create')
    ) {
      return null;
    }
    await assertBoardProjectWritable(board);
    return board;
  }
  const caps = await resolveBoardCapabilities(userId, board);
  if (!caps.canCreateCards) return null;
  await assertBoardProjectWritable(board);
  return board;
}

function resolveBoardScope({ scopeType, scopeId, teamId, organizationId }) {
  return require('../utils/boardIdentityPatch').resolveBoardScope({
    scopeType,
    scopeId,
    teamId,
    organizationId,
  });
}

async function createBoard(_args) {
  const err = new Error(
    'Tạo dự án qua POST /api/projects (createProject). createBoard-as-project đã deprecate.'
  );
  err.statusCode = 410;
  err.errorCode = 'PROJECT_CREATE_VIA_BOARD_GONE';
  throw err;
}

function toOidList(ids = []) {
  return (ids || [])
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

/**
 * Khớp ensureBoardViewAccess: creator / member / workspace trong phạm vi task-workspace-scope.
 * (Trước đây Owner/Admin xem detail được nhưng list trống vì thiếu nhánh workspace.)
 */
async function listBoards({ userId, organizationId, teamId, scopeType, scopeId }) {
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  const orgOid = mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(String(organizationId))
    : null;
  if (!userOid || !orgOid) return [];

  const base = {
    organizationId: orgOid,
    isActive: true,
  };
  // Legacy unit scope query (department|team|division) bị bỏ — list org-wide sau migrate.
  // Chỉ còn filter khi client gửi scopeType=organization + scopeId hợp lệ.
  const st = String(scopeType || '').toLowerCase();
  if (st === 'organization' && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
    base.scopeType = 'organization';
    base.scopeId = new mongoose.Types.ObjectId(String(scopeId));
  }
  // teamId denorm đã null sau migrate — bỏ filter teamId unit.

  const memberBoardIds = await TaskBoardMember.find({
    userId: userOid,
    canView: true,
  })
    .select('boardId')
    .lean();
  const ids = memberBoardIds.map((r) => r.boardId).filter((id) => id != null);
  const accessOr = [{ createdBy: userOid }];
  if (ids.length) accessOr.push({ _id: { $in: ids } });

  const pmProjectIds = await ProjectMembership.find({ userId: userOid })
    .select('projectId')
    .lean();
  const projectIdsFromPm = [
    ...new Set(pmProjectIds.map((r) => r.projectId).filter(Boolean).map(String)),
  ]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (projectIdsFromPm.length) {
    accessOr.push({ projectId: { $in: projectIdsFromPm } });
  }

  // Discover via org policy (V2) or legacy workspace projects.
  const workspaceScope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (workspaceScope) {
    const Project = require('../models/Project');
    if (isProjectVisibilityV2Enabled()) {
      const discoverIds = await discoverableProjectIdsForUser(userId, organizationId);
      if (discoverIds.length) {
        accessOr.push({ projectId: { $in: discoverIds } });
      }
    } else {
      const workspaceProjects = await Project.find({
        organizationId: orgOid,
        isActive: true,
        visibility: 'workspace',
      })
        .select('_id')
        .lean();
      const wpIds = workspaceProjects.map((p) => p._id).filter(Boolean);
      if (wpIds.length) accessOr.push({ projectId: { $in: wpIds } });
    }
  }

  const boards = await TaskBoard.find({
    ...base,
    $or: accessOr,
  })
    .sort({ updatedAt: -1 })
    .lean();
  return boards;
}

async function getBoardDetail({ userId, boardId, includeCards, epicId, featureId, parentTaskId }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const boardOid = board._id;
  // Board cũ: bỏ cờ isDefault (không còn list hệ thống bảo vệ)
  await TaskBoardList.updateMany({ boardId: boardOid, isDefault: true }, { $set: { isDefault: false } });
  const lists = await fetchActiveLists(boardOid);
  const listIds = lists.map((l) => l._id);
  const userOid = toOid(userId);
  const watcherRows = listIds.length
    ? await TaskBoardListWatcher.find({ listId: { $in: listIds } }).select('listId userId').lean()
    : [];
  const watcherCountByList = new Map();
  const watchingSet = new Set();
  for (const row of watcherRows) {
    const lid = String(row.listId);
    watcherCountByList.set(lid, (watcherCountByList.get(lid) || 0) + 1);
    if (userOid && String(row.userId) === String(userOid)) watchingSet.add(lid);
  }
  const wantCards = parseIncludeCardsFlag(includeCards);
  const scopedCardQuery = Boolean(epicId || featureId || parentTaskId);
  const cardFilter = wantCards
    ? buildBoardCardMongoFilter(
        { boardId: boardOid, epicId, featureId, parentTaskId },
        { isValidOid: (id) => mongoose.Types.ObjectId.isValid(String(id)), toOid }
      )
    : null;
  const cards = wantCards
    ? await Task.find(cardFilter).sort({ listId: 1, position: 1, createdAt: 1 }).lean()
    : [];

  const canAdmin = await userCanAdminBoard(userId, board);
  const capabilities = await resolveBoardCapabilities(userId, board);
  const activeListCount = lists.length;
  const cardCountByList = new Map();
  for (const c of cards) {
    const lid = String(c.listId || '');
    cardCountByList.set(lid, (cardCountByList.get(lid) || 0) + 1);
  }
  const listsEnriched = lists.map((l) => {
    const cardCount = cardCountByList.get(String(l._id)) || 0;
    const policy = resolveListArchivePolicy({
      list: l,
      cardCount,
      activeListCount,
      canAdmin,
    });
    const statusKey =
      String(l.statusKey || '').trim() ||
      require('./workflow.service').inferStatusKeyFromTitle(l.title) ||
      '';
    return {
      ...l,
      statusKey,
      cardCount,
      watcherCount: watcherCountByList.get(String(l._id)) || 0,
      isWatching: watchingSet.has(String(l._id)),
      canArchive: policy.canArchive,
      archiveBlockReason: policy.archiveBlockReason,
    };
  });

  let workflowPayload = null;
  try {
    const {
      loadBoardWorkflowLean,
      allowedTransitionsFrom,
      resolveListStatusKey,
    } = require('./workflow.service');
    const wf = await loadBoardWorkflowLean(board);
    if (wf) {
      const transitionsByFrom = {};
      for (const list of listsEnriched) {
        const fromKey = resolveListStatusKey(list);
        if (!fromKey) continue;
        transitionsByFrom[fromKey] = allowedTransitionsFrom(wf, fromKey);
      }
      workflowPayload = {
        _id: wf._id,
        name: wf.name,
        templateKey: wf.templateKey || '',
        states: wf.states || [],
        transitions: wf.transitions || [],
        transitionsByFrom,
      };
    }
  } catch {
    workflowPayload = null;
  }

  const assigneeIds = [
    ...new Set(
      cards
        .flatMap((c) => {
          const ids = [];
          if (c?.assigneeId) ids.push(String(c.assigneeId));
          if (c?.createdBy) ids.push(String(c.createdBy));
          for (const a of c.assignments || []) {
            if (a?.userId) ids.push(String(a.userId));
          }
          return ids;
        })
        .filter(Boolean)
    ),
  ];
  const assigneeRows = assigneeIds.length ? await enrichAssignableProfiles(assigneeIds, userId) : [];
  const assigneeMap = new Map(assigneeRows.map((row) => [String(row.userId), row]));
  const { normalizeIssueType } = require('../utils/projectIssueTypePerms');

  // Keep only fields needed by FE (avoid large docs)
  const sanitizedCards = cards.map((c) => ({
    _id: c._id,
    boardId: c.boardId,
    listId: c.listId,
    ownerTeamId: c.ownerTeamId || null,
    workGroupChannelId: c.workGroupChannelId || null,
    title: c.title,
    description: c.description,
    summary: c.summary,
    priority: c.priority,
    dueDate: c.dueDate,
    assigneeId: c.assigneeId,
    assigneeName: c.assigneeId
      ? assigneeMap.get(String(c.assigneeId))?.displayName ||
        assigneeMap.get(String(c.assigneeId))?.username ||
        ''
      : '',
    assignees: c.assigneeId
      ? [
          {
            userId: String(c.assigneeId),
            displayName:
              assigneeMap.get(String(c.assigneeId))?.displayName ||
              assigneeMap.get(String(c.assigneeId))?.username ||
              '',
            avatar: assigneeMap.get(String(c.assigneeId))?.avatar || '',
          },
        ]
      : [],
    assignments: Array.isArray(c.assignments)
      ? c.assignments.map((a) => ({
          userId: String(a.userId),
          slot: a.slot || 'primary',
          projectRoleId: a.projectRoleId || null,
          displayName:
            assigneeMap.get(String(a.userId))?.displayName ||
            assigneeMap.get(String(a.userId))?.username ||
            '',
          avatar: assigneeMap.get(String(a.userId))?.avatar || '',
        }))
      : c.assigneeId
        ? [
            {
              userId: String(c.assigneeId),
              slot: 'primary',
              projectRoleId: null,
              displayName:
                assigneeMap.get(String(c.assigneeId))?.displayName ||
                assigneeMap.get(String(c.assigneeId))?.username ||
                '',
              avatar: assigneeMap.get(String(c.assigneeId))?.avatar || '',
            },
          ]
        : [],
    createdBy: c.createdBy || null,
    reporterName: c.createdBy
      ? assigneeMap.get(String(c.createdBy))?.displayName ||
        assigneeMap.get(String(c.createdBy))?.username ||
        ''
      : '',
    reporterAvatar: c.createdBy ? assigneeMap.get(String(c.createdBy))?.avatar || '' : '',
    tags: Array.isArray(c.tags) ? c.tags : [],
    attachments: Array.isArray(c.attachments) ? c.attachments : [],
    checklists: Array.isArray(c.checklists) ? c.checklists : [],
    parentTaskId: c.parentTaskId || null,
    epicId: c.epicId || null,
    featureId: c.featureId || null,
    issueType: normalizeIssueType(c.issueType),
    projectId: c.projectId || board.projectId || null,
    sprintId: c.sprintId || null,
    status: c.status,
    completedAt: c.completedAt,
    position: c.position,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    changeRequestIds: Array.isArray(c.changeRequestIds)
      ? c.changeRequestIds.map((id) => String(id))
      : [],
    comments: Array.isArray(c.comments)
      ? c.comments.map((cm) => ({
          userId: cm.userId,
          content: cm.content,
          createdAt: cm.createdAt,
        }))
      : [],
  }));

  const changeRequestService = require('./changeRequest.service');
  const cardsWithCr = await changeRequestService.enrichTasksWithChangeRequests(sanitizedCards);

  const { attachProjectIdentityToBoard } = require('./project.service');
  const boardWithProject = await attachProjectIdentityToBoard(board);

  return {
    board: boardWithProject,
    lists: listsEnriched,
    cards: scopedCardQuery ? cardsWithCr : attachSubtasksToSanitizedCards(cardsWithCr),
    capabilities,
    workflow: workflowPayload,
  };
}

async function createList({ userId, boardId, title }) {
  const board = await ensureBoardManageLists(boardId, userId);
  if (!board) throw new Error('Chỉ PM/TL/Admin mới được tạo danh sách trên board');
  const last = await TaskBoardList.findOne({ boardId }).sort({ order: -1 }).lean();
  const nextOrder = (Number(last?.order) || 0) + 1000;
  const row = await TaskBoardList.create({
    boardId,
    title: String(title || '').trim(),
    order: nextOrder,
    isDefault: false,
    isArchived: false,
  });
  return row.toObject();
}

async function createCard({
  userId,
  boardId,
  listId,
  title,
  summary,
  description,
  assigneeId,
  ownerTeamId,
  dueDate,
  priority,
  tags,
  attachments,
  sourceMessageId,
  aiGenerated,
  taskType,
  assignments,
  parentTaskId,
  checklists,
  epicId,
  featureId,
  issueType,
  sprintId,
  estimateHours,
  startDate,
  hoursOverride,
  hoursRationale,
}) {
  const board = await ensureBoardCreateCards(boardId, userId);
  if (!board) {
    const err = new Error('Không có quyền tạo thẻ (task:create / story:create / bug:create)');
    err.statusCode = 403;
    throw err;
  }
  const { isProjectRbacV2Enabled: rbacV2On } = require('../utils/projectPermissionMatrix');
  if (rbacV2On() && board.projectId) {
    const { createPermissionForIssueType } = require('../utils/projectIssueTypePerms');
    const { assertUserProjectPermission } = require('./projectAccess.service');
    const createKey = createPermissionForIssueType(issueType, { parentTaskId });
    await assertUserProjectPermission({
      userId,
      projectId: board.projectId,
      boardId,
      permission: createKey,
      message: `Không có quyền tạo thẻ (${createKey})`,
    });
  }
  const list = await TaskBoardList.findOne({ _id: listId, boardId, isArchived: false }).lean();
  if (!list) throw new Error('List không tồn tại trong board đã chọn');

  const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
  const nextOwnerTeamId = normalizeOwnerTeamId(ownerTeamId);
  if (ownerTeamId !== undefined && ownerTeamId !== null && ownerTeamId !== '' && !nextOwnerTeamId) {
    throw new Error('ownerTeamId không hợp lệ');
  }
  if (!isAssignmentEngineEnabled() && !canAssignOwnerTeam(scope, nextOwnerTeamId)) {
    throw new Error('Không thể gán thẻ cho team ngoài phạm vi');
  }

  let nextAssignments = normalizeAssignmentsPayload(assignments);
  let nextAssigneeId = assigneeId || null;
  if (nextAssignments.length) {
    const synced = syncPrimaryAssignment(
      primaryFromAssignmentsOr(assigneeId, nextAssignments),
      nextAssignments
    );
    nextAssigneeId = synced.assigneeId;
    nextAssignments = synced.assignments;
  } else if (assigneeId) {
    const synced = syncPrimaryAssignment(assigneeId, []);
    nextAssigneeId = synced.assigneeId;
    nextAssignments = synced.assignments;
  }

  if (nextAssigneeId) {
    await authorizeCardAssignee({
      userId,
      board,
      assigneeId: nextAssigneeId,
      ownerTeamId: nextOwnerTeamId,
      scope,
      taskType: taskType || '*',
      slot: 'primary',
    });
  }

  const { normalizeIssueType } = require('../utils/projectIssueTypePerms');
  const normalizedIssueType = normalizeIssueType(issueType);

  let parentOid = null;
  if (parentTaskId) {
    const parent = await Task.findOne({
      _id: parentTaskId,
      boardId,
      isActive: true,
    }).lean();
    if (!parent) throw new Error('parentTaskId không hợp lệ');
    parentOid = parent._id;
    const { assertTaskParentNest } = require('./workTypeNest.service');
    await assertTaskParentNest({
      projectId: board.projectId,
      childCard: { issueType: normalizedIssueType },
      parentCard: parent,
    });
  }

  let featureOid = null;
  let nextEpicId = epicId || null;
  if (featureId) {
    const { assertTaskFeatureNest } = require('./workTypeNest.service');
    const feature = await assertTaskFeatureNest({
      projectId: board.projectId,
      childCard: { issueType: normalizedIssueType },
      featureId,
    });
    featureOid = feature._id;
    if (!nextEpicId && feature.parentId) nextEpicId = feature.parentId;
  }

  const last = await Task.findOne({ boardId, listId, isActive: true })
    .sort({ position: -1 })
    .lean();
  const nextPos = (Number(last?.position) || 0) + 1000;

  const nextEstimateHours =
    estimateHours !== undefined ? normalizeHoursEstimate(estimateHours) : null;
  const nextStartDate = startDate !== undefined ? parseStartDate(startDate) : null;
  const nextDueDate = dueDate ? new Date(dueDate) : null;

  await assertHoursCapacityOrThrow({
    assigneeId: nextAssigneeId || null,
    excludeCardId: null,
    proposed: {
      estimateHours: nextEstimateHours,
      startDate: nextStartDate,
      dueDate: nextDueDate,
    },
    hoursOverride: Boolean(hoursOverride),
    hoursRationale,
    organizationId: board.organizationId,
    boardId: board._id,
    overriddenBy: userId,
  });

  const row = await Task.create({
    boardId,
    listId,
    projectId: board.projectId || null,
    parentTaskId: parentOid,
    organizationId: board.organizationId,
    ...boardScopeTaskFields(board),
    ownerTeamId: nextOwnerTeamId,
    title: String(title || '').trim(),
    summary: String(summary || '').trim(),
    description: String(description || '').trim(),
    assigneeId: nextAssigneeId || null,
    assignments: nextAssignments,
    createdBy: userId,
    priority: priority || 'medium',
    dueDate: nextDueDate,
    startDate: nextStartDate,
    estimateHours: nextEstimateHours,
    position: nextPos,
    tags: Array.isArray(tags) ? tags : [],
    checklists: Array.isArray(checklists) ? checklists : [],
    epicId: nextEpicId || null,
    featureId: featureOid,
    issueType: normalizedIssueType,
    sprintId: sprintId || null,
    attachments: Array.isArray(attachments)
      ? attachments
          .map((a) => ({
            name: String(a?.name || a?.url || '').trim(),
            url: String(a?.url || '').trim(),
            documentId: a?.documentId || null,
          }))
          .filter((a) => a.url)
      : [],
    sourceMessageId: sourceMessageId || null,
    aiGenerated: Boolean(aiGenerated),
  });

  await ensureAssigneeBoardAccess({
    boardId: board._id,
    assigneeId: nextAssigneeId || null,
    actorId: userId,
  });
  const created = row.toObject();
  if (board.projectId && nextOwnerTeamId) {
    void emitTeamChannelProvisionIfNeeded({
      organizationId: board.organizationId,
      projectId: board.projectId,
      teamId: nextOwnerTeamId,
      actorUserId: userId,
    });
  }
  void notifyListWatchers({
    listId,
    board,
    actorId: userId,
    title: 'Thẻ mới trong danh sách',
    content: `Thẻ "${created.title}" vừa được thêm`,
  }).catch((err) => logger.warn('[task-board] notify watchers failed: %s', err.message));
  if (board.projectId) {
    const { logActivity } = require('./project.service');
    void logActivity({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: created._id,
      actorId: userId,
      type: parentOid ? 'task.subtask_created' : 'task.created',
      title: created.title,
    });
    const { appendFieldChanges } = require('./workHistory.service');
    void appendFieldChanges({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: created._id,
      actorId: userId,
      changes: [{ field: 'issue', from: null, to: created.title }],
    });
  }
  return created;
}

function primaryFromAssignmentsOr(assigneeId, assignments) {
  if (assigneeId) return assigneeId;
  const p = (assignments || []).find((a) => String(a.slot) === 'primary');
  return p?.userId || null;
}

function computeCardInsertPosition(siblings, index) {
  const GAP = 1000;
  if (!siblings.length) return GAP;
  const idx = Math.max(0, Math.min(Number(index) || 0, siblings.length));
  if (idx <= 0) {
    const first = Number(siblings[0].position) || GAP;
    return first - GAP / 2;
  }
  if (idx >= siblings.length) {
    const last = Number(siblings[siblings.length - 1].position) || 0;
    return last + GAP;
  }
  const prev = Number(siblings[idx - 1].position) || 0;
  const next = Number(siblings[idx].position) || prev + GAP * 2;
  return (prev + next) / 2;
}

function scheduleCrWorkStatusSync(card) {
  const ids = Array.isArray(card?.changeRequestIds) ? card.changeRequestIds : [];
  if (!ids.length) return;
  setImmediate(() => {
    void (async () => {
      try {
        const changeRequestService = require('./changeRequest.service');
        await changeRequestService.syncChangeRequestWorkStatus(ids);
      } catch (err) {
        logger.warn('[task-board] CR workStatus sync failed: %s', err?.message || err);
      }
    })();
  });
}

async function moveCard({ userId, cardId, toListId, position, index, ownerTeamId }) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId) throw new Error('Card không tồn tại');
  const board = await ensureBoardViewAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const beforeMove = {
    listId: card.listId,
    status: card.status,
    ownerTeamId: card.ownerTeamId,
  };

  const caps = await resolveBoardCapabilities(userId, board);
  if (!caps.canMoveCards) throw new Error('Không có quyền kéo thẻ trên board này');

  const targetListId = toListId || card.listId;
  const list = await TaskBoardList.findOne({ _id: targetListId, boardId: board._id, isArchived: false }).lean();
  if (!list) throw new Error('List đích không hợp lệ');

  const movingToDone = isDoneListTitle(list.title);
  if (movingToDone && !caps.canMoveToDone) {
    throw new Error('Chỉ PM/TL/Admin mới được kéo thẻ sang cột Xong (duyệt)');
  }

  const isAssignee = card.assigneeId && String(card.assigneeId) === String(userId);
  const canFreelyMove = caps.canCreateCards || caps.canEditCards || caps.canManageBoard;
  if (!canFreelyMove) {
    if (!isAssignee) {
      throw new Error('Bạn chỉ được kéo thẻ được gán cho mình');
    }
  }

  const {
    resolveListStatusKey,
    assertCanTransition,
    isWorkflowEngineV2Enabled,
    loadBoardWorkflowLean,
  } = require('./workflow.service');

  const fromList = card.listId
    ? await TaskBoardList.findById(card.listId).lean()
    : null;
  const fromStatusKey =
    resolveListStatusKey(fromList) || String(card.status || '').trim() || 'todo';
  const toStatusKey = resolveListStatusKey(list);

  // Phase 4: khi board có workflow + cột có statusKey → enforce transition đầy đủ
  if (
    isWorkflowEngineV2Enabled() &&
    board.workflowId &&
    toStatusKey &&
    fromStatusKey !== toStatusKey
  ) {
    let actorPermissions = caps.permissions || [];
    let actorProjectRoleKeys = [];
    let isElevated = Boolean(caps.canManageBoard);
    try {
      const { resolveUserProjectPermissions } = require('./projectAccess.service');
      const resolved = await resolveUserProjectPermissions({
        userId,
        projectId: board.projectId,
        boardId: board._id,
      });
      actorPermissions = resolved.permissions || actorPermissions;
      isElevated = isElevated || resolved.isOrgAdmin || resolved.isCreator;
      const ProjectMembership = require('../models/ProjectMembership');
      const ProjectRole = require('../models/ProjectRole');
      const mems = await ProjectMembership.find({
        projectId: board.projectId,
        userId,
      })
        .select('projectRoleId')
        .lean();
      const roleIds = mems.map((m) => m.projectRoleId).filter(Boolean);
      if (roleIds.length) {
        const roles = await ProjectRole.find({ _id: { $in: roleIds } }).select('key').lean();
        actorProjectRoleKeys = roles.map((r) => String(r.key));
      }
    } catch {
      /* optional enrich */
    }

    const transition = await assertCanTransition(board, fromStatusKey, toStatusKey, {
      card: card.toObject ? card.toObject() : card,
      actorPermissions,
      actorProjectRoleKeys,
      isElevated,
    });
    if (!transition.ok) {
      const err = new Error(transition.message || 'Không chuyển được status');
      err.statusCode = transition.statusCode || 400;
      throw err;
    }

    // Phase 5 — approval gate
    const approvalService = require('./approval.service');
    if (approvalService.isApprovalSystemV2Enabled()) {
      const gate = await approvalService.maybeStartTaskApproval({
        userId,
        board,
        card,
        fromStatus: fromStatusKey,
        toStatus: toStatusKey,
        transition: transition.transition || null,
        targetListId,
      });
      if (gate.blocked) {
        const refreshed = await Task.findById(card._id).lean();
        return {
          ...refreshed,
          approvalRequest: gate.request,
          approvalPending: true,
        };
      }
    }
  } else if (movingToDone || String(toStatusKey) === 'done') {
    // Legacy / no workflow statusKey — vẫn có thể gắn project default Done policy
    const approvalService = require('./approval.service');
    if (approvalService.isApprovalSystemV2Enabled()) {
      const gate = await approvalService.maybeStartTaskApproval({
        userId,
        board,
        card,
        fromStatus: String(card.status || fromStatusKey || 'todo'),
        toStatus: 'done',
        transition: { requiresApprovalPolicyKey: '' },
        targetListId,
      });
      if (gate.blocked) {
        const refreshed = await Task.findById(card._id).lean();
        return {
          ...refreshed,
          approvalRequest: gate.request,
          approvalPending: true,
        };
      }
    }
  }

  const siblings = await Task.find({
    boardId: board._id,
    listId: targetListId,
    isActive: true,
    _id: { $ne: card._id },
  })
    .sort({ position: 1, createdAt: 1 })
    .lean();

  let targetIndex = index;
  if (targetIndex == null && position != null && Number.isFinite(Number(position))) {
    const asIdx = Number(position);
    if (asIdx >= 0 && asIdx <= siblings.length && Number.isInteger(asIdx)) {
      targetIndex = asIdx;
    }
  }
  if (targetIndex == null) {
    targetIndex = siblings.length;
  }

  card.listId = targetListId;
  card.position = computeCardInsertPosition(siblings, targetIndex);
  if (ownerTeamId !== undefined) {
    const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
    const nextOwner = normalizeOwnerTeamId(ownerTeamId);
    if (ownerTeamId !== null && ownerTeamId !== '' && !nextOwner) {
      throw new Error('ownerTeamId không hợp lệ');
    }
    if (!isAssignmentEngineEnabled() && !canAssignOwnerTeam(scope, nextOwner)) {
      throw new Error('Không thể gán thẻ cho team ngoài phạm vi');
    }
    card.ownerTeamId = nextOwner;
  }

  if (
    isWorkflowEngineV2Enabled() &&
    board.workflowId &&
    toStatusKey &&
    fromStatusKey !== toStatusKey
  ) {
    card.status = toStatusKey;
    const wf = await loadBoardWorkflowLean(board);
    const st = (wf?.states || []).find((s) => String(s.key) === toStatusKey);
    const cat = String(st?.category || '').toLowerCase();
    if (cat === 'done' || toStatusKey === 'done' || st?.isFinal) {
      card.completedAt = card.completedAt || new Date();
    } else if (String(card.status) !== 'done' && fromStatusKey === 'done') {
      card.completedAt = null;
    } else if (cat !== 'done' && toStatusKey !== 'done') {
      if (String(fromStatusKey) === 'done') card.completedAt = null;
    }
  } else if (movingToDone) {
    const transition = await assertCanTransition(board, card.status, 'done', {
      card: card.toObject ? card.toObject() : card,
    });
    if (!transition.ok) throw new Error(transition.message || 'Không chuyển được sang Done');
    card.status = 'done';
    card.completedAt = card.completedAt || new Date();
  } else if (card.status === 'done') {
    const transition = await assertCanTransition(board, 'done', 'todo', {
      card: card.toObject ? card.toObject() : card,
    });
    if (!transition.ok) throw new Error(transition.message || 'Không chuyển được khỏi Done');
    card.status = 'todo';
    card.completedAt = null;
  }
  await card.save();
  const moved = card.toObject();
  if (board.projectId && ownerTeamId !== undefined) {
    const prevTeam = normalizeOwnerTeamId(beforeMove.ownerTeamId);
    const nextTeam = normalizeOwnerTeamId(moved.ownerTeamId);
    if (nextTeam && nextTeam !== prevTeam) {
      void emitTeamChannelProvisionIfNeeded({
        organizationId: board.organizationId,
        projectId: board.projectId,
        teamId: nextTeam,
        actorUserId: userId,
      });
    }
  }
  scheduleCrWorkStatusSync(moved);
  await notifyListWatchers({
    listId: toListId,
    board,
    actorId: userId,
    title: 'Thẻ được chuyển',
    content: `Thẻ "${moved.title}" vừa được chuyển vào danh sách`,
  });
  if (board.projectId) {
    const { diffTaskFields } = require('../utils/workHistoryDiff');
    const { appendFieldChanges } = require('./workHistory.service');
    await appendFieldChanges({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: cardId,
      actorId: userId,
      changes: diffTaskFields(beforeMove, { listId: moved.listId, status: moved.status }),
    });
  }
  return moved;
}

async function updateCard({
  userId,
  cardId,
  title,
  description,
  summary,
  priority,
  dueDate,
  tags,
  assigneeId,
  ownerTeamId,
  attachments,
  status,
  taskType,
  assignments,
  checklists,
  parentTaskId,
  epicId,
  featureId,
  issueType,
  estimateHours,
  startDate,
  hoursOverride,
  hoursRationale,
}) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa card này');
  const caps = await resolveBoardCapabilities(userId, board);
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');

  const next = {};
  if (title !== undefined) next.title = String(title).trim();
  if (description !== undefined) next.description = String(description).trim();
  if (summary !== undefined) next.summary = String(summary).trim();
  if (priority !== undefined) next.priority = priority || 'medium';
  if (dueDate !== undefined) next.dueDate = dueDate ? new Date(dueDate) : null;
  if (startDate !== undefined) next.startDate = startDate ? parseStartDate(startDate) : null;
  if (estimateHours !== undefined) {
    const { normalizeEstimateHours } = require('../utils/timeTracking');
    next.estimateHours = normalizeEstimateHours(estimateHours);
  }
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { assertUserProjectPermission } = require('./projectAccess.service');
    const { updatePermissionForIssueType } = require('../utils/projectIssueTypePerms');
    if (estimateHours !== undefined) {
      await assertUserProjectPermission({
        userId,
        projectId: board.projectId,
        boardId: board._id,
        permission: 'task:estimate',
        message: 'Không có quyền estimate (task:estimate)',
      });
    }
    const nextIssueType =
      issueType !== undefined ? String(issueType || 'task').toLowerCase() : String(card.issueType || 'task');
    if (priority !== undefined && nextIssueType === 'story') {
      await assertUserProjectPermission({
        userId,
        projectId: board.projectId,
        boardId: board._id,
        permission: 'backlog:prioritize',
        message: 'Không có quyền ưu tiên story (backlog:prioritize)',
      });
    }
    const contentTouched = [title, description, summary, dueDate, tags, status, checklists, attachments].some(
      (v) => v !== undefined
    );
    if (contentTouched || issueType !== undefined) {
      const updateKey = updatePermissionForIssueType(nextIssueType);
      const resolvedPerms = Array.isArray(caps.permissions) ? caps.permissions : [];
      if (!hasPermission(resolvedPerms, updateKey) && !caps.canManageBoard) {
        await assertUserProjectPermission({
          userId,
          projectId: board.projectId,
          boardId: board._id,
          permission: updateKey,
          message: `Không có quyền sửa thẻ (${updateKey})`,
        });
      }
    }
  }
  if (checklists !== undefined) next.checklists = Array.isArray(checklists) ? checklists : [];
  if (parentTaskId !== undefined) {
    if (!parentTaskId) {
      next.parentTaskId = null;
    } else {
      const parent = await Task.findOne({
        _id: parentTaskId,
        boardId: card.boardId,
        isActive: true,
      }).lean();
      if (!parent) throw new Error('parentTaskId không hợp lệ');
      if (String(parent._id) === String(cardId)) throw new Error('Card không thể là parent của chính nó');
      next.parentTaskId = parent._id;
      if (board.projectId) {
        const { assertTaskParentNest } = require('./workTypeNest.service');
        await assertTaskParentNest({
          projectId: board.projectId,
          childCard: { issueType: issueType !== undefined ? issueType : card.issueType },
          parentCard: parent,
        });
      }
    }
  }
  if (epicId !== undefined) {
    next.epicId = epicId || null;
  }
  if (featureId !== undefined) {
    if (!featureId) {
      next.featureId = null;
    } else if (board.projectId) {
      const { assertTaskFeatureNest } = require('./workTypeNest.service');
      const feature = await assertTaskFeatureNest({
        projectId: board.projectId,
        childCard: { issueType: issueType !== undefined ? issueType : card.issueType },
        featureId,
      });
      next.featureId = feature._id;
      if (next.epicId === undefined && !card.epicId && feature.parentId) {
        next.epicId = feature.parentId;
      }
    } else {
      next.featureId = featureId;
    }
  }
  if (issueType !== undefined) {
    const raw = String(issueType || '').trim().toLowerCase();
    if (raw && !['task', 'bug', 'story'].includes(raw)) {
      throw new Error('issueType phải là task|bug|story');
    }
    next.issueType = require('../utils/projectIssueTypePerms').normalizeIssueType(issueType);
  }
  if (status !== undefined) {
    const st = String(status || '').trim();
    const { assertCanTransition } = require('./workflow.service');
    let actorPermissions = caps.permissions || [];
    let isElevated = Boolean(caps.canManageBoard);
    try {
      const { resolveUserProjectPermissions } = require('./projectAccess.service');
      const resolved = await resolveUserProjectPermissions({
        userId,
        projectId: board.projectId,
        boardId: board._id,
      });
      actorPermissions = resolved.permissions || actorPermissions;
      isElevated = isElevated || resolved.isOrgAdmin || resolved.isCreator;
    } catch {
      /* optional */
    }
    const transition = await assertCanTransition(board, card.status, st, {
      card: { ...card.toObject(), ...next },
      actorPermissions,
      isElevated,
    });
    if (!transition.ok) {
      const err = new Error(transition.message || 'status không hợp lệ');
      err.statusCode = transition.statusCode || 400;
      throw err;
    }

    const approvalService = require('./approval.service');
    if (approvalService.isApprovalSystemV2Enabled() && String(card.status) !== st) {
      const gate = await approvalService.maybeStartTaskApproval({
        userId,
        board,
        card,
        fromStatus: String(card.status || ''),
        toStatus: st,
        transition: transition.transition || null,
        targetListId: null,
      });
      if (gate.blocked) {
        // Không apply status đích — chỉ awaiting_approval
        Object.assign(card, next);
        await card.save();
        const refreshed = await Task.findById(card._id).lean();
        return {
          ...refreshed,
          approvalRequest: gate.request,
          approvalPending: true,
        };
      }
    }

    next.status = st;
    if (st === 'done') {
      next.completedAt = new Date();
    } else if (card.status === 'done') {
      next.completedAt = null;
    }
  }
  if (tags !== undefined) next.tags = Array.isArray(tags) ? tags : [];
  if (attachments !== undefined) {
    next.attachments = Array.isArray(attachments)
      ? attachments
          .map((a) => ({
            name: String(a?.name || a?.url || '').trim(),
            url: String(a?.url || '').trim(),
            documentId: a?.documentId || null,
          }))
          .filter((a) => a.url)
      : [];
  }
  if (assigneeId !== undefined) next.assigneeId = assigneeId || null;
  if (ownerTeamId !== undefined) {
    const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
    const nextOwner = normalizeOwnerTeamId(ownerTeamId);
    if (ownerTeamId !== null && ownerTeamId !== '' && !nextOwner) {
      throw new Error('ownerTeamId không hợp lệ');
    }
    if (!isAssignmentEngineEnabled() && !canAssignOwnerTeam(scope, nextOwner)) {
      throw new Error('Không thể gán thẻ cho team ngoài phạm vi');
    }
    next.ownerTeamId = nextOwner;
  }

  if (assignments !== undefined) {
    const normalized = normalizeAssignmentsPayload(assignments);
    const synced = syncPrimaryAssignment(
      primaryFromAssignmentsOr(assigneeId !== undefined ? assigneeId : card.assigneeId, normalized),
      normalized
    );
    next.assignments = synced.assignments;
    next.assigneeId = synced.assigneeId;
  } else if (assigneeId !== undefined) {
    const synced = syncPrimaryAssignment(assigneeId || null, card.assignments || []);
    next.assigneeId = synced.assigneeId;
    next.assignments = synced.assignments;
  }

  const effectiveAssignee =
    next.assigneeId !== undefined ? next.assigneeId : card.assigneeId;
  if ((assigneeId !== undefined || assignments !== undefined) && effectiveAssignee) {
    const scope = await fetchTaskWorkspaceScope(userId, board.organizationId);
    const effectiveTeam =
      ownerTeamId !== undefined
        ? normalizeOwnerTeamId(ownerTeamId)
        : normalizeOwnerTeamId(card.ownerTeamId);
    await authorizeCardAssignee({
      userId,
      board,
      assigneeId: effectiveAssignee,
      ownerTeamId: effectiveTeam,
      scope,
      taskType: taskType || '*',
      slot: 'primary',
    });
  }

  if (next.title != null && !next.title) throw new Error('title không hợp lệ');

  const assigneeChanged =
    next.assigneeId !== undefined &&
    String(next.assigneeId || '') !== String(card.assigneeId || '');
  if (assigneeChanged) {
    await ensureAssigneeBoardAccess({
      boardId: board._id,
      assigneeId: effectiveAssignee || null,
      actorId: userId,
    });
  }

  if (
    hoursFieldsTouched({ assigneeId, assignments, estimateHours, startDate, dueDate })
  ) {
    await assertHoursCapacityOrThrow({
      assigneeId: effectiveAssignee || null,
      excludeCardId: card._id,
      proposed: {
        estimateHours:
          next.estimateHours !== undefined ? next.estimateHours : card.estimateHours,
        startDate: next.startDate !== undefined ? next.startDate : card.startDate,
        dueDate: next.dueDate !== undefined ? next.dueDate : card.dueDate,
      },
      hoursOverride: Boolean(hoursOverride),
      hoursRationale,
      organizationId: board.organizationId,
      boardId: board._id,
      overriddenBy: userId,
    });
  }

  const updated = await Task.findByIdAndUpdate(
    cardId,
    { $set: next },
    { new: true, runValidators: true }
  );
  const out = updated?.toObject ? updated.toObject() : updated;

  if (assigneeChanged && board.projectId) {
    try {
      await syncWorkGroupMembers({ card: out || card, board, userId });
    } catch (syncErr) {
      await Task.findByIdAndUpdate(cardId, { $set: { assigneeId: card.assigneeId, assignments: card.assignments || [] } });
      const err = new Error('Đồng bộ nhóm làm việc thất bại — đã khôi phục assignee');
      err.statusCode = 409;
      throw err;
    }
  }

  if (board.projectId && next.ownerTeamId !== undefined) {
    const prevTeam = normalizeOwnerTeamId(card.ownerTeamId);
    const nextTeam = normalizeOwnerTeamId(next.ownerTeamId);
    if (nextTeam && nextTeam !== prevTeam) {
      void emitTeamChannelProvisionIfNeeded({
        organizationId: board.organizationId,
        projectId: board.projectId,
        teamId: nextTeam,
        actorUserId: userId,
      });
    }
  }
  const statusChanged =
    next.status !== undefined && String(next.status || '') !== String(card.status || '');
  if (statusChanged) scheduleCrWorkStatusSync(out || card);
  if (card.listId) {
    void notifyListWatchers({
      listId: card.listId,
      board,
      actorId: userId,
      title: 'Thẻ được cập nhật',
      content: `Thẻ "${out?.title || card.title}" vừa được chỉnh sửa`,
    }).catch((err) => logger.warn('[task-board] notify watchers failed: %s', err.message));
  }
  if (board.projectId) {
    const { logActivity } = require('./project.service');
    void logActivity({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: cardId,
      actorId: userId,
      type: 'task.updated',
      title: out?.title || card.title,
      payload: { fields: Object.keys(next) },
    });
    if (Object.prototype.hasOwnProperty.call(next, 'estimateHours')) {
      const beforeEst =
        card.estimateHours === undefined || card.estimateHours === null
          ? null
          : Number(card.estimateHours);
      if (beforeEst !== next.estimateHours) {
        void logActivity({
          organizationId: board.organizationId,
          projectId: board.projectId,
          boardId: board._id,
          taskId: cardId,
          actorId: userId,
          type: 'estimate_updated',
          title: `Estimate ${next.estimateHours ?? '—'}h`,
          payload: { before: beforeEst, after: next.estimateHours },
        });
      }
    }
    const keys = Object.keys(next);
    const beforeDoc = card.toObject ? card.toObject() : card;
    void require('./audit.service')
      .recordMutationAudit({
        organizationId: board.organizationId,
        actorUserId: userId,
        action: 'task.updated',
        resourceType: 'task',
        resourceId: String(cardId),
        beforeDoc,
        afterDoc: out,
        keys,
        meta: { projectId: String(board.projectId), boardId: String(board._id) },
      })
      .catch((err) => logger.warn('[task-board] audit failed: %s', err.message));
    const { diffTaskPatch } = require('../utils/workHistoryDiff');
    const { appendFieldChanges } = require('./workHistory.service');
    void appendFieldChanges({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: cardId,
      actorId: userId,
      changes: diffTaskPatch(beforeDoc, next),
    });
  }
  return out;
}

/**
 * Create a workgroup channel for a Feature (PlanningItem) and set workGroupChannelId.
 * S2S call to organization-service provision endpoint.
 */
async function createWorkGroup({ userId, featureId }) {
  const PlanningItem = require('../models/PlanningItem');
  const feature = await PlanningItem.findById(featureId);
  if (!feature || !feature.isActive) throw new Error('Feature không tồn tại');
  if (!feature.projectId) throw new Error('Feature không thuộc project');
  if (feature.workGroupChannelId) {
    return { workGroupChannelId: String(feature.workGroupChannelId), alreadyExists: true };
  }

  const Board = require('../models/TaskBoard');
  const board = await Board.findOne({ projectId: feature.projectId, isActive: true }).lean();
  if (!board) throw new Error('Không tìm thấy board');
  await ensureBoardEditAccess(board._id, userId);

  const orgId = String(feature.organizationId);
  const projectId = String(feature.projectId);
  const parentTaskId = String(feature._id);
  const channelName = String(feature.title || '').trim() || 'workgroup';

  try {
    const res = await axios.post(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/project-workgroup-channel`,
      { organizationId: orgId, projectId, parentTaskId, channelName },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) {
      throw new Error(res.data?.message || `Org-service returned ${res.status}`);
    }
    const channel = res.data?.data;
    const channelId = channel?._id || channel?.id;
    if (!channelId) throw new Error('Không nhận được channelId từ org-service');

    await PlanningItem.findByIdAndUpdate(featureId, { $set: { workGroupChannelId: channelId } });
    return { workGroupChannelId: String(channelId), alreadyExists: false };
  } catch (err) {
    logger.error('[task-board] createWorkGroup S2S failed: %s', err?.message || err);
    throw new Error('Không thể tạo nhóm làm việc: ' + (err?.message || 'unknown'));
  }
}

/**
 * Sync Channel.members = union of assigneeIds for all active cards under a feature with workGroupChannelId.
 */
async function syncWorkGroupMembers({ card, board, userId }) {
  const fId = card.featureId;
  if (!fId) return;
  const PlanningItem = require('../models/PlanningItem');
  const feature = await PlanningItem.findById(fId).select('workGroupChannelId').lean();
  if (!feature?.workGroupChannelId) return;

  const channelId = String(feature.workGroupChannelId);
  const orgId = String(board.organizationId);

  const siblings = await Task.find({
    featureId: fId,
    boardId: board._id,
    isActive: true,
  })
    .select('assigneeId')
    .lean();

  const memberIds = [...new Set(
    siblings.map((s) => String(s.assigneeId || '')).filter((id) => id && mongoose.Types.ObjectId.isValid(id))
  )];

  try {
    const res = await axios.put(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/project-workgroup-channel/${encodeURIComponent(channelId)}/members`,
      { members: memberIds },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 400) {
      logger.warn('[task-board] syncWorkGroupMembers failed: status=%d', res.status);
      throw new Error('Sync work group members failed');
    }
  } catch (err) {
    logger.warn('[task-board] syncWorkGroupMembers S2S error: %s', err?.message || err);
    throw err;
  }
}

async function addCardComment({ userId, cardId, content }) {
  const text = String(content || '').trim();
  if (!text) throw new Error('Nội dung bình luận không được để trống');
  const card = await Task.findById(cardId);
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa card này');
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { assertUserProjectPermission } = require('./projectAccess.service');
    await assertUserProjectPermission({
      userId,
      projectId: board.projectId,
      boardId: board._id,
      permission: 'task:comment',
      message: 'Không có quyền bình luận (task:comment)',
    });
  }

  const userOid = toOid(userId);
  if (!userOid) throw new Error('userId không hợp lệ');

  const updated = await Task.findByIdAndUpdate(
    cardId,
    {
      $push: {
        comments: {
          userId: userOid,
          content: text,
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true }
  );
  const out = updated?.toObject ? updated.toObject() : updated;
  if (card.listId) {
    await notifyListWatchers({
      listId: card.listId,
      board,
      actorId: userId,
      title: 'Bình luận mới trên thẻ',
      content: `Có bình luận mới trên thẻ "${out?.title || card.title}"`,
    });
  }
  if (board.projectId) {
    const { appendFieldChanges } = require('./workHistory.service');
    await appendFieldChanges({
      organizationId: board.organizationId,
      projectId: board.projectId,
      boardId: board._id,
      taskId: cardId,
      actorId: userId,
      changes: [{ field: 'comment', from: null, to: text.slice(0, 200) }],
    });
  }
  return out;
}

async function copyCard({ userId, cardId, toListId }) {
  const card = await Task.findById(cardId).lean();
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');

  const targetListOid = toListId ? toOid(toListId) : card.listId;
  const list = await TaskBoardList.findOne({
    _id: targetListOid,
    boardId: board._id,
    isArchived: false,
  }).lean();
  if (!list) throw new Error('List đích không hợp lệ');

  const last = await Task.findOne({ boardId: board._id, listId: list._id, isActive: true })
    .sort({ position: -1 })
    .lean();
  const nextPos = (Number(last?.position) || 0) + 1000;
  const copyTitle = String(card.title || '').trim();
  const row = await Task.create({
    boardId: board._id,
    listId: list._id,
    organizationId: board.organizationId,
    ...boardScopeTaskFields(board),
    title: copyTitle.endsWith('(bản sao)') ? copyTitle : `${copyTitle} (bản sao)`,
    summary: card.summary || '',
    description: card.description || '',
    assigneeId: card.assigneeId || null,
    createdBy: userId,
    priority: card.priority || 'medium',
    dueDate: card.dueDate || null,
    tags: Array.isArray(card.tags) ? [...card.tags] : [],
    attachments: Array.isArray(card.attachments) ? card.attachments.map((a) => ({ ...a })) : [],
    position: nextPos,
    isActive: true,
  });
  const created = row.toObject();
  await notifyListWatchers({
    listId: list._id,
    board,
    actorId: userId,
    title: 'Thẻ được sao chép',
    content: `Thẻ "${created.title}" vừa được thêm`,
  });
  return created;
}

async function archiveCard({ userId, cardId }) {
  const card = await Task.findById(cardId);
  if (!card || !card.boardId || !card.isActive) throw new Error('Card không tồn tại');
  const board = await ensureBoardEditAccess(card.boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  const { isProjectRbacV2Enabled, hasPermission, assertPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled() && board.projectId) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({
      userId,
      projectId: board.projectId,
      boardId: board._id,
    });
    assertPermission(resolved.permissions, 'task:delete', 'Không có quyền xóa/archive thẻ (task:delete)');
  }
  card.isActive = false;
  await card.save();
  try {
    const approvalService = require('./approval.service');
    await approvalService.cancelPendingForEntity({
      entityType: 'task',
      entityId: card._id,
      actorId: userId,
      reason: 'card_archived',
    });
  } catch {
    /* best-effort T5 */
  }
  return { cardId: String(card._id), archived: true };
}

async function reorderList({ userId, boardId, listId, position }) {
  const board = await ensureBoardEditAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền sửa board này');
  const boardOid = board._id;
  const listOid = toOid(listId);
  if (!listOid) throw new Error('listId không hợp lệ');
  const lists = await fetchActiveLists(boardOid);
  const ids = lists.map((l) => String(l._id));
  const fromIdx = ids.indexOf(String(listId));
  if (fromIdx < 0) throw new Error('List không tồn tại');
  const pos = Math.max(1, Math.min(Number(position) || 1, ids.length));
  const nextIds = ids.filter((id) => id !== String(listId));
  nextIds.splice(pos - 1, 0, String(listId));
  await reindexListOrders(boardOid, nextIds.map((id) => toOid(id)));
  return fetchActiveLists(boardOid);
}

async function copyList({ userId, listId, title, toBoardId }) {
  const src = await TaskBoardList.findById(listId).lean();
  if (!src || src.isArchived) throw new Error('List không tồn tại');
  const targetBoardId = toBoardId || src.boardId;
  const board = await ensureBoardEditAccess(targetBoardId, userId);
  if (!board) throw new Error('Không có quyền sửa board đích');
  const targetOid = board._id;
  const lists = await fetchActiveLists(targetOid);
  const nextOrder = (Number(lists[lists.length - 1]?.order) || 0) + 1000;
  const newList = await TaskBoardList.create({
    boardId: targetOid,
    title: String(title || src.title || '').trim() || src.title,
    order: nextOrder,
    isDefault: false,
    isArchived: false,
  });
  const cards = await Task.find({ listId: src._id, isActive: true }).sort({ position: 1 }).lean();
  if (cards.length) {
    const rows = cards.map((c, idx) => ({
      boardId: targetOid,
      listId: newList._id,
      organizationId: board.organizationId,
      ...boardScopeTaskFields(board),
      title: c.title,
      summary: c.summary || '',
      description: c.description || '',
      assigneeId: c.assigneeId || null,
      createdBy: userId,
      priority: c.priority || 'medium',
      dueDate: c.dueDate || null,
      position: (idx + 1) * 1000,
      tags: Array.isArray(c.tags) ? c.tags : [],
      isActive: true,
    }));
    await Task.insertMany(rows, { ordered: false });
  }
  return newList.toObject();
}

async function moveList({ userId, listId, toBoardId, position }) {
  const src = await TaskBoardList.findById(listId);
  if (!src || src.isArchived) throw new Error('List không tồn tại');
  const sourceBoard = await ensureBoardEditAccess(src.boardId, userId);
  if (!sourceBoard) throw new Error('Không có quyền sửa board nguồn');
  const targetBoard = await ensureBoardEditAccess(toBoardId, userId);
  if (!targetBoard) throw new Error('Không có quyền sửa board đích');
  const targetOid = targetBoard._id;
  src.boardId = targetOid;
  await src.save();
  await Task.updateMany(
    { listId: src._id, isActive: true },
    {
      $set: {
        boardId: targetOid,
        organizationId: targetBoard.organizationId,
        ...boardScopeTaskFields(targetBoard),
      },
    }
  );
  const lists = await fetchActiveLists(targetOid);
  const ids = lists.map((l) => String(l._id)).filter((id) => id !== String(listId));
  const pos = Math.max(1, Math.min(Number(position) || ids.length + 1, ids.length + 1));
  ids.splice(pos - 1, 0, String(listId));
  await reindexListOrders(targetOid, ids.map((id) => toOid(id)));
  return src.toObject();
}

async function moveAllCardsInList({ userId, listId, toListId }) {
  const src = await TaskBoardList.findById(listId).lean();
  if (!src || src.isArchived) throw new Error('List nguồn không tồn tại');
  const dst = await TaskBoardList.findById(toListId).lean();
  if (!dst || dst.isArchived) throw new Error('List đích không tồn tại');
  const srcBoard = await ensureBoardEditAccess(src.boardId, userId);
  const dstBoard = await ensureBoardEditAccess(dst.boardId, userId);
  if (!srcBoard || !dstBoard) throw new Error('Không có quyền sửa board');
  const last = await Task.findOne({ boardId: dst.boardId, listId: toListId, isActive: true })
    .sort({ position: -1 })
    .lean();
  let nextPos = Number(last?.position) || 0;
  const cards = await Task.find({ listId: src._id, isActive: true }).sort({ position: 1 }).lean();
  for (const card of cards) {
    nextPos += 1000;
    await Task.updateOne(
      { _id: card._id },
      {
        $set: {
          listId: toListId,
          boardId: dst.boardId,
          organizationId: dstBoard.organizationId,
          ...boardScopeTaskFields(dstBoard),
          position: nextPos,
        },
      }
    );
  }
  await notifyListWatchers({
    listId: toListId,
    board: dstBoard,
    actorId: userId,
    title: 'Thẻ được chuyển hàng loạt',
    content: `${cards.length} thẻ vừa được chuyển vào danh sách "${dst.title}"`,
  });
  return { movedCount: cards.length };
}

async function archiveList({ userId, boardId, listId }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const canAdmin = await userCanAdminBoard(userId, board);
  if (!canAdmin) throw new Error('Chỉ Owner/Admin mới được lưu trữ danh sách');

  const boardOid = board._id;
  const listOid = toOid(listId);
  if (!listOid) throw new Error('listId không hợp lệ');

  const list = await TaskBoardList.findOne({ _id: listOid, boardId: boardOid, isArchived: false });
  if (!list) throw new Error('Danh sách không tồn tại hoặc đã bị xóa');

  const activeListCount = await TaskBoardList.countDocuments({ boardId: boardOid, isArchived: false });
  const cardCount = await Task.countDocuments({ listId: listOid, isActive: true });
  const policy = resolveListArchivePolicy({
    list,
    cardCount,
    activeListCount,
    canAdmin: true,
  });
  if (!policy.canArchive) {
    throw new Error(policy.archiveBlockReason || 'Không thể lưu trữ danh sách');
  }

  list.isArchived = true;
  await list.save();
  await TaskBoardListWatcher.deleteMany({ listId: listOid });

  return { listId: String(list._id), archived: true };
}

/** Đóng board; nếu có projectId thì archive cả Project. */
async function archiveBoard({ userId, boardId }) {
  const board = await TaskBoard.findById(boardId);
  if (!board || !board.isActive) throw new Error('Board không tồn tại hoặc đã đóng');
  if (board.projectId) {
    const projectService = require('./project.service');
    return projectService.archiveProject({ userId, projectId: board.projectId });
  }
  const canAdmin = await userCanAdminBoard(userId, board);
  if (!canAdmin) throw new Error('Chỉ Owner/Admin board hoặc tổ chức mới được đóng dự án');
  await persistClosedBoardExperiences(board);
  board.isActive = false;
  await board.save();
  return board.toObject();
}

const {
  BOARD_IDENTITY_PATCH_KEYS,
  buildBoardIdentityPatch,
} = require('../utils/boardIdentityPatch');

/** Project Settings — PATCH identity trên Project khi board có projectId. */
async function patchBoard({ userId, boardId, patch }) {
  const board = await TaskBoard.findById(boardId);
  if (!board || !board.isActive) throw new Error('Board không tồn tại hoặc đã đóng');

  if (board.projectId) {
    const projectService = require('./project.service');
    await projectService.patchProject({
      userId,
      projectId: board.projectId,
      patch,
    });
    return projectService.attachProjectIdentityToBoard(board.toObject());
  }

  const canAdmin = await userCanAdminBoard(userId, board);
  const caps = await resolveBoardCapabilities(userId, board.toObject());
  if (!canAdmin && !caps.canManageBoard) {
    throw new Error('Không có quyền sửa settings dự án');
  }

  const built = buildBoardIdentityPatch(patch);
  if (!built.ok) {
    const err = new Error(built.message);
    err.statusCode = 400;
    throw err;
  }

  Object.assign(board, built.$set);
  await board.save();
  return board.toObject();
}

async function setListWatch({ userId, listId, watching }) {
  const list = await TaskBoardList.findById(listId).lean();
  if (!list || list.isArchived) throw new Error('List không tồn tại');
  const board = await ensureBoardViewAccess(list.boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');
  const userOid = toOid(userId);
  const listOid = toOid(listId);
  if (!userOid || !listOid) throw new Error('userId/listId không hợp lệ');
  if (watching) {
    await TaskBoardListWatcher.findOneAndUpdate(
      { listId: listOid, userId: userOid },
      { listId: listOid, boardId: board._id, userId: userOid },
      { upsert: true, new: true }
    );
    return { watching: true, watcherCount: await TaskBoardListWatcher.countDocuments({ listId: listOid }) };
  }
  await TaskBoardListWatcher.deleteOne({ listId: listOid, userId: userOid });
  return { watching: false, watcherCount: await TaskBoardListWatcher.countDocuments({ listId: listOid }) };
}

async function listBoardAssignableMembers({ userId, boardId, evaluateCanAssign }) {
  const board = await ensureBoardViewAccess(boardId, userId);
  if (!board) throw new Error('Không có quyền xem board này');

  const orgId = String(board.organizationId);
  const scopeType = String(board.scopeType || '').toLowerCase() || 'organization';
  const scopeId = String(board.scopeId || board.organizationId || '');
  const candidateIds = new Set();

  const boardMemberRows = await TaskBoardMember.find({ boardId: board._id, canView: true })
    .select('userId')
    .lean();
  for (const row of boardMemberRows) {
    if (row?.userId) candidateIds.add(String(row.userId));
  }
  if (board.createdBy) candidateIds.add(String(board.createdBy));

  if (board.projectId) {
    const pmRows = await ProjectMembership.find({ projectId: board.projectId })
      .select('userId')
      .lean();
    for (const row of pmRows) {
      if (row?.userId) candidateIds.add(String(row.userId));
    }
  } else {
    const orgMembers = await fetchOrganizationMembers(userId, orgId);
    for (const m of orgMembers) {
      // Org-level board: mọi thành viên org là ứng viên assign (sau migrate scope).
      candidateIds.add(String(m.userId));
    }
  }

  const allowedRoleIds = [];

  let members = await enrichAssignableProfiles([...candidateIds], userId);
  members = members.map((m) => ({ ...m, suggested: false }));

  if (evaluateCanAssign) {
    const { assertCanAssign } = require('./assignmentEngine.service');
    const withFlags = [];
    for (const m of members) {
      const check = await assertCanAssign({
        actorUserId: userId,
        targetUserId: m.userId,
        boardId: board._id,
        taskType: '*',
        systemMembershipRole: null,
      });
      withFlags.push({ ...m, canAssign: Boolean(check?.ok) });
    }
    members = withFlags;
  }

  return { members, teamId: scopeType === 'team' ? scopeId : '', scopeType, scopeId, allowedRoleIds };
}

async function ensureAssigneeBoardAccess({ boardId, assigneeId, actorId }) {
  if (!boardId || !assigneeId) return;
  const exists = await TaskBoardMember.findOne({ boardId, userId: assigneeId }).lean();
  if (!exists) {
    try {
      await TaskBoardMember.create({
        boardId,
        userId: assigneeId,
        role: 'viewer',
        canView: true,
        canEdit: false,
        addedBy: actorId,
      });
    } catch (err) {
      logger.warn('[task-board] ensure assignee access failed: %s', err.message);
    }
  }
  try {
    const board = await TaskBoard.findById(boardId).select('projectId').lean();
    const projectId = board?.projectId || null;
    const existingPm = projectId
      ? await ProjectMembership.findOne({ projectId, userId: assigneeId }).lean()
      : await ProjectMembership.findOne({ boardId, userId: assigneeId }).lean();
    if (!existingPm) {
      await ensureProjectMembership({
        boardId,
        projectId: projectId || undefined,
        userId: assigneeId,
        projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.DEVELOPER,
        addedBy: actorId,
      });
    }
  } catch (err) {
    logger.warn('[task-board] ensure project membership failed: %s', err.message);
  }
}

module.exports = {
  createBoard,
  listBoards,
  getBoardDetail,
  listBoardAssignableMembers,
  createList,
  createCard,
  moveCard,
  updateCard,
  addCardComment,
  copyCard,
  archiveCard,
  reorderList,
  copyList,
  moveList,
  moveAllCardsInList,
  setListWatch,
  archiveList,
  archiveBoard,
  patchBoard,
  buildBoardIdentityPatch,
  BOARD_IDENTITY_PATCH_KEYS,
  userCanAdminBoard,
  resolveBoardCapabilities,
  ensureBoardViewAccess,
  ensureBoardEditAccess,
  ensureAssigneeBoardAccess,
  createWorkGroup,
};

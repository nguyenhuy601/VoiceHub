const mongoose = require('../db');
const Project = require('../models/Project');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const TaskBoardMember = require('../models/TaskBoardMember');
const Task = require('../models/Task');
const TaskActivityLog = require('../models/TaskActivityLog');
const Sprint = require('../models/Sprint');
const ProjectMembership = require('../models/ProjectMembership');
const { logger } = require('@enterprise/shared');
const {
  fetchTaskWorkspaceScope,
  canCreateTaskInScope,
} = require('./taskWorkspaceScope');
const {
  ensureOrgProjectRoles,
  ensureProjectMembership,
  setUserProjectRoles,
} = require('./projectTeam.service');
const { applyDelegationTemplate } = require('./delegation.service');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');
const {
  isCreateBoardSeedEnabled,
  normalizeDelegationTemplateId,
  normalizeSeedMembers,
} = require('../utils/createBoardSeed');
const {
  buildProjectCodeBase,
  allocateUniqueProjectCode,
} = require('@enterprise/shared/utils/projectCodeGenerate');
const { buildBoardIdentityPatch, resolveBoardScope } = require('../utils/boardIdentityPatch');
const { buildProjectInitFields } = require('../utils/projectInitFields');
const {
  assertDeliveryRoster,
  collectCreateProjectRoleKeys,
  normalizeRoleKeys,
} = require('../utils/projectDeliveryRoster');
const { normalizeRequiredProjectRoles } = require('../utils/requiredProjectRoles');
const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
const {
  isProjectVisibilityV2Enabled,
  resolveProjectAccess,
  applyInformationLevelToProject,
  normalizeRelatedDepartmentIds,
  normalizeInformationLevelOverrides,
  normalizeProjectVisibilityPolicy,
  assertCanUseCustomProjectVisibility,
} = require('../utils/projectVisibility');

const DEFAULT_BOARD_TITLE = 'Main';
const DEFAULT_LIST_TITLES = Object.freeze(['To Do', 'In Progress', 'Done']);

const LEAD_ROLE_SLOT_KEYS = Object.freeze({
  projectManagerId: DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  productOwnerId: DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
  scrumMasterId: DEFAULT_PROJECT_ROLE_KEYS.SCRUM_MASTER,
  techLeadId: DEFAULT_PROJECT_ROLE_KEYS.TECH_LEAD,
});

function toValidUserId(id) {
  const s = String(id || '').trim();
  return mongoose.Types.ObjectId.isValid(s) ? s : '';
}
function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function ensureUniqueProjectCode(organizationId, preferred) {
  const base = String(preferred || '').trim().slice(0, 64);
  if (!base) return base;
  const rows = await Project.find({
    organizationId,
    projectCode: { $regex: `^${escapeRegex(base)}(-[0-9]+)?$` },
  })
    .select('projectCode')
    .lean();
  const existing = rows.map((r) => String(r.projectCode || '').trim()).filter(Boolean);
  return allocateUniqueProjectCode(base, existing);
}

async function logActivity({
  organizationId,
  projectId,
  boardId = null,
  taskId = null,
  actorId,
  type,
  title = '',
  payload = {},
}) {
  try {
    await TaskActivityLog.create({
      organizationId,
      projectId,
      boardId,
      taskId,
      actorId,
      type,
      title: String(title || '').slice(0, 500),
      payload,
    });
  } catch (err) {
    logger.warn('[project] activity log failed: %s', err.message);
  }
}

async function seedDefaultLists(boardId) {
  const STATUS_KEYS = ['todo', 'in_progress', 'done'];
  const rows = DEFAULT_LIST_TITLES.map((title, idx) => ({
    boardId,
    title,
    statusKey: STATUS_KEYS[idx] || '',
    order: (idx + 1) * 1000,
    isArchived: false,
    isDefault: idx === 0,
  }));
  await TaskBoardList.insertMany(rows);
  return TaskBoardList.find({ boardId, isArchived: false }).sort({ order: 1 }).lean();
}

/**
 * Create Project + default Board (Main) + lists + PM ownership (status ready_for_planning).
 * projectId !== boardId.
 */
async function createProject({
  userId,
  organizationId,
  teamId,
  scopeType,
  scopeId,
  title,
  description,
  projectCode,
  scopeLabel,
  dueDate,
  background,
  visibility,
  delegationTemplateId,
  members,
  projectType,
  category,
  priority,
  tags,
  startDate,
  expectedEndDate,
  estimatedDurationDays,
  workingCalendar,
  methodology,
  methodologySettings,
  sprintDurationDays,
  sprintStartDay,
  wipLimit,
  customer,
  projectManagerId,
  productOwnerId,
  scrumMasterId,
  techLeadId,
  visibilityMode,
  visibilityPolicy,
  informationLevelOverrides,
  relatedDepartmentIds,
}) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  if (!scope || !canCreateTaskInScope(scope)) {
    throw new Error('Bạn không có quyền tạo dự án');
  }
  // Project thuộc Organization — map mọi create (kể cả legacy dept/team/div) sang org scope.
  const orgIdStr = String(organizationId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(orgIdStr)) {
    throw new Error('organizationId không hợp lệ');
  }
  const nextScope = { scopeType: 'organization', scopeId: orgIdStr };
  if (scopeType && ['team', 'department', 'division'].includes(String(scopeType).toLowerCase())) {
    logger.info('[createProject] legacy unit scope ignored; using organization', {
      requestedScopeType: scopeType,
      organizationId: orgIdStr,
    });
  }

  const init = buildProjectInitFields({
    status: 'ready_for_planning',
    projectType,
    category,
    priority,
    tags,
    startDate,
    expectedEndDate: expectedEndDate !== undefined ? expectedEndDate : dueDate,
    dueDate,
    estimatedDurationDays,
    workingCalendar,
    methodology,
    methodologySettings,
    sprintDurationDays,
    sprintStartDay,
    wipLimit,
    customer,
  });
  if (!init.ok) throw new Error(init.message);

  let due = init.fields.dueDate || null;
  if (!due && dueDate !== undefined && dueDate !== null && String(dueDate).trim() !== '') {
    const parsed = new Date(dueDate);
    if (Number.isNaN(parsed.getTime())) throw new Error('dueDate không hợp lệ');
    due = parsed;
  }

  const titleTrim = String(title || '').trim();
  if (!titleTrim) throw new Error('title là bắt buộc');

  assertDeliveryRoster(
    collectCreateProjectRoleKeys({
      productOwnerId,
      scrumMasterId,
      techLeadId,
      members,
    })
  );

  let code = String(projectCode || '').trim();
  if (!code) {
    code = buildProjectCodeBase({
      title: titleTrim,
      scopeType: nextScope.scopeType,
      scopeLabel: String(scopeLabel || '').trim(),
      dueDate: due,
    });
  }
  code = await ensureUniqueProjectCode(organizationId, code);

  const mode =
    String(visibilityMode || 'inherit').toLowerCase() === 'custom' ? 'custom' : 'inherit';
  if (mode === 'custom') {
    const ctx = await fetchProjectVisibilityContext(organizationId, userId);
    assertCanUseCustomProjectVisibility(ctx, userId);
  }

  const project = await Project.create({
    organizationId,
    teamId: null,
    scopeType: nextScope.scopeType,
    scopeId: nextScope.scopeId,
    title: titleTrim,
    description: String(description || '').trim(),
    projectCode: code,
    dueDate: due,
    background: String(background || '').trim(),
    visibility: visibility === 'workspace' ? 'workspace' : 'private',
    visibilityMode: mode,
    visibilityPolicy:
      mode === 'custom' ? normalizeProjectVisibilityPolicy(visibilityPolicy || {}) : null,
    informationLevelOverrides: normalizeInformationLevelOverrides(informationLevelOverrides),
    relatedDepartmentIds: normalizeRelatedDepartmentIds(relatedDepartmentIds),
    createdBy: userId,
    isActive: true,
    ...init.fields,
    dueDate: init.fields.dueDate !== undefined ? init.fields.dueDate : due,
  });

  const board = await TaskBoard.create({
    projectId: project._id,
    organizationId,
    teamId: project.teamId,
    scopeType: project.scopeType,
    scopeId: project.scopeId,
    title: DEFAULT_BOARD_TITLE,
    background: project.background,
    createdBy: userId,
    isActive: true,
  });

  const lists = await seedDefaultLists(board._id);

  const pmUserId = toValidUserId(projectManagerId) || String(userId);
  const ownerUserId = pmUserId;

  await TaskBoardMember.create({
    boardId: board._id,
    userId: ownerUserId,
    role: 'owner',
    canView: true,
    canEdit: true,
    addedBy: userId,
  });

  if (String(userId) !== String(ownerUserId)) {
    try {
      await TaskBoardMember.create({
        boardId: board._id,
        userId,
        role: 'editor',
        canView: true,
        canEdit: true,
        addedBy: userId,
      });
    } catch (err) {
      logger.warn('[project] creator board member: %s', err.message);
    }
  }

  const templateId = normalizeDelegationTemplateId(delegationTemplateId);

  // Creator mặc định: Product Owner (+ role kiêm nhiệm nếu gửi trong members).
  try {
    await ensureOrgProjectRoles(organizationId);
    const creatorSeed = (Array.isArray(members) ? members : []).find(
      (m) => String(m?.userId || m?.id || '') === String(userId)
    );
    const creatorKeys = normalizeRoleKeys([
      DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
      ...((creatorSeed && Array.isArray(creatorSeed.projectRoleKeys)
        ? creatorSeed.projectRoleKeys
        : [])),
    ]);
    await setUserProjectRoles({
      projectId: project._id,
      boardId: board._id,
      userId: ownerUserId,
      projectRoleKeys:
        String(ownerUserId) === String(userId)
          ? creatorKeys
          : [DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER],
      addedBy: userId,
      boardRole: 'owner',
    });
    if (String(userId) !== String(ownerUserId)) {
      await setUserProjectRoles({
        projectId: project._id,
        boardId: board._id,
        userId,
        projectRoleKeys: creatorKeys,
        addedBy: userId,
        boardRole: 'editor',
      });
    }
  } catch (err) {
    logger.warn('[project] creator product-owner membership failed: %s', err.message);
    try {
      await ensureProjectMembership({
        projectId: project._id,
        boardId: board._id,
        userId: ownerUserId,
        projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
        addedBy: userId,
        organizationId,
      });
    } catch (fallbackErr) {
      logger.warn('[project] creator membership fallback failed: %s', fallbackErr.message);
    }
  }

  try {
    const leadSlots = {
      productOwnerId,
      scrumMasterId,
      techLeadId,
    };
    for (const [slot, roleKey] of Object.entries({
      productOwnerId: LEAD_ROLE_SLOT_KEYS.productOwnerId,
      scrumMasterId: LEAD_ROLE_SLOT_KEYS.scrumMasterId,
      techLeadId: LEAD_ROLE_SLOT_KEYS.techLeadId,
    })) {
      const uid = toValidUserId(leadSlots[slot]);
      if (!uid) continue;
      await setUserProjectRoles({
        projectId: project._id,
        boardId: board._id,
        userId: uid,
        projectRoleKeys: [roleKey],
        addedBy: userId,
        boardRole: 'editor',
      });
    }

    await applyDelegationTemplate(board._id, templateId);
  } catch (err) {
    logger.warn('[project] team bootstrap failed: %s', err.message);
  }

  if (isCreateBoardSeedEnabled()) {
    const seedRows = normalizeSeedMembers(members, { creatorUserId: userId });
    for (const row of seedRows) {
      try {
        await setUserProjectRoles({
          projectId: project._id,
          boardId: board._id,
          userId: row.userId,
          projectRoleKeys: row.projectRoleKeys,
          addedBy: userId,
          boardRole: row.boardRole,
        });
      } catch (err) {
        logger.warn('[project] seed member failed user=%s: %s', row.userId, err.message);
      }
    }
  }

  await logActivity({
    organizationId,
    projectId: project._id,
    boardId: board._id,
    actorId: userId,
    type: 'project.created',
    title: `Tạo dự án ${titleTrim}`,
    payload: {
      projectCode: code,
      defaultBoardId: String(board._id),
      status: project.status,
      methodology: project.methodology,
    },
  });

  try {
    const auditService = require('./audit.service');
    await auditService.recordMutationAudit({
      organizationId,
      actorUserId: userId,
      action: 'project.created',
      resourceType: 'project',
      resourceId: String(project._id),
      beforeDoc: null,
      afterDoc: project.toObject(),
      keys: ['title', 'projectCode', 'status', 'dueDate', 'visibilityMode', 'isActive'],
    });
  } catch {
    /* best-effort */
  }

  const projectObj = project.toObject();
  const boardObj = board.toObject();
  return {
    ...projectObj,
    projectId: String(projectObj._id),
    defaultBoardId: String(boardObj._id),
    board: boardObj,
    boards: [boardObj],
    lists,
  };
}

function toOidList(ids = []) {
  return (ids || [])
    .map((id) => String(id || '').trim())
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));
}

async function listProjects({
  userId,
  organizationId,
  teamId,
  scopeType,
  scopeId,
  includeArchived = false,
}) {
  const userOid = mongoose.Types.ObjectId.isValid(userId)
    ? new mongoose.Types.ObjectId(String(userId))
    : null;
  const orgOid = mongoose.Types.ObjectId.isValid(organizationId)
    ? new mongoose.Types.ObjectId(String(organizationId))
    : null;
  if (!userOid || !orgOid) return [];

  let allowArchived = false;
  if (includeArchived) {
    try {
      const scope = await fetchTaskWorkspaceScope(userId, organizationId);
      const role = String(scope?.membershipRole || '').toLowerCase();
      allowArchived = role === 'owner' || role === 'admin';
    } catch {
      allowArchived = false;
    }
  }

  const base = { organizationId: orgOid };
  if (!allowArchived) base.isActive = true;
  const st = String(scopeType || '').toLowerCase();
  if (st === 'organization' && scopeId && mongoose.Types.ObjectId.isValid(scopeId)) {
    base.scopeType = 'organization';
    base.scopeId = new mongoose.Types.ObjectId(String(scopeId));
  }
  void teamId;

  const useV2 = isProjectVisibilityV2Enabled();
  let visibilityCtx = null;
  if (useV2) {
    visibilityCtx = await fetchProjectVisibilityContext(organizationId, userId);
    if (!visibilityCtx.isOrgMember) return [];
  }

  const memberRows = await ProjectMembership.find({ userId: userOid })
    .select('projectId projectRoleId')
    .lean();
  const roleIdsNeeded = [
    ...new Set(memberRows.map((r) => String(r.projectRoleId || '')).filter(Boolean)),
  ];
  const ProjectRole = require('../models/ProjectRole');
  const roleDocs = roleIdsNeeded.length
    ? await ProjectRole.find({ _id: { $in: roleIdsNeeded } }).select('_id key').lean()
    : [];
  const roleKeyById = new Map(roleDocs.map((r) => [String(r._id), String(r.key || '').trim()]));
  const roleKeysByProject = new Map();
  for (const row of memberRows) {
    const pid = String(row.projectId || '');
    if (!pid) continue;
    if (!roleKeysByProject.has(pid)) roleKeysByProject.set(pid, []);
    const rk = roleKeyById.get(String(row.projectRoleId || '')) || '';
    if (rk) roleKeysByProject.get(pid).push(rk);
  }
  const memberProjectIds = [...roleKeysByProject.keys()]
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  let projects;
  if (useV2) {
    // Broad org list — filter discover in-memory (related depts / policy).
    projects = await Project.find(base).sort({ createdAt: -1 }).lean();
  } else {
    const accessOr = [{ createdBy: userOid }];
    if (memberProjectIds.length) accessOr.push({ _id: { $in: memberProjectIds } });
    const workspaceScope = await fetchTaskWorkspaceScope(userId, organizationId);
    if (workspaceScope) accessOr.push({ visibility: 'workspace' });
    projects = await Project.find({ ...base, $or: accessOr }).sort({ createdAt: -1 }).lean();
  }

  if (!projects.length) return [];

  const projectIds = projects.map((p) => p._id);
  const [boards, membershipRows] = await Promise.all([
    TaskBoard.find({
      projectId: { $in: projectIds },
      isActive: true,
    })
      .sort({ createdAt: 1 })
      .lean(),
    ProjectMembership.find({ projectId: { $in: projectIds } })
      .select('projectId userId')
      .lean(),
  ]);

  const boardsByProject = new Map();
  for (const b of boards) {
    const key = String(b.projectId);
    if (!boardsByProject.has(key)) boardsByProject.set(key, []);
    boardsByProject.get(key).push(b);
  }

  const memberCountByProject = new Map();
  for (const row of membershipRows) {
    const key = String(row.projectId);
    if (!memberCountByProject.has(key)) memberCountByProject.set(key, new Set());
    const uid = String(row.userId || '').trim();
    if (uid) memberCountByProject.get(key).add(uid);
  }

  const healJobs = [];
  for (const p of projects) {
    const key = String(p._id);
    const users = memberCountByProject.get(key) || new Set();
    const creatorId = String(p.createdBy || '').trim();
    if (creatorId && !users.has(creatorId)) {
      healJobs.push(
        (async () => {
          try {
            await ensureOrgProjectRoles(p.organizationId);
            await ensureProjectMembership({
              projectId: p._id,
              boardId: (boardsByProject.get(key) || [])[0]?._id || null,
              userId: creatorId,
              projectRoleKey: DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
              addedBy: creatorId,
              organizationId: p.organizationId,
            });
            users.add(creatorId);
            memberCountByProject.set(key, users);
            if (!roleKeysByProject.has(key)) roleKeysByProject.set(key, []);
            roleKeysByProject.get(key).push(DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER);
          } catch (err) {
            logger.warn('[listProjects] creator membership heal failed project=%s: %s', key, err.message);
          }
        })()
      );
    }
  }
  if (healJobs.length) await Promise.all(healJobs);

  const actor = visibilityCtx
    ? {
        userId: String(userId),
        isOrgMember: visibilityCtx.isOrgMember,
        membershipRole: visibilityCtx.membershipRole,
        organizationRoleKeys: visibilityCtx.organizationRoleKeys,
        headedDepartmentIds: visibilityCtx.headedDepartmentIds,
        memberDepartmentIds: visibilityCtx.memberDepartmentIds,
      }
    : null;

  const result = [];
  for (const p of projects) {
    const key = String(p._id);
    const pBoards = boardsByProject.get(key) || [];
    const defaultBoard = pBoards[0] || null;
    const memberUsers = memberCountByProject.get(key);
    const memberCount = memberUsers ? memberUsers.size : 0;
    const projectRoleKeys = roleKeysByProject.get(key) || [];
    const isMember = projectRoleKeys.length > 0 || (memberUsers && memberUsers.has(String(userId)));

    let access = { discover: true, informationLevel: 'details', audiences: [] };
    if (useV2 && actor) {
      access = resolveProjectAccess({
        actor,
        project: p,
        membership: { isMember, projectRoleKeys },
        orgPolicy: visibilityCtx.policy,
      });
      if (!access.discover) continue;
    }

    const payload = applyInformationLevelToProject(
      {
        ...p,
        projectId: key,
        defaultBoardId: defaultBoard ? String(defaultBoard._id) : null,
        boards: access.informationLevel === 'summary' ? undefined : pBoards,
        memberCount,
        membersCount: memberCount,
        access,
        myMembership: {
          isMember: Boolean(isMember),
          projectRoleKeys: [...new Set((projectRoleKeys || []).map(String).filter(Boolean))],
        },
      },
      access.informationLevel
    );
    result.push(payload);
  }
  return result;
}

async function getProject({ userId, projectId }) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }

  const useV2 = isProjectVisibilityV2Enabled();
  if (useV2) {
    const visibilityCtx = await fetchProjectVisibilityContext(project.organizationId, userId);
    const membershipRows = await ProjectMembership.find({
      projectId: project._id,
      userId,
    })
      .select('projectRoleId')
      .lean();
    const roleIds = membershipRows.map((r) => r.projectRoleId).filter(Boolean);
    const ProjectRole = require('../models/ProjectRole');
    const roleDocs = roleIds.length
      ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key').lean()
      : [];
    const projectRoleKeys = roleDocs.map((r) => String(r.key || '').trim()).filter(Boolean);
    const isMember =
      membershipRows.length > 0 ||
      projectRoleKeys.length > 0 ||
      String(project.createdBy) === String(userId);
    const access = resolveProjectAccess({
      actor: {
        userId: String(userId),
        isOrgMember: visibilityCtx.isOrgMember,
        membershipRole: visibilityCtx.membershipRole,
        organizationRoleKeys: visibilityCtx.organizationRoleKeys,
        headedDepartmentIds: visibilityCtx.headedDepartmentIds,
        memberDepartmentIds: visibilityCtx.memberDepartmentIds,
      },
      project,
      membership: {
        isMember,
        projectRoleKeys,
      },
      orgPolicy: visibilityCtx.policy,
    });
    if (!access.discover) {
      const err = new Error('Project không tồn tại');
      err.statusCode = 404;
      throw err;
    }

    const boards =
      access.informationLevel === 'summary'
        ? []
        : await TaskBoard.find({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
    const defaultBoard = boards[0] || null;
    const basePayload = applyInformationLevelToProject(
      {
        ...project,
        projectId: String(project._id),
        defaultBoardId: defaultBoard ? String(defaultBoard._id) : null,
        boards,
        access,
      },
      access.informationLevel
    );
    return attachProjectCapabilities(basePayload, userId, project._id);
  }

  const boardService = require('./taskBoard.service');
  const boards = await TaskBoard.find({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
  const defaultBoard = boards[0] || null;
  if (defaultBoard) {
    const ok = await boardService.ensureBoardViewAccess(defaultBoard._id, userId);
    if (!ok && String(project.createdBy) !== String(userId)) {
      const err = new Error('Không có quyền xem dự án');
      err.statusCode = 403;
      throw err;
    }
  } else if (String(project.createdBy) !== String(userId)) {
    const err = new Error('Không có quyền xem dự án');
    err.statusCode = 403;
    throw err;
  }
  return attachProjectCapabilities(
    {
      ...project,
      projectId: String(project._id),
      defaultBoardId: defaultBoard ? String(defaultBoard._id) : null,
      boards,
    },
    userId,
    project._id
  );
}

async function attachProjectCapabilities(payload, userId, projectId) {
  if (payload && typeof payload === 'object') {
    delete payload.technicalSetup;
  }
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (!isProjectRbacV2Enabled()) {
    return payload;
  }
  const { resolveUserProjectPermissions } = require('./projectAccess.service');
  const resolved = await resolveUserProjectPermissions({ userId, projectId });
  const perms = resolved.permissions || [];
  const bypass = resolved.isOrgAdmin || resolved.isCreator;
  return {
    ...payload,
    capabilities: {
      ...resolved.capabilities,
      permissions: perms,
      canManagePlanning: bypass || hasPermission(perms, 'project:edit'),
      canManageMembers: bypass || hasPermission(perms, 'members:manage'),
      canViewMembers:
        bypass ||
        hasPermission(perms, 'members:view') ||
        hasPermission(perms, 'members:manage'),
      canManageSettings: bypass || hasPermission(perms, 'settings:update'),
      canManageSprints:
        bypass || hasPermission(perms, 'sprint:create') || hasPermission(perms, 'sprint:close'),
      canCreateEpic: bypass || hasPermission(perms, 'epic:create'),
      canUpdateEpic: bypass || hasPermission(perms, 'epic:update'),
      canDeleteEpic: bypass || hasPermission(perms, 'epic:delete'),
      canCreateStory: bypass || hasPermission(perms, 'story:create'),
      canUpdateStory: bypass || hasPermission(perms, 'story:update'),
      canCreateTask: bypass || hasPermission(perms, 'task:create'),
      canCreateBug: bypass || hasPermission(perms, 'bug:create'),
      canPrioritizeBacklog: bypass || hasPermission(perms, 'backlog:prioritize'),
      canUpdateBacklog: bypass || hasPermission(perms, 'backlog:update'),
      canEstimate: bypass || hasPermission(perms, 'task:estimate'),
    },
  };
}

async function listProjectMembersForUser({ userId, projectId }) {
  await getProject({ userId, projectId });
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { assertUserAnyProjectPermission } = require('./projectAccess.service');
    await assertUserAnyProjectPermission({
      userId,
      projectId,
      permissions: ['members:view', 'members:manage'],
      message: 'Không có quyền xem thành viên dự án',
    });
  }
  const { listProjectMemberships } = require('./projectTeam.service');
  return listProjectMemberships(projectId);
}

async function userCanAdminProject(userId, project) {
  if (!userId || !project) return false;
  if (String(project.createdBy) === String(userId)) return true;
  const boardService = require('./taskBoard.service');
  const board = await TaskBoard.findOne({ projectId: project._id, isActive: true }).lean();
  if (board) return boardService.userCanAdminBoard(userId, board);
  const scope = await fetchTaskWorkspaceScope(userId, project.organizationId);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  return orgRole === 'owner' || orgRole === 'admin';
}

async function assertProjectMatrixOrAdmin(userId, project, permissions, message) {
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { assertUserAnyProjectPermission } = require('./projectAccess.service');
    await assertUserAnyProjectPermission({
      userId,
      projectId: project._id || project.id,
      permissions,
      message,
    });
    return;
  }
  const canAdmin = await userCanAdminProject(userId, project);
  if (!canAdmin) {
    const err = new Error(message || 'Không có quyền trên dự án');
    err.statusCode = 403;
    throw err;
  }
}

async function patchProject({ userId, projectId, patch }) {
  const project = await Project.findById(projectId);
  if (!project || project.isActive === false) throw new Error('Project không tồn tại');
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    const canSettings =
      hasPermission(resolved.permissions, 'settings:update') ||
      hasPermission(resolved.permissions, 'project:edit') ||
      resolved.isOrgAdmin ||
      resolved.isCreator;
    if (!canSettings) {
      const err = new Error('Không có quyền sửa settings dự án (settings:update)');
      err.statusCode = 403;
      throw err;
    }
  } else {
    const canAdmin = await userCanAdminProject(userId, project.toObject());
    if (!canAdmin) throw new Error('Không có quyền sửa settings dự án');
  }

  const built = buildBoardIdentityPatch(patch);
  const init = buildProjectInitFields(patch, { partial: true });
  const hasStaffingPatch = Object.prototype.hasOwnProperty.call(patch || {}, 'requiredProjectRoles');
  const hasVisibilityPatch = [
    'visibilityMode',
    'visibilityPolicy',
    'informationLevelOverrides',
    'relatedDepartmentIds',
  ].some((k) => Object.prototype.hasOwnProperty.call(patch || {}, k));
  if (!built.ok && !init.ok && !hasStaffingPatch && !hasVisibilityPatch) {
    const err = new Error(built.message || init.message || 'Không có field hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  if (init.ok === false && Object.keys(patch || {}).some((k) =>
    [
      'status',
      'projectType',
      'category',
      'priority',
      'tags',
      'startDate',
      'expectedEndDate',
      'estimatedDurationDays',
      'workingCalendar',
      'methodology',
      'methodologySettings',
      'customer',
      'sprintDurationDays',
      'sprintStartDay',
      'wipLimit',
    ].includes(k)
  )) {
    const err = new Error(init.message);
    err.statusCode = 400;
    throw err;
  }

  const $set = {
    ...(built.ok ? built.$set : {}),
    ...(init.ok ? init.fields : {}),
  };
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'requiredProjectRoles')) {
    $set.requiredProjectRoles = normalizeRequiredProjectRoles(patch.requiredProjectRoles);
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'relatedDepartmentIds')) {
    $set.relatedDepartmentIds = normalizeRelatedDepartmentIds(patch.relatedDepartmentIds);
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'informationLevelOverrides')) {
    $set.informationLevelOverrides = normalizeInformationLevelOverrides(
      patch.informationLevelOverrides
    );
  }
  if (Object.prototype.hasOwnProperty.call(patch || {}, 'visibilityMode')) {
    const mode =
      String(patch.visibilityMode || 'inherit').toLowerCase() === 'custom' ? 'custom' : 'inherit';
    if (mode === 'custom') {
      const ctx = await fetchProjectVisibilityContext(project.organizationId, userId);
      assertCanUseCustomProjectVisibility(ctx, userId);
    }
    $set.visibilityMode = mode;
    if (mode === 'inherit') {
      $set.visibilityPolicy = null;
    } else if (Object.prototype.hasOwnProperty.call(patch || {}, 'visibilityPolicy')) {
      $set.visibilityPolicy = normalizeProjectVisibilityPolicy(patch.visibilityPolicy || {});
    } else if (!project.visibilityPolicy) {
      $set.visibilityPolicy = normalizeProjectVisibilityPolicy({});
    }
  } else if (Object.prototype.hasOwnProperty.call(patch || {}, 'visibilityPolicy')) {
    if (String(project.visibilityMode || 'inherit') !== 'custom') {
      const err = new Error('Chỉ được set visibilityPolicy khi visibilityMode=custom');
      err.statusCode = 400;
      throw err;
    }
    $set.visibilityPolicy = normalizeProjectVisibilityPolicy(patch.visibilityPolicy || {});
  }
  // Settings không được gắn lại project vào department/team/division.
  if ($set.scopeType !== undefined || $set.scopeId !== undefined || $set.teamId !== undefined) {
    $set.scopeType = 'organization';
    $set.scopeId = project.organizationId;
    $set.teamId = null;
  }
  if (!Object.keys($set).length) {
    const err = new Error('Không có field hợp lệ để cập nhật');
    err.statusCode = 400;
    throw err;
  }

  if ($set.projectCode !== undefined && $set.projectCode) {
    $set.projectCode = await ensureUniqueProjectCode(project.organizationId, $set.projectCode);
  }

  const beforeSnap = project.toObject();
  Object.assign(project, $set);
  await project.save();

  // Keep denorm scope/background on boards in sync when changed
  const boardSet = {};
  if ($set.scopeType !== undefined) boardSet.scopeType = $set.scopeType;
  if ($set.scopeId !== undefined) boardSet.scopeId = $set.scopeId;
  if ($set.teamId !== undefined) boardSet.teamId = $set.teamId;
  if ($set.background !== undefined) boardSet.background = $set.background;
  if (Object.keys(boardSet).length) {
    await TaskBoard.updateMany({ projectId: project._id }, { $set: boardSet });
  }

  await logActivity({
    organizationId: project.organizationId,
    projectId: project._id,
    actorId: userId,
    type: 'project.updated',
    title: 'Cập nhật settings dự án',
    payload: { fields: Object.keys($set) },
  });

  try {
    const auditService = require('./audit.service');
    await auditService.recordMutationAudit({
      organizationId: project.organizationId,
      actorUserId: userId,
      action: 'project.updated',
      resourceType: 'project',
      resourceId: String(project._id),
      beforeDoc: beforeSnap,
      afterDoc: project.toObject(),
      keys: Object.keys($set),
    });
  } catch {
    /* best-effort */
  }

  const boards = await TaskBoard.find({ projectId: project._id, isActive: true })
    .sort({ createdAt: 1 })
    .lean();
  return {
    ...project.toObject(),
    projectId: String(project._id),
    defaultBoardId: boards[0] ? String(boards[0]._id) : null,
    boards,
  };
}

async function archiveProject({ userId, projectId }) {
  const project = await Project.findById(projectId);
  if (!project || project.isActive === false) throw new Error('Project không tồn tại');
  await assertProjectMatrixOrAdmin(
    userId,
    project.toObject(),
    ['project:archive'],
    'Không có quyền đóng dự án (project:archive)'
  );
  const beforeSnap = project.toObject();
  const now = new Date();
  project.isActive = false;
  project.archivedAt = now;
  let retentionDays = project.retentionDays;
  if (!retentionDays) {
    try {
      const governanceService = require('./governance.service');
      const settings = await governanceService.getOrCreateSettings(project.organizationId);
      retentionDays = settings.defaultRetentionDays || 365;
    } catch {
      retentionDays = 365;
    }
  }
  project.retentionUntil = new Date(now.getTime() + Number(retentionDays) * 86400000);
  await project.save();
  await TaskBoard.updateMany({ projectId: project._id }, { $set: { isActive: false } });
  await logActivity({
    organizationId: project.organizationId,
    projectId: project._id,
    actorId: userId,
    type: 'project.archived',
    title: 'Đóng dự án',
  });
  try {
    const auditService = require('./audit.service');
    await auditService.recordMutationAudit({
      organizationId: project.organizationId,
      actorUserId: userId,
      action: 'project.archived',
      resourceType: 'project',
      resourceId: String(project._id),
      beforeDoc: beforeSnap,
      afterDoc: project.toObject(),
      keys: ['isActive', 'archivedAt', 'retentionUntil', 'status'],
    });
  } catch {
    /* best-effort */
  }
  return { ...project.toObject(), archived: true };
}

async function listProjectBoards({ userId, projectId }) {
  const data = await getProject({ userId, projectId });
  return data.boards || [];
}

async function createBoardInProject({
  userId,
  projectId,
  title,
  background,
}) {
  const project = await Project.findById(projectId).lean();
  if (!project || project.isActive === false) throw new Error('Project không tồn tại');
  await assertProjectMatrixOrAdmin(
    userId,
    project,
    ['project:edit'],
    'Không có quyền tạo board trong dự án (project:edit)'
  );

  const board = await TaskBoard.create({
    projectId: project._id,
    organizationId: project.organizationId,
    teamId: project.teamId,
    scopeType: project.scopeType,
    scopeId: project.scopeId,
    title: String(title || DEFAULT_BOARD_TITLE).trim() || DEFAULT_BOARD_TITLE,
    background: String(background || project.background || '').trim(),
    createdBy: userId,
    isActive: true,
  });
  await seedDefaultLists(board._id);
  await TaskBoardMember.create({
    boardId: board._id,
    userId,
    role: 'owner',
    canView: true,
    canEdit: true,
    addedBy: userId,
  });
  return board.toObject();
}

async function getProjectOverview({ userId, projectId }) {
  const project = await getProject({ userId, projectId });
  const boardIds = (project.boards || []).map((b) => b._id);
  const cards = boardIds.length
    ? await Task.find({ boardId: { $in: boardIds }, isActive: true, parentTaskId: null })
        .select('title status dueDate assigneeId listId boardId completedAt')
        .lean()
    : [];
  const now = Date.now();
  let done = 0;
  let overdue = 0;
  for (const c of cards) {
    const st = String(c.status || '').toLowerCase();
    if (st.includes('done') || st.includes('complete') || c.completedAt) done += 1;
    else if (c.dueDate && new Date(c.dueDate).getTime() < now) overdue += 1;
  }
  return {
    project,
    summary: {
      total: cards.length,
      done,
      overdue,
      donePercent: cards.length ? Math.round((done / cards.length) * 100) : 0,
    },
  };
}

async function getProjectActivity({ userId, projectId, limit = 50 }) {
  const project = await getProject({ userId, projectId });
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    const canView =
      resolved.isOrgAdmin ||
      resolved.isCreator ||
      hasPermission(resolved.permissions, 'task:view') ||
      hasPermission(resolved.permissions, 'project:view');
    if (!canView) {
      const err = new Error('Không có quyền xem activity');
      err.statusCode = 403;
      throw err;
    }
    if (resolved.informationLevel === 'summary') {
      return [];
    }
  } else if (project.access?.informationLevel === 'summary') {
    return [];
  }
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return TaskActivityLog.find({ projectId })
    .sort({ createdAt: -1 })
    .limit(lim)
    .lean();
}

async function getProjectFiles({ userId, projectId }) {
  const project = await getProject({ userId, projectId });
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    if (
      !hasPermission(resolved.permissions, 'files:view') &&
      !resolved.isOrgAdmin &&
      !resolved.isCreator
    ) {
      return [];
    }
  }
  const boardIds = (project.boards || []).map((b) => b._id);
  if (!boardIds.length) return [];
  const cards = await Task.find({
    boardId: { $in: boardIds },
    isActive: true,
    'attachments.0': { $exists: true },
  })
    .select('title attachments boardId')
    .lean();
  const files = [];
  for (const c of cards) {
    for (const a of c.attachments || []) {
      if (!a?.url) continue;
      files.push({
        name: a.name || a.url,
        url: a.url,
        documentId: a.documentId || null,
        taskId: c._id,
        taskTitle: c.title,
        boardId: c.boardId,
      });
    }
  }
  return files;
}

async function listProjectSprints({ userId, projectId }) {
  await getProject({ userId, projectId });
  const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { assertUserAnyProjectPermission } = require('./projectAccess.service');
    await assertUserAnyProjectPermission({
      userId,
      projectId,
      permissions: ['sprint:view', 'project:view'],
      message: 'Không có quyền xem sprint (sprint:view)',
    });
  }
  return Sprint.find({ projectId }).sort({ createdAt: -1 }).lean();
}

async function createProjectSprint({
  userId,
  projectId,
  name,
  goal,
  startDate,
  endDate,
  status,
  boardId,
}) {
  const project = await getProject({ userId, projectId });
  await assertProjectMatrixOrAdmin(
    userId,
    project,
    ['sprint:create', 'project:edit'],
    'Không có quyền tạo sprint (sprint:create)'
  );
  const title = String(name || '').trim();
  if (!title) throw new Error('name là bắt buộc');
  const st = ['planned', 'active', 'closed'].includes(String(status || ''))
    ? String(status)
    : 'planned';
  let bid = boardId || project.defaultBoardId || null;
  const row = await Sprint.create({
    organizationId: project.organizationId,
    projectId,
    boardId: bid,
    name: title,
    goal: String(goal || '').trim(),
    startDate: startDate ? new Date(startDate) : null,
    endDate: endDate ? new Date(endDate) : null,
    status: st,
    createdBy: userId,
  });
  return row.toObject();
}

async function patchProjectSprint({ userId, projectId, sprintId, patch = {} }) {
  const project = await getProject({ userId, projectId });
  const statusNext = patch.status !== undefined ? String(patch.status || '').trim() : '';
  const sprintPerms =
    statusNext === 'closed'
      ? ['sprint:close', 'project:edit']
      : statusNext === 'active'
        ? ['sprint:start', 'sprint:create', 'project:edit']
        : ['sprint:create', 'project:edit'];
  await assertProjectMatrixOrAdmin(
    userId,
    project,
    sprintPerms,
    'Không có quyền cập nhật sprint'
  );
  const sprint = await Sprint.findOne({ _id: sprintId, projectId });
  if (!sprint) {
    const err = new Error('Sprint không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (patch.name !== undefined) {
    const title = String(patch.name || '').trim();
    if (!title) throw new Error('name không hợp lệ');
    sprint.name = title;
  }
  if (patch.goal !== undefined) sprint.goal = String(patch.goal || '').trim().slice(0, 2000);
  if (patch.startDate !== undefined) sprint.startDate = patch.startDate ? new Date(patch.startDate) : null;
  if (patch.endDate !== undefined) sprint.endDate = patch.endDate ? new Date(patch.endDate) : null;
  if (patch.status !== undefined) {
    const st = String(patch.status || '').trim();
    if (!['planned', 'active', 'closed'].includes(st)) throw new Error('status sprint không hợp lệ');
    sprint.status = st;
  }
  if (patch.reviewNotes !== undefined) {
    sprint.reviewNotes = String(patch.reviewNotes || '').trim().slice(0, 4000);
  }
  await sprint.save();
  return sprint.toObject();
}

/**
 * Merge Project identity onto board DTO for Hub / FE that still read board.title as project name.
 */
async function attachProjectIdentityToBoard(board) {
  if (!board?.projectId) return board;
  const project = await Project.findById(board.projectId).lean();
  if (!project) return { ...board, projectId: String(board.projectId) };
  return {
    ...board,
    projectId: String(project._id),
    title: project.title,
    projectCode: project.projectCode,
    description: project.description,
    requiredProjectRoles: Array.isArray(project.requiredProjectRoles) ? project.requiredProjectRoles : [],
    dueDate: project.dueDate || project.expectedEndDate,
    visibility: project.visibility,
    visibilityMode: project.visibilityMode === 'custom' ? 'custom' : 'inherit',
    visibilityPolicy: project.visibilityPolicy || null,
    relatedDepartmentIds: Array.isArray(project.relatedDepartmentIds)
      ? project.relatedDepartmentIds.map((id) => String(id))
      : [],
    background: project.background || board.background,
    workflowTemplateId: project.workflowTemplateId ? String(project.workflowTemplateId) : '',
    defaultTaskDoneApprovalPolicyId: project.defaultTaskDoneApprovalPolicyId
      ? String(project.defaultTaskDoneApprovalPolicyId)
      : '',
    scopeType: project.scopeType,
    scopeId: project.scopeId,
    teamId: project.teamId,
    boardTitle: board.title,
    status: project.status,
    projectType: project.projectType,
    category: project.category,
    priority: project.priority,
    tags: project.tags,
    startDate: project.startDate,
    expectedEndDate: project.expectedEndDate,
    estimatedDurationDays: project.estimatedDurationDays,
    workingCalendar: project.workingCalendar,
    methodology: project.methodology,
    methodologySettings: project.methodologySettings,
    customer: project.customer,
  };
}

module.exports = {
  DEFAULT_BOARD_TITLE,
  DEFAULT_LIST_TITLES,
  createProject,
  listProjects,
  getProject,
  listProjectMembersForUser,
  patchProject,
  archiveProject,
  listProjectBoards,
  createBoardInProject,
  getProjectOverview,
  getProjectActivity,
  getProjectFiles,
  listProjectSprints,
  createProjectSprint,
  patchProjectSprint,
  userCanAdminProject,
  attachProjectIdentityToBoard,
  logActivity,
  ensureUniqueProjectCode,
  seedDefaultLists,
};

const mongoose = require('../db');
const projectService = require('../services/project.service');
const {
  listProjectMemberships,
  setUserProjectRoles,
} = require('../services/projectTeam.service');
const { listMemberCandidates } = require('../services/projectMemberCandidate.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

async function createProject(req, res) {
  try {
    const userId = asUserId(req);
    const body = req.body || {};
    const {
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
    } = body;
    if (!userId) return unauthorized(res);
    if (!validOid(organizationId)) {
      return res.status(400).json({ success: false, message: 'organizationId không hợp lệ' });
    }
    if (!String(title || '').trim()) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'title là bắt buộc',
        message: 'title là bắt buộc',
      });
    }
    const data = await projectService.createProject({
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
      visibilityMode: body.visibilityMode,
      visibilityPolicy: body.visibilityPolicy,
      informationLevelOverrides: body.informationLevelOverrides,
      relatedDepartmentIds: body.relatedDepartmentIds,
      delegationTemplateId,
      members,
      projectType: body.projectType,
      category: body.category,
      priority: body.priority,
      tags: body.tags,
      startDate: body.startDate,
      expectedEndDate: body.expectedEndDate,
      estimatedDurationDays: body.estimatedDurationDays,
      workingCalendar: body.workingCalendar,
      methodology: body.methodology,
      methodologySettings: body.methodologySettings,
      sprintDurationDays: body.sprintDurationDays,
      sprintStartDay: body.sprintStartDay,
      wipLimit: body.wipLimit,
      customer: body.customer,
      projectManagerId: body.projectManagerId,
      productOwnerId: body.productOwnerId,
      scrumMasterId: body.scrumMasterId,
      techLeadId: body.techLeadId,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, 'Không thể tạo dự án', 'PROJECT_CREATE_FAILED');
  }
}

async function listProjects(req, res) {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, message: 'Database unavailable' });
    }
    const userId = asUserId(req);
    const { organizationId, teamId, scopeType, scopeId, includeArchived } = req.query || {};
    if (!userId) return unauthorized(res);
    if (!validOid(organizationId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_INVALID_ID',
        messageUser: 'organizationId không hợp lệ',
        message: 'organizationId không hợp lệ',
      });
    }
    const data = await projectService.listProjects({
      userId,
      organizationId,
      teamId,
      scopeType,
      scopeId,
      includeArchived:
        String(includeArchived || '').trim() === '1' ||
        String(includeArchived || '').toLowerCase() === 'true',
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, 'Không thể liệt kê dự án', 'PROJECT_LIST_FAILED');
  }
}

async function getProject(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.getProject({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải dự án', 'PROJECT_GET_FAILED');
  }
}

async function patchProject(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.patchProject({
      userId,
      projectId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể cập nhật dự án', 'PROJECT_PATCH_FAILED');
  }
}

async function archiveProject(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.archiveProject({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, 'Không thể đóng dự án', 'PROJECT_ARCHIVE_FAILED');
  }
}

async function getOverview(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.getProjectOverview({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải overview', 'PROJECT_OVERVIEW_FAILED');
  }
}

async function getActivity(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.getProjectActivity({
      userId,
      projectId,
      limit: req.query?.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải activity', 'PROJECT_ACTIVITY_FAILED');
  }
}

async function getFiles(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.getProjectFiles({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải files', 'PROJECT_FILES_FAILED');
  }
}

async function listMembers(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    await projectService.getProject({ userId, projectId });
    const data = await listProjectMemberships(projectId);
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải members', 'PROJECT_MEMBERS_FAILED');
  }
}

async function listMemberCandidatesController(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    const projectRoleKey = String(req.query?.projectRoleKey || '').trim();
    if (!userId) return unauthorized(res);
    const project = await projectService.getProject({ userId, projectId });
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      return sendServiceError(res, 403, {
        errorCode: 'PROJECT_FORBIDDEN',
        messageUser: 'Không có quyền quản lý thành viên.',
        message: 'Forbidden',
      });
    }
    const data = await listMemberCandidates({
      organizationId: project.organizationId,
      projectId,
      projectRoleKey,
      actorUserId: userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải gợi ý thành viên',
      'PROJECT_MEMBER_CANDIDATES_FAILED'
    );
  }
}

async function putMemberRoles(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, memberUserId } = req.params;
    const body = req.body || {};
    const { projectRoleKeys, boardRole, allocations, joinDate, leaveDate, billable, status } = body;
    if (!userId) return unauthorized(res);
    const project = await projectService.getProject({ userId, projectId });
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      return sendServiceError(res, 403, {
        errorCode: 'PROJECT_FORBIDDEN',
        messageUser: 'Không có quyền quản lý thành viên.',
        message: 'Forbidden',
      });
    }
    const data = await setUserProjectRoles({
      projectId,
      boardId: project.defaultBoardId,
      userId: memberUserId,
      projectRoleKeys,
      addedBy: userId,
      boardRole,
      allocations,
      joinDate,
      leaveDate,
      billable,
      status,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể cập nhật roles', 'PROJECT_MEMBER_ROLES_FAILED');
  }
}

async function listBoards(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.listProjectBoards({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải boards', 'PROJECT_BOARDS_FAILED');
  }
}

async function createBoard(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.createBoardInProject({
      userId,
      projectId,
      title: req.body?.title,
      background: req.body?.background,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, 'Không thể tạo board', 'PROJECT_BOARD_CREATE_FAILED');
  }
}

async function listSprints(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.listProjectSprints({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải sprints', 'PROJECT_SPRINTS_FAILED');
  }
}

async function createSprint(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    const data = await projectService.createProjectSprint({
      userId,
      projectId,
      ...(req.body || {}),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, 400, 'Không thể tạo sprint', 'PROJECT_SPRINT_CREATE_FAILED');
  }
}

async function patchSprint(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, sprintId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(sprintId)) {
      return res.status(400).json({ success: false, message: 'projectId/sprintId không hợp lệ' });
    }
    const data = await projectService.patchProjectSprint({
      userId,
      projectId,
      sprintId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể cập nhật sprint', 'PROJECT_SPRINT_PATCH_FAILED');
  }
}

async function getTechnicalSetup(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.getTechnicalSetup({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải technical setup', 'PROJECT_TECH_SETUP_GET_FAILED');
  }
}

async function putTechnicalSetup(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.updateTechnicalSetup({
      userId,
      projectId,
      body: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể lưu technical setup', 'PROJECT_TECH_SETUP_PUT_FAILED');
  }
}

async function completeTechnicalSetup(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await projectService.completeTechnicalSetup({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể hoàn tất technical setup', 'PROJECT_TECH_SETUP_COMPLETE_FAILED');
  }
}

module.exports = {
  createProject,
  listProjects,
  getProject,
  patchProject,
  archiveProject,
  getOverview,
  getActivity,
  getFiles,
  listMembers,
  listMemberCandidatesController,
  putMemberRoles,
  listBoards,
  createBoard,
  listSprints,
  createSprint,
  patchSprint,
  getTechnicalSetup,
  putTechnicalSetup,
  completeTechnicalSetup,
};

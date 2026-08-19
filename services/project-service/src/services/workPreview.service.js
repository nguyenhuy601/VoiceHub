const mongoose = require('../db');
const Project = require('../models/Project');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const TaskBoardList = require('../models/TaskBoardList');
const Sprint = require('../models/Sprint');
const ChangeRequest = require('../models/ChangeRequest');
const TaskActivityLog = require('../models/TaskActivityLog');
const { resolveUserProjectPermissions } = require('./projectAccess.service');
const { hasPermission } = require('../utils/projectPermissionMatrix');
const { displayIssueKey } = require('../utils/displayIssueKey');
const { enrichAssignableProfiles } = require('../utils/userProfileLabels');
const {
  shouldRestrictWorkPreview,
  restrictedWorkPreviewBody,
} = require('../utils/workPreviewPolicy');

const RECENT_CAP = 3;

function asOid(raw) {
  const s = String(raw || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

function notFound(message) {
  const err = new Error(message);
  err.statusCode = 404;
  return err;
}

function hasKindViewPermission(kind, access) {
  const resolved = access.resolved || {};
  if (resolved.isOrgAdmin || resolved.isCreator) return true;
  if (!resolved.rbacV2) return Boolean(access.isMember);
  const perms = resolved.permissions || [];
  if (kind === 'change_request') return hasPermission(perms, 'change_request:view');
  if (kind === 'project') {
    return hasPermission(perms, 'project:view') || hasPermission(perms, 'task:view');
  }
  return hasPermission(perms, 'task:view');
}

async function resolvePreviewAccess(userId, projectId) {
  const pid = asOid(projectId);
  const uid = String(userId || '').trim();
  if (!pid || !uid) {
    return { project: null, isMember: false, informationLevel: 'summary', resolved: null };
  }
  const project = await Project.findById(pid)
    .select('_id title projectCode createdBy organizationId isActive')
    .lean();
  if (!project || project.isActive === false) {
    return { project: null, isMember: false, informationLevel: 'summary', resolved: null };
  }

  const resolved = await resolveUserProjectPermissions({ userId: uid, projectId: pid });
  let isMember = Boolean(resolved.isOrgAdmin || resolved.isCreator);
  if (!isMember && Array.isArray(resolved.roles) && resolved.roles.length) isMember = true;
  if (!isMember) {
    const alloc = await ProjectMember.findOne({
      projectId: project._id,
      userId: uid,
      status: 'active',
    })
      .select('_id')
      .lean();
    isMember = Boolean(alloc);
  }

  return {
    project,
    resolved,
    isMember,
    informationLevel: resolved.informationLevel || 'details',
  };
}

function gateOrRestrict(kind, access) {
  const hasViewPermission = hasKindViewPermission(kind, access);
  if (
    shouldRestrictWorkPreview({
      isMember: access.isMember,
      informationLevel: access.informationLevel,
      hasViewPermission,
    })
  ) {
    return restrictedWorkPreviewBody();
  }
  return null;
}

async function labelForUserId(userId) {
  const uid = String(userId || '').trim();
  if (!uid) return null;
  const rows = await enrichAssignableProfiles([uid]);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  return {
    userId: uid,
    displayName: String(row.displayName || '').trim() || null,
  };
}

function mapComments(comments) {
  const list = Array.isArray(comments) ? comments : [];
  return list
    .map((c) => ({
      kind: 'comment',
      at: c.createdAt || null,
      content: String(c.content || '').slice(0, 400),
      actorId: c.userId ? String(c.userId) : null,
    }))
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
}

function mapHistory(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    kind: 'history',
    at: row.createdAt || null,
    field: String(row.payload?.field || row.title || '').slice(0, 64),
    from: row.payload?.from ?? null,
    to: row.payload?.to ?? null,
    actorId: row.actorId ? String(row.actorId) : null,
  }));
}

async function buildTaskPreview(access, entityId) {
  const task = await Task.findOne({
    _id: entityId,
    projectId: access.project._id,
    isActive: { $ne: false },
  }).lean();
  if (!task) throw notFound('Work không tồn tại');

  const [sprint, list, assignee, crRows, historyRows] = await Promise.all([
    task.sprintId ? Sprint.findById(task.sprintId).select('name').lean() : null,
    task.listId ? TaskBoardList.findById(task.listId).select('title statusKey').lean() : null,
    labelForUserId(task.assigneeId),
    Array.isArray(task.changeRequestIds) && task.changeRequestIds.length
      ? ChangeRequest.find({ _id: { $in: task.changeRequestIds }, isActive: true })
          .select('code title')
          .lean()
      : [],
    TaskActivityLog.find({ taskId: task._id })
      .select('actorId title payload createdAt')
      .sort({ createdAt: -1 })
      .limit(RECENT_CAP)
      .lean(),
  ]);

  const commentItems = mapComments(task.comments);
  const historyItems = mapHistory(historyRows);
  const recent = [...commentItems, ...historyItems]
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, RECENT_CAP);

  const projectCode = String(access.project.projectCode || '').trim();
  const statusLabel = String(list?.title || task.status || '').trim();

  return {
    restricted: false,
    kind: 'task',
    id: String(task._id),
    projectId: String(access.project._id),
    displayIssueKey: displayIssueKey(projectCode, task._id),
    title: String(task.title || ''),
    issueType: String(task.issueType || 'task'),
    priority: String(task.priority || ''),
    status: statusLabel,
    project: {
      id: String(access.project._id),
      title: String(access.project.title || ''),
      projectCode,
    },
    sprint: sprint?.name ? { id: String(task.sprintId), name: String(sprint.name) } : null,
    assignee,
    changeRequests: (crRows || []).map((cr) => ({
      id: String(cr._id),
      code: String(cr.code || ''),
      title: String(cr.title || ''),
    })),
    recent,
    actions: { canOpenDetail: true, canOpenDiscussion: true },
  };
}

async function buildChangeRequestPreview(access, entityId) {
  const row = await ChangeRequest.findOne({
    _id: entityId,
    projectId: access.project._id,
    isActive: true,
  }).lean();
  if (!row) throw notFound('Change request không tồn tại');

  const activity = (Array.isArray(row.activity) ? row.activity : [])
    .slice()
    .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0))
    .slice(0, RECENT_CAP)
    .map((item) => ({
      kind: 'activity',
      at: item.at || null,
      type: String(item.type || ''),
      from: item.from || '',
      to: item.to || '',
      actorId: item.actorId ? String(item.actorId) : null,
    }));

  const projectCode = String(access.project.projectCode || '').trim();
  return {
    restricted: false,
    kind: 'change_request',
    id: String(row._id),
    projectId: String(access.project._id),
    code: String(row.code || ''),
    title: String(row.title || ''),
    type: String(row.type || ''),
    priority: String(row.priority || ''),
    status: String(row.status || ''),
    project: {
      id: String(access.project._id),
      title: String(access.project.title || ''),
      projectCode,
    },
    recent: activity,
    actions: { canOpenDetail: true, canOpenDiscussion: true },
  };
}

function buildProjectPreview(access) {
  return {
    restricted: false,
    kind: 'project',
    id: String(access.project._id),
    projectId: String(access.project._id),
    project: {
      id: String(access.project._id),
      title: String(access.project.title || ''),
      projectCode: String(access.project.projectCode || ''),
    },
    actions: { canOpenDetail: false, canOpenDiscussion: false },
  };
}

/**
 * Lazy preview cho chip chat. Non-member / thiếu view → 200 restricted (không 404, không leak field).
 */
async function getWorkPreview({ userId, projectId, kind, id } = {}) {
  const access = await resolvePreviewAccess(userId, projectId);
  if (!access.project) return restrictedWorkPreviewBody();

  const kindNorm = String(kind || '').trim().toLowerCase();
  if (!kindNorm || kindNorm === 'project') {
    return gateOrRestrict('project', access) || buildProjectPreview(access);
  }

  if (kindNorm !== 'task' && kindNorm !== 'change_request') {
    throw badRequest('kind phải là task hoặc change_request');
  }
  const entityId = asOid(id);
  if (!entityId) throw badRequest('id không hợp lệ');

  const restricted = gateOrRestrict(kindNorm, access);
  if (restricted) return restricted;

  if (kindNorm === 'task') return buildTaskPreview(access, entityId);
  return buildChangeRequestPreview(access, entityId);
}

module.exports = {
  getWorkPreview,
};

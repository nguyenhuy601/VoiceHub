const axios = require('axios');
const mongoose = require('../db');
const ChangeRequest = require('../models/ChangeRequest');
const Task = require('../models/Task');
const TaskBoardList = require('../models/TaskBoardList');
const ApprovalPolicy = require('../models/ApprovalPolicy');
const ApprovalRequest = require('../models/ApprovalRequest');
const projectService = require('./project.service');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/projectCloseGate');
const { isProjectRbacV2Enabled } = require('../utils/projectPermissionMatrix');
const {
  normalizeChangeRequestType,
  normalizeChangeRequestPriority,
  assertRequiredChangeRequestDescription,
  normalizeOptionalChangeRequestCurrent,
  assertRequiredChangeRequestRequestedChange,
  assertChangeRequestStatusTransition,
  buildChangeRequestListFilter,
  parseChangeRequestListQuery,
  normalizeChangeRequestImpact,
  emptyChangeRequestImpact,
  isChangeRequestApprovalTerminalStatus,
  isChangeRequestWorkItemLinked,
  shouldNotifyAssigneesOnCrStatus,
  pickWorkItemsForIds,
  pickLowestLinkedWorkStatus,
  resolveChangeRequestWorkStatus,
} = require('../utils/changeRequestTypes');
const { enrichAssignableProfiles } = require('../utils/userProfileLabels');
const { normalizePolicySteps } = require('../utils/approvalChain');
const { logger } = require('@enterprise/shared');

const CODE_RETRY_MAX = 5;
const ACTIVITY_CAP = 50;

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
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

async function assertProjectAccess(userId, projectId) {
  return projectService.getProject({ userId, projectId });
}

async function assertCrPermission(userId, projectId, permission) {
  const project = await assertProjectAccess(userId, projectId);
  if (permission !== 'change_request:view') {
    assertProjectWritable(project);
  }
  if (!isProjectRbacV2Enabled()) {
    if (permission === 'change_request:view') return project;
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      const err = new Error('Không có quyền quản lý change request');
      err.statusCode = 403;
      throw err;
    }
    return project;
  }
  await assertUserProjectPermission({
    userId,
    projectId,
    permission,
    message: `Không có quyền change request (${permission})`,
  });
  return project;
}

function projectRequiresCrApproval(project) {
  return Boolean(project?.changeRequestApprovalPolicyId);
}

function appendStatusActivity(item, fromStatus, toStatus, userId) {
  const actorOid = validOid(userId) ? userId : null;
  const next = Array.isArray(item.activity) ? [...item.activity] : [];
  next.push({
    type: 'status_changed',
    from: fromStatus,
    to: toStatus,
    at: new Date(),
    actorId: actorOid,
  });
  item.activity = next.slice(-ACTIVITY_CAP);
}

async function notifyCrWorkAssignees({ userIds, title, content, data }) {
  if (!NOTIFICATION_INTERNAL_TOKEN || !NOTIFICATION_SERVICE_URL) return;
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return;
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds: ids,
        type: 'change_request_work',
        title,
        content,
        data: data || {},
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
  } catch (err) {
    const detail = err?.code || err?.message || String(err);
    logger.warn('[changeRequest] notify failed: %s', detail);
  }
}

async function notifyAssigneesForLinkedWorks({
  item,
  actorId,
  action,
  status = '',
  taskIds = null,
}) {
  try {
    const ids =
      taskIds != null
        ? (Array.isArray(taskIds) ? taskIds : []).filter((id) => validOid(id))
        : (Array.isArray(item?.workItemIds) ? item.workItemIds : []).filter((id) => validOid(id));
    if (!ids.length) return;
    const tasks = await Task.find({ _id: { $in: ids }, isActive: true })
      .select('_id title assigneeId')
      .lean();
    const actor = String(actorId || '');
    const code = String(item?.code || 'CR');
    const crTitle = String(item?.title || '');
    for (const task of tasks) {
      const assignee = task.assigneeId ? String(task.assigneeId) : '';
      if (!assignee || assignee === actor) continue;
      const workTitle = String(task.title || '');
      const isLink = action === 'linked';
      const title = isLink
        ? `${code} linked to your work`
        : `${code} → ${status || 'updated'}`;
      const content = isLink
        ? `${code} “${crTitle}” was linked to “${workTitle}”.`
        : `${code} “${crTitle}” status is now ${status} (work: “${workTitle}”).`;
      await notifyCrWorkAssignees({
        userIds: [assignee],
        title,
        content,
        data: {
          projectId: String(item.projectId || ''),
          changeRequestId: String(item._id || ''),
          taskId: String(task._id),
          code,
          action: isLink ? 'linked' : 'status',
          status: status || undefined,
        },
      });
    }
  } catch (err) {
    logger.warn('[changeRequest] notifyAssignees skipped: %s', err?.message || err);
  }
}

function scheduleCrWorkNotify(payload) {
  setImmediate(() => {
    void notifyAssigneesForLinkedWorks(payload);
  });
}

function toChangeRequestDto(
  doc,
  profileById = null,
  { includeActivity = false, includeWorkItems = false, approvalRequired = false, workItems = null } = {}
) {
  if (!doc) return null;
  const row = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  const uid = String(row.createdBy || '');
  const profile = profileById instanceof Map ? profileById.get(uid) : null;
  const impact = normalizeChangeRequestImpact(row.impact);
  const dto = {
    _id: row._id,
    projectId: row.projectId,
    code: row.code,
    title: row.title,
    description: row.description || '',
    type: row.type,
    priority: row.priority,
    status: row.status,
    approvalStatus: row.status,
    workStatus: resolveChangeRequestWorkStatus(
      row.workStatus,
      includeWorkItems ? workItems : undefined
    ),
    reason: row.reason || '',
    current: row.current || '',
    requestedChange: row.requestedChange || '',
    impact,
    workItemIds: (Array.isArray(row.workItemIds) ? row.workItemIds : []).map((id) => String(id)),
    approvalRequired: Boolean(approvalRequired),
    createdBy: row.createdBy,
    createdByName: profile?.displayName || (uid ? uid.slice(-6) : ''),
    createdByAvatar: profile?.avatar || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (includeActivity) {
    const events = Array.isArray(row.activity) ? row.activity : [];
    dto.activity = events.map((ev) => {
      const actorUid = String(ev.actorId || '');
      const actorProfile = profileById instanceof Map ? profileById.get(actorUid) : null;
      return {
        type: ev.type || 'status_changed',
        from: ev.from || '',
        to: ev.to || '',
        at: ev.at || null,
        actorId: ev.actorId || null,
        actorName: actorProfile?.displayName || (actorUid ? actorUid.slice(-6) : ''),
      };
    });
  }
  if (includeWorkItems) {
    dto.workItems = Array.isArray(workItems) ? workItems : [];
  }
  return dto;
}

async function loadCrProfileMap(rows, actorId, { includeActivity = false } = {}) {
  const ids = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (r?.createdBy) ids.push(String(r.createdBy));
    if (includeActivity && Array.isArray(r?.activity)) {
      for (const ev of r.activity) {
        if (ev?.actorId) ids.push(String(ev.actorId));
      }
    }
  }
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  try {
    const profiles = await enrichAssignableProfiles(unique, actorId);
    return new Map((profiles || []).map((p) => [String(p.userId), p]));
  } catch {
    return new Map();
  }
}

async function loadWorkItemsSummary(workItemIds = []) {
  const ids = (Array.isArray(workItemIds) ? workItemIds : []).filter((id) => validOid(id));
  if (!ids.length) return [];
  const tasks = await Task.find({ _id: { $in: ids }, isActive: true })
    .select('_id title issueType status listId')
    .lean();
  const listIds = [
    ...new Set(
      tasks
        .map((t) => (t.listId ? String(t.listId) : ''))
        .filter((id) => validOid(id))
    ),
  ];
  const lists = listIds.length
    ? await TaskBoardList.find({ _id: { $in: listIds } })
        .select('_id statusKey order title')
        .lean()
    : [];
  const listById = new Map(lists.map((l) => [String(l._id), l]));
  const byId = new Map(tasks.map((t) => [String(t._id), t]));
  return ids
    .map((id) => {
      const t = byId.get(String(id));
      if (!t) return null;
      const list = t.listId ? listById.get(String(t.listId)) : null;
      const status = String(t.status || '')
        .trim()
        .toLowerCase();
      const statusKey = String(list?.statusKey || status || '')
        .trim()
        .toLowerCase();
      return {
        _id: t._id,
        title: t.title || '',
        issueType: t.issueType || 'task',
        status,
        listId: t.listId ? String(t.listId) : '',
        statusKey,
        listOrder: Number(list?.order) || 0,
      };
    })
    .filter(Boolean);
}

async function persistComputedWorkStatus(rows, workById) {
  const list = Array.isArray(rows) ? rows : [];
  const ops = [];
  for (const row of list) {
    const works = pickWorkItemsForIds(row.workItemIds, workById);
    const computed = pickLowestLinkedWorkStatus(works);
    if (String(row.workStatus || '') === computed) continue;
    row.workStatus = computed;
    if (row._id) {
      ops.push({
        updateOne: {
          filter: { _id: row._id },
          update: { $set: { workStatus: computed } },
        },
      });
    }
  }
  if (!ops.length) return;
  try {
    await ChangeRequest.bulkWrite(ops);
  } catch (err) {
    logger.warn('[changeRequest] workStatus persist failed: %s', err?.message || err);
  }
}

async function syncChangeRequestWorkStatus(crIds = []) {
  const ids = [
    ...new Set((Array.isArray(crIds) ? crIds : []).map(String).filter((id) => validOid(id))),
  ];
  if (!ids.length) return;
  const rows = await ChangeRequest.find({ _id: { $in: ids }, isActive: true })
    .select('_id workItemIds workStatus')
    .lean();
  if (!rows.length) return;
  const allWorkIds = [];
  for (const row of rows) {
    for (const id of row.workItemIds || []) {
      if (validOid(id)) allWorkIds.push(String(id));
    }
  }
  const summaries = await loadWorkItemsSummary([...new Set(allWorkIds)]);
  const workById = new Map(summaries.map((w) => [String(w._id), w]));
  await persistComputedWorkStatus(rows, workById);
}

async function nextChangeRequestSeq(projectId) {
  const last = await ChangeRequest.findOne({ projectId }).sort({ seq: -1 }).select('seq').lean();
  const seq = (Number(last?.seq) || 0) + 1;
  return { seq, code: `CR-${seq}` };
}

async function listChangeRequests({
  userId,
  projectId,
  type,
  status,
  priority,
  q,
  sort,
  page,
  size,
}) {
  const project = await assertCrPermission(userId, projectId, 'change_request:view');
  const parsed = parseChangeRequestListQuery({ q, sort, page, size });
  const filter = buildChangeRequestListFilter({
    projectId,
    type,
    status,
    priority,
    q: parsed.q,
  });
  const [total, rows] = await Promise.all([
    ChangeRequest.countDocuments(filter),
    ChangeRequest.find(filter).sort(parsed.sortMongo).skip(parsed.skip).limit(parsed.size).lean(),
  ]);
  const profileById = await loadCrProfileMap(rows, userId);
  const approvalRequired = projectRequiresCrApproval(project);
  const allWorkIds = [];
  for (const row of rows) {
    for (const id of row.workItemIds || []) {
      if (validOid(id)) allWorkIds.push(String(id));
    }
  }
  const workSummaries = await loadWorkItemsSummary([...new Set(allWorkIds)]);
  const workById = new Map(workSummaries.map((w) => [String(w._id), w]));
  await persistComputedWorkStatus(rows, workById);
  return {
    items: rows.map((row) =>
      toChangeRequestDto(row, profileById, {
        approvalRequired,
        includeWorkItems: true,
        workItems: pickWorkItemsForIds(row.workItemIds, workById),
      })
    ),
    total,
    page: parsed.page,
    size: parsed.size,
  };
}

async function getChangeRequest({ userId, projectId, crId }) {
  const project = await assertCrPermission(userId, projectId, 'change_request:view');
  if (!validOid(crId)) throw badRequest('crId không hợp lệ');
  const row = await ChangeRequest.findOne({ _id: crId, projectId, isActive: true }).lean();
  if (!row) throw notFound('Change request không tồn tại');
  const profileById = await loadCrProfileMap([row], userId, { includeActivity: true });
  const workItems = await loadWorkItemsSummary(row.workItemIds);
  const workById = new Map(workItems.map((w) => [String(w._id), w]));
  await persistComputedWorkStatus([row], workById);
  return toChangeRequestDto(row, profileById, {
    includeActivity: true,
    includeWorkItems: true,
    approvalRequired: projectRequiresCrApproval(project),
    workItems,
  });
}

async function createChangeRequest({
  userId,
  projectId,
  title,
  description,
  type,
  priority,
  reason,
  current,
  requestedChange,
  impact,
}) {
  const project = await assertCrPermission(userId, projectId, 'change_request:create');
  const name = String(title || '').trim();
  if (!name) throw badRequest('title là bắt buộc');
  const crType = normalizeChangeRequestType(type);
  if (!crType) throw badRequest('type không hợp lệ');
  const crPriority = normalizeChangeRequestPriority(priority);
  if (!crPriority) throw badRequest('priority không hợp lệ');
  const desc = assertRequiredChangeRequestDescription(description);
  const why = String(reason || '').trim();
  const currentText = normalizeOptionalChangeRequestCurrent(current);
  const requested = assertRequiredChangeRequestRequestedChange(requestedChange);
  const impactDoc = normalizeChangeRequestImpact(impact);
  const orgId = project.organizationId;
  const creatorOid = validOid(userId) ? userId : undefined;
  if (!creatorOid) throw badRequest('userId không hợp lệ');

  let lastErr;
  for (let attempt = 0; attempt < CODE_RETRY_MAX; attempt += 1) {
    const { seq, code } = await nextChangeRequestSeq(projectId);
    try {
      const row = await ChangeRequest.create({
        organizationId: orgId,
        projectId,
        seq,
        code,
        title: name,
        description: desc,
        type: crType,
        priority: crPriority,
        status: 'draft',
        reason: why,
        current: currentText,
        requestedChange: requested,
        impact: impactDoc,
        workItemIds: [],
        workStatus: '',
        createdBy: creatorOid,
        updatedBy: creatorOid,
        isActive: true,
      });
      return toChangeRequestDto(row, null, {
        approvalRequired: projectRequiresCrApproval(project),
        includeWorkItems: true,
        workItems: [],
      });
    } catch (err) {
      if (err && err.code === 11000) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  const conflict = new Error('Không tạo được mã Change Request');
  conflict.statusCode = 409;
  conflict.cause = lastErr;
  throw conflict;
}

async function patchChangeRequest({ userId, projectId, crId, patch = {} }) {
  const project = await assertCrPermission(userId, projectId, 'change_request:update');
  if (!validOid(crId)) throw badRequest('crId không hợp lệ');
  const item = await ChangeRequest.findOne({ _id: crId, projectId, isActive: true });
  if (!item) throw notFound('Change request không tồn tại');

  let pendingLinkTaskId = null;
  if (patch.linkWorkItemId !== undefined || patch.unlinkWorkItemId !== undefined) {
    if (patch.linkWorkItemId) {
      pendingLinkTaskId = await linkWorkItemInternal({
        item,
        projectId,
        taskId: patch.linkWorkItemId,
      });
    }
    if (patch.unlinkWorkItemId) {
      await unlinkWorkItemInternal({ item, projectId, taskId: patch.unlinkWorkItemId });
    }
  }

  if (patch.title !== undefined) {
    const name = String(patch.title || '').trim();
    if (!name) throw badRequest('title là bắt buộc');
    item.title = name;
  }
  if (patch.description !== undefined) {
    item.description = assertRequiredChangeRequestDescription(patch.description);
  }
  if (patch.reason !== undefined) {
    item.reason = String(patch.reason || '').trim();
  }
  if (patch.current !== undefined) {
    item.current = normalizeOptionalChangeRequestCurrent(patch.current);
  }
  if (patch.requestedChange !== undefined) {
    item.requestedChange = assertRequiredChangeRequestRequestedChange(patch.requestedChange);
  }
  if (patch.impact !== undefined) {
    item.impact = normalizeChangeRequestImpact(patch.impact, item.impact || emptyChangeRequestImpact());
    item.markModified('impact');
  }
  if (patch.type !== undefined) {
    const crType = normalizeChangeRequestType(patch.type);
    if (!crType) throw badRequest('type không hợp lệ');
    item.type = crType;
  }
  if (patch.priority !== undefined) {
    const crPriority = normalizeChangeRequestPriority(patch.priority, null);
    if (!crPriority) throw badRequest('priority không hợp lệ');
    item.priority = crPriority;
  }
  let statusNotified = '';
  if (patch.status !== undefined) {
    const fromStatus = item.status;
    const toStatus = assertChangeRequestStatusTransition(fromStatus, patch.status);
    if (toStatus !== fromStatus) {
      if (
        projectRequiresCrApproval(project) &&
        isChangeRequestApprovalTerminalStatus(toStatus)
      ) {
        throw badRequest(
          'Project yêu cầu duyệt Change Request — dùng Gửi duyệt / Approval, không PATCH approved|rejected'
        );
      }
      item.status = toStatus;
      appendStatusActivity(item, fromStatus, toStatus, userId);
      if (shouldNotifyAssigneesOnCrStatus(toStatus)) {
        statusNotified = toStatus;
      }
    }
  }
  if (validOid(userId)) item.updatedBy = userId;
  const workItems = await loadWorkItemsSummary(item.workItemIds);
  item.workStatus = pickLowestLinkedWorkStatus(workItems);
  await item.save();
  if (pendingLinkTaskId) {
    scheduleCrWorkNotify({
      item,
      actorId: userId,
      action: 'linked',
      taskIds: [pendingLinkTaskId],
    });
  }
  if (statusNotified) {
    scheduleCrWorkNotify({
      item,
      actorId: userId,
      action: 'status',
      status: statusNotified,
    });
  }
  const profileById = await loadCrProfileMap([item], userId, { includeActivity: true });
  return toChangeRequestDto(item, profileById, {
    includeActivity: true,
    includeWorkItems: true,
    approvalRequired: projectRequiresCrApproval(project),
    workItems,
  });
}

async function linkWorkItemInternal({ item, projectId, taskId }) {
  if (!validOid(taskId)) throw badRequest('linkWorkItemId không hợp lệ');
  const task = await Task.findOne({ _id: taskId, projectId, isActive: true })
    .select('_id issueType')
    .lean();
  if (!task) throw badRequest('Work item không thuộc project hoặc không tồn tại');
  const issueType = String(task.issueType || 'task').toLowerCase();
  if (!['story', 'task', 'bug'].includes(issueType)) {
    throw badRequest('Chỉ liên kết story/task/bug');
  }
  if (isChangeRequestWorkItemLinked(item.workItemIds, taskId)) {
    throw badRequest('Work item đã được liên kết với Change Request này');
  }
  item.workItemIds = [...(item.workItemIds || []), task._id];
  item.markModified('workItemIds');
  // Dual-write Task side without full document save (tránh side-effect / hook)
  await Task.updateOne(
    { _id: task._id, projectId },
    { $addToSet: { changeRequestIds: item._id } }
  );
  return task._id;
}

async function unlinkWorkItemInternal({ item, projectId, taskId }) {
  if (!validOid(taskId)) throw badRequest('unlinkWorkItemId không hợp lệ');
  item.workItemIds = (Array.isArray(item.workItemIds) ? item.workItemIds : []).filter(
    (id) => String(id) !== String(taskId)
  );
  item.markModified('workItemIds');
  await Task.updateOne(
    { _id: taskId, projectId },
    { $pull: { changeRequestIds: item._id } }
  );
}

async function submitChangeRequestApproval({ userId, projectId, crId }) {
  const project = await assertProjectAccess(userId, projectId);
  if (isProjectRbacV2Enabled()) {
    await assertUserProjectPermission({
      userId,
      projectId,
      permission: 'approval:request',
      message: 'Không có quyền tạo yêu cầu duyệt (approval:request)',
    });
  } else {
    const canAdmin = await projectService.userCanAdminProject(userId, project);
    if (!canAdmin) {
      const err = new Error('Không có quyền tạo yêu cầu duyệt');
      err.statusCode = 403;
      throw err;
    }
  }
  if (!validOid(crId)) throw badRequest('crId không hợp lệ');
  if (!projectRequiresCrApproval(project)) {
    throw badRequest('Project chưa gắn Change Request Approval Policy');
  }
  const item = await ChangeRequest.findOne({ _id: crId, projectId, isActive: true });
  if (!item) throw notFound('Change request không tồn tại');
  if (String(item.status) !== 'reviewing') {
    throw badRequest('Chỉ gửi duyệt khi status là reviewing');
  }

  const existing = await ApprovalRequest.findOne({
    entityType: 'change_request',
    entityId: String(item._id),
    status: 'pending',
  }).lean();
  if (existing) {
    const err = new Error('Đã có yêu cầu duyệt đang pending cho Change Request này');
    err.statusCode = 409;
    err.request = existing;
    throw err;
  }

  const policy = await ApprovalPolicy.findById(project.changeRequestApprovalPolicyId);
  if (!policy || !policy.isActive) {
    throw badRequest('Approval Policy Change Request không hợp lệ');
  }
  const entityTypes = Array.isArray(policy.entityTypes) ? policy.entityTypes : [];
  if (entityTypes.length && !entityTypes.includes('change_request')) {
    throw badRequest('Policy không áp dụng cho change_request');
  }

  const steps = normalizePolicySteps(policy.steps);
  const request = await ApprovalRequest.create({
    organizationId: project.organizationId,
    projectId,
    boardId: null,
    entityType: 'change_request',
    entityId: String(item._id),
    policyId: policy._id,
    policyKey: policy.key,
    status: 'pending',
    currentStep: 0,
    requestedBy: userId,
    fromStatus: 'reviewing',
    toStatus: 'approved',
    stepsSnapshot: steps,
    decisions: [],
    audit: { notes: 'change_request_submit' },
  });

  return {
    request: request.toObject(),
    changeRequest: await getChangeRequest({ userId, projectId, crId }),
  };
}

/**
 * Called from approval.service decide when entityType=change_request completes.
 */
async function applyChangeRequestApprovalResult({ request, actorId }) {
  if (!request || request.entityType !== 'change_request') return null;
  if (!validOid(request.entityId)) return null;
  const item = await ChangeRequest.findOne({
    _id: request.entityId,
    projectId: request.projectId,
    isActive: true,
  });
  if (!item) return null;
  const fromStatus = item.status;
  let toStatus = null;
  if (request.status === 'approved') toStatus = 'approved';
  else if (request.status === 'rejected') toStatus = 'rejected';
  else return null;
  if (fromStatus === toStatus) return item.toObject();
  // Bypass transition matrix for approval completion from reviewing (or any) → terminal
  item.status = toStatus;
  appendStatusActivity(item, fromStatus, toStatus, actorId);
  if (validOid(actorId)) item.updatedBy = actorId;
  await item.save();
  if (shouldNotifyAssigneesOnCrStatus(toStatus)) {
    scheduleCrWorkNotify({
      item,
      actorId,
      action: 'status',
      status: toStatus,
    });
  }
  return item.toObject();
}

async function deleteChangeRequest({ userId, projectId, crId }) {
  await assertCrPermission(userId, projectId, 'change_request:delete');
  if (!validOid(crId)) throw badRequest('crId không hợp lệ');
  const item = await ChangeRequest.findOne({ _id: crId, projectId, isActive: true });
  if (!item) throw notFound('Change request không tồn tại');
  item.isActive = false;
  if (validOid(userId)) item.updatedBy = userId;
  await item.save();
  const workIds = Array.isArray(item.workItemIds) ? item.workItemIds : [];
  if (workIds.length) {
    await Task.updateMany(
      { _id: { $in: workIds }, projectId },
      { $pull: { changeRequestIds: item._id } }
    );
  }
  return { deleted: true, id: String(item._id) };
}

async function enrichTasksWithChangeRequests(tasks = []) {
  const list = Array.isArray(tasks) ? tasks : [];
  const crIds = [];
  for (const t of list) {
    for (const id of t.changeRequestIds || []) {
      if (validOid(id)) crIds.push(String(id));
    }
  }
  if (!crIds.length) {
    return list.map((t) => ({
      ...t,
      changeRequests: [],
    }));
  }
  const unique = [...new Set(crIds)];
  const rows = await ChangeRequest.find({
    _id: { $in: unique },
    isActive: true,
  })
    .select('_id code title')
    .lean();
  const byId = new Map(
    rows.map((r) => [String(r._id), { _id: r._id, code: r.code, title: r.title || '' }])
  );
  return list.map((t) => {
    const linked = (Array.isArray(t.changeRequestIds) ? t.changeRequestIds : [])
      .map((id) => byId.get(String(id)))
      .filter(Boolean);
    return { ...t, changeRequests: linked };
  });
}

module.exports = {
  listChangeRequests,
  getChangeRequest,
  createChangeRequest,
  patchChangeRequest,
  deleteChangeRequest,
  submitChangeRequestApproval,
  applyChangeRequestApprovalResult,
  enrichTasksWithChangeRequests,
  syncChangeRequestWorkStatus,
  toChangeRequestDto,
  projectRequiresCrApproval,
};

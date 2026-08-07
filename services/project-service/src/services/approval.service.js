const axios = require('axios');
const ApprovalPolicy = require('../models/ApprovalPolicy');
const ApprovalRequest = require('../models/ApprovalRequest');
const Project = require('../models/Project');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const Task = require('../models/Task');
const TaskBoardList = require('../models/TaskBoardList');
const TaskActivityLog = require('../models/TaskActivityLog');
const {
  BUILTIN_POLICIES,
  normalizePolicySteps,
  validatePolicySteps,
  applyDecisionToChain,
  isApprovalSystemV2Enabled,
  isApprovalMrReleaseStubEnabled,
  canonicalizeStepRoleKey,
} = require('../utils/approvalChain');
const { resolveCanonicalProjectRoleKey } = require('@enterprise/shared/config/masterData');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
const { logger } = require('@enterprise/shared');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

async function requireOrgAdmin(organizationId, userId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role !== 'owner' && role !== 'admin') {
    const err = new Error('Chỉ org admin được quản lý Approval Policy');
    err.statusCode = 403;
    throw err;
  }
  return scope;
}

async function ensureOrgApprovalPolicies(organizationId, actorUserId = null) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const existing = await ApprovalPolicy.find({ organizationId: orgId }).lean();
  const byKey = new Map(existing.map((p) => [String(p.key), p]));
  const out = [...existing];
  for (const seed of BUILTIN_POLICIES) {
    if (byKey.has(seed.key)) continue;
    const doc = await ApprovalPolicy.create({
      organizationId: orgId,
      key: seed.key,
      name: seed.name,
      description: seed.description || '',
      entityTypes: seed.entityTypes,
      steps: normalizePolicySteps(seed.steps),
      isBuiltin: true,
      isActive: true,
      createdBy: actorUserId || null,
    });
    out.push(doc.toObject());
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
}

async function listPolicies(organizationId, userId, { projectId } = {}) {
  const { assertCanReadOrgCatalog } = require('./orgCatalogAccess.service');
  await assertCanReadOrgCatalog({ organizationId, userId, projectId });
  const policies = await ensureOrgApprovalPolicies(organizationId, userId);
  return policies.map((p) => {
    const builtin = BUILTIN_POLICIES.find((b) => b.key === p.key);
    return {
      ...p,
      companySizes: builtin?.companySizes ? [...builtin.companySizes] : [],
    };
  });
}

async function upsertPolicy({
  userId,
  organizationId,
  policyId,
  key,
  name,
  description,
  entityTypes,
  steps,
  isActive,
}) {
  await requireOrgAdmin(organizationId, userId);
  await ensureOrgApprovalPolicies(organizationId, userId);
  const validated = validatePolicySteps(steps);
  if (!validated.ok) {
    const err = new Error(validated.message || 'steps không hợp lệ');
    err.statusCode = validated.statusCode || 400;
    err.errorCode = 'APPROVAL_ROLE_KEYS_INVALID';
    err.invalidKeys = validated.invalidKeys;
    throw err;
  }
  const nextSteps = validated.steps;
  if (!nextSteps.length) {
    const err = new Error('steps bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  if (policyId) {
    const doc = await ApprovalPolicy.findOne({ _id: policyId, organizationId });
    if (!doc) {
      const err = new Error('Policy không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    if (!doc.isBuiltin && key) doc.key = String(key).trim().toLowerCase();
    doc.name = String(name || doc.name).trim() || doc.name;
    doc.description = String(description ?? doc.description ?? '').trim();
    if (entityTypes) doc.entityTypes = entityTypes;
    doc.steps = nextSteps;
    if (isActive !== undefined) doc.isActive = Boolean(isActive);
    doc.updatedBy = userId;
    await doc.save();
    return doc.toObject();
  }

  const k = String(key || name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!k) {
    const err = new Error('key bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const doc = await ApprovalPolicy.create({
    organizationId,
    key: k,
    name: String(name || k).trim(),
    description: String(description || '').trim(),
    entityTypes: Array.isArray(entityTypes) && entityTypes.length ? entityTypes : ['task'],
    steps: nextSteps,
    isBuiltin: false,
    createdBy: userId,
    updatedBy: userId,
  });
  return doc.toObject();
}

async function resolveActorContext(userId, projectId, organizationId) {
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const orgRole = String(scope?.membershipRole || '').toLowerCase();
  const isOrgAdmin = orgRole === 'owner' || orgRole === 'admin';
  const mems = await ProjectMembership.find({ projectId, userId }).select('projectRoleId').lean();
  const roleIds = mems.map((m) => m.projectRoleId).filter(Boolean);
  const roles = roleIds.length
    ? await ProjectRole.find({ _id: { $in: roleIds } }).select('key').lean()
    : [];
  let orgRoleKeys = Array.isArray(scope?.organizationRoleKeys)
    ? scope.organizationRoleKeys.map((k) => canonicalizeStepRoleKey('org_role', k))
    : [];
  if (!orgRoleKeys.length && organizationId && userId) {
    try {
      const { fetchProjectVisibilityContext } = require('../clients/orgVisibility.client');
      const vis = await fetchProjectVisibilityContext(organizationId, userId);
      orgRoleKeys = (vis.organizationRoleKeys || []).map((k) =>
        canonicalizeStepRoleKey('org_role', k)
      );
    } catch {
      /* optional */
    }
  }
  return {
    userId: String(userId),
    projectRoleKeys: roles.map((r) => canonicalizeStepRoleKey('project_role', r.key)),
    orgRoleKeys,
    isOrgAdmin,
  };
}

async function resolveApproverUserIds(projectId, organizationId, step) {
  if (!step) return [];
  if (step.approverType === 'user' && step.userId) return [String(step.userId)];
  if (step.approverType === 'project_role' && step.roleKey) {
    const need = resolveCanonicalProjectRoleKey(step.roleKey);
    if (!need) return [];
    const roleFilter = {};
    if (organizationId) roleFilter.organizationId = organizationId;
    const roles = await ProjectRole.find(roleFilter).select('_id key').lean();
    const ids = roles
      .filter((r) => resolveCanonicalProjectRoleKey(r.key) === need)
      .map((r) => r._id);
    if (!ids.length) return [];
    const mems = await ProjectMembership.find({
      projectId,
      projectRoleId: { $in: ids },
    })
      .select('userId')
      .lean();
    return [...new Set(mems.map((m) => String(m.userId)).filter(Boolean))];
  }
  if (step.approverType === 'org_role' && step.roleKey && organizationId) {
    const need = canonicalizeStepRoleKey('org_role', step.roleKey);
    if (!need) return [];
    const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
      .trim()
      .replace(/\/+$/, '');
    if (!ORGANIZATION_SERVICE_URL) return [];
    try {
      const axios = require('axios');
      const res = await axios.get(
        `${ORGANIZATION_SERVICE_URL}/api/organizations/${encodeURIComponent(
          String(organizationId)
        )}/org-role-assignments`,
        {
          params: { roleKey: need },
          headers: buildTrustedGatewayHeaders(),
          timeout: 10000,
          validateStatus: () => true,
        }
      );
      if (res.status !== 200) return [];
      const data = res.data?.data ?? res.data ?? {};
      const assignments = Array.isArray(data.assignments) ? data.assignments : [];
      return [
        ...new Set(
          assignments
            .filter(
              (a) => canonicalizeStepRoleKey('org_role', a.roleKey) === need
            )
            .map((a) => String(a.userId))
            .filter(Boolean)
        ),
      ];
    } catch (err) {
      logger.warn('[approval] org_role resolve failed: %s', err.message);
      return [];
    }
  }
  return [];
}

async function notifyApprovers({ userIds, title, content, data }) {
  if (!NOTIFICATION_INTERNAL_TOKEN || !NOTIFICATION_SERVICE_URL) return;
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return;
  try {
    await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds: ids,
        type: 'project_approval',
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
    logger.warn('[approval] notify failed: %s', err.message);
  }
}

async function writeAuditLog({
  organizationId,
  projectId,
  boardId,
  taskId,
  actorId,
  type,
  title,
  payload,
}) {
  try {
    await TaskActivityLog.create({
      organizationId,
      projectId,
      boardId: boardId || null,
      taskId: taskId || null,
      actorId,
      type,
      title: String(title || '').slice(0, 500),
      payload: payload || {},
    });
  } catch (err) {
    logger.warn('[approval] activity log failed: %s', err.message);
  }
  try {
    const auditService = require('./audit.service');
    await auditService.recordAudit({
      organizationId,
      actorUserId: actorId,
      action: String(type || 'approval.event'),
      resourceType: taskId ? 'task' : 'approval',
      resourceId: String(taskId || projectId || ''),
      before: null,
      after: payload || null,
      meta: { title, boardId: boardId ? String(boardId) : null, projectId: String(projectId || '') },
    });
  } catch (err) {
    logger.warn('[approval] audit event failed: %s', err.message);
  }
}

async function findPolicyForTransition({
  organizationId,
  projectId,
  transition,
  toStatus,
}) {
  await ensureOrgApprovalPolicies(organizationId);
  if (transition?.requiresApprovalPolicyId) {
    const p = await ApprovalPolicy.findOne({
      _id: transition.requiresApprovalPolicyId,
      organizationId,
      isActive: { $ne: false },
    }).lean();
    if (p) return p;
  }
  const key = String(transition?.requiresApprovalPolicyKey || '').trim();
  if (key) {
    const p = await ApprovalPolicy.findOne({
      organizationId,
      key,
      isActive: { $ne: false },
    }).lean();
    if (p) return p;
  }
  // Default: chỉ khi project gắn defaultTaskDoneApprovalPolicyId
  const isDone = String(toStatus || '').toLowerCase() === 'done';
  if (isDone) {
    const project = await Project.findById(projectId)
      .select('defaultTaskDoneApprovalPolicyId')
      .lean();
    if (project?.defaultTaskDoneApprovalPolicyId) {
      const p = await ApprovalPolicy.findById(project.defaultTaskDoneApprovalPolicyId).lean();
      if (p && p.isActive !== false) return p;
    }
  }
  return null;
}

/**
 * Intercept task transition — nếu cần duyệt, tạo request và khóa card.
 * @returns {{ blocked: true, request } | { blocked: false }}
 */
async function maybeStartTaskApproval({
  userId,
  board,
  card,
  fromStatus,
  toStatus,
  transition,
  targetListId,
}) {
  if (!isApprovalSystemV2Enabled()) return { blocked: false };
  if (!board?.organizationId || !board?.projectId || !card?._id) return { blocked: false };
  if (String(fromStatus) === String(toStatus)) return { blocked: false };

  // Đã đang chờ duyệt
  if (String(card.status) === 'awaiting_approval') {
    const err = new Error('Thẻ đang chờ duyệt — không thể chuyển status');
    err.statusCode = 400;
    throw err;
  }

  const policy = await findPolicyForTransition({
    organizationId: board.organizationId,
    projectId: board.projectId,
    transition,
    toStatus,
  });
  if (!policy) return { blocked: false };

  // Tránh request trùng pending
  const existing = await ApprovalRequest.findOne({
    entityType: 'task',
    entityId: String(card._id),
    status: 'pending',
  }).lean();
  if (existing) {
    const err = new Error('Đã có yêu cầu duyệt đang pending cho thẻ này');
    err.statusCode = 409;
    err.request = existing;
    throw err;
  }

  const steps = normalizePolicySteps(policy.steps);
  const request = await ApprovalRequest.create({
    organizationId: board.organizationId,
    projectId: board.projectId,
    boardId: board._id,
    entityType: 'task',
    entityId: String(card._id),
    policyId: policy._id,
    policyKey: policy.key,
    status: 'pending',
    currentStep: 0,
    requestedBy: userId,
    fromStatus: String(fromStatus || ''),
    toStatus: String(toStatus || ''),
    previousListId: card.listId || null,
    targetListId: targetListId || null,
    stepsSnapshot: steps,
    decisions: [],
    audit: { notes: 'task_transition' },
  });

  await Task.updateOne(
    { _id: card._id },
    { $set: { status: 'awaiting_approval' } }
  );

  await writeAuditLog({
    organizationId: board.organizationId,
    projectId: board.projectId,
    boardId: board._id,
    taskId: card._id,
    actorId: userId,
    type: 'approval_requested',
    title: `Yêu cầu duyệt: ${fromStatus} → ${toStatus}`,
    payload: {
      requestId: String(request._id),
      policyKey: policy.key,
      fromStatus,
      toStatus,
    },
  });

  const step0 = steps[0];
  const approverIds = await resolveApproverUserIds(board.projectId, board.organizationId, step0);
  await notifyApprovers({
    userIds: approverIds.filter((id) => id !== String(userId)),
    title: 'Yêu cầu duyệt task',
    content: `Task cần duyệt (${policy.name}) — bước 1/${steps.length}`,
    data: {
      organizationId: String(board.organizationId),
      projectId: String(board.projectId),
      boardId: String(board._id),
      taskId: String(card._id),
      requestId: String(request._id),
      type: 'project_approval',
    },
  });

  return { blocked: true, request: request.toObject() };
}

async function applyApprovedTaskTransition(request) {
  const task = await Task.findById(request.entityId);
  if (!task) return null;
  const toStatus = String(request.toStatus || 'done');
  task.status = toStatus;
  if (toStatus === 'done') {
    task.completedAt = task.completedAt || new Date();
  }
  if (request.targetListId) {
    task.listId = request.targetListId;
  } else if (toStatus === 'done' && task.boardId) {
    // tìm list done
    const lists = await TaskBoardList.find({ boardId: task.boardId, isArchived: false }).lean();
    const doneList =
      lists.find((l) => String(l.statusKey) === 'done') ||
      lists.find((l) => /done|xong|hoàn thành/i.test(String(l.title || '')));
    if (doneList) task.listId = doneList._id;
  }
  await task.save();
  return task.toObject();
}

async function restoreTaskAfterReject(request) {
  const task = await Task.findById(request.entityId);
  if (!task) return null;
  task.status = String(request.fromStatus || 'todo') || 'todo';
  if (task.status !== 'done') task.completedAt = null;
  if (request.previousListId) task.listId = request.previousListId;
  await task.save();
  return task.toObject();
}

async function decideRequest({
  userId,
  requestId,
  decision,
  comment,
  organizationId,
  clientIp = '',
}) {
  const request = await ApprovalRequest.findById(requestId);
  if (!request) {
    const err = new Error('Approval request không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (organizationId && String(request.organizationId) !== String(organizationId)) {
    const err = new Error('organizationId không khớp');
    err.statusCode = 400;
    throw err;
  }
  if (request.status !== 'pending') {
    const err = new Error(`Request đã ${request.status}`);
    err.statusCode = 400;
    throw err;
  }

  const actor = await resolveActorContext(userId, request.projectId, request.organizationId);
  const result = applyDecisionToChain({
    steps: request.stepsSnapshot,
    currentStep: request.currentStep,
    decisions: request.decisions,
    actor,
    decision,
    comment,
    at: new Date(),
  });
  if (!result.ok) {
    const err = new Error(result.message || 'Không duyệt được');
    err.statusCode = result.statusCode || 400;
    throw err;
  }

  request.decisions = result.decisions;
  request.currentStep = result.currentStep;
  request.status = result.nextStatus;
  if (result.nextStatus === 'approved' || result.nextStatus === 'rejected') {
    request.completedAt = new Date();
  }
  if (!request.audit || typeof request.audit !== 'object') {
    request.audit = {};
  }
  if (clientIp) {
    request.audit.lastDecisionIp = String(clientIp).slice(0, 64);
  }
  request.markModified('audit');
  await request.save();

  await writeAuditLog({
    organizationId: request.organizationId,
    projectId: request.projectId,
    boardId: request.boardId,
    taskId: request.entityType === 'task' ? request.entityId : null,
    actorId: userId,
    type: `approval_${result.nextStatus === 'pending' ? 'step' : result.nextStatus}`,
    title: `Approval ${decision}: ${request.policyKey}`,
    payload: {
      requestId: String(request._id),
      decision,
      status: request.status,
      currentStep: request.currentStep,
    },
  });

  if (request.entityType === 'task') {
    if (request.status === 'approved') {
      await applyApprovedTaskTransition(request);
    } else if (request.status === 'rejected') {
      await restoreTaskAfterReject(request);
    } else if (request.status === 'pending' && !result.awaitingQuorum) {
      // next step — notify next approvers
      const step = (request.stepsSnapshot || [])[request.currentStep];
      const approverIds = await resolveApproverUserIds(
        request.projectId,
        request.organizationId,
        step
      );
      await notifyApprovers({
        userIds: approverIds,
        title: 'Bước duyệt tiếp theo',
        content: `Approval ${request.policyKey} — bước ${request.currentStep + 1}`,
        data: {
          organizationId: String(request.organizationId),
          projectId: String(request.projectId),
          requestId: String(request._id),
          taskId: request.entityId,
        },
      });
    }
  }

  return request.toObject();
}

async function cancelRequest({ userId, requestId, reason = '' }) {
  const request = await ApprovalRequest.findById(requestId);
  if (!request) {
    const err = new Error('Approval request không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (request.status !== 'pending') {
    const err = new Error(`Request đã ${request.status}`);
    err.statusCode = 400;
    throw err;
  }
  const actor = await resolveActorContext(userId, request.projectId, request.organizationId);
  const isRequester = String(request.requestedBy) === String(userId);
  if (!isRequester && !actor.isOrgAdmin) {
    const err = new Error('Chỉ requester hoặc admin được hủy');
    err.statusCode = 403;
    throw err;
  }
  request.status = 'cancelled';
  request.cancelledReason = String(reason || 'cancelled').slice(0, 240);
  request.completedAt = new Date();
  await request.save();

  if (request.entityType === 'task') {
    await restoreTaskAfterReject(request);
  }

  await writeAuditLog({
    organizationId: request.organizationId,
    projectId: request.projectId,
    boardId: request.boardId,
    taskId: request.entityType === 'task' ? request.entityId : null,
    actorId: userId,
    type: 'approval_cancelled',
    title: 'Hủy yêu cầu duyệt',
    payload: { requestId: String(request._id), reason: request.cancelledReason },
  });

  return request.toObject();
}

/** T5 — cancel pending when card deleted */
async function cancelPendingForEntity({ entityType, entityId, actorId, reason = 'entity_deleted' }) {
  const pending = await ApprovalRequest.find({
    entityType,
    entityId: String(entityId),
    status: 'pending',
  });
  for (const req of pending) {
    req.status = 'cancelled';
    req.cancelledReason = reason;
    req.completedAt = new Date();
    await req.save();
    await writeAuditLog({
      organizationId: req.organizationId,
      projectId: req.projectId,
      boardId: req.boardId,
      taskId: entityType === 'task' ? entityId : null,
      actorId: actorId || req.requestedBy,
      type: 'approval_cancelled',
      title: 'Auto-cancel: entity deleted',
      payload: { requestId: String(req._id), reason },
    });
  }
  return pending.length;
}

async function listInbox({ userId, organizationId, status = 'pending' }) {
  if (!organizationId) {
    const err = new Error('organizationId bắt buộc');
    err.statusCode = 400;
    throw err;
  }
  const filter = { organizationId, status: status || 'pending' };
  const rows = await ApprovalRequest.find(filter).sort({ updatedAt: -1 }).limit(100).lean();

  // Filter to requests where user can act OR requested
  const enriched = [];
  for (const row of rows) {
    const actor = await resolveActorContext(userId, row.projectId, organizationId);
    const step = (row.stepsSnapshot || [])[row.currentStep];
    const canAct =
      row.status === 'pending' &&
      require('../utils/approvalChain').actorCanDecideStep(step, actor);
    const isRequester = String(row.requestedBy) === String(userId);
    if (canAct || isRequester || actor.isOrgAdmin) {
      enriched.push({ ...row, canAct, isRequester });
    }
  }
  return enriched;
}

async function listForEntity({ entityType, entityId }) {
  return ApprovalRequest.find({
    entityType,
    entityId: String(entityId),
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
}

/**
 * Stub: create MR/Release approval without real entity store.
 */
async function startStubEntityApproval({
  userId,
  organizationId,
  projectId,
  entityType,
  entityId,
  policyKey,
}) {
  if (!isApprovalMrReleaseStubEnabled()) {
    const err = new Error('MR/Release approval stub đang tắt');
    err.statusCode = 404;
    throw err;
  }
  if (!['merge_request', 'release'].includes(entityType)) {
    const err = new Error('entityType stub phải là merge_request|release');
    err.statusCode = 400;
    throw err;
  }
  await ensureOrgApprovalPolicies(organizationId, userId);
  const key = policyKey || (entityType === 'release' ? 'release_deploy' : 'mr_merge');
  const policy = await ApprovalPolicy.findOne({
    organizationId,
    key,
    isActive: { $ne: false },
  }).lean();
  if (!policy) {
    const err = new Error('Policy stub không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const steps = normalizePolicySteps(policy.steps);
  const request = await ApprovalRequest.create({
    organizationId,
    projectId,
    entityType,
    entityId: String(entityId || `${entityType}_${Date.now()}`),
    policyId: policy._id,
    policyKey: policy.key,
    status: 'pending',
    currentStep: 0,
    requestedBy: userId,
    fromStatus: '',
    toStatus: entityType === 'release' ? 'deployed' : 'merged',
    stepsSnapshot: steps,
    audit: { notes: 'stub_entity' },
  });
  const approverIds = await resolveApproverUserIds(projectId, organizationId, steps[0]);
  await notifyApprovers({
    userIds: approverIds,
    title: `Approval ${policy.name}`,
    content: `Stub ${entityType} chờ duyệt`,
    data: {
      organizationId: String(organizationId),
      projectId: String(projectId),
      requestId: String(request._id),
      entityType,
      entityId: request.entityId,
    },
  });
  return request.toObject();
}

async function bindProjectTaskDonePolicy({ userId, projectId, policyId }) {
  const project = await Project.findById(projectId);
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    const can =
      hasPermission(resolved.permissions, 'settings:update') ||
      hasPermission(resolved.permissions, 'project:edit') ||
      resolved.isOrgAdmin ||
      resolved.isCreator;
    if (!can) {
      const err = new Error('Không có quyền sửa settings (settings:update)');
      err.statusCode = 403;
      throw err;
    }
  } else {
    const { userCanAdminProject } = require('./project.service');
    const can = await userCanAdminProject(userId, project.toObject());
    if (!can) {
      const err = new Error('Không có quyền sửa settings');
      err.statusCode = 403;
      throw err;
    }
  }
  if (policyId) {
    await ensureOrgApprovalPolicies(project.organizationId, userId);
    const p = await ApprovalPolicy.findOne({
      _id: policyId,
      organizationId: project.organizationId,
    }).lean();
    if (!p) {
      const err = new Error('Policy không tồn tại');
      err.statusCode = 404;
      throw err;
    }
    project.defaultTaskDoneApprovalPolicyId = p._id;
  } else {
    project.defaultTaskDoneApprovalPolicyId = null;
  }
  await project.save();
  return project.toObject();
}

module.exports = {
  isApprovalSystemV2Enabled,
  ensureOrgApprovalPolicies,
  listPolicies,
  upsertPolicy,
  maybeStartTaskApproval,
  decideRequest,
  cancelRequest,
  cancelPendingForEntity,
  listInbox,
  listForEntity,
  startStubEntityApproval,
  bindProjectTaskDonePolicy,
  findPolicyForTransition,
  applyDecisionToChain,
};

const TASK_SERVICE_URL = String(process.env.TASK_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!TASK_SERVICE_URL) throw new Error('Thiếu biến môi trường: TASK_SERVICE_URL');
const express = require('express');
const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const AiTaskExtraction = require('../models/AiTaskExtraction');
const SyncSuggestion = require('../models/SyncSuggestion');
const { publishJson } = require('../messaging/rabbit');
const { assertUserCanExtractFromMessage } = require('../utils/verifyExtractSource');
const { assertCanUseAiTask } = require('../clients/orgScope.client');
const AiBoardDraft = require('../models/AiBoardDraft');
const {
  buildProjectDraft,
  buildTeamAssignSuggestions,
} = require('../services/aiBoardDraft.builder');

const router = express.Router();

function fail(res, status, message, errorCode) {
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

/**
 * MVP async extract:
 * - tạo extraction status=queued
 * - publish job vào queue task-ai.extract
 */
router.post('/extract', async (req, res) => {
  const { messageId, organizationId, titleHint, mentions, channelId } = req.body || {};

  const generatedBy = req.user?.id;
  if (!generatedBy) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  if (!messageId || !organizationId) {
    return res.status(400).json({ success: false, message: 'messageId and organizationId are required' });
  }

  try {
    await assertUserCanExtractFromMessage({
      messageId,
      organizationId,
      userId: generatedBy,
      channelId,
    });
  } catch (verifyErr) {
    const status = Number(verifyErr?.statusCode) || 403;
    return fail(res, status, verifyErr.message || 'Forbidden', 'AI_EXTRACT_FORBIDDEN');
  }

  const safeMentions = Array.isArray(mentions)
    ? mentions
        .filter((m) => m && (m.userId || m.id) && /^[a-f0-9]{24}$/i.test(String(m.userId || m.id)))
        .map((m) => ({
          userId: String(m.userId || m.id),
          username: String(m.username || '').slice(0, 64),
          displayName: String(m.displayName || m.name || '').slice(0, 120),
        }))
    : [];

  const extraction = await AiTaskExtraction.create({
    generatedBy,
    organizationId,
    status: 'queued',
    sourceRef: { messageId: String(messageId), messageType: 'chat_message' },
    draft: { title: titleHint || '' },
    contextHints: {
      mentions: safeMentions,
      channelId: channelId ? String(channelId) : '',
    },
  });

  const queue = process.env.RABBITMQ_TASK_AI_EXTRACT_QUEUE || 'task-ai.extract';
  await publishJson(queue, {
    extractionId: String(extraction._id),
    messageId: String(messageId),
    organizationId: String(organizationId),
    generatedBy: String(generatedBy),
    mentions: safeMentions,
    channelId: channelId ? String(channelId) : '',
  });

  return res.status(202).json({ success: true, data: { extractionId: String(extraction._id), status: 'queued' } });
});

router.get('/extractions/:id', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  const extraction = await AiTaskExtraction.findById(req.params.id).lean();
  if (!extraction) return fail(res, 404, 'Không tìm thấy dữ liệu trích xuất', 'AI_EXTRACTION_NOT_FOUND');
  if (String(extraction.generatedBy) !== String(userId)) {
    return fail(res, 403, 'Bạn không có quyền truy cập dữ liệu này', 'AI_EXTRACTION_FORBIDDEN');
  }
  return res.json({ success: true, data: extraction });
});

/**
 * Confirm draft -> tạo Task thật ở task-service.
 * Lưu ý: Task.sourceRef sẽ bổ sung ở Phase 3 (schema Task mở rộng).
 */
function resolveTrustedAssigneeId(extraction, bodyAssigneeId) {
  const candidates = new Set();
  const draftId = extraction?.draft?.assigneeId;
  if (draftId && /^[a-f0-9]{24}$/i.test(String(draftId))) candidates.add(String(draftId));
  for (const m of extraction?.contextHints?.mentions || []) {
    const id = m?.userId || m?.id;
    if (id && /^[a-f0-9]{24}$/i.test(String(id))) candidates.add(String(id));
  }
  if (!candidates.size) return undefined;
  if (bodyAssigneeId && candidates.has(String(bodyAssigneeId))) return String(bodyAssigneeId);
  return [...candidates][0];
}

router.post('/confirm', async (req, res) => {
  const { extractionId, assigneeId: bodyAssigneeId, boardId, listId } = req.body || {};
  const userId = req.user?.id || req.headers['x-user-id'];
  const idemKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim();

  if (!userId) return res.status(401).json({ success: false, message: 'Missing user context' });
  if (!extractionId) return res.status(400).json({ success: false, message: 'extractionId is required' });

  const extraction = await AiTaskExtraction.findById(extractionId);
  if (!extraction) return res.status(404).json({ success: false, message: 'Extraction not found' });
  if (String(extraction.generatedBy) !== String(userId)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  if (!['ready', 'confirmed'].includes(extraction.status)) {
    return fail(res, 409, 'Nội dung AI chưa sẵn sàng để xác nhận', 'AI_EXTRACTION_NOT_READY');
  }

  try {
    await assertCanUseAiTask(userId, extraction.organizationId);
  } catch (roleErr) {
    return fail(
      res,
      Number(roleErr.statusCode) || 403,
      roleErr.message || 'Forbidden',
      roleErr.errorCode || 'AI_CONFIRM_ROLE_DENIED'
    );
  }

  if (extraction.status === 'confirmed' && extraction.taskId) {
    if (
      idemKey &&
      extraction.confirmIdempotencyKey &&
      idemKey !== extraction.confirmIdempotencyKey
    ) {
      return fail(res, 409, 'Yêu cầu bị trùng hoặc không hợp lệ', 'AI_CONFIRM_IDEMPOTENCY_CONFLICT');
    }
    return res.json({ success: true, data: { taskId: String(extraction.taskId), extractionId: String(extraction._id) } });
  }

  const locked = await AiTaskExtraction.findOneAndUpdate(
    { _id: extractionId, status: 'ready' },
    { $set: { status: 'confirming' } },
    { new: true }
  );
  if (!locked) {
    const latest = await AiTaskExtraction.findById(extractionId).lean();
    if (latest?.status === 'confirmed' && latest.taskId) {
      return res.json({
        success: true,
        data: { taskId: String(latest.taskId), extractionId: String(latest._id) },
      });
    }
    return fail(res, 409, 'Nội dung AI chưa sẵn sàng hoặc đang được xác nhận', 'AI_EXTRACTION_NOT_READY');
  }

  const taskServiceUrl = process.env.TASK_SERVICE_URL;
  const draft = locked.draft || {};
  if (!draft.dueDate) {
    await AiTaskExtraction.findByIdAndUpdate(extractionId, { $set: { status: 'ready' } });
    return fail(res, 422, 'Tin nhắn chưa có deadline rõ ngày/giờ nên chưa thể tạo task tự động', 'AI_DUE_DATE_REQUIRED');
  }
  const assigneeId = resolveTrustedAssigneeId(locked, bodyAssigneeId);
  const attachments = Array.isArray(draft.attachments) ? draft.attachments : [];

  let createRes;
  if (boardId && listId) {
    createRes = await axios.post(
      `${taskServiceUrl}/api/tasks/boards/${encodeURIComponent(String(boardId))}/cards`,
      {
        listId: String(listId),
        title: draft.title || 'Task từ AI',
        summary: draft.summary || '',
        description: draft.description || '',
        priority: draft.priority || 'medium',
        dueDate: draft.dueDate || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        attachments,
        assigneeId: assigneeId || undefined,
        aiGenerated: true,
        sourceMessageId: locked.sourceRef?.messageId || undefined,
      },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  } else {
    createRes = await axios.post(
      `${taskServiceUrl}/api/tasks`,
      {
        title: draft.title || 'Task từ AI',
        summary: draft.summary || '',
        description: draft.description || '',
        organizationId: String(locked.organizationId),
        priority: draft.priority || 'medium',
        dueDate: draft.dueDate || null,
        tags: Array.isArray(draft.tags) ? draft.tags : [],
        attachments,
        assigneeId: assigneeId || undefined,
        departmentId: draft.departmentId || undefined,
        teamId: draft.teamId || undefined,
        departmentName: draft.departmentName || undefined,
        aiGenerated: true,
        sourceMessageId: locked.sourceRef?.messageId || undefined,
      },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
  }

  if (createRes.status !== 201 || !createRes.data?.success || !createRes.data?.data?._id) {
    await AiTaskExtraction.findByIdAndUpdate(extractionId, { $set: { status: 'ready' } });
    const taskMsg =
      typeof createRes.data?.message === 'string' && createRes.data.message.trim()
        ? createRes.data.message.trim()
        : 'Create task failed';
    return fail(res, 400, taskMsg, 'AI_CONFIRM_CREATE_TASK_FAILED');
  }

  locked.status = 'confirmed';
  locked.taskId = createRes.data.data._id;
  if (idemKey) {
    locked.confirmIdempotencyKey = idemKey;
  }
  await locked.save();

  return res.json({ success: true, data: { taskId: String(locked.taskId), extractionId: String(locked._id) } });
});

router.get('/:taskId/sync-suggestions', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');

  const { taskId } = req.params;
  const taskRes = await axios.get(`${TASK_SERVICE_URL}/api/tasks/${encodeURIComponent(String(taskId))}`, {
    headers: buildTrustedGatewayHeaders(userId),
    timeout: 12000,
    validateStatus: () => true,
  });
  if (taskRes.status === 403 || taskRes.status === 401) {
    return fail(res, 403, 'Forbidden', 'AI_SYNC_SUGGESTIONS_FORBIDDEN');
  }
  if (taskRes.status !== 200) {
    return fail(res, 404, 'Task not found', 'AI_TASK_NOT_FOUND');
  }

  const items = await SyncSuggestion.find({ taskId, status: 'pending' }).sort({ createdAt: -1 }).lean();
  return res.json({ success: true, data: items });
});

router.post('/:taskId/sync-suggestions/:id/approve', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return res.status(401).json({ success: false, message: 'Missing user context' });

  const suggestion = await SyncSuggestion.findById(req.params.id);
  if (!suggestion || String(suggestion.taskId) !== String(req.params.taskId)) {
    return res.status(404).json({ success: false, message: 'Suggestion not found' });
  }
  if (suggestion.status !== 'pending') {
    return res.status(409).json({ success: false, message: `Suggestion already ${suggestion.status}` });
  }

  const taskServiceUrl = process.env.TASK_SERVICE_URL;
  const taskRes = await axios.get(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, {
    headers: buildTrustedGatewayHeaders(userId),
    timeout: 15000,
    validateStatus: () => true,
  });
  const task = taskRes.data?.data;
  if (taskRes.status !== 200 || !taskRes.data?.success || !task) {
    return fail(res, 400, 'Không tìm thấy task cần đồng bộ', 'AI_SYNC_TASK_NOT_FOUND');
  }

  const lockedStatuses = new Set(['in_progress', 'review', 'done']);
  if (lockedStatuses.has(String(task.status))) {
    return res.status(409).json({ success: false, message: 'Task is locked for sync (status >= in_progress)' });
  }

  if (suggestion.changeType === 'deleted' || suggestion.changeType === 'recalled') {
    // approve -> detach source (không xóa task)
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.isDetached': true } });
  } else {
    const patch = suggestion.proposedPatch || {};
    const updateRes = await axios.put(`${taskServiceUrl}/api/tasks/${suggestion.taskId}`, patch, {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 15000,
      validateStatus: () => true,
    });
    if (updateRes.status !== 200 || !updateRes.data?.success) {
      return fail(res, 400, 'Không thể cập nhật task từ đề xuất', 'AI_SYNC_UPDATE_FAILED');
    }
    await AiTaskExtraction.findByIdAndUpdate(suggestion.extractionId, { $set: { 'sync.lastSyncedAt': new Date() } });
  }

  suggestion.status = 'approved';
  suggestion.approvedBy = userId;
  await suggestion.save();
  return res.json({ success: true, data: suggestion });
});

/**
 * P2 — AI gợi ý tạo dự án (board + lists). Sync heuristic → PM review → confirm.
 */
router.post('/project-draft', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  const {
    organizationId,
    brief,
    title,
    projectCode,
    description,
    dueDate,
    scopeType,
    scopeId,
    teamId,
    teams,
    visibility,
  } = req.body || {};

  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  if (!organizationId) return fail(res, 400, 'organizationId là bắt buộc', 'VALIDATION_REQUIRED');

  let scope;
  try {
    scope = await assertCanUseAiTask(userId, organizationId);
  } catch (roleErr) {
    return fail(res, Number(roleErr.statusCode) || 403, roleErr.message, roleErr.errorCode);
  }
  if (!scope?.canCreateTask) {
    return fail(res, 403, 'Chỉ PM/TL/Admin mới được tạo dự án bằng AI', 'AI_PROJECT_ROLE_DENIED');
  }

  const payload = buildProjectDraft({
    brief,
    title,
    projectCode,
    description,
    dueDate,
    teams:
      Array.isArray(teams) && teams.length
        ? teams
        : [],
    visibility,
  });
  payload.scopeType = scopeType || (teamId ? 'team' : 'department');
  payload.scopeId = scopeId || teamId || scope.departmentId || scope.teamId || null;
  payload.organizationId = String(organizationId);

      // Nếu client gửi teams có tên — ưu tiên; không thì bỏ list team placeholder id
      if (!payload.lists.some((l) => l.kind === 'team') && Array.isArray(teams) && teams.length) {
        for (const t of teams) {
          const name = String(t?.name || t?.title || '').trim();
          if (!name) continue;
          payload.lists.push({
            title: name.startsWith('Team ') ? name : `Team ${name}`,
            teamId: t?._id || t?.id || null,
            kind: 'team',
          });
        }
      }

  const draft = await AiBoardDraft.create({
    kind: 'project',
    generatedBy: userId,
    organizationId,
    status: 'ready',
    payload,
  });

  return res.status(201).json({
    success: true,
    data: { draftId: String(draft._id), status: draft.status, payload: draft.payload },
  });
});

router.get('/project-drafts/:id', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  const draft = await AiBoardDraft.findById(req.params.id).lean();
  if (!draft || draft.kind !== 'project') {
    return fail(res, 404, 'Không tìm thấy draft dự án', 'AI_PROJECT_DRAFT_NOT_FOUND');
  }
  if (String(draft.generatedBy) !== String(userId)) {
    return fail(res, 403, 'Forbidden', 'AI_PROJECT_DRAFT_FORBIDDEN');
  }
  return res.json({ success: true, data: draft });
});

router.post('/project-drafts/:id/confirm', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');

  const draftDoc = await AiBoardDraft.findById(req.params.id);
  if (!draftDoc || draftDoc.kind !== 'project') {
    return fail(res, 404, 'Không tìm thấy draft dự án', 'AI_PROJECT_DRAFT_NOT_FOUND');
  }
  if (String(draftDoc.generatedBy) !== String(userId)) {
    return fail(res, 403, 'Forbidden', 'AI_PROJECT_DRAFT_FORBIDDEN');
  }
  if (draftDoc.status === 'confirmed' && draftDoc.result?.boardId) {
    return res.json({ success: true, data: draftDoc.result });
  }
  if (draftDoc.status !== 'ready') {
    return fail(res, 409, 'Draft không sẵn sàng', 'AI_PROJECT_DRAFT_NOT_READY');
  }

  try {
    await assertCanUseAiTask(userId, draftDoc.organizationId);
  } catch (roleErr) {
    return fail(res, Number(roleErr.statusCode) || 403, roleErr.message, roleErr.errorCode);
  }

  const edited = req.body?.payload && typeof req.body.payload === 'object' ? req.body.payload : draftDoc.payload;
  const taskServiceUrl = process.env.TASK_SERVICE_URL;
  draftDoc.status = 'confirming';
  await draftDoc.save();

  const createRes = await axios.post(
    `${taskServiceUrl}/api/tasks/boards`,
    {
      organizationId: String(draftDoc.organizationId),
      title: edited.title,
      description: edited.description,
      projectCode: edited.projectCode,
      dueDate: edited.dueDate || undefined,
      visibility: edited.visibility || 'workspace',
      scopeType: edited.scopeType,
      scopeId: edited.scopeId,
      teamId: edited.scopeType === 'team' ? edited.scopeId : undefined,
      background: edited.background || 'linear-gradient(135deg,#0f172a,#1e293b)',
    },
    {
      headers: buildTrustedGatewayHeaders(userId),
      timeout: 20000,
      validateStatus: () => true,
    }
  );

  if (![200, 201].includes(createRes.status) || !createRes.data?.success) {
    draftDoc.status = 'ready';
    draftDoc.error = createRes.data?.message || `HTTP ${createRes.status}`;
    await draftDoc.save();
    return fail(res, 400, draftDoc.error || 'Không tạo được board', 'AI_PROJECT_CREATE_FAILED');
  }

  const board = createRes.data.data || createRes.data;
  const boardId = String(board._id || board.id);
  const listIds = [];
  for (const list of edited.lists || []) {
    const title = String(list?.title || '').trim();
    if (!title) continue;
    const listRes = await axios.post(
      `${taskServiceUrl}/api/tasks/boards/${encodeURIComponent(boardId)}/lists`,
      { title },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    if ([200, 201].includes(listRes.status)) {
      const row = listRes.data?.data || listRes.data;
      if (row?._id) listIds.push(String(row._id));
    }
  }

  const result = { boardId, projectCode: edited.projectCode, listIds, board };
  draftDoc.status = 'confirmed';
  draftDoc.boardId = boardId;
  draftDoc.payload = edited;
  draftDoc.result = result;
  draftDoc.error = '';
  await draftDoc.save();

  return res.json({ success: true, data: result });
});

/**
 * P2.5 — AI gợi ý thẻ + assignee trên list team (TL confirm).
 */
router.post('/boards/:boardId/lists/:listId/suggest-cards', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  const { boardId, listId } = req.params;
  const { organizationId, prompt, boardTitle, listTitle, members, maxCards } = req.body || {};

  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');
  if (!organizationId) return fail(res, 400, 'organizationId là bắt buộc', 'VALIDATION_REQUIRED');

  try {
    await assertCanUseAiTask(userId, organizationId);
  } catch (roleErr) {
    return fail(res, Number(roleErr.statusCode) || 403, roleErr.message, roleErr.errorCode);
  }

  let memberRows = Array.isArray(members) ? members : [];
  if (!memberRows.length) {
    try {
      const taskServiceUrl = process.env.TASK_SERVICE_URL;
      const memRes = await axios.get(
        `${taskServiceUrl}/api/tasks/boards/${encodeURIComponent(boardId)}/assignable-members`,
        {
          headers: buildTrustedGatewayHeaders(userId),
          timeout: 15000,
          validateStatus: () => true,
        }
      );
      const data = memRes.data?.data || memRes.data;
      memberRows = Array.isArray(data?.members) ? data.members : [];
    } catch {
      memberRows = [];
    }
  }

  const suggestions = buildTeamAssignSuggestions({
    listTitle,
    boardTitle,
    prompt,
    members: memberRows,
    maxCards: Number(maxCards) || 5,
  });

  const draft = await AiBoardDraft.create({
    kind: 'team_assign',
    generatedBy: userId,
    organizationId,
    status: 'ready',
    boardId,
    listId,
    payload: { suggestions, prompt: String(prompt || ''), listTitle, boardTitle },
  });

  return res.status(201).json({
    success: true,
    data: {
      draftId: String(draft._id),
      status: draft.status,
      suggestions,
    },
  });
});

router.post('/team-assign-drafts/:id/confirm', async (req, res) => {
  const userId = req.user?.id || req.headers['x-user-id'];
  if (!userId) return fail(res, 401, 'Thiếu thông tin người dùng', 'AI_USER_CONTEXT_MISSING');

  const draftDoc = await AiBoardDraft.findById(req.params.id);
  if (!draftDoc || draftDoc.kind !== 'team_assign') {
    return fail(res, 404, 'Không tìm thấy draft giao việc', 'AI_TEAM_ASSIGN_NOT_FOUND');
  }
  if (String(draftDoc.generatedBy) !== String(userId)) {
    return fail(res, 403, 'Forbidden', 'AI_TEAM_ASSIGN_FORBIDDEN');
  }
  if (draftDoc.status === 'confirmed' && draftDoc.result?.cardIds) {
    return res.json({ success: true, data: draftDoc.result });
  }
  if (draftDoc.status !== 'ready') {
    return fail(res, 409, 'Draft không sẵn sàng', 'AI_TEAM_ASSIGN_NOT_READY');
  }

  try {
    await assertCanUseAiTask(userId, draftDoc.organizationId);
  } catch (roleErr) {
    return fail(res, Number(roleErr.statusCode) || 403, roleErr.message, roleErr.errorCode);
  }

  const items =
    Array.isArray(req.body?.items) && req.body.items.length
      ? req.body.items
      : draftDoc.payload?.suggestions || [];
  const boardId = String(draftDoc.boardId);
  const listId = String(draftDoc.listId);
  const taskServiceUrl = process.env.TASK_SERVICE_URL;

  draftDoc.status = 'confirming';
  await draftDoc.save();

  const cardIds = [];
  const errors = [];
  for (const item of items) {
    const title = String(item?.title || '').trim();
    if (!title) continue;
    const createRes = await axios.post(
      `${taskServiceUrl}/api/tasks/boards/${encodeURIComponent(boardId)}/cards`,
      {
        listId,
        title,
        summary: item.summary || '',
        description: item.description || '',
        priority: item.priority || 'medium',
        dueDate: item.dueDate || null,
        assigneeId: item.assigneeId || undefined,
        aiGenerated: true,
      },
      {
        headers: buildTrustedGatewayHeaders(userId),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    if ([200, 201].includes(createRes.status)) {
      const row = createRes.data?.data || createRes.data;
      if (row?._id) cardIds.push(String(row._id));
    } else {
      errors.push(createRes.data?.message || `HTTP ${createRes.status}`);
    }
  }

  if (!cardIds.length) {
    draftDoc.status = 'ready';
    draftDoc.error = errors[0] || 'Không tạo được thẻ';
    await draftDoc.save();
    return fail(res, 400, draftDoc.error, 'AI_TEAM_ASSIGN_CREATE_FAILED');
  }

  const result = { boardId, listId, cardIds, errors };
  draftDoc.status = 'confirmed';
  draftDoc.result = result;
  draftDoc.error = '';
  await draftDoc.save();
  return res.json({ success: true, data: result });
});

module.exports = router;


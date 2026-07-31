const sprintService = require('../services/sprint.service');
const workflowService = require('../services/workflow.service');
const { transferBoardOwner } = require('../services/boardTransfer.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

async function listSprints(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.listSprints(req.params.boardId, userId);
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_LIST_FAILED');
  }
}

async function createSprint(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.createSprint({
      userId,
      boardId: req.params.boardId,
      ...(req.body || {}),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_CREATE_FAILED');
  }
}

async function updateSprint(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.updateSprint({
      userId,
      boardId: req.params.boardId,
      sprintId: req.params.sprintId,
      ...(req.body || {}),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_UPDATE_FAILED');
  }
}

async function deleteSprint(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.deleteSprint({
      userId,
      boardId: req.params.boardId,
      sprintId: req.params.sprintId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_DELETE_FAILED');
  }
}

async function assignSprintCards(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.assignCardsToSprint({
      userId,
      boardId: req.params.boardId,
      sprintId: req.params.sprintId,
      cardIds: req.body?.cardIds,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_ASSIGN_FAILED');
  }
}

async function removeSprintCard(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await sprintService.removeCardFromSprint({
      userId,
      boardId: req.params.boardId,
      sprintId: req.params.sprintId,
      cardId: req.params.cardId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'SPRINT_UNASSIGN_FAILED');
  }
}

async function getWorkflow(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await workflowService.getWorkflow(req.params.boardId, userId);
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'WORKFLOW_GET_FAILED');
  }
}

async function putWorkflow(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await workflowService.upsertWorkflow({
      userId,
      boardId: req.params.boardId,
      ...(req.body || {}),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'WORKFLOW_UPSERT_FAILED');
  }
}

async function seedWorkflow(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await workflowService.seedDefaultWorkflow({
      userId,
      boardId: req.params.boardId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'WORKFLOW_SEED_FAILED');
  }
}

async function applyWorkflowTemplate(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await workflowService.applyTemplateToBoard({
      userId,
      boardId: req.params.boardId,
      templateId: req.body?.templateId,
      templateKey: req.body?.templateKey,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      err.message,
      'WORKFLOW_APPLY_TEMPLATE_FAILED'
    );
  }
}

async function transferBoard(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const data = await transferBoardOwner({
      userId,
      boardId: req.params.boardId,
      toUserId: req.body?.toUserId,
      demotePreviousPm: req.body?.demotePreviousPm !== false,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'BOARD_TRANSFER_FAILED');
  }
}

module.exports = {
  listSprints,
  createSprint,
  updateSprint,
  deleteSprint,
  assignSprintCards,
  removeSprintCard,
  getWorkflow,
  putWorkflow,
  seedWorkflow,
  applyWorkflowTemplate,
  transferBoard,
};

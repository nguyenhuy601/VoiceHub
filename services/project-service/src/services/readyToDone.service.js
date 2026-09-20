const mongoose = require('../db');
const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const { assertUserProjectPermission } = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const { evaluateReadyToDone } = require('../utils/work/evaluateReadyToDone');
const { isDoneListTitle } = require('./boardCapabilities');
const boardService = require('./taskBoard.service');
const { appendFieldChanges } = require('./workHistory.service');

function validOid(value) {
  return mongoose.isValidObjectId(String(value || ''));
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

function conflict(message, errorCode = 'READY_TO_DONE_NOT_READY') {
  const err = new Error(message);
  err.statusCode = 409;
  err.errorCode = errorCode;
  return err;
}

async function loadOpenBugsForTestCases(projectId, testCases) {
  const tcIds = (testCases || [])
    .map((tc) => tc._id || tc.id)
    .filter((id) => validOid(id))
    .map((id) => String(id));
  if (!tcIds.length) return [];

  const bugs = await Task.find({
    projectId,
    issueType: 'bug',
    isActive: true,
    sourceTestCaseId: { $in: tcIds },
  })
    .select('_id listId boardId title sourceTestCaseId')
    .lean();

  if (!bugs.length) return [];

  const listIds = [...new Set(bugs.map((b) => String(b.listId || '')).filter(Boolean))];
  const lists = listIds.length
    ? await TaskBoardList.find({ _id: { $in: listIds } }).select('_id title').lean()
    : [];
  const doneListIds = new Set(
    lists.filter((l) => isDoneListTitle(l.title)).map((l) => String(l._id))
  );

  return bugs.filter((b) => !doneListIds.has(String(b.listId || '')));
}

async function evaluateForWorkItem(projectId, workItemId) {
  const testCases = await TestCase.find({
    projectId,
    workItemId,
    isActive: true,
  }).lean();
  const openBugs = await loadOpenBugsForTestCases(projectId, testCases);
  return {
    ...evaluateReadyToDone({ testCases, openBugs }),
    workItemId: String(workItemId),
  };
}

async function getReadyToDone({ userId, projectId, taskId }) {
  await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'task:view',
    message: 'Không có quyền xem task',
  });
  if (!validOid(taskId)) throw badRequest('taskId không hợp lệ');
  const task = await Task.findOne({ _id: taskId, projectId, isActive: true }).select('_id').lean();
  if (!task) throw notFound('Task không tồn tại');
  return evaluateForWorkItem(projectId, taskId);
}

/**
 * Map workItemId → readiness for all linked cards in project (board FE one-shot).
 */
async function listReadyToDoneMap({ userId, projectId }) {
  await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'task:view',
    message: 'Không có quyền xem task',
  });
  const testCases = await TestCase.find({
    projectId,
    isActive: true,
    workItemId: { $ne: null },
  }).lean();

  const byWorkItem = new Map();
  for (const tc of testCases) {
    const wid = String(tc.workItemId || '');
    if (!wid) continue;
    if (!byWorkItem.has(wid)) byWorkItem.set(wid, []);
    byWorkItem.get(wid).push(tc);
  }

  const out = {};
  for (const [workItemId, tcs] of byWorkItem.entries()) {
    const openBugs = await loadOpenBugsForTestCases(projectId, tcs);
    out[workItemId] = evaluateReadyToDone({ testCases: tcs, openBugs });
  }
  return out;
}

async function findDoneListId(boardId) {
  const lists = await TaskBoardList.find({ boardId, isArchived: false }).sort({ order: 1 }).lean();
  const done = lists.find((l) => isDoneListTitle(l.title));
  return done?._id || null;
}

async function confirmReadyToDone({ userId, projectId, taskId }) {
  const resolved = await assertUserProjectPermission({
    userId,
    projectId,
    permission: 'task:drag_to_done',
    message: 'Không có quyền xác nhận Done (task:drag_to_done)',
  });
  assertProjectWritable(resolved.project);
  if (!validOid(taskId)) throw badRequest('taskId không hợp lệ');

  const task = await Task.findOne({ _id: taskId, projectId, isActive: true });
  if (!task) throw notFound('Task không tồn tại');

  const evaluation = await evaluateForWorkItem(projectId, taskId);
  if (!evaluation.ready) {
    throw conflict(
      `Chưa sẵn sàng Done (${evaluation.reason || 'not_ready'})`,
      'READY_TO_DONE_NOT_READY'
    );
  }

  let boardId = task.boardId;
  if (!boardId) {
    const board = await TaskBoard.findOne({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
    boardId = board?._id;
  }
  if (!boardId) throw badRequest('Task chưa gắn board');

  const doneListId = await findDoneListId(boardId);
  if (!doneListId) throw badRequest('Board không có cột Done');

  if (String(task.listId) === String(doneListId)) {
    return { card: task.toObject(), evaluation, alreadyDone: true };
  }

  const moved = await boardService.moveCard({
    userId,
    cardId: String(taskId),
    toListId: String(doneListId),
    index: 0,
  });

  try {
    if (task.readyToDoneNotifiedAt) {
      task.readyToDoneNotifiedAt = null;
      await task.save();
    }
  } catch {
    /* best-effort clear dedupe stamp */
  }

  try {
    await appendFieldChanges({
      organizationId: task.organizationId,
      projectId,
      boardId,
      taskId,
      actorId: userId,
      changes: [
        {
          field: 'done_confirmed_from_qa',
          from: null,
          to: {
            passCount: evaluation.passCount,
            totalActive: evaluation.totalActive,
          },
        },
      ],
    });
  } catch {
    /* best-effort audit */
  }

  // Plan C — project may become Release Ready after card Done
  try {
    const { scheduleDeliveryNotify, maybeNotifyReleaseReadyProposed } = require('../utils/work/deliveryNotify');
    scheduleDeliveryNotify(() =>
      maybeNotifyReleaseReadyProposed({ actorId: userId, projectId })
    );
  } catch {
    /* ignore */
  }

  return { card: moved, evaluation, alreadyDone: false };
}

module.exports = {
  getReadyToDone,
  listReadyToDoneMap,
  confirmReadyToDone,
  evaluateForWorkItem,
};

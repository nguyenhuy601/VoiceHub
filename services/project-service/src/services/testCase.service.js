const mongoose = require('../db');
const TestCase = require('../models/TestCase');
const Task = require('../models/Task');
const TaskBoard = require('../models/TaskBoard');
const TaskBoardList = require('../models/TaskBoardList');
const Sprint = require('../models/Sprint');
const {
  assertUserProjectPermission,
  assertUserAnyProjectPermission,
} = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const {
  normalizeTestCaseStatus,
  assertTestCaseResult,
} = require('../utils/work/testCaseTypes');

const CODE_RETRY_MAX = 5;

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

/**
 * Place open-bug on the project board so it appears in Sprint Board (not orphan backlog).
 * Prefer To Do list + active sprint when available.
 */
async function resolveBoardPlacement(projectId) {
  const board = await TaskBoard.findOne({ projectId, isActive: true }).sort({ createdAt: 1 }).lean();
  if (!board?._id) {
    return { boardId: null, listId: null, sprintId: null, position: 1000 };
  }
  const lists = await TaskBoardList.find({ boardId: board._id, isArchived: false })
    .sort({ order: 1 })
    .lean();
  const todo =
    lists.find((l) => /^to\s*do$/i.test(String(l.title || ''))) ||
    lists.find((l) => /backlog|todo|cần làm|chưa làm/i.test(String(l.title || ''))) ||
    lists[0];
  const listId = todo?._id || null;
  const activeSprint = await Sprint.findOne({
    projectId,
    boardId: board._id,
    status: 'active',
  })
    .sort({ updatedAt: -1 })
    .lean();
  let position = 1000;
  if (listId) {
    const last = await Task.findOne({ boardId: board._id, listId, isActive: true })
      .sort({ position: -1 })
      .select('position')
      .lean();
    position = (Number(last?.position) || 0) + 1000;
  }
  return {
    boardId: board._id,
    listId,
    sprintId: activeSprint?._id || null,
    position,
  };
}

async function assertTestCasePermission({ userId, projectId, write = false, bugOnly = false }) {
  const resolved = bugOnly
    ? await assertUserProjectPermission({
        userId,
        projectId,
        permission: 'bug:create',
        message: 'Không có quyền tạo bug từ test case',
      })
    : await assertUserAnyProjectPermission({
        userId,
        projectId,
        permissions: write
          ? ['task:create', 'task:update', 'bug:create']
          : ['task:view'],
        message: write
          ? 'Không có quyền cập nhật test case'
          : 'Không có quyền xem test case',
      });
  if (write || bugOnly) assertProjectWritable(resolved.project);
  return resolved.project;
}

async function loadTestCase(projectId, testCaseId) {
  if (!validOid(testCaseId)) throw badRequest('testCaseId không hợp lệ');
  const item = await TestCase.findOne({
    _id: testCaseId,
    projectId,
    isActive: true,
  });
  if (!item) throw notFound('Test case không tồn tại');
  return item;
}

async function listTestCases({ userId, projectId }) {
  await assertTestCasePermission({ userId, projectId });
  return TestCase.find({ projectId, isActive: true }).sort({ createdAt: -1 }).lean();
}

async function getTestCase({ userId, projectId, testCaseId }) {
  await assertTestCasePermission({ userId, projectId });
  const item = await loadTestCase(projectId, testCaseId);
  return item.toObject();
}

async function assertWorkItemInProject(projectId, workItemId) {
  if (workItemId === null || workItemId === '') return null;
  if (!validOid(workItemId)) throw badRequest('workItemId không hợp lệ');
  const task = await Task.findOne({ _id: workItemId, projectId, isActive: true })
    .select('_id')
    .lean();
  if (!task) throw badRequest('workItem không thuộc project hoặc không tồn tại');
  return task._id;
}

async function createTestCase({ userId, projectId, title, externalKey, status, workItemId }) {
  const project = await assertTestCasePermission({ userId, projectId, write: true });
  const normalizedTitle = String(title || '').trim();
  if (!normalizedTitle) throw badRequest('title là bắt buộc');
  const normalizedStatus = normalizeTestCaseStatus(status, 'draft');
  if (!normalizedStatus) throw badRequest('status không hợp lệ');
  if (!validOid(userId)) throw badRequest('userId không hợp lệ');
  const linkedWorkItemId = await assertWorkItemInProject(projectId, workItemId);

  let lastError;
  for (let attempt = 0; attempt < CODE_RETRY_MAX; attempt += 1) {
    const total = await TestCase.countDocuments({ projectId });
    try {
      return await TestCase.create({
        organizationId: project.organizationId,
        projectId,
        code: `TC-${total + attempt + 1}`,
        title: normalizedTitle,
        externalKey: String(externalKey || '').trim(),
        status: normalizedStatus,
        workItemId: linkedWorkItemId,
        createdBy: userId,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      lastError = err;
    }
  }
  const err = new Error('Không tạo được mã Test Case');
  err.statusCode = 409;
  err.cause = lastError;
  throw err;
}

async function patchTestCase({ userId, projectId, testCaseId, patch = {} }) {
  await assertTestCasePermission({ userId, projectId, write: true });
  const item = await loadTestCase(projectId, testCaseId);
  if (patch.title !== undefined) {
    const title = String(patch.title || '').trim();
    if (!title) throw badRequest('title là bắt buộc');
    item.title = title;
  }
  if (patch.externalKey !== undefined) {
    item.externalKey = String(patch.externalKey || '').trim();
  }
  if (patch.status !== undefined) {
    const status = normalizeTestCaseStatus(patch.status);
    if (!status) throw badRequest('status không hợp lệ');
    item.status = status;
  }
  if (patch.workItemId !== undefined) {
    item.workItemId = await assertWorkItemInProject(projectId, patch.workItemId);
  }
  // Reset Pass/Fail (+ unlink bug) để QA retest — không xóa bug task trên Board.
  if (patch.resetExecution === true) {
    item.lastResult = null;
    item.lastExecutedAt = null;
    item.lastExecutedBy = null;
    item.linkedBugId = null;
  }
  await item.save();
  const out = item.toObject();
  if (
    item.workItemId &&
    (patch.status !== undefined ||
      patch.workItemId !== undefined ||
      patch.resetExecution === true)
  ) {
    const { scheduleDeliveryNotify, maybeNotifyReadyToDoneProposed, maybeNotifyReleaseReadyProposed } =
      require('../utils/work/deliveryNotify');
    const workItemId = String(item.workItemId);
    scheduleDeliveryNotify(async () => {
      await maybeNotifyReadyToDoneProposed({
        actorId: userId,
        projectId,
        organizationId: item.organizationId,
        taskId: workItemId,
      });
      await maybeNotifyReleaseReadyProposed({ actorId: userId, projectId });
    });
  }
  return out;
}

async function executeTestCase({ userId, projectId, testCaseId, result }) {
  await assertTestCasePermission({ userId, projectId, write: true });
  const item = await loadTestCase(projectId, testCaseId);
  item.lastResult = assertTestCaseResult(result);
  item.lastExecutedAt = new Date();
  item.lastExecutedBy = validOid(userId) ? userId : null;
  await item.save();
  const out = item.toObject();
  // Plan C — notify when Ready-to-Done / Release Ready flips (fire-and-forget)
  if (item.workItemId) {
    const { scheduleDeliveryNotify, maybeNotifyReadyToDoneProposed, maybeNotifyReleaseReadyProposed } =
      require('../utils/work/deliveryNotify');
    const workItemId = String(item.workItemId);
    scheduleDeliveryNotify(async () => {
      await maybeNotifyReadyToDoneProposed({
        actorId: userId,
        projectId,
        organizationId: item.organizationId,
        taskId: workItemId,
      });
      await maybeNotifyReleaseReadyProposed({ actorId: userId, projectId });
    });
  }
  return out;
}

async function openBugFromTestCase({ userId, projectId, testCaseId }) {
  const project = await assertTestCasePermission({
    userId,
    projectId,
    write: true,
    bugOnly: true,
  });
  const item = await loadTestCase(projectId, testCaseId);
  if (item.linkedBugId) {
    const err = new Error('Test case đã liên kết với bug');
    err.statusCode = 409;
    throw err;
  }
  const placement = await resolveBoardPlacement(projectId);
  const bug = await Task.create({
    organizationId: project.organizationId,
    projectId,
    boardId: placement.boardId,
    listId: placement.listId,
    sprintId: placement.sprintId,
    position: placement.position,
    title: `[Bug] ${item.code}: ${item.title}`,
    description: `Phát hiện từ test case ${item.code}`,
    issueType: 'bug',
    sourceTestCaseId: item._id,
    retestStatus: 'pending',
    createdBy: userId,
    isActive: true,
  });
  item.linkedBugId = bug._id;
  await item.save();
  return { testCase: item.toObject(), bug: bug.toObject() };
}

module.exports = {
  listTestCases,
  getTestCase,
  createTestCase,
  patchTestCase,
  executeTestCase,
  openBugFromTestCase,
};

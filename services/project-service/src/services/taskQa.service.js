const mongoose = require('../db');
const Task = require('../models/Task');
const { assertUserAnyProjectPermission } = require('./projectAccess.service');
const { assertProjectWritable } = require('../utils/project/projectCloseGate');
const {
  buildPendingFixSuggestion,
  decideFixSuggestion,
} = require('../utils/task/fixSuggestion');

function badRequest(message) {
  const err = new Error(message);
  err.statusCode = 400;
  return err;
}

async function loadWritableTask({ userId, projectId, taskId }) {
  if (!mongoose.isValidObjectId(String(taskId || ''))) {
    throw badRequest('taskId không hợp lệ');
  }
  const resolved = await assertUserAnyProjectPermission({
    userId,
    projectId,
    permissions: ['task:update', 'bug:create'],
    message: 'Không có quyền cập nhật fix suggestion',
  });
  assertProjectWritable(resolved.project);
  const task = await Task.findOne({ _id: taskId, projectId, isActive: true });
  if (!task) {
    const err = new Error('Task không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  return task;
}

async function proposeFixSuggestion({ userId, projectId, taskId, text }) {
  const task = await loadWritableTask({ userId, projectId, taskId });
  task.fixSuggestion = buildPendingFixSuggestion({ text, userId });
  task.markModified('fixSuggestion');
  await task.save();
  return task.toObject();
}

async function decideTaskFixSuggestion({ userId, projectId, taskId, decision }) {
  const task = await loadWritableTask({ userId, projectId, taskId });
  const current =
    typeof task.fixSuggestion?.toObject === 'function'
      ? task.fixSuggestion.toObject()
      : task.fixSuggestion;
  task.fixSuggestion = decideFixSuggestion(current, { decision, userId });
  if (task.fixSuggestion.status === 'accepted') task.retestStatus = 'pending';
  task.markModified('fixSuggestion');
  await task.save();
  return task.toObject();
}

module.exports = {
  proposeFixSuggestion,
  decideTaskFixSuggestion,
};

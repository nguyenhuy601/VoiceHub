const Task = require('../models/Task');
const { readTaskFromStored, maybeMigrateTaskDoc } = require('./taskPii');

const CLIENT_TASK_FIELDS = [
  '_id', 'id', 'title', 'summary', 'description', 'status', 'priority', 'dueDate',
  'assigneeId', 'createdBy', 'organizationId', 'serverId', 'departmentId', 'teamId',
  'departmentName', 'boardId', 'listId', 'position', 'tags', 'attachments', 'comments',
  'completedAt', 'createdAt', 'updatedAt', 'isActive', 'aiGenerated', 'sourceMessageId',
  'assignee', 'createdByUser',
];

function sanitizeClientTask(task) {
  if (!task || typeof task !== 'object') return task;
  const out = {};
  for (const key of CLIENT_TASK_FIELDS) {
    if (task[key] !== undefined) out[key] = task[key];
  }
  if (Array.isArray(out.comments)) {
    out.comments = out.comments.map((cm) => ({
      userId: cm.userId,
      content: cm.content,
      createdAt: cm.createdAt,
    }));
  }
  return out;
}

async function toClientTask(task) {
  if (!task) return task;
  await maybeMigrateTaskDoc(Task, task);
  return sanitizeClientTask(readTaskFromStored(task));
}

async function toClientTaskList(tasks) {
  const list = Array.isArray(tasks) ? tasks : [];
  const out = [];
  for (const t of list) {
    out.push(await toClientTask(t));
  }
  return out;
}

module.exports = {
  toClientTask,
  toClientTaskList,
};

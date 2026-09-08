/**
 * Nhắc hạn thẻ: sắp đến hạn (mặc định 24h) và quá hạn.
 * Idempotent: dueSoonNotifiedAt / overdueNotifiedAt. Không đụng chat/voice.
 */
const { logger } = require('@enterprise/shared');
const Task = require('../models/Task');
const { notifySystemKind, projectHubActionUrl } = require('../clients/notification.client');
const { classifyDue, DAY_MS } = require('../utils/taskDueClassify');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DONE_STATUSES = ['done', 'completed'];

function isJobEnabled() {
  const raw = String(process.env.TASK_DUE_REMINDER_ENABLED ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no' && raw !== 'off';
}

function resolveIntervalMs() {
  const raw = Number(process.env.TASK_DUE_REMINDER_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60_000) return raw;
  return DEFAULT_INTERVAL_MS;
}

function resolveSoonMs() {
  const hours = Number(process.env.TASK_DUE_SOON_HOURS);
  if (Number.isFinite(hours) && hours > 0 && hours <= 168) return hours * 60 * 60 * 1000;
  return DAY_MS;
}

function openTaskFilter() {
  return {
    isActive: { $ne: false },
    assigneeId: { $ne: null },
    dueDate: { $ne: null },
    status: { $nin: DONE_STATUSES },
  };
}

async function notifyDueCard(task, kind, now, soonMs) {
  const titleText = String(task.title || 'Thẻ').trim() || 'Thẻ';
  const projectId = task.projectId ? String(task.projectId) : '';
  const boardId = task.boardId ? String(task.boardId) : '';
  const organizationId = task.organizationId ? String(task.organizationId) : '';
  const isOverdue = kind === 'overdue';
  const hours = Math.max(1, Math.round(Number(soonMs || resolveSoonMs()) / (60 * 60 * 1000)));
  const ok = await notifySystemKind({
    userIds: [task.assigneeId],
    kind: isOverdue ? 'task_overdue' : 'task_due_soon',
    title: isOverdue ? 'Việc quá hạn' : 'Việc sắp đến hạn',
    content: isOverdue
      ? `Thẻ “${titleText}” đã quá hạn.`
      : `Thẻ “${titleText}” sẽ đến hạn trong ${hours} giờ tới.`,
    data: {
      organizationId,
      projectId,
      boardId,
      taskId: String(task._id),
    },
    actionUrl: projectHubActionUrl({ projectId, boardId, organizationId }),
  });
  if (!ok) return false;
  const field = isOverdue ? 'overdueNotifiedAt' : 'dueSoonNotifiedAt';
  const q = { _id: task._id, [field]: null };
  const updated = await Task.updateOne(q, { $set: { [field]: now } });
  return updated.modifiedCount > 0;
}

/**
 * @param {{ now?: Date, soonMs?: number }} [opts]
 */
async function runTaskDueRemindersOnce(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const soonMs = Number.isFinite(opts.soonMs) ? opts.soonMs : resolveSoonMs();
  const soonEnd = new Date(now.getTime() + soonMs);

  const soonTasks = await Task.find({
    ...openTaskFilter(),
    dueSoonNotifiedAt: null,
    dueDate: { $gte: now, $lte: soonEnd },
  })
    .select('_id title assigneeId organizationId projectId boardId dueDate')
    .lean();

  const overdueTasks = await Task.find({
    ...openTaskFilter(),
    overdueNotifiedAt: null,
    dueDate: { $lt: now },
  })
    .select('_id title assigneeId organizationId projectId boardId dueDate')
    .lean();

  let notified = 0;
  let skipped = 0;

  for (const task of soonTasks) {
    try {
      const ok = await notifyDueCard(task, 'due_soon', now, soonMs);
      if (ok) notified += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn('[taskDueReminders] due_soon %s: %s', String(task._id), err?.message || err);
    }
  }

  for (const task of overdueTasks) {
    try {
      const ok = await notifyDueCard(task, 'overdue', now);
      if (ok) notified += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn('[taskDueReminders] overdue %s: %s', String(task._id), err?.message || err);
    }
  }

  return {
    scanned: soonTasks.length + overdueTasks.length,
    notified,
    skipped,
  };
}

let intervalHandle = null;
let running = false;

async function tick() {
  if (!isJobEnabled()) return;
  if (running) return;
  running = true;
  try {
    const result = await runTaskDueRemindersOnce();
    if (result.scanned > 0) {
      logger.info(
        '[taskDueReminders] scanned=%s notified=%s skipped=%s',
        result.scanned,
        result.notified,
        result.skipped
      );
    }
  } catch (err) {
    logger.warn('[taskDueReminders] tick failed: %s', err?.message || err);
  } finally {
    running = false;
  }
}

function startTaskDueRemindersJob() {
  if (intervalHandle) return;
  if (!isJobEnabled()) {
    logger.info('[taskDueReminders] disabled (TASK_DUE_REMINDER_ENABLED)');
    return;
  }
  const ms = resolveIntervalMs();
  logger.info('[taskDueReminders] started interval=%sms soonMs=%s', ms, resolveSoonMs());
  void tick();
  intervalHandle = setInterval(() => {
    void tick();
  }, ms);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
}

function stopTaskDueRemindersJob() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  classifyDue,
  runTaskDueRemindersOnce,
  startTaskDueRemindersJob,
  stopTaskDueRemindersJob,
  isJobEnabled,
  resolveSoonMs,
};

/**
 * Nhắc assignee khi task gần hạn (≤ N ngày) hoặc quá hạn.
 * Idempotent qua Task.dueSoonNotifiedAt / overdueNotifiedAt.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const Task = require('../models/Task');
const { collectTaskAssigneeIds } = require('../utils/task/taskAssignee');
const {
  DAY_MS,
  classifyTaskDueReminder,
  resolveDueSoonDays,
  startOfUtcDay,
} = require('../utils/task/taskDueReminder');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function resolveIntervalMs() {
  const raw = Number(process.env.TASK_DUE_REMINDER_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60_000) return raw;
  return DEFAULT_INTERVAL_MS;
}

function buildActionUrl(projectId, taskId) {
  const pid = String(projectId || '').trim();
  const tid = String(taskId || '').trim();
  if (!pid) return '/app/collaborate/projects';
  const base = `/app/collaborate/projects/${encodeURIComponent(pid)}`;
  if (!tid) return base;
  return `${base}?workItem=${encodeURIComponent(tid)}`;
}

async function notifyTaskDue({ userIds, task, kind, now }) {
  if (!NOTIFICATION_INTERNAL_TOKEN || !NOTIFICATION_SERVICE_URL) return false;
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return false;

  const titleText = String(task?.title || 'Work').trim() || 'Work';
  const dueIso = task?.dueDate ? new Date(task.dueDate).toISOString().slice(0, 10) : '';
  const isOverdue = kind === 'overdue';
  const title = isOverdue ? 'Work đã quá hạn' : 'Work sắp đến hạn';
  const content = isOverdue
    ? `“${titleText}” đã quá hạn${dueIso ? ` (${dueIso})` : ''}. Hãy cập nhật tiến độ hoặc due date.`
    : `“${titleText}” còn không quá ${resolveDueSoonDays()} ngày tới hạn${dueIso ? ` (${dueIso})` : ''}.`;

  const res = await axios.post(
    `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
    {
      userIds: ids,
      type: 'system',
      title,
      content,
      data: {
        organizationId: task?.organizationId ? String(task.organizationId) : '',
        projectId: task?.projectId ? String(task.projectId) : '',
        taskId: task?._id ? String(task._id) : '',
        dueDate: dueIso,
        kind: isOverdue ? 'task_overdue' : 'task_due_soon',
      },
      actionUrl: buildActionUrl(task?.projectId, task?._id),
    },
    {
      headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
      timeout: 8000,
      validateStatus: () => true,
    }
  );
  const ok = res.status >= 200 && res.status < 300;
  if (!ok) {
    logger.warn(
      '[taskDueReminders] notify HTTP %s for task %s kind=%s',
      res.status,
      String(task?._id || ''),
      kind
    );
  }
  return ok;
}

/**
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ scanned: number, notified: number, skipped: number }>}
 */
async function runTaskDueRemindersOnce(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const today = startOfUtcDay(now);
  const dueSoonDays = resolveDueSoonDays();
  const windowEnd = new Date(today.getTime() + dueSoonDays * DAY_MS);

  const tasks = await Task.find({
    isActive: { $ne: false },
    dueDate: { $ne: null, $lte: windowEnd },
    status: { $nin: ['done', 'cancelled'] },
    $or: [{ assigneeId: { $ne: null } }, { 'assignments.0': { $exists: true } }],
  })
    .select(
      '_id title organizationId projectId dueDate status assigneeId assignments.userId dueSoonNotifiedAt overdueNotifiedAt isActive'
    )
    .lean();

  let notified = 0;
  let skipped = 0;

  for (const task of tasks) {
    try {
      const kind = classifyTaskDueReminder(task, { now, dueSoonDays });
      if (!kind) {
        skipped += 1;
        continue;
      }

      const userIds = [...collectTaskAssigneeIds(task)];
      if (!userIds.length) {
        skipped += 1;
        continue;
      }

      const ok = await notifyTaskDue({ userIds, task, kind, now });
      if (!ok) {
        skipped += 1;
        continue;
      }

      const flagField = kind === 'overdue' ? 'overdueNotifiedAt' : 'dueSoonNotifiedAt';
      const filter = { _id: task._id, [flagField]: null };
      const updated = await Task.updateOne(filter, { $set: { [flagField]: now } });
      if (updated.modifiedCount > 0) notified += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn(
        '[taskDueReminders] task %s failed: %s',
        String(task?._id || ''),
        err?.message || err
      );
    }
  }

  return { scanned: tasks.length, notified, skipped };
}

let intervalHandle = null;
let running = false;

async function tick() {
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
  const ms = resolveIntervalMs();
  logger.info('[taskDueReminders] started interval=%sms dueSoonDays=%s', ms, resolveDueSoonDays());
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
  buildActionUrl,
  runTaskDueRemindersOnce,
  startTaskDueRemindersJob,
  stopTaskDueRemindersJob,
  classifyTaskDueReminder,
};

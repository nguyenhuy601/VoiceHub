/**
 * Nhắc sprint autoComplete còn ≤ 3 ngày tới endDate.
 * Không tự đóng sprint — chỉ gửi notification (idempotent qua autoCompleteReminder3dSentAt).
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const Sprint = require('../models/Sprint');
const Task = require('../models/Task');
const { collectSprintMemberIds } = require('../utils/sprintMemberOverlap');

const DAY_MS = 24 * 60 * 60 * 1000;
const REMINDER_WINDOW_MS = 3 * DAY_MS;
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function resolveIntervalMs() {
  const raw = Number(process.env.SPRINT_AUTOCOMPLETE_REMINDER_INTERVAL_MS);
  if (Number.isFinite(raw) && raw >= 60_000) return raw;
  return DEFAULT_INTERVAL_MS;
}

function buildActionUrl(projectId) {
  const pid = String(projectId || '').trim();
  if (!pid) return '/app/collaborate/projects';
  return `/app/collaborate/projects/${encodeURIComponent(pid)}`;
}

async function notifySprintEndingSoon({ userIds, sprint }) {
  if (!NOTIFICATION_INTERNAL_TOKEN || !NOTIFICATION_SERVICE_URL) return false;
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!ids.length) return false;
  const name = String(sprint?.name || 'Sprint').trim() || 'Sprint';
  const res = await axios.post(
    `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
    {
      userIds: ids,
      type: 'system',
      title: 'Sprint sắp kết thúc',
      content: `Sprint “${name}” còn không quá 3 ngày tới hạn. Hãy chuẩn bị Complete Sprint.`,
      data: {
        organizationId: sprint?.organizationId ? String(sprint.organizationId) : '',
        projectId: sprint?.projectId ? String(sprint.projectId) : '',
        sprintId: sprint?._id ? String(sprint._id) : '',
        kind: 'sprint_ending_soon',
      },
      actionUrl: buildActionUrl(sprint?.projectId),
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
      '[sprintAutoCompleteReminders] notify HTTP %s for sprint %s',
      res.status,
      String(sprint?._id || '')
    );
  }
  return ok;
}

async function resolveRecipientIds(sprint) {
  const sprintId = sprint?._id;
  if (!sprintId) return [];
  const tasks = await Task.find({
    sprintId,
    isActive: { $ne: false },
  })
    .select('assigneeId assignments.userId')
    .lean();
  const members = collectSprintMemberIds(tasks);
  const createdBy = sprint?.createdBy ? String(sprint.createdBy) : '';
  if (createdBy) members.add(createdBy);
  return [...members];
}

/**
 * Một vòng quét. Export để test / chạy tay.
 * @param {{ now?: Date }} [opts]
 * @returns {Promise<{ scanned: number, notified: number, skipped: number }>}
 */
async function runSprintAutoCompleteRemindersOnce(opts = {}) {
  const now = opts.now instanceof Date ? opts.now : new Date();
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS);

  const sprints = await Sprint.find({
    status: 'active',
    autoComplete: true,
    autoCompleteReminder3dSentAt: null,
    endDate: { $gte: now, $lte: windowEnd },
  })
    .select('_id name organizationId projectId createdBy endDate')
    .lean();

  let notified = 0;
  let skipped = 0;

  for (const sprint of sprints) {
    try {
      const userIds = await resolveRecipientIds(sprint);
      if (!userIds.length) {
        // Vẫn đánh dấu sent để không quét lại vô hạn khi không có người nhận.
        await Sprint.updateOne(
          { _id: sprint._id, autoCompleteReminder3dSentAt: null },
          { $set: { autoCompleteReminder3dSentAt: now } }
        );
        skipped += 1;
        continue;
      }
      const ok = await notifySprintEndingSoon({ userIds, sprint });
      if (!ok) {
        skipped += 1;
        continue;
      }
      const updated = await Sprint.updateOne(
        { _id: sprint._id, autoCompleteReminder3dSentAt: null },
        { $set: { autoCompleteReminder3dSentAt: now } }
      );
      if (updated.modifiedCount > 0) notified += 1;
      else skipped += 1;
    } catch (err) {
      skipped += 1;
      logger.warn(
        '[sprintAutoCompleteReminders] sprint %s failed: %s',
        String(sprint?._id || ''),
        err?.message || err
      );
    }
  }

  return { scanned: sprints.length, notified, skipped };
}

let intervalHandle = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await runSprintAutoCompleteRemindersOnce();
    if (result.scanned > 0) {
      logger.info(
        '[sprintAutoCompleteReminders] scanned=%s notified=%s skipped=%s',
        result.scanned,
        result.notified,
        result.skipped
      );
    }
  } catch (err) {
    logger.warn('[sprintAutoCompleteReminders] tick failed: %s', err?.message || err);
  } finally {
    running = false;
  }
}

function startSprintAutoCompleteRemindersJob() {
  if (intervalHandle) return;
  const ms = resolveIntervalMs();
  logger.info('[sprintAutoCompleteReminders] started interval=%sms', ms);
  void tick();
  intervalHandle = setInterval(() => {
    void tick();
  }, ms);
  if (typeof intervalHandle.unref === 'function') intervalHandle.unref();
}

function stopSprintAutoCompleteRemindersJob() {
  if (!intervalHandle) return;
  clearInterval(intervalHandle);
  intervalHandle = null;
}

module.exports = {
  REMINDER_WINDOW_MS,
  runSprintAutoCompleteRemindersOnce,
  startSprintAutoCompleteRemindersJob,
  stopSprintAutoCompleteRemindersJob,
  buildActionUrl,
};

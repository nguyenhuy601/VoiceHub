/**
 * Background snapshot (không chạy trên request user).
 * Gọi downstream C2 khi URL + token có — ghi RM. Fail từng phần → partial flags.
 */

const axios = require('axios');
const { logger } = require('@enterprise/shared');
const { saveSnapshot } = require('./dashboardReadModel.redis');

const TIMEOUT_MS = Math.min(
  8000,
  Math.max(2000, Number(process.env.DASHBOARD_SNAPSHOT_TIMEOUT_MS || 6000) || 6000)
);

function internalHeaders(userId) {
  const token = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['x-gateway-internal-token'] = token;
  if (userId) headers['x-user-id'] = String(userId);
  return headers;
}

function unwrap(body) {
  if (body == null) return null;
  if (body.data !== undefined) return body.data;
  return body;
}

async function getJson(url, headers, label) {
  try {
    const res = await axios.get(url, { headers, timeout: TIMEOUT_MS, validateStatus: () => true });
    if (res.status < 200 || res.status >= 300) {
      logger.warn('[dashboardSnapshot]', label, res.status);
      return { ok: false };
    }
    return { ok: true, data: unwrap(res.data) };
  } catch (e) {
    logger.warn('[dashboardSnapshot]', label, e.message);
    return { ok: false };
  }
}

function unwrapFriendsList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.friends)) return data.friends;
  return [];
}

async function sumTaskDone(orgIds, headers, taskBase) {
  if (!taskBase || !orgIds.length) return { taskDone: 0, failed: !orgIds.length };
  let total = 0;
  let failures = 0;
  const capped = orgIds.slice(0, 8);
  await Promise.all(
    capped.map(async (oid) => {
      const url = `${taskBase}/api/tasks/statistics?organizationId=${encodeURIComponent(oid)}`;
      const res = await getJson(url, headers, `tasks/${oid}`);
      if (!res.ok) {
        failures += 1;
        return;
      }
      const done = Number(res.data?.done);
      if (Number.isFinite(done)) total += done;
      else failures += 1;
    })
  );
  return {
    taskDone: failures === capped.length ? null : total,
    failed: failures === capped.length,
  };
}

async function refreshDashboardSnapshot(userId, eventId) {
  const uid = String(userId || '').trim();
  if (!uid) return { ok: false, reason: 'missing_user' };

  const headers = internalHeaders(uid);
  const orgBase = String(process.env.ORGANIZATION_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const friendBase = String(process.env.FRIEND_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const notifBase = String(process.env.NOTIFICATION_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const voiceBase = String(process.env.VOICE_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const taskBase = String(process.env.PROJECT_SERVICE_URL || process.env.TASK_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');

  const startFrom = new Date();
  const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [orgRes, friendsRes, pendingRes, notifRes, meetingsRes] = await Promise.all([
    orgBase
      ? getJson(`${orgBase}/api/organizations/my`, headers, 'orgs')
      : Promise.resolve({ ok: false }),
    friendBase
      ? getJson(`${friendBase}/api/friends`, headers, 'friends')
      : Promise.resolve({ ok: false }),
    friendBase
      ? getJson(`${friendBase}/api/friends/pending`, headers, 'pending')
      : Promise.resolve({ ok: false }),
    notifBase
      ? getJson(`${notifBase}/api/notifications?scope=personal&limit=1`, headers, 'notif')
      : Promise.resolve({ ok: false }),
    voiceBase
      ? getJson(
          `${voiceBase}/api/meetings?startFrom=${encodeURIComponent(startFrom.toISOString())}&startTo=${encodeURIComponent(startTo.toISOString())}&limit=8`,
          headers,
          'meetings'
        )
      : Promise.resolve({ ok: false }),
  ]);

  const orgList = orgRes.ok && Array.isArray(orgRes.data) ? orgRes.data : [];
  const orgIds = orgList
    .map((o) => String(o?._id || o?.id || '').trim())
    .filter((id) => /^[a-f\d]{24}$/i.test(id));

  const { taskDone, failed: tasksFailed } = await sumTaskDone(orgIds, headers, taskBase);

  let upcomingMeetings = [];
  if (meetingsRes.ok) {
    const meetings = meetingsRes.data?.meetings ?? meetingsRes.data?.data?.meetings;
    if (Array.isArray(meetings)) {
      upcomingMeetings = meetings.slice(0, 5).map((m) => ({
        id: m._id,
        title: m.title,
        startTime: m.startTime,
        participants: Array.isArray(m.participants) ? m.participants.length : 0,
      }));
    }
  }

  const friendsRaw = friendsRes.ok ? unwrapFriendsList(friendsRes.data) : [];
  const pendingRaw = pendingRes.ok && Array.isArray(pendingRes.data) ? pendingRes.data : [];
  let unread = 0;
  if (notifRes.ok) unread = Number(notifRes.data?.unreadCount) || 0;

  const patch = {
    orgCount: orgList.length,
    friendsTotal: friendsRaw.length,
    pendingCount: pendingRaw.length,
    unread,
    taskDone,
    upcomingMeetings,
    partial: {
      organizations: !orgRes.ok,
      friends: !friendsRes.ok,
      pending: !pendingRes.ok,
      notifications: !notifRes.ok,
      meetings: !meetingsRes.ok,
      tasks: tasksFailed,
    },
    asOf: new Date().toISOString(),
  };

  await saveSnapshot(uid, patch, eventId);
  return { ok: true, patch };
}

module.exports = {
  refreshDashboardSnapshot,
};

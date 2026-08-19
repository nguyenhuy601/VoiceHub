const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');
const UserProjectMembership = require('../models/UserProjectMembership');

const PROJECT_SERVICE_URL = String(process.env.PROJECT_SERVICE_URL || process.env.TASK_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isCrossTeamNotifyEnabled() {
  const raw = String(process.env.PROJECT_CROSS_TEAM_CONTEXT_NOTIFY ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function notificationAxiosOpts() {
  const opts = { timeout: 8000, validateStatus: () => true };
  if (NOTIFICATION_INTERNAL_TOKEN) {
    opts.headers = { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN };
  }
  return opts;
}

function projectServiceHeaders(senderId) {
  return buildTrustedGatewayHeaders(String(senderId || '').trim());
}

async function fetchRoomChannelMeta({ senderId, organizationId, roomId }) {
  if (!ORGANIZATION_SERVICE_URL || !organizationId || !roomId) return null;
  try {
    const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/voice-channel-access/${encodeURIComponent(String(organizationId))}/${encodeURIComponent(String(senderId))}/${encodeURIComponent(String(roomId))}`;
    const res = await axios.get(url, {
      headers: projectServiceHeaders(senderId),
      timeout: 8000,
      validateStatus: () => true,
    });
    const data = res.data?.data ?? res.data;
    if (!data) return null;
    return {
      projectId: data.projectId ? String(data.projectId) : null,
      projectChannelKind: data.projectChannelKind ? String(data.projectChannelKind) : null,
    };
  } catch {
    return null;
  }
}

async function fetchWorkPreviewParticipantIds({ senderId, projectId, kind, entityId }) {
  if (!PROJECT_SERVICE_URL || !projectId || !kind || !entityId) return [];
  try {
    const url = `${PROJECT_SERVICE_URL}/api/projects/${encodeURIComponent(String(projectId))}/work-preview`;
    const res = await axios.get(url, {
      params: { kind, id: entityId },
      headers: projectServiceHeaders(senderId),
      timeout: 10000,
      validateStatus: () => true,
    });
    const data = res.data?.data ?? res.data;
    if (!data || data.restricted) return [];

    const ids = new Set();
    const assigneeId = String(data.assignee?.userId || data.assigneeId || '').trim();
    if (assigneeId) ids.add(assigneeId);

    for (const row of data.recent || []) {
      const actorId = String(row?.actorId || '').trim();
      if (actorId) ids.add(actorId);
    }
    return [...ids].filter(Boolean);
  } catch {
    return [];
  }
}

async function listProjectMemberUserIds(organizationId, projectId) {
  const oid = String(organizationId || '').trim();
  const pid = String(projectId || '').trim();
  if (!oid || !pid) return [];
  const rows = await UserProjectMembership.find({
    organizationId: oid,
    projectIds: pid,
  })
    .select('userId')
    .lean();
  return rows.map((row) => String(row.userId)).filter(Boolean);
}

/**
 * Cross-team: notify Work stakeholders — không filter/ẩn bubble trên room.
 */
async function maybeNotifyCrossTeamContext({ message, roomMeta }) {
  if (!isCrossTeamNotifyEnabled()) return;
  if (!NOTIFICATION_SERVICE_URL) return;

  const senderId = String(message?.senderId?._id || message?.senderId || '').trim();
  const organizationId = String(message?.organizationId || '').trim();
  const roomId = String(message?.roomId || '').trim();

  let meta = roomMeta;
  if (!meta?.projectChannelKind && organizationId && roomId && senderId) {
    meta = await fetchRoomChannelMeta({ senderId, organizationId, roomId });
  }
  if (String(meta?.projectChannelKind || '') !== 'cross_team') return;

  const refs = Array.isArray(message?.refs) ? message.refs : [];
  const firstRef = refs[0] || null;
  if (!firstRef?.projectId || !firstRef?.kind || !firstRef?.id) return;

  const projectId = String(firstRef.projectId).trim();

  let recipientIds = await fetchWorkPreviewParticipantIds({
    senderId,
    projectId,
    kind: firstRef.kind,
    entityId: firstRef.id,
  });
  if (!recipientIds.length) {
    recipientIds = await listProjectMemberUserIds(organizationId, projectId);
  }

  const recipients = [...new Set(recipientIds.map(String))].filter(
    (uid) => uid && uid !== senderId
  );
  if (!recipients.length) return;

  const refLabel = String(firstRef.label || firstRef.id || 'Work').trim();
  const preview = String(message?.content || '').trim();
  const content = preview
    ? preview.length > 120
      ? `${preview.slice(0, 117)}…`
      : preview
    : `Có cập nhật liên quan ${refLabel}`;

  await Promise.all(
    recipients.map((userId) =>
      axios
        .post(
          `${NOTIFICATION_SERVICE_URL}/api/notifications`,
          {
            userId,
            type: 'message',
            title: `#cross-team · ${refLabel}`,
            content,
            data: {
              roomId: String(message?.roomId || ''),
              organizationId,
              projectId,
              refKind: firstRef.kind,
              refId: String(firstRef.id),
            },
            actionUrl: organizationId
              ? `/app/collaborate/organizations/${encodeURIComponent(organizationId)}/channels?channelId=${encodeURIComponent(String(message?.roomId || ''))}`
              : undefined,
          },
          notificationAxiosOpts()
        )
        .catch(() => null)
    )
  );
}

module.exports = {
  isCrossTeamNotifyEnabled,
  maybeNotifyCrossTeamContext,
};

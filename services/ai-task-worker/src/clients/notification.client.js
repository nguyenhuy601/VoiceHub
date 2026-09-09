/**
 * Inbox HITL AI — HTTP S2S tới notification-service.
 * Chỉ gọi khi draft/suggestion sẵn sàng duyệt (async), không spam wizard đồng bộ.
 */
const axios = require('axios');
const { buildAiProposalActionUrl } = require('../utils/aiProposalActionUrl');

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

function isAiProposalNotifyEnabled() {
  const raw = String(process.env.AI_PROPOSAL_NOTIFY ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off' && raw !== 'no';
}

function isConfigured() {
  return Boolean(NOTIFICATION_SERVICE_URL && NOTIFICATION_INTERNAL_TOKEN);
}

function uniqueUserIds(userIds, excludeUserId) {
  const skip = String(excludeUserId || '').trim();
  return [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))].filter(
    (id) => id !== skip
  );
}

/**
 * @returns {Promise<boolean>}
 */
async function notifyAiProposalPending({
  userIds,
  title,
  content,
  data,
  actionUrl,
  excludeUserId,
}) {
  if (!isAiProposalNotifyEnabled() || !isConfigured()) return false;
  const ids = uniqueUserIds(userIds, excludeUserId);
  if (!ids.length) return false;
  try {
    const res = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications/bulk`,
      {
        userIds: ids,
        type: 'system',
        title: String(title || 'AI chờ xác nhận').slice(0, 200),
        content: String(content || 'Có đề xuất AI cần bạn duyệt (HITL).').slice(0, 500),
        data: {
          ...(data || {}),
          kind: 'ai_proposal_pending',
        },
        actionUrl: actionUrl || undefined,
      },
      {
        headers: { 'x-internal-notification-token': NOTIFICATION_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status < 200 || res.status >= 300) {
      console.warn('[aiProposalNotify] bulk HTTP', res.status, res.data?.message || res.data);
      return false;
    }
    return true;
  } catch (err) {
    console.warn('[aiProposalNotify] failed:', err?.message || err);
    return false;
  }
}

module.exports = {
  isAiProposalNotifyEnabled,
  buildAiProposalActionUrl,
  notifyAiProposalPending,
};

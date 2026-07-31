const axios = require('axios');
const { logger } = require('@enterprise/shared');

const CHAT_SERVICE_URL = String(process.env.CHAT_SERVICE_URL || '').trim().replace(/\/+$/, '');
const CHAT_INTERNAL_TOKEN = String(process.env.CHAT_INTERNAL_TOKEN || '').trim();

/**
 * S2S: đăng tin chào System Bot lên Department Channel.
 * Fail-soft — không làm fail provision kênh phòng.
 */
async function postDepartmentWelcomeMessage({
  organizationId,
  roomId,
  departmentName,
  content,
} = {}) {
  const orgId = String(organizationId || '').trim();
  const channelId = String(roomId || '').trim();
  if (!orgId || !channelId) {
    return { skipped: true, reason: 'empty' };
  }
  if (!CHAT_SERVICE_URL || !CHAT_INTERNAL_TOKEN) {
    logger.warn('[deptWelcome] CHAT_SERVICE_URL or CHAT_INTERNAL_TOKEN missing — skip');
    return { skipped: true, reason: 'not_configured' };
  }

  try {
    const response = await axios.post(
      `${CHAT_SERVICE_URL}/api/messages/internal/system-channel-message`,
      {
        organizationId: orgId,
        roomId: channelId,
        departmentName: departmentName || undefined,
        content: content || undefined,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-chat-internal-token': CHAT_INTERNAL_TOKEN,
        },
        timeout: Number(process.env.DEPT_WELCOME_TIMEOUT_MS || 15000),
        validateStatus: () => true,
      }
    );
    if (response.status >= 400) {
      logger.warn('[deptWelcome] chat-service error', {
        status: response.status,
        message: response.data?.message,
        roomId: channelId,
      });
      return { ok: false, status: response.status, data: response.data };
    }
    return { ok: true, data: response.data?.data || response.data };
  } catch (error) {
    logger.warn('[deptWelcome] request failed:', error.message);
    return { ok: false, reason: error.message };
  }
}

module.exports = {
  postDepartmentWelcomeMessage,
};

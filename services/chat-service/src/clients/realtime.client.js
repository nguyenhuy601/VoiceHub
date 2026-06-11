const axios = require('axios');
const logger = require('@enterprise/shared/utils/logger');

const INTERNAL_REALTIME_TOKEN = process.env.REALTIME_INTERNAL_TOKEN || '';

function getSocketServiceUrl() {
  return String(process.env.SOCKET_SERVICE_URL || '').trim().replace(/\/+$/, '');
}

async function emitRealtimeEvent(event = {}, options = {}) {
  const { timeoutMs = 3000 } = options;

  if (!event || !event.event) {
    return { ok: false, reason: 'missing_event_name' };
  }

  const SOCKET_SERVICE_URL = getSocketServiceUrl();
  if (!SOCKET_SERVICE_URL) {
    logger.warn('[realtime] SOCKET_SERVICE_URL not set; skip emit');
    return { ok: false, reason: 'missing_socket_url' };
  }

  const token = String(INTERNAL_REALTIME_TOKEN || '').trim();
  if (!token) {
    logger.warn('[realtime] REALTIME_INTERNAL_TOKEN not set; skip emit');
    return { ok: false, reason: 'missing_realtime_token' };
  }

  try {
    const headers = { 'x-realtime-token': token };
    const response = await axios.post(
      `${SOCKET_SERVICE_URL}/internal/realtime/publish`,
      event,
      { timeout: timeoutMs, headers }
    );
    return { ok: true, data: response?.data || {} };
  } catch (error) {
    logger.warn(
      `[realtime] emit failed: ${event.event} -> ${error.response?.status || ''} ${error.message}`
    );
    return {
      ok: false,
      reason: error.response?.data?.message || error.message,
      status: error.response?.status || null,
    };
  }
}

module.exports = { emitRealtimeEvent };

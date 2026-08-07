/**
 * S2S: ghi AuditEvent vào project-service (Phase 6 — master_data mutations).
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');

const PROJECT_SERVICE_URL = String(
  process.env.PROJECT_SERVICE_URL || process.env.TASK_SERVICE_URL || ''
)
  .trim()
  .replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

async function recordProjectAudit(payload = {}) {
  if (!PROJECT_SERVICE_URL || !GATEWAY_INTERNAL_TOKEN) {
    logger.warn('[projectAudit] PROJECT_SERVICE_URL or GATEWAY_INTERNAL_TOKEN missing — skip');
    return null;
  }
  try {
    const res = await axios.post(
      `${PROJECT_SERVICE_URL}/api/projects/internal/audit-events`,
      payload,
      {
        headers: { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN },
        timeout: 8000,
        validateStatus: () => true,
      }
    );
    if (res.status >= 200 && res.status < 300) {
      return res.data?.data ?? res.data ?? null;
    }
    logger.warn('[projectAudit] ingest status=%s', res.status);
    return null;
  } catch (err) {
    logger.warn('[projectAudit] ingest failed: %s', err.message);
    return null;
  }
}

module.exports = { recordProjectAudit };

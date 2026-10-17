const axios = require('axios');
const { buildTrustedGatewayHeaders } = require('@enterprise/shared/middleware/gatewayTrust');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');

/**
 * S2S: vị trí tổ chức đang gán.
 * @returns {Promise<Array<{ userId: string, positionCode: string, positionName: string }>>}
 */
async function fetchActiveOrgPositions(organizationId, actorUserId = 'system') {
  const oid = String(organizationId || '').trim();
  if (!oid || !ORGANIZATION_SERVICE_URL) return [];
  const url = `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/organizations/${encodeURIComponent(oid)}/position-assignments`;
  const res = await axios.get(url, {
    headers: buildTrustedGatewayHeaders(actorUserId || 'system'),
    timeout: 15000,
    validateStatus: () => true,
  });
  if (res.status !== 200) {
    const err = new Error('Không tải được vị trí tổ chức');
    err.statusCode = res.status >= 400 ? res.status : 502;
    throw err;
  }
  const rows = res.data?.data?.positions;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => ({
      userId: String(row?.userId || '').trim(),
      positionCode: String(row?.positionCode || '').trim(),
      positionName: String(row?.positionName || '').trim(),
    }))
    .filter((row) => row.userId);
}

module.exports = { fetchActiveOrgPositions };

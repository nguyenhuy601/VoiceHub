const axios = require('axios');
const { buildTrustedHeaders } = require('./httpDownstream');
const { isUsableDashboardSummary } = require('@enterprise/shared/utils/dashboardReadModelShape');

function resolveReportBase() {
  return String(process.env.REPORT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * @returns {Promise<{ ok: boolean, data?: object }>}
 */
async function fetchDashboardReadModel(userId, userEmail) {
  const base = resolveReportBase();
  if (!base || !userId) return { ok: false };
  const url = `${base}/internal/reports/v1/dashboard/${encodeURIComponent(String(userId))}`;
  const headers = buildTrustedHeaders(userId, userEmail);
  try {
    const res = await axios.get(url, { headers, timeout: 2500, validateStatus: () => true });
    if (res.status !== 200) return { ok: false, status: res.status };
    const data = res.data?.data !== undefined ? res.data.data : res.data;
    if (!isUsableDashboardSummary(data)) return { ok: false };
    return { ok: true, data };
  } catch {
    return { ok: false };
  }
}

module.exports = {
  fetchDashboardReadModel,
  resolveReportBase,
};

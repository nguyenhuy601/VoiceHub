/**
 * C4 report-service flags — optional mount khi REPORT_SERVICE_URL có mặt.
 *
 * REPORT_AGGREGATOR_MODE:
 *   off        — không dùng report-service
 *   c2_api     — aggregator gọi internal API (cầu nối)
 *   c4_warehouse — chỉ đọc analytics warehouse
 *
 * DASHBOARD_READ_MODEL (ADR-005):
 *   off        — BFF fan-out như cũ
 *   fallback   — thử RM, miss thì fan-out
 *   on         — ưu tiên RM; miss vẫn fan-out (không 5xx dashboard)
 */

const MODES = new Set(['off', 'c2_api', 'c4_warehouse']);
const DASHBOARD_RM_MODES = new Set(['off', 'fallback', 'on']);

function getReportAggregatorMode() {
  const raw = String(process.env.REPORT_AGGREGATOR_MODE || 'off')
    .trim()
    .toLowerCase();
  if (MODES.has(raw)) return raw;
  return 'off';
}

function isReportServiceEnabled() {
  const url = String(process.env.REPORT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  return Boolean(url) && getReportAggregatorMode() !== 'off';
}

function resolveReportServiceUrl() {
  return String(process.env.REPORT_SERVICE_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

/** Analytics Mongo/OLAP — phải khác URI OLTP project/task. */
function resolveAnalyticsMongoUri() {
  return String(process.env.ANALYTICS_MONGODB_URI || '')
    .trim();
}

function getDashboardReadModelMode() {
  const raw = String(process.env.DASHBOARD_READ_MODEL || 'off')
    .trim()
    .toLowerCase();
  if (DASHBOARD_RM_MODES.has(raw)) return raw;
  return 'off';
}

function isDashboardReadModelEnabled() {
  return getDashboardReadModelMode() !== 'off';
}

module.exports = {
  REPORT_AGGREGATOR_MODES: MODES,
  DASHBOARD_RM_MODES,
  getReportAggregatorMode,
  isReportServiceEnabled,
  resolveReportServiceUrl,
  resolveAnalyticsMongoUri,
  getDashboardReadModelMode,
  isDashboardReadModelEnabled,
};

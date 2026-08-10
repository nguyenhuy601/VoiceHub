/** ADR-005 — predicate dùng chung BFF + report-service. */

function isUsableDashboardSummary(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Number.isFinite(Number(data.orgCount))) return false;
  if (data.asOf == null || String(data.asOf).trim() === '') return false;
  return true;
}

module.exports = { isUsableDashboardSummary };

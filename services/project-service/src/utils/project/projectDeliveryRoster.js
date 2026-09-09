/**
 * 3 band bắt buộc khi tạo dự án: Product (PO|BA) + Facilitate (SM|PM) + Build (Dev|QA).
 * Một người được kiêm nhiều role.
 */

const PRODUCT_BAND = Object.freeze(['product_owner', 'business_analyst']);
const FACILITATE_BAND = Object.freeze(['scrum_master', 'project_manager']);
const BUILD_BAND = Object.freeze([
  'backend_developer',
  'frontend_developer',
  'mobile_developer',
  'fullstack_developer',
  'developer',
  'junior',
  'technical_lead',
  'tech_lead',
  'senior_developer',
  'qa_engineer',
  'qa_lead',
  'qa',
  'tester',
]);

const PRODUCT_SET = new Set(PRODUCT_BAND);
const FACILITATE_SET = new Set(FACILITATE_BAND);
const BUILD_SET = new Set(BUILD_BAND);

function normalizeRoleKeys(raw = []) {
  const input = Array.isArray(raw) ? raw : [raw];
  const out = [];
  const seen = new Set();
  for (const item of input) {
    const key = String(item || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function deliveryRosterStatus(roleKeys = []) {
  const keys = normalizeRoleKeys(roleKeys);
  return {
    hasProduct: keys.some((k) => PRODUCT_SET.has(k)),
    hasFacilitate: keys.some((k) => FACILITATE_SET.has(k)),
    hasBuild: keys.some((k) => BUILD_SET.has(k)),
  };
}

function assertDeliveryRoster(roleKeys = []) {
  const status = deliveryRosterStatus(roleKeys);
  const missing = [];
  if (!status.hasProduct) missing.push('PO hoặc BA');
  if (!status.hasFacilitate) missing.push('SM hoặc PM');
  if (!status.hasBuild) missing.push('Dev hoặc QA');
  if (!missing.length) return { ok: true, status };
  const err = new Error(`Team dự án thiếu: ${missing.join(', ')}`);
  err.statusCode = 400;
  err.errorCode = 'PROJECT_ROSTER_INCOMPLETE';
  throw err;
}

function collectCreateProjectRoleKeys({
  productOwnerId,
  scrumMasterId,
  techLeadId,
  members,
} = {}) {
  const keys = ['product_owner'];
  if (productOwnerId) keys.push('product_owner');
  if (scrumMasterId) keys.push('scrum_master');
  if (techLeadId) keys.push('technical_lead');
  for (const row of Array.isArray(members) ? members : []) {
    const rowKeys = Array.isArray(row?.projectRoleKeys) ? row.projectRoleKeys : [];
    keys.push(...rowKeys);
  }
  return normalizeRoleKeys(keys);
}

module.exports = {
  PRODUCT_BAND,
  FACILITATE_BAND,
  BUILD_BAND,
  normalizeRoleKeys,
  deliveryRosterStatus,
  assertDeliveryRoster,
  collectCreateProjectRoleKeys,
};

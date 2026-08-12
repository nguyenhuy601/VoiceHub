/** Mirror BE projectDeliveryRoster — 3 band bắt buộc khi tạo dự án. */

export const PRODUCT_BAND = Object.freeze(['product_owner', 'business_analyst']);
export const FACILITATE_BAND = Object.freeze(['scrum_master', 'project_manager']);
export const BUILD_BAND = Object.freeze([
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

export function normalizeRoleKeys(raw = []) {
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

export function deliveryRosterStatus(roleKeys = []) {
  const keys = normalizeRoleKeys(roleKeys);
  return {
    hasProduct: keys.some((k) => PRODUCT_SET.has(k)),
    hasFacilitate: keys.some((k) => FACILITATE_SET.has(k)),
    hasBuild: keys.some((k) => BUILD_SET.has(k)),
  };
}

/** Creator luôn là PO ở BE — cộng seedMembers. */
export function collectWizardRosterKeys(seedMembers = [], { creatorIsPo = true } = {}) {
  const keys = creatorIsPo ? ['product_owner'] : [];
  for (const row of Array.isArray(seedMembers) ? seedMembers : []) {
    keys.push(...(Array.isArray(row?.projectRoleKeys) ? row.projectRoleKeys : []));
  }
  return normalizeRoleKeys(keys);
}

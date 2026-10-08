/**
 * RULE-14 — Add delivery member trước Plan Baseline.
 * Mode: off | warn (default) | enforce
 */

const CORE_PLANNING_ROLE_KEYS = Object.freeze([
  'project_manager',
  'product_owner',
  'business_analyst',
  'solution_architect',
  'architect',
  'technical_lead',
  'tech_lead',
  'scrum_master',
]);

const DELIVERY_ROLE_KEYS = Object.freeze([
  'backend_developer',
  'frontend_developer',
  'mobile_developer',
  'fullstack_developer',
  'developer',
  'junior',
  'senior_developer',
  'qa_engineer',
  'qa_lead',
  'qa',
  'tester',
  'devops',
  'devops_engineer',
  'designer',
  'ui_ux',
  'ui_designer',
  'ux_designer',
]);

const CORE_SET = new Set(CORE_PLANNING_ROLE_KEYS);
const DELIVERY_SET = new Set(DELIVERY_ROLE_KEYS);

const MEMBER_ADD_MODES = Object.freeze(['off', 'warn', 'enforce']);

function normalizeMemberAddMode(raw) {
  const m = String(raw || 'warn')
    .trim()
    .toLowerCase();
  return MEMBER_ADD_MODES.includes(m) ? m : 'warn';
}

function normalizeRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase();
}

function isCorePlanningRole(roleKey) {
  return CORE_SET.has(normalizeRoleKey(roleKey));
}

function isDeliveryRole(roleKey) {
  return DELIVERY_SET.has(normalizeRoleKey(roleKey));
}

/**
 * @param {string[]} roleKeys
 * @returns {string[]} delivery keys among input
 */
function deliveryKeysAmong(roleKeys = []) {
  return [...new Set((roleKeys || []).map(normalizeRoleKey).filter((k) => DELIVERY_SET.has(k)))];
}

/**
 * @param {{
 *   mode?: string,
 *   roleKeys?: string[],
 *   planningBaselineExists?: boolean,
 *   resourceApproved?: boolean,
 * }} input
 * @returns {{ allowed: boolean, mode: string, deliveryKeys: string[], warning: object|null, error: Error|null }}
 */
function evaluateMemberAddBeforePlanBaseline(input = {}) {
  const mode = normalizeMemberAddMode(input.mode);
  const deliveryKeys = deliveryKeysAmong(input.roleKeys);
  if (mode === 'off' || !deliveryKeys.length) {
    return { allowed: true, mode, deliveryKeys, warning: null, error: null };
  }
  const unlocked = Boolean(input.planningBaselineExists) || Boolean(input.resourceApproved);
  if (unlocked) {
    return { allowed: true, mode, deliveryKeys, warning: null, error: null };
  }

  const message =
    'Nhóm delivery (Dev/QA/…) nên thêm sau khi có Planning Baseline hoặc RESOURCE approved (RULE-14).';
  const warning = {
    errorCode: 'PLAN_BASELINE_REQUIRED',
    message,
    deliveryKeys,
  };

  if (mode === 'enforce') {
    const err = new Error(message);
    err.statusCode = 409;
    err.errorCode = 'PLAN_BASELINE_REQUIRED';
    err.details = { deliveryKeys };
    return { allowed: false, mode, deliveryKeys, warning, error: err };
  }

  return { allowed: true, mode, deliveryKeys, warning, error: null };
}

module.exports = {
  CORE_PLANNING_ROLE_KEYS,
  DELIVERY_ROLE_KEYS,
  MEMBER_ADD_MODES,
  normalizeMemberAddMode,
  isCorePlanningRole,
  isDeliveryRole,
  deliveryKeysAmong,
  evaluateMemberAddBeforePlanBaseline,
};

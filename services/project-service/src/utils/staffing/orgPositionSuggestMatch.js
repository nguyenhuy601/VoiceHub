/**
 * Gợi ý nhân sự: vai trò dự án (quyền trên dự án) ← vị trí tổ chức (chức danh đã gán).
 * Khớp cả mã master HR (product_manager, team_lead, technical_lead, …)
 * và mã vị trí cũ (PRODUCT_OWNER, PROJECT_MANAGER, …).
 * Không có vị trí Project Manager / Product Owner trong master — PM lấy Team Lead, PO lấy Product Manager.
 */
const TECH_POSITION_CODES = Object.freeze([
  'TECHNICAL_LEAD',
  'ENGINEERING_MANAGER',
  'TECHNICAL_MANAGER',
  'SOFTWARE_ARCHITECT',
  'SOLUTION_ARCHITECT',
]);
const DEV_POSITION_CODES = Object.freeze(['SOFTWARE_DEVELOPER']);
const QA_POSITION_CODES = Object.freeze(['QA_ENGINEER']);

const ROLE_ORG_POSITION_CODES = Object.freeze({
  product_owner: Object.freeze(['PRODUCT_OWNER', 'PRODUCT_MANAGER']),
  project_manager: Object.freeze([
    'PROJECT_MANAGER',
    'SENIOR_PROJECT_MANAGER',
    'DELIVERY_MANAGER',
    'PROJECT_COORDINATOR',
    'TEAM_LEAD',
  ]),
  business_analyst: Object.freeze([
    'BUSINESS_ANALYST',
    'SENIOR_BUSINESS_ANALYST',
    'SYSTEM_ANALYST',
  ]),
  tech_lead: TECH_POSITION_CODES,
  technical_lead: TECH_POSITION_CODES,
  solution_architect: Object.freeze([
    'SOLUTION_ARCHITECT',
    'SOFTWARE_ARCHITECT',
    'TECHNICAL_LEAD',
  ]),
  architect: Object.freeze(['SOLUTION_ARCHITECT', 'SOFTWARE_ARCHITECT', 'TECHNICAL_LEAD']),
  scrum_master: Object.freeze(['SCRUM_MASTER']),
  qa_engineer: QA_POSITION_CODES,
  qa_lead: QA_POSITION_CODES,
  qa: QA_POSITION_CODES,
  tester: QA_POSITION_CODES,
  backend_developer: Object.freeze([...DEV_POSITION_CODES, 'BACKEND_ENGINEER']),
  frontend_developer: Object.freeze([...DEV_POSITION_CODES, 'FRONTEND_ENGINEER']),
  mobile_developer: DEV_POSITION_CODES,
  fullstack_developer: DEV_POSITION_CODES,
  developer: DEV_POSITION_CODES,
  senior_developer: DEV_POSITION_CODES,
  junior: DEV_POSITION_CODES,
  ui_ux_designer: Object.freeze(['UX_DESIGNER', 'UI_UX_DESIGNER']),
  devops_engineer: Object.freeze(['DEVOPS_ENGINEER']),
  release_manager: Object.freeze(['DEVOPS_ENGINEER']),
});

function normalizePositionCode(raw) {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function preferredOrgPositionCodes(projectRoleKey) {
  const key = String(projectRoleKey || '').trim().toLowerCase();
  return ROLE_ORG_POSITION_CODES[key] || null;
}

/**
 * @param {{ positionCode?: string, positionName?: string } | null} position
 * @param {string} projectRoleKey
 */
function orgPositionMatchesRole(position, projectRoleKey) {
  const preferred = preferredOrgPositionCodes(projectRoleKey);
  if (!preferred) return false;
  const code = normalizePositionCode(position?.positionCode);
  const name = normalizePositionCode(position?.positionName);
  return preferred.includes(code) || preferred.includes(name);
}

module.exports = {
  ROLE_ORG_POSITION_CODES,
  preferredOrgPositionCodes,
  orgPositionMatchesRole,
  normalizePositionCode,
};

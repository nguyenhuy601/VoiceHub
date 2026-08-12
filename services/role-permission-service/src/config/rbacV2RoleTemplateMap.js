/**
 * Map Org Role / Project Role catalog keys → RBAC V2 Permission Group template keys.
 * Used by migration + UI hints; does not create Category/Module (immutable system catalog).
 */
const ORG_ROLE_TO_TEMPLATE = Object.freeze({
  owner: 'organization_admin',
  admin: 'organization_admin',
  director: 'organization_admin',
  department_manager: 'department_manager',
  team_manager: 'department_manager',
  member: 'viewer',
  employee: 'viewer',
});

/**
 * Membership.role (organization-service: owner|admin|hr|member) → Permission Group template.
 * After direct-replace purge, UserRole is rebound from this map.
 */
const MEMBERSHIP_ROLE_TO_TEMPLATE = Object.freeze({
  owner: 'organization_admin',
  admin: 'organization_admin',
  hr: 'department_manager',
  member: 'viewer',
});

const PROJECT_ROLE_TO_TEMPLATE = Object.freeze({
  project_manager: 'project_manager',
  product_owner: 'product_owner',
  scrum_master: 'scrum_master',
  technical_lead: 'developer',
  solution_architect: 'developer',
  backend_developer: 'developer',
  fullstack_developer: 'developer',
  frontend_developer: 'developer',
  qa_lead: 'qa',
  qa_engineer: 'qa',
  devops_engineer: 'developer',
  observer: 'viewer',
  project_admin: 'project_admin',
});

function templateKeyForOrgRole(key) {
  return ORG_ROLE_TO_TEMPLATE[String(key || '').trim()] || 'viewer';
}

function templateKeyForProjectRole(key) {
  return PROJECT_ROLE_TO_TEMPLATE[String(key || '').trim()] || 'viewer';
}

/** @param {string} membershipRole raw or normalized Membership.role */
function membershipRoleToTemplateKey(membershipRole) {
  const key = String(membershipRole || '')
    .trim()
    .toLowerCase();
  if (MEMBERSHIP_ROLE_TO_TEMPLATE[key]) return MEMBERSHIP_ROLE_TO_TEMPLATE[key];
  // aliases
  if (key === 'org_admin') return 'organization_admin';
  if (key === 'human_resources' || key === 'nhan_su') return 'department_manager';
  if (key === 'employee') return 'viewer';
  return 'viewer';
}

module.exports = {
  ORG_ROLE_TO_TEMPLATE,
  MEMBERSHIP_ROLE_TO_TEMPLATE,
  PROJECT_ROLE_TO_TEMPLATE,
  templateKeyForOrgRole,
  templateKeyForProjectRole,
  membershipRoleToTemplateKey,
};

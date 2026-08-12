const { MASTER_PROJECT_ROLES } = require('@enterprise/shared/config/masterData');
const { defaultPermissionsForRoleKey } = require('../utils/projectPermissionMatrix');

/**
 * RBAC V2: map Project Role key → Permission Group template (role-permission-service).
 * Project-service vẫn giữ permissions matrix cục bộ; templateKey dùng để sync/rebind group.
 */
const PROJECT_ROLE_RBAC_TEMPLATE = Object.freeze({
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

/** Catalog Project Role từ master SSOT + permissions matrix. */
const DEFAULT_PROJECT_ROLES = MASTER_PROJECT_ROLES.map((def) => ({
  key: def.key,
  label: def.label,
  canAssign: Boolean(def.canAssign),
  sortOrder: def.sortOrder,
  permissions: defaultPermissionsForRoleKey(def.key),
  rbacTemplateKey: PROJECT_ROLE_RBAC_TEMPLATE[def.key] || 'viewer',
}));

/** Cạnh mẫu: key→key (áp sau khi có ProjectRole docs). */
const DELEGATION_TEMPLATES = {
  product: {
    id: 'product',
    label: 'Product / delivery digraph',
    edges: [
      ['project_manager', 'technical_lead', ['*']],
      ['project_manager', 'solution_architect', ['*']],
      ['project_manager', 'qa_lead', ['*']],
      ['project_manager', 'backend_developer', ['*']],
      ['project_manager', 'fullstack_developer', ['*']],
      ['technical_lead', 'fullstack_developer', ['*']],
      ['technical_lead', 'backend_developer', ['*']],
      ['technical_lead', 'qa_lead', ['*']],
      ['solution_architect', 'fullstack_developer', ['tech', '*']],
      ['fullstack_developer', 'backend_developer', ['*']],
      ['qa_lead', 'backend_developer', ['bug']],
      ['qa_lead', 'fullstack_developer', ['bug']],
      ['qa_engineer', 'backend_developer', ['bug']],
      ['devops_engineer', 'backend_developer', ['deploy', '*']],
    ],
  },
  outsourcing: {
    id: 'outsourcing',
    label: 'Outsourcing digraph',
    edges: [
      ['project_manager', 'technical_lead', ['*']],
      ['project_manager', 'qa_lead', ['*']],
      ['technical_lead', 'backend_developer', ['*']],
      ['technical_lead', 'fullstack_developer', ['*']],
      ['qa_engineer', 'backend_developer', ['bug', '*']],
      ['fullstack_developer', 'observer', ['*']],
    ],
  },
  startup: {
    id: 'startup',
    label: 'Startup flat digraph',
    edges: [
      ['project_manager', 'backend_developer', ['*']],
      ['project_manager', 'qa_engineer', ['*']],
      ['technical_lead', 'backend_developer', ['*']],
      ['technical_lead', 'observer', ['*']],
      ['qa_engineer', 'backend_developer', ['bug', '*']],
    ],
  },
};

module.exports = {
  DEFAULT_PROJECT_ROLES,
  DELEGATION_TEMPLATES,
  PROJECT_ROLE_RBAC_TEMPLATE,
};

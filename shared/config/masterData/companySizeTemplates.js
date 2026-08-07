/**
 * Company size presets — enabled master-data keys per template.
 */

const { MASTER_DEPARTMENT_KEYS } = require('./departments');
const { MASTER_POSITION_KEYS } = require('./positions');
const { MASTER_ORGANIZATION_ROLE_KEYS } = require('./organizationRoles');
const { MASTER_PROJECT_ROLE_KEYS } = require('./projectRoles');

const COMPANY_SIZE_KEYS = Object.freeze(['startup', 'sme', 'mid', 'enterprise']);

const COMPANY_SIZE_TEMPLATES = Object.freeze({
  startup: {
    label: 'Startup',
    enabledDepartmentKeys: [
      'engineering',
      'product',
      'design',
      'operations',
    ],
    enabledPositionKeys: [
      'product_manager',
      'team_lead',
      'software_developer',
      'qa_engineer',
      'ux_designer',
      'intern',
    ],
    enabledOrganizationRoleKeys: [
      'department_manager',
      'team_lead',
    ],
    enabledProjectRoleKeys: [
      'project_manager',
      'product_owner',
      'scrum_master',
      'technical_lead',
      'backend_developer',
      'qa_engineer',
      'observer',
    ],
  },
  sme: {
    label: 'SME',
    enabledDepartmentKeys: [
      'engineering',
      'qa',
      'product',
      'business_analysis',
      'design',
      'hr',
      'operations',
    ],
    enabledPositionKeys: [
      'engineering_manager',
      'product_manager',
      'team_lead',
      'business_analyst',
      'software_developer',
      'qa_engineer',
      'ux_designer',
      'devops_engineer',
      'intern',
    ],
    enabledOrganizationRoleKeys: [
      'department_manager',
      'team_lead',
      'director',
      'resource_manager',
    ],
    enabledProjectRoleKeys: [
      'project_manager',
      'product_owner',
      'scrum_master',
      'solution_architect',
      'technical_lead',
      'business_analyst',
      'backend_developer',
      'frontend_developer',
      'qa_lead',
      'qa_engineer',
      'ui_ux_designer',
      'devops_engineer',
      'observer',
    ],
  },
  mid: {
    label: 'Mid-size',
    enabledDepartmentKeys: MASTER_DEPARTMENT_KEYS.filter((k) => k !== 'finance' && k !== 'marketing'),
    enabledPositionKeys: MASTER_POSITION_KEYS.filter((k) => k !== 'intern'),
    enabledOrganizationRoleKeys: MASTER_ORGANIZATION_ROLE_KEYS.filter((k) => k !== 'auditor'),
    enabledProjectRoleKeys: MASTER_PROJECT_ROLE_KEYS.filter(
      (k) => !['sponsor', 'stakeholder'].includes(k)
    ),
  },
  enterprise: {
    label: 'Enterprise',
    enabledDepartmentKeys: [...MASTER_DEPARTMENT_KEYS],
    enabledPositionKeys: [...MASTER_POSITION_KEYS],
    enabledOrganizationRoleKeys: [...MASTER_ORGANIZATION_ROLE_KEYS],
    enabledProjectRoleKeys: [...MASTER_PROJECT_ROLE_KEYS],
  },
});

function resolveCompanySize(raw) {
  const k = String(raw || '').trim().toLowerCase();
  if (COMPANY_SIZE_KEYS.includes(k)) return k;
  return 'startup';
}

function getTemplateForCompanySize(companySize) {
  const size = resolveCompanySize(companySize);
  return COMPANY_SIZE_TEMPLATES[size] || COMPANY_SIZE_TEMPLATES.startup;
}

function buildDefaultMasterDataSettings(companySize = 'startup') {
  const template = getTemplateForCompanySize(companySize);
  return {
    companySize: resolveCompanySize(companySize),
    masterData: {
      enabledDepartmentKeys: [...template.enabledDepartmentKeys],
      enabledPositionKeys: [...template.enabledPositionKeys],
      enabledOrganizationRoleKeys: [...template.enabledOrganizationRoleKeys],
      enabledProjectRoleKeys: [...template.enabledProjectRoleKeys],
    },
  };
}

module.exports = {
  COMPANY_SIZE_KEYS,
  COMPANY_SIZE_TEMPLATES,
  resolveCompanySize,
  getTemplateForCompanySize,
  buildDefaultMasterDataSettings,
};

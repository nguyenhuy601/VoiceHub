const {
  VISIBILITY_AUDIENCES,
  INFORMATION_LEVELS,
  maxInformationLevel,
  normalizeProjectVisibilityPolicy,
  isValidInformationLevel,
} = require('@enterprise/shared/config/projectVisibilityPolicy');
const { DEFAULT_PROJECT_ROLE_KEYS } = require('@enterprise/shared/config/roleTaxonomy');

const PM_ROLE_KEYS = new Set([
  DEFAULT_PROJECT_ROLE_KEYS.PROJECT_MANAGER,
  DEFAULT_PROJECT_ROLE_KEYS.PRODUCT_OWNER,
  'project_manager',
  'product_owner',
]);

function isProjectVisibilityV2Enabled() {
  const raw = String(process.env.PROJECT_VISIBILITY_V2 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {object} actor
 * @param {object} project
 * @param {{ projectRoleKeys?: string[] }} [membership]
 */
function classifyAudiences(actor = {}, project = {}, membership = {}) {
  const matched = new Set();
  const membershipRole = String(actor.membershipRole || '').toLowerCase();
  const orgRoleKeys = new Set(
    (Array.isArray(actor.organizationRoleKeys) ? actor.organizationRoleKeys : []).map((k) =>
      String(k || '').trim().toLowerCase()
    )
  );

  if (membershipRole === 'owner') matched.add('system_admins');
  if (membershipRole === 'owner' || membershipRole === 'admin') matched.add('organization_admins');
  if (orgRoleKeys.has('director')) matched.add('directors');

  const roleKeys = (Array.isArray(membership.projectRoleKeys) ? membership.projectRoleKeys : []).map(
    (k) => String(k || '').trim().toLowerCase()
  );
  const isCreator = String(project.createdBy || '') === String(actor.userId || '');
  const isMember = Boolean(membership.isMember) || roleKeys.length > 0 || isCreator;
  if (isMember) matched.add('project_members');
  if (isCreator || roleKeys.some((k) => PM_ROLE_KEYS.has(k))) matched.add('project_managers');

  // relatedDepartmentIds không còn dùng để discover (chỉ thành viên dự án / elevated org).

  if (actor.isOrgMember) matched.add('all_employees');

  return [...matched];
}

/**
 * Merge org policy with project custom + level overrides.
 */
function resolveEffectivePolicy(orgPolicy, project = {}) {
  const base = normalizeProjectVisibilityPolicy(orgPolicy || {});
  const mode = String(project.visibilityMode || 'inherit').toLowerCase() === 'custom' ? 'custom' : 'inherit';
  if (mode !== 'custom') {
    return { mode, policy: base };
  }
  const custom = normalizeProjectVisibilityPolicy(project.visibilityPolicy || base);
  const overrides = Array.isArray(project.informationLevelOverrides)
    ? project.informationLevelOverrides
    : [];
  for (const row of overrides) {
    const audience = String(row?.audience || '').trim();
    const level = String(row?.level || '').trim().toLowerCase();
    if (VISIBILITY_AUDIENCES.includes(audience) && isValidInformationLevel(level)) {
      custom.defaultInformationLevels[audience] = level;
    }
  }
  return { mode, policy: custom };
}

/**
 * @returns {{ discover: boolean, informationLevel: string, audiences: string[] }}
 */
function resolveProjectAccess({ actor, project, membership, orgPolicy }) {
  const audiences = classifyAudiences(actor, project, membership);
  const { policy } = resolveEffectivePolicy(orgPolicy, project);

  const discoverAudiences = audiences.filter((a) => policy.discoverAudiences[a]);

  // Legacy dual-read: workspace projects visible to any org member
  let discover = discoverAudiences.length > 0;
  if (!discover && actor.isOrgMember && String(project.visibility || '') === 'workspace') {
    discover = true;
    if (!audiences.includes('all_employees')) audiences.push('all_employees');
    discoverAudiences.push('all_employees');
  }

  const roleKeys = (Array.isArray(membership?.projectRoleKeys) ? membership.projectRoleKeys : []).map(
    (k) => String(k || '').trim().toLowerCase()
  );
  const isCreator = String(project?.createdBy || '') === String(actor?.userId || '');
  const isMember =
    Boolean(membership?.isMember) || roleKeys.length > 0 || isCreator;
  const isProjectManager = isCreator || roleKeys.some((k) => PM_ROLE_KEYS.has(k));

  // Creator / explicit member always discover (safety net)
  if (!discover && isMember) {
    discover = true;
    if (!audiences.includes('project_members')) audiences.push('project_members');
    if (!discoverAudiences.includes('project_members')) discoverAudiences.push('project_members');
  }

  // Level = max among discover audiences (plan: matched + discoverable)
  let informationLevel = discover
    ? maxInformationLevel(
        discoverAudiences.map((a) => policy.defaultInformationLevels[a] || 'summary')
      )
    : 'summary';

  // Hard floor: membership / PM never stuck at related-dept "summary"
  if (isMember) {
    informationLevel = maxInformationLevel([
      informationLevel,
      policy.defaultInformationLevels.project_members || 'details',
    ]);
  }
  if (isProjectManager) {
    informationLevel = maxInformationLevel([
      informationLevel,
      policy.defaultInformationLevels.project_managers || 'confidential',
    ]);
  }
  if (audiences.includes('organization_admins') || audiences.includes('system_admins')) {
    informationLevel = maxInformationLevel([
      informationLevel,
      policy.defaultInformationLevels.organization_admins || 'confidential',
      policy.defaultInformationLevels.system_admins || 'confidential',
    ]);
  }

  return {
    discover,
    informationLevel,
    audiences: [...new Set(audiences)],
  };
}

/**
 * Strip fields by information level for API responses.
 */
function applyInformationLevelToProject(project, informationLevel) {
  if (!project || typeof project !== 'object') return project;
  const level = String(informationLevel || 'summary').toLowerCase();
  const out = { ...project };

  delete out.technicalSetup;

  if (level === 'summary') {
    delete out.customer;
    delete out.boards;
    return out;
  }
  if (level === 'details') {
    if (out.customer) {
      out.customer = {
        name: out.customer.name || '',
        company: out.customer.company || '',
      };
    }
    return out;
  }
  return out;
}

function normalizeRelatedDepartmentIds(raw = []) {
  const input = Array.isArray(raw) ? raw : [];
  const ids = [];
  const seen = new Set();
  for (const item of input) {
    const id = String(item || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * T4: PM/custom visibility only when org allows override (or actor is org admin).
 * @returns {{ allowed: boolean, isOrgAdmin: boolean }}
 */
function canUseCustomProjectVisibility(ctx = {}, userId = '') {
  const role = String(ctx?.membershipRole || '').toLowerCase();
  const isOrgAdmin = role === 'owner' || role === 'admin';
  const allowOverride = ctx?.policy?.allowProjectManagerOverride !== false;
  return {
    allowed: allowOverride || isOrgAdmin,
    isOrgAdmin,
  };
}

function assertCanUseCustomProjectVisibility(ctx = {}, userId = '') {
  const { allowed } = canUseCustomProjectVisibility(ctx, userId);
  if (allowed) return;
  const err = new Error('Organization không cho phép override Visibility Policy');
  err.statusCode = 403;
  throw err;
}

function normalizeInformationLevelOverrides(rows = []) {
  const input = Array.isArray(rows) ? rows : [];
  const byAudience = new Map();
  for (const row of input) {
    const audience = String(row?.audience || '').trim();
    const level = String(row?.level || '').trim().toLowerCase();
    if (!VISIBILITY_AUDIENCES.includes(audience) || !isValidInformationLevel(level)) continue;
    byAudience.set(audience, { audience, level });
  }
  return [...byAudience.values()];
}

module.exports = {
  VISIBILITY_AUDIENCES,
  INFORMATION_LEVELS,
  isProjectVisibilityV2Enabled,
  classifyAudiences,
  resolveEffectivePolicy,
  resolveProjectAccess,
  applyInformationLevelToProject,
  normalizeRelatedDepartmentIds,
  normalizeInformationLevelOverrides,
  normalizeProjectVisibilityPolicy,
  canUseCustomProjectVisibility,
  assertCanUseCustomProjectVisibility,
};

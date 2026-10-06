const { resolvePositionKeyFromJobTitle } = require('../staffing/positionCandidateMatch');
const { coalesceJobTitle } = require('../common/jobTitleProfile');
const { fetchUserProfileByIdInternal } = require('../../clients/userService.client');
const mongoose = require('mongoose');
const ProjectMembership = require('../../models/ProjectMembership');
const ProjectRole = require('../../models/ProjectRole');
const {
  normalizeRequirementAccessPolicy,
  mergePersonaActions,
  mergePersonaVisibility,
} = require('@enterprise/shared/config/requirementAccessPolicy');

function normalizeJobTitleAlias(jobTitle) {
  return String(jobTitle || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function jobTitleMatchesMapping(jobTitle, mapping = {}) {
  const positionKeys = new Set((mapping.positionKeys || []).map((k) => String(k).toLowerCase()));
  const aliases = new Set((mapping.aliases || []).map((a) => String(a).toLowerCase()));
  const positionKey = resolvePositionKeyFromJobTitle(jobTitle);
  if (positionKey && positionKeys.has(positionKey.toLowerCase())) return true;

  const alias = normalizeJobTitleAlias(jobTitle);
  if (!alias) return false;
  if (aliases.has(alias)) return true;
  return aliases.has(alias.replace(/\s+/g, '_'));
}

async function fetchUserJobTitle(userId) {
  try {
    const res = await fetchUserProfileByIdInternal(userId);
    const profile = res?.data?.data ?? res?.data ?? null;
    return coalesceJobTitle(profile);
  } catch {
    return '';
  }
}

function asObjectIdOrRaw(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (mongoose.isValidObjectId(raw)) return new mongoose.Types.ObjectId(raw);
  return raw;
}

async function hasProjectRoleKeys(userId, organizationId, roleKeys = []) {
  const uid = asObjectIdOrRaw(userId);
  const orgId = asObjectIdOrRaw(organizationId);
  const keys = Array.isArray(roleKeys) ? roleKeys.filter(Boolean) : [];
  if (!uid || !orgId || !keys.length) return false;
  if (mongoose.connection.readyState !== 1) return false;

  try {
    const roles = await ProjectRole.find({
      organizationId: orgId,
      key: { $in: keys },
    })
      .select('_id key')
      .lean();
    if (!roles.length) return false;

    const roleIds = roles.map((row) => row._id);
    const membership = await ProjectMembership.findOne({
      organizationId: orgId,
      userId: uid,
      projectRoleId: { $in: roleIds },
    })
      .select('_id')
      .lean();
    return Boolean(membership);
  } catch {
    return false;
  }
}

/** True if user has one of roleKeys on a specific project (via membership → role key). */
async function hasProjectRoleKeysOnProject(userId, projectId, roleKeys = []) {
  const uid = asObjectIdOrRaw(userId);
  const pid = asObjectIdOrRaw(projectId);
  const keys = new Set(
    (Array.isArray(roleKeys) ? roleKeys : [])
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean)
  );
  if (!uid || !pid || !keys.size) return false;
  if (mongoose.connection.readyState !== 1) return false;

  try {
    // Membership-first: roles may be org catalog (projectId null) or project clones.
    // Do NOT filter ProjectRole by projectId — that misses catalog-backed memberships.
    const memberships = await ProjectMembership.find({
      projectId: pid,
      userId: uid,
    })
      .select('projectRoleId')
      .lean();
    if (!memberships.length) return false;
    const roleIds = memberships.map((m) => m.projectRoleId).filter(Boolean);
    if (!roleIds.length) return false;
    const roles = await ProjectRole.find({ _id: { $in: roleIds } })
      .select('key')
      .lean();
    return roles.some((r) => keys.has(String(r?.key || '').trim().toLowerCase()));
  } catch {
    return false;
  }
}

function membershipRoleMatchesOperator(membershipRole, policy) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const roles = new Set(
    (normalized.personaByOrgRole?.operator?.membershipRoles || []).map((r) => String(r).toLowerCase())
  );
  return roles.has(String(membershipRole || '').toLowerCase());
}

async function matchSubmitter({ userId, organizationId, jobTitle, policy }) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const mapping = normalized.personaByPosition?.submitter || {};
  if (jobTitleMatchesMapping(jobTitle, mapping)) return true;
  return hasProjectRoleKeys(userId, organizationId, mapping.projectRoleKeys);
}

async function matchApprover({ userId, organizationId, jobTitle, policy }) {
  const normalized = normalizeRequirementAccessPolicy(policy);
  const mapping = normalized.personaByPosition?.approver || {};
  if (jobTitleMatchesMapping(jobTitle, mapping)) return true;
  return hasProjectRoleKeys(userId, organizationId, mapping.projectRoleKeys);
}

function pickPrimaryPersona(personasMatched = []) {
  if (personasMatched.includes('approver')) return 'approver';
  if (personasMatched.includes('submitter')) return 'submitter';
  if (personasMatched.includes('operator')) return 'operator';
  return 'member';
}

/**
 * Resolve org-level requirement persona + merged actions/visibility.
 * @param {{ userId: string, organizationId: string, membershipRole?: string, policy?: object, jobTitle?: string }} input
 */
async function resolveRequirementPersona(input = {}) {
  const userId = String(input.userId || '').trim();
  const organizationId = String(input.organizationId || '').trim();
  const policy = normalizeRequirementAccessPolicy(input.policy || {});
  const membershipRole = String(input.membershipRole || '').toLowerCase();

  if (!userId || !organizationId) {
    return {
      persona: 'member',
      personasMatched: ['member'],
      actions: mergePersonaActions(['member'], policy),
      visibility: mergePersonaVisibility(['member'], policy),
      isSubmitter: false,
      isApprover: false,
      isOperator: false,
      isProductUser: false,
    };
  }

  const jobTitle =
    input.jobTitle !== undefined ? String(input.jobTitle || '') : await fetchUserJobTitle(userId);

  const personasMatched = [];
  const isOperator = membershipRoleMatchesOperator(membershipRole, policy);
  const isApprover = await matchApprover({ userId, organizationId, jobTitle, policy });
  const isSubmitter = await matchSubmitter({ userId, organizationId, jobTitle, policy });

  if (isOperator) personasMatched.push('operator');
  if (isApprover) personasMatched.push('approver');
  if (isSubmitter) personasMatched.push('submitter');
  if (!personasMatched.length) personasMatched.push('member');

  const actions = mergePersonaActions(personasMatched, policy);
  const visibility = mergePersonaVisibility(personasMatched, policy);

  return {
    persona: pickPrimaryPersona(personasMatched),
    personasMatched,
    actions,
    visibility,
    isSubmitter,
    isApprover,
    isOperator,
    isProductUser: isSubmitter || isApprover,
  };
}

/**
 * Pure decision — FE SoT for Gate1 project approver (role keys + analysis:po_review matrix).
 * @param {Array<{ key?: string }>} roles
 * @param {string[]} [approverRoleKeys]
 * @returns {{ ok: boolean, via: string|null, roleKeys: string[] }}
 */
function evaluateApproverFromProjectRoles(
  roles = [],
  approverRoleKeys = ['product_owner', 'project_manager']
) {
  const keySet = new Set(
    (Array.isArray(approverRoleKeys) ? approverRoleKeys : [])
      .map((k) => String(k || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const list = Array.isArray(roles) ? roles : [];
  const roleKeys = list
    .map((r) => String(r?.key || '').trim().toLowerCase())
    .filter(Boolean);

  if (!keySet.size) {
    return { ok: false, via: null, roleKeys };
  }

  if (roleKeys.some((k) => keySet.has(k))) {
    const matched = roleKeys.find((k) => keySet.has(k));
    return { ok: true, via: `project_role:${matched}`, roleKeys };
  }

  const {
    matrixPermissionsFromRoleKeys,
    hasPermission,
  } = require('../project/projectPermissionMatrix');
  const rolePerms = matrixPermissionsFromRoleKeys(list);
  if (hasPermission(rolePerms, 'analysis:po_review')) {
    return { ok: true, via: 'project_permission:analysis:po_review', roleKeys };
  }

  return { ok: false, via: null, roleKeys };
}

/**
 * FE SoT for Gate1 approve: same path as attachProjectCapabilities
 * (resolveUserProjectPermissions → role keys / matrixPermissionsFromRoleKeys).
 * Does NOT use creator/org-admin permission dump.
 *
 * @param {string} userId
 * @param {string} projectId
 * @param {string[]} [approverRoleKeys]
 * @returns {Promise<{ ok: boolean, via: string|null, roleKeys: string[] }>}
 */
async function userHasApproverRoleOnProject(
  userId,
  projectId,
  approverRoleKeys = ['product_owner', 'project_manager']
) {
  const uid = String(userId || '').trim();
  const pid = String(projectId || '').trim();
  if (!uid || !pid) {
    return { ok: false, via: null, roleKeys: [] };
  }

  try {
    // Lazy require — avoid circular load with projectAccess → …
    const { resolveUserProjectPermissions } = require('../../services/projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId: uid, projectId: pid });
    return evaluateApproverFromProjectRoles(resolved?.roles || [], approverRoleKeys);
  } catch {
    return { ok: false, via: null, roleKeys: [] };
  }
}

module.exports = {
  resolveRequirementPersona,
  jobTitleMatchesMapping,
  membershipRoleMatchesOperator,
  matchSubmitter,
  matchApprover,
  hasProjectRoleKeys,
  hasProjectRoleKeysOnProject,
  userHasApproverRoleOnProject,
  evaluateApproverFromProjectRoles,
};

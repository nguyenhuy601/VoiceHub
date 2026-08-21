const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const { resolvePositionKeyFromJobTitle } = require('./positionCandidateMatch');
const {
  REQUIREMENT_SUBMITTER_JOB_TITLE_KEYS,
  REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS,
  REQUIREMENT_APPROVER_JOB_TITLE_KEYS,
  REQUIREMENT_APPROVER_JOB_TITLE_ALIASES,
  REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS,
  REQUIREMENT_PRODUCT_JOB_TITLE_KEYS,
} = require('../constants/requirementLifecycle');
const { coalesceJobTitle } = require('./jobTitleProfile');

const SUBMITTER_JOB_TITLE_SET = new Set(REQUIREMENT_SUBMITTER_JOB_TITLE_KEYS);
const APPROVER_JOB_TITLE_SET = new Set(REQUIREMENT_APPROVER_JOB_TITLE_KEYS);
const APPROVER_JOB_TITLE_ALIAS_SET = new Set(REQUIREMENT_APPROVER_JOB_TITLE_ALIASES);
const PRODUCT_JOB_TITLE_SET = new Set(REQUIREMENT_PRODUCT_JOB_TITLE_KEYS);

function normalizeJobTitleAlias(jobTitle) {
  return String(jobTitle || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function jobTitleMatchesSet(jobTitle, keySet) {
  const positionKey = resolvePositionKeyFromJobTitle(jobTitle);
  return Boolean(positionKey && keySet.has(positionKey));
}

function isSubmitterJobTitle(jobTitle) {
  return jobTitleMatchesSet(jobTitle, SUBMITTER_JOB_TITLE_SET);
}

function isApproverJobTitle(jobTitle) {
  if (jobTitleMatchesSet(jobTitle, APPROVER_JOB_TITLE_SET)) return true;
  const alias = normalizeJobTitleAlias(jobTitle);
  if (!alias) return false;
  if (APPROVER_JOB_TITLE_ALIAS_SET.has(alias)) return true;
  // slug form stored as product_owner / project_manager
  const slug = alias.replace(/\s+/g, '_');
  return APPROVER_JOB_TITLE_ALIAS_SET.has(slug);
}

/** @deprecated prefer isSubmitterJobTitle / isApproverJobTitle */
function isProductJobTitle(jobTitle) {
  return jobTitleMatchesSet(jobTitle, PRODUCT_JOB_TITLE_SET);
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

async function hasProjectRoleKeys(userId, organizationId, roleKeys) {
  const uid = String(userId || '').trim();
  const orgId = String(organizationId || '').trim();
  const keys = Array.isArray(roleKeys) ? roleKeys.filter(Boolean) : [];
  if (!uid || !orgId || !keys.length) return false;

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
}

async function hasSubmitterProjectRole(userId, organizationId) {
  return hasProjectRoleKeys(userId, organizationId, [...REQUIREMENT_SUBMITTER_PROJECT_ROLE_KEYS]);
}

async function hasApproverProjectRole(userId, organizationId) {
  return hasProjectRoleKeys(userId, organizationId, [...REQUIREMENT_APPROVER_PROJECT_ROLE_KEYS]);
}

/** @deprecated prefer hasSubmitterProjectRole / hasApproverProjectRole */
async function hasProductProjectRole(userId, organizationId) {
  const [submitter, approver] = await Promise.all([
    hasSubmitterProjectRole(userId, organizationId),
    hasApproverProjectRole(userId, organizationId),
  ]);
  return submitter || approver;
}

async function isRequirementSubmitterUser(userId, organizationId) {
  const uid = String(userId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) return false;

  const [jobTitle, hasProjectRole] = await Promise.all([
    fetchUserJobTitle(uid),
    hasSubmitterProjectRole(uid, orgId),
  ]);
  if (hasProjectRole) return true;
  return isSubmitterJobTitle(jobTitle);
}

async function isRequirementApproverUser(userId, organizationId) {
  const uid = String(userId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) return false;

  const [jobTitle, hasProjectRole] = await Promise.all([
    fetchUserJobTitle(uid),
    hasApproverProjectRole(uid, orgId),
  ]);
  if (hasProjectRole) return true;
  return isApproverJobTitle(jobTitle);
}

/** BA submitter hoặc PO/PM approver — dùng cho Collaborate nav. */
async function isRequirementProductUser(userId, organizationId) {
  const uid = String(userId || '').trim();
  const orgId = String(organizationId || '').trim();
  if (!uid || !orgId) return false;

  const [submitter, approver] = await Promise.all([
    isRequirementSubmitterUser(uid, orgId),
    isRequirementApproverUser(uid, orgId),
  ]);
  return submitter || approver;
}

module.exports = {
  isSubmitterJobTitle,
  isApproverJobTitle,
  isProductJobTitle,
  hasSubmitterProjectRole,
  hasApproverProjectRole,
  hasProductProjectRole,
  isRequirementSubmitterUser,
  isRequirementApproverUser,
  isRequirementProductUser,
};

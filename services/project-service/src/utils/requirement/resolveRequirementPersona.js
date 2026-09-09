const { resolvePositionKeyFromJobTitle } = require('./positionCandidateMatch');
const { coalesceJobTitle } = require('./jobTitleProfile');
const { fetchUserProfileByIdInternal } = require('../clients/userService.client');
const mongoose = require('mongoose');
const ProjectMembership = require('../models/ProjectMembership');
const ProjectRole = require('../models/ProjectRole');
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

async function hasProjectRoleKeys(userId, organizationId, roleKeys = []) {
  const uid = String(userId || '').trim();
  const orgId = String(organizationId || '').trim();
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

module.exports = {
  resolveRequirementPersona,
  jobTitleMatchesMapping,
  membershipRoleMatchesOperator,
  matchSubmitter,
  matchApprover,
};

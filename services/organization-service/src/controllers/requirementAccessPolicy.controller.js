const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const { orgValidation, orgCatch, orgNotFound, orgUnauthorized, orgAccessDenied } = require('../utils/orgApiError');
const { resolveOrgAccess } = require('../utils/orgAccess');
const {
  normalizeRequirementAccessPolicy,
  defaultRequirementAccessPolicy,
  validateRequirementAccessPolicy,
} = require('../utils/requirementAccessPolicy');

const getUserId = (req) =>
  req.user?.id || req.user?._id || req.user?.userId || req.headers['x-user-id'] || '';

async function getRequirementAccessPolicy(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return orgUnauthorized(res);
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');

    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) return orgAccessDenied(res);

    const org = await Organization.findById(orgId).select('settings').lean();
    if (!org) return orgNotFound(res);

    const policy = normalizeRequirementAccessPolicy(org.settings?.requirementAccessPolicy || {});
    return res.json({ success: true, data: { policy } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function putRequirementAccessPolicy(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return orgUnauthorized(res);
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');

    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) return orgAccessDenied(res);
    const role = Membership.normalizeRole(access.membership?.role);
    if (role !== 'owner' && role !== 'admin') {
      return orgAccessDenied(res, 'Chỉ owner/admin được sửa Requirement Access Policy');
    }

    const validated = validateRequirementAccessPolicy(req.body?.policy || req.body || {});
    if (!validated.ok) {
      return orgValidation(res, validated.message || 'Policy không hợp lệ');
    }

    const org = await Organization.findById(orgId);
    if (!org) return orgNotFound(res);

    org.settings = org.settings || {};
    org.settings.requirementAccessPolicy = validated.policy;
    org.markModified('settings');
    await org.save();

    return res.json({ success: true, data: { policy: validated.policy } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function getInternalRequirementAccessPolicy(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }

    const org = await Organization.findById(organizationId).select('settings').lean();
    if (!org) return orgNotFound(res);

    const policy = normalizeRequirementAccessPolicy(org.settings?.requirementAccessPolicy || {});
    return res.json({ success: true, data: { policy } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

module.exports = {
  getRequirementAccessPolicy,
  putRequirementAccessPolicy,
  getInternalRequirementAccessPolicy,
  defaultRequirementAccessPolicy,
};

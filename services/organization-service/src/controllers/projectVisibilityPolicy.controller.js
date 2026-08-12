const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const Department = require('../models/Department');
const { orgValidation, orgCatch, orgNotFound, orgUnauthorized, orgAccessDenied } = require('../utils/orgApiError');
const { resolveOrgAccess } = require('../utils/orgAccess');
const {
  normalizeProjectVisibilityPolicy,
  defaultProjectVisibilityPolicy,
} = require('../utils/projectVisibilityPolicy');

const getUserId = (req) =>
  req.user?.id || req.user?._id || req.user?.userId || req.headers['x-user-id'] || '';

async function getProjectVisibilityPolicy(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return orgUnauthorized(res);
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');

    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) return orgAccessDenied(res);

    const org = await Organization.findById(orgId).select('settings').lean();
    if (!org) return orgNotFound(res);

    const policy = normalizeProjectVisibilityPolicy(org.settings?.projectVisibilityPolicy || {});
    return res.json({ success: true, data: { policy } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

async function putProjectVisibilityPolicy(req, res) {
  try {
    const userId = getUserId(req);
    if (!userId) return orgUnauthorized(res);
    const orgId = String(req.params.orgId || '').trim();
    if (!orgId) return orgValidation(res, 'organizationId bắt buộc');

    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) return orgAccessDenied(res);
    const role = Membership.normalizeRole(access.membership?.role);
    if (role !== 'owner' && role !== 'admin') {
      return orgAccessDenied(res, 'Chỉ owner/admin được sửa Project Visibility Policy');
    }

    const policy = normalizeProjectVisibilityPolicy(req.body?.policy || req.body || {});
    const org = await Organization.findById(orgId);
    if (!org) return orgNotFound(res);

    org.settings = org.settings || {};
    org.settings.projectVisibilityPolicy = policy;
    org.markModified('settings');
    await org.save();

    return res.json({ success: true, data: { policy } });
  } catch (error) {
    return orgCatch(res, error);
  }
}

/**
 * S2S: actor placement + org policy for project-service visibility resolve.
 */
async function getInternalProjectVisibilityContext(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    const userId = String(req.params.userId || req.query.userId || '').trim();
    if (!organizationId || !userId) {
      return orgValidation(res, 'organizationId and userId are required');
    }

    const org = await Organization.findById(organizationId).select('settings').lean();
    if (!org) return orgNotFound(res);

    const membership = await Membership.findOne({
      organization: organizationId,
      user: userId,
      status: 'active',
    })
      .select('role department')
      .lean();

    const policy = normalizeProjectVisibilityPolicy(org.settings?.projectVisibilityPolicy || {});
    if (!membership) {
      return res.json({
        success: true,
        data: {
          isOrgMember: false,
          membershipRole: null,
          organizationRoleKeys: [],
          headedDepartmentIds: [],
          memberDepartmentIds: [],
          policy,
        },
      });
    }

    const membershipRole = Membership.normalizeRole(membership.role);
    const [headedDepts, memberDepts] = await Promise.all([
      Department.find({ organization: organizationId, head: userId }).select('_id').lean(),
      Department.find({
        organization: organizationId,
        $or: [{ members: userId }, { head: userId }],
      })
        .select('_id')
        .lean(),
    ]);

    const memberDepartmentIds = new Set(memberDepts.map((d) => String(d._id)));
    if (membership.department) memberDepartmentIds.add(String(membership.department));

    let organizationRoleKeys = [];
    try {
      const { resolveOrganizationRoles } = require('../services/organizationRoles.service');
      const roles = await resolveOrganizationRoles(userId, organizationId);
      organizationRoleKeys = (Array.isArray(roles) ? roles : [])
        .map((r) => String(r?.key || r?.roleKey || r || '').trim().toLowerCase())
        .filter(Boolean);
    } catch {
      organizationRoleKeys = [];
    }

    return res.json({
      success: true,
      data: {
        isOrgMember: true,
        membershipRole,
        organizationRoleKeys,
        headedDepartmentIds: headedDepts.map((d) => String(d._id)),
        memberDepartmentIds: [...memberDepartmentIds],
        policy,
      },
    });
  } catch (error) {
    return orgCatch(res, error);
  }
}

module.exports = {
  getProjectVisibilityPolicy,
  putProjectVisibilityPolicy,
  getInternalProjectVisibilityContext,
  defaultProjectVisibilityPolicy,
};

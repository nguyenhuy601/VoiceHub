const {
  listResponsibilities,
  upsertResponsibility,
  patchResponsibility,
  seedDefaultResponsibilities,
  setUserResponsibilities,
  listUserResponsibilities,
  listUserIdsByResponsibilityKey,
} = require('../services/responsibility.service');
const { resolveOrgAccess } = require('../utils/orgAccess');
const { orgUnauthorized, orgAccessDenied, orgCatch, orgValidation } = require('../utils/orgApiError');

function getUserId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

async function requireOrgAdmin(req, res) {
  const userId = getUserId(req);
  const orgId = req.params.orgId;
  if (!userId) {
    orgUnauthorized(res);
    return null;
  }
  const access = await resolveOrgAccess(userId, orgId);
  if (!access.ok) {
    orgAccessDenied(res);
    return null;
  }
  const role = String(access.membership?.role || '').toLowerCase();
  const systemRole = String(req.user?.systemRole || '').toLowerCase();
  if (systemRole !== 'admin' && !['owner', 'admin'].includes(role)) {
    orgAccessDenied(res);
    return null;
  }
  return { userId, orgId };
}

async function list(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const data = await listResponsibilities(ctx.orgId);
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function create(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const { key, label, description } = req.body || {};
    const data = await upsertResponsibility({
      organizationId: ctx.orgId,
      key,
      label,
      description,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function patch(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const data = await patchResponsibility({
      organizationId: ctx.orgId,
      key: req.params.key,
      ...(req.body || {}),
    });
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function seed(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const data = await seedDefaultResponsibilities(ctx.orgId);
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function putUser(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const keys = req.body?.keys;
    if (!Array.isArray(keys)) {
      return orgValidation(res, 'keys phải là mảng');
    }
    const data = await setUserResponsibilities({
      organizationId: ctx.orgId,
      userId: req.params.userId,
      keys,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function getUser(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const data = await listUserResponsibilities(ctx.orgId, req.params.userId);
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function usersByKey(req, res) {
  try {
    const ctx = await requireOrgAdmin(req, res);
    if (!ctx) return;
    const userIds = await listUserIdsByResponsibilityKey(ctx.orgId, req.params.key);
    return res.json({ success: true, data: { userIds } });
  } catch (err) {
    return orgCatch(res, err);
  }
}

module.exports = {
  list,
  create,
  patch,
  seed,
  putUser,
  getUser,
  usersByKey,
  listUserIdsByResponsibilityKey,
};

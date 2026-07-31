const { orgCatch, orgMemberNotFound, orgNotFound, orgValidation } = require('../utils/orgApiError');
const express = require('express');
const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const { resolveOrgAccess } = require('../utils/orgAccess');
const { buildAccessibleChannelData } = require('../services/orgShellData.service');
const { getCachedAccessibleChannelData } = require('../services/orgReadCache.service');
const { buildAiTaskExtractContext } = require('../services/memberContext.service');
const { syncMembershipPlacementFromRoles } = require('../services/membershipPlacementSync');
const { backfillRoleScopeAssignmentsForOrg } = require('../services/roleScopeAssignmentBackfill.service');

const router = express.Router();

/** voice-service: quyền voice kênh org (S2S, không dùng route admin /channels/.../access). */
router.get('/voice-channel-access/:organizationId/:userId/:channelId', async (req, res) => {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    const userId = String(req.params.userId || '').trim();
    const channelId = String(req.params.channelId || '').trim();
    if (!organizationId || !userId || !channelId) {
      return orgValidation(res, 'organizationId, userId and channelId are required');
    }
    const access = await resolveOrgAccess(userId, organizationId);
    if (!access.ok) {
      return res.json({ success: true, data: { allowed: false, reason: 'not_member' } });
    }
    const accessData = await getCachedAccessibleChannelData(
      userId,
      organizationId,
      access,
      buildAccessibleChannelData
    );
    const perms = accessData?.permissionsByChannelId?.[channelId] || null;
    const allowed = Boolean(perms?.canVoice);
    return res.json({
      success: true,
      data: {
        allowed,
        canVoice: Boolean(perms?.canVoice),
        canRead: Boolean(perms?.canRead),
        reason: allowed ? null : 'voice_denied',
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** GET membership role — role-permission-service requireOrgMember gọi S2S. */
router.get('/membership/:organizationId/:userId', async (req, res) => {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!organizationId || !userId) {
      return orgValidation(res, 'organizationId and userId are required');
    }
    const row = await Membership.findOne({
      organization: organizationId,
      user: userId,
      status: 'active',
    })
      .select('role')
      .lean();
    if (!row) {
      return orgMemberNotFound(res, 'Không phải thành viên tổ chức này.');
    }
    return res.json({
      success: true,
      data: { role: Membership.normalizeRole(row.role) },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** Tên tổ chức cho webhook / service nội bộ (serverId RBAC = organizationId). */
router.get('/org/:organizationId/summary', async (req, res) => {
  try {
    const org = await Organization.findById(req.params.organizationId).select('name').lean();
    if (!org) {
      return orgNotFound(res);
    }
    return res.json({
      success: true,
      data: { organizationId: String(req.params.organizationId), name: org.name || 'Organization' },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * POST body: { organizationId, userIds?, mentionLabels?, channelId?, messageText? }
 */
router.post('/ai-task-context', async (req, res) => {
  try {
    const { organizationId, userIds, mentionLabels, channelId, messageText } = req.body || {};
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const data = await buildAiTaskExtractContext({
      organizationId,
      userIds,
      mentionLabels,
      channelId,
      messageText,
    });
    if (!data) {
      return orgNotFound(res);
    }
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * POST body: { organizationId, userId }
 * Đồng bộ Membership + members[] sau gán/gỡ role hierarchy.
 */
router.post('/sync-membership-placement', async (req, res) => {
  try {
    const { organizationId, userId } = req.body || {};
    if (!organizationId || !userId) {
      return orgValidation(res, 'organizationId and userId are required');
    }
    const result = await syncMembershipPlacementFromRoles(userId, organizationId);
    if (!result.ok) {
      return res.status(404).json({ success: false, message: result.reason || 'sync_failed' });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** Đồng bộ lại toàn bộ thành viên active trong org (sửa dữ liệu cũ). */
router.post('/sync-membership-placement-org', async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const Membership = require('../models/Membership');
    const rows = await Membership.find({ organization: organizationId, status: 'active' })
      .select('user')
      .lean();
    const results = [];
    for (const row of rows) {
      const uid = row?.user ? String(row.user) : '';
      if (!uid) continue;
      const r = await syncMembershipPlacementFromRoles(uid, organizationId);
      results.push({ userId: uid, ok: r.ok, placement: r.placement || null });
    }
    return res.json({ success: true, data: { synced: results.length, results } });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** Backfill RoleScopeAssignment từ hierarchy roles hiện có. */
router.post('/backfill-role-scope-assignments', async (req, res) => {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const result = await backfillRoleScopeAssignmentsForOrg(organizationId);
    if (!result.ok) {
      return res.status(400).json({ success: false, message: result.reason || 'backfill_failed' });
    }
    return res.json({ success: true, data: result });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Seed/UAT — đồng bộ hierarchy roles (div_/dep_/team_) bất chấp structure cache.
 * Body: { organizationId }
 */
router.post('/sync-hierarchy-roles', async (req, res) => {
  try {
    const organizationId = String(req.body?.organizationId || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const org = await Organization.findById(organizationId).select('_id').lean();
    if (!org) return orgNotFound(res);

    const Division = require('../models/Division');
    const Department = require('../models/Department');
    const Team = require('../models/Team');
    const { syncHierarchyRoles } = require('../services/hierarchyRoleSync');
    const { invalidateOrgReadCache } = require('../services/orgReadCache.service');

    const [divisions, departments, teams] = await Promise.all([
      Division.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
      Department.find({ organization: organizationId }).select('_id name').lean(),
      Team.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
    ]);
    await syncHierarchyRoles(organizationId, { divisions, departments, teams });
    try {
      await invalidateOrgReadCache(organizationId);
    } catch {
      /* ignore */
    }
    return res.json({
      success: true,
      data: {
        organizationId,
        divisions: divisions.length,
        departments: departments.length,
        teams: teams.length,
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Seed/UAT — upsert membership (S2S). Body: { organizationId, userId, role? }
 */
router.post('/ensure-membership', async (req, res) => {
  try {
    const organizationId = String(req.body?.organizationId || '').trim();
    const userId = String(req.body?.userId || '').trim();
    const role = Membership.normalizeRole(req.body?.role || 'member');
    if (!organizationId || !userId) {
      return orgValidation(res, 'organizationId and userId are required');
    }
    if (!['owner', 'admin', 'hr', 'member'].includes(role)) {
      return orgValidation(res, 'Invalid role');
    }
    const org = await Organization.findById(organizationId).select('_id').lean();
    if (!org) return orgNotFound(res);

    const { ensureDefaultOrgRoles, syncUserOrgRole } = require('../services/rolePermissionOrgSync');
    const membership = await Membership.findOneAndUpdate(
      { user: userId, organization: organizationId },
      {
        user: userId,
        organization: organizationId,
        role,
        status: 'active',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await ensureDefaultOrgRoles(organizationId);
    await syncUserOrgRole(userId, organizationId, role);
    return res.json({
      success: true,
      data: {
        userId,
        organizationId,
        role: Membership.normalizeRole(membership.role),
        membershipId: String(membership._id),
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Seed/UAT — chuyển owner. Body: { organizationId, newOwnerUserId }
 * Demote owner cũ → admin; set owner mới; cập nhật Organization.ownerId.
 */
router.post('/transfer-owner', async (req, res) => {
  try {
    const organizationId = String(req.body?.organizationId || '').trim();
    const newOwnerUserId = String(req.body?.newOwnerUserId || '').trim();
    if (!organizationId || !newOwnerUserId) {
      return orgValidation(res, 'organizationId and newOwnerUserId are required');
    }
    const org = await Organization.findById(organizationId);
    if (!org) return orgNotFound(res);

    const { ensureDefaultOrgRoles, syncUserOrgRole } = require('../services/rolePermissionOrgSync');

    const previousOwners = await Membership.find({
      organization: organizationId,
      status: 'active',
      role: 'owner',
    })
      .select('user')
      .lean();

    for (const row of previousOwners) {
      const uid = String(row.user || '');
      if (!uid || uid === newOwnerUserId) continue;
      await Membership.updateOne(
        { _id: row._id },
        { $set: { role: 'admin' } }
      );
      await syncUserOrgRole(uid, organizationId, 'admin');
    }

    await Membership.findOneAndUpdate(
      { user: newOwnerUserId, organization: organizationId },
      {
        user: newOwnerUserId,
        organization: organizationId,
        role: 'owner',
        status: 'active',
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    await ensureDefaultOrgRoles(organizationId);
    await syncUserOrgRole(newOwnerUserId, organizationId, 'owner');

    org.ownerId = newOwnerUserId;
    await org.save();

    return res.json({
      success: true,
      data: {
        organizationId,
        ownerId: newOwnerUserId,
        demotedOwners: previousOwners
          .map((r) => String(r.user || ''))
          .filter((uid) => uid && uid !== newOwnerUserId),
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Single-company reset — liệt kê mọi org.
 * Chỉ gọi với x-gateway-internal-token (internalGatewayAuth).
 */
router.get('/organizations', async (req, res) => {
  try {
    const list = await Organization.find({})
      .select('_id name slug ownerId status createdAt')
      .sort({ createdAt: 1 })
      .lean();
    return res.json({
      success: true,
      data: list.map((o) => ({
        id: String(o._id),
        name: o.name,
        slug: o.slug,
        ownerId: o.ownerId ? String(o.ownerId) : null,
        status: o.status,
        createdAt: o.createdAt,
      })),
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Xóa 1 org + dữ liệu liên quan trên các service (cascade).
 */
router.post('/purge-organization', async (req, res) => {
  try {
    const organizationId = String(req.body?.organizationId || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const { purgeOrganizationEverywhere } = require('../services/organizationCascadePurge');
    await purgeOrganizationEverywhere(organizationId);
    return res.json({ success: true, data: { organizationId, purged: true } });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/**
 * Xóa toàn bộ tổ chức trong DB (single-company pivot / reset môi trường).
 */
router.post('/purge-all-organizations', async (req, res) => {
  try {
    const { purgeOrganizationEverywhere } = require('../services/organizationCascadePurge');
    const list = await Organization.find({}).select('_id name slug').lean();
    const results = [];
    for (const org of list) {
      const id = String(org._id);
      try {
        await purgeOrganizationEverywhere(id);
        results.push({ id, name: org.name, slug: org.slug, ok: true });
      } catch (error) {
        results.push({
          id,
          name: org.name,
          slug: org.slug,
          ok: false,
          error: String(error?.message || error),
        });
      }
    }
    // Dọn invite/membership mồ côi nếu còn sót
    try {
      const CompanyInvite = require('../models/CompanyInvite');
      await CompanyInvite.deleteMany({});
    } catch {
      // ignore
    }
    await Membership.deleteMany({});
    const failed = results.filter((r) => !r.ok);
    return res.status(failed.length ? 207 : 200).json({
      success: failed.length === 0,
      data: {
        purgedCount: results.filter((r) => r.ok).length,
        failedCount: failed.length,
        results,
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** task-service: userIds có Responsibility key (S2S). */
router.get('/organizations/:orgId/responsibilities/users', async (req, res) => {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const key = String(req.query.key || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const {
      listUserIdsByResponsibilityKey,
    } = require('../services/responsibility.service');
    const userIds = await listUserIdsByResponsibilityKey(organizationId, key);
    return res.json({ success: true, data: { userIds } });
  } catch (err) {
    return orgCatch(res, err);
  }
});

/** project-service: actor placement + org visibility policy */
router.get(
  '/organizations/:organizationId/users/:userId/project-visibility-context',
  async (req, res) => {
    const {
      getInternalProjectVisibilityContext,
    } = require('../controllers/projectVisibilityPolicy.controller');
    return getInternalProjectVisibilityContext(req, res);
  }
);

/** project-service: department roster (headcount) cho Resource Capacity / Planner */
router.get('/organizations/:orgId/departments/roster', async (req, res) => {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const rawIds = String(req.query.departmentIds || '').trim();
    const departmentIds = rawIds
      ? rawIds.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const { buildDepartmentRoster } = require('../services/structurePlacement.service');
    const departments = await buildDepartmentRoster(organizationId, { departmentIds });
    return res.json({ success: true, data: { departments } });
  } catch (err) {
    return orgCatch(res, err);
  }
});

module.exports = router;

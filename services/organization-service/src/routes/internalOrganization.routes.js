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

module.exports = router;

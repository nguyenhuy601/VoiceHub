const { orgCatch, orgMemberNotFound, orgNotFound, orgValidation } = require('../utils/orgApiError');
const Organization = require('../models/Organization');
const Membership = require('../models/Membership');
const Channel = require('../models/Channel');
const { resolveOrgAccess } = require('../utils/orgAccess');
const { buildAccessibleChannelData } = require('../services/orgShellData.service');
const { getCachedAccessibleChannelData } = require('../services/orgReadCache.service');
const { buildAiTaskExtractContext } = require('../services/memberContext.service');
const { syncMembershipPlacementFromRoles } = require('../services/membershipPlacementSync');
const { backfillRoleScopeAssignmentsForOrg } = require('../services/roleScopeAssignmentBackfill.service');

async function getVoiceChannelAccess(req, res) {
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
    const channelRow = await Channel.findOne({ _id: channelId, organization: organizationId })
      .select('projectId projectChannelKind name type')
      .lean();
    return res.json({
      success: true,
      data: {
        allowed,
        canVoice: Boolean(perms?.canVoice),
        canRead: Boolean(perms?.canRead),
        reason: allowed ? null : 'voice_denied',
        projectId: channelRow?.projectId ? String(channelRow.projectId) : null,
        projectChannelKind: channelRow?.projectChannelKind
          ? String(channelRow.projectChannelKind)
          : null,
        channelType: channelRow?.type ? String(channelRow.type) : null,
        channelName: channelRow?.name ? String(channelRow.name) : null,
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function getMembershipRole(req, res) {
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
}

async function listActiveMemberships(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
    const rows = await Membership.find({
      organization: organizationId,
      status: 'active',
    })
      .select('user role')
      .lean();
    const data = rows
      .map((row) => {
        const userId = row?.user ? String(row.user) : '';
        if (!userId) return null;
        return {
          userId,
          role: Membership.normalizeRole(row.role),
        };
      })
      .filter(Boolean);
    return res.json({ success: true, data });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function getOrgSummary(req, res) {
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
}

async function postAiTaskContext(req, res) {
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
}

async function syncMembershipPlacement(req, res) {
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
}

async function syncMembershipPlacementOrg(req, res) {
  try {
    const { organizationId } = req.body || {};
    if (!organizationId) {
      return orgValidation(res, 'organizationId is required');
    }
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
}

async function backfillRoleScopeAssignments(req, res) {
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
}

async function syncHierarchyRolesInternal(req, res) {
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
}

async function ensureMembership(req, res) {
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
}

async function transferOwner(req, res) {
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
      await Membership.updateOne({ _id: row._id }, { $set: { role: 'admin' } });
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
}

async function listOrganizationsInternal(req, res) {
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
}

async function purgeOrganization(req, res) {
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
}

async function purgeAllOrganizations(req, res) {
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
}

async function getEnabledProjectRoles(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId is required');
    const { getEnabledProjectRoleKeys } = require('../services/orgMasterData.service');
    const keys = await getEnabledProjectRoleKeys(organizationId);
    return res.json({ success: true, data: { enabledProjectRoleKeys: keys } });
  } catch (err) {
    return orgCatch(res, err, err.statusCode || 500);
  }
}

async function getEnabledPositions(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    if (!organizationId) return orgValidation(res, 'organizationId is required');
    const { getEnabledPositionKeys } = require('../services/orgMasterData.service');
    const keys = await getEnabledPositionKeys(organizationId);
    return res.json({ success: true, data: { enabledPositionKeys: keys } });
  } catch (err) {
    return orgCatch(res, err, err.statusCode || 500);
  }
}

async function getDepartmentRoster(req, res) {
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
}

async function getUserPlacement(req, res) {
  try {
    const organizationId = String(req.params.orgId || '').trim();
    const userId = String(req.params.userId || '').trim();
    if (!organizationId || !userId) {
      return orgValidation(res, 'organizationId and userId are required');
    }
    const { findPlacementByStructureMembers } = require('../services/structurePlacement.service');
    const placement = await findPlacementByStructureMembers(organizationId, userId);
    return res.json({ success: true, data: { placement } });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function createProjectWorkgroupChannel(req, res) {
  try {
    const { organizationId, projectId, parentTaskId, channelName } = req.body || {};
    if (!organizationId || !projectId || !parentTaskId) {
      return orgValidation(res, 'organizationId, projectId, parentTaskId are required');
    }
    const { ensureProjectWorkGroupChannel } = require('../services/projectChannelProvision.service');
    const actorId = req.headers['x-user-id'] || null;
    const result = await ensureProjectWorkGroupChannel({
      organizationId,
      projectId,
      parentTaskId,
      channelName: channelName || '',
      createdBy: actorId,
    });
    if (!result.channel) {
      return res.status(500).json({ success: false, message: 'Failed to create workgroup channel' });
    }
    return res.status(result.created ? 201 : 200).json({ success: true, data: result.channel });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function getProjectChannel(req, res) {
  try {
    const organizationId = String(req.params.organizationId || '').trim();
    const projectId = String(req.params.projectId || '').trim();
    const kind = String(req.query.kind || 'announcement').trim() || 'announcement';
    if (!organizationId || !projectId) {
      return orgValidation(res, 'organizationId and projectId are required');
    }
    const allowedKinds = new Set(['general', 'announcement', 'cross_team', 'team', 'workgroup']);
    if (!allowedKinds.has(kind)) {
      return orgValidation(res, 'kind is invalid');
    }
    const channel = await Channel.findOne({
      organization: organizationId,
      projectId,
      projectChannelKind: kind,
      isActive: true,
    })
      .select('_id name projectChannelKind type projectName')
      .lean();
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: 'Project channel not found',
        errorCode: 'PROJECT_CHANNEL_NOT_FOUND',
      });
    }
    return res.json({
      success: true,
      data: {
        channelId: String(channel._id),
        name: String(channel.name || ''),
        projectChannelKind: String(channel.projectChannelKind || ''),
        type: String(channel.type || ''),
        projectName: String(channel.projectName || ''),
      },
    });
  } catch (err) {
    return orgCatch(res, err);
  }
}

async function updateProjectWorkgroupMembers(req, res) {
  try {
    const channelId = String(req.params.channelId || '').trim();
    const members = Array.isArray(req.body?.members) ? req.body.members : [];
    if (!channelId) {
      return orgValidation(res, 'channelId is required');
    }
    const { mongoose } = require('@enterprise/shared/config/mongo');
    const validMembers = members
      .map((m) => String(m || '').trim())
      .filter((m) => mongoose.Types.ObjectId.isValid(m))
      .map((m) => new mongoose.Types.ObjectId(m));
    const uniqueIds = [...new Map(validMembers.map((o) => [String(o), o])).values()];

    const updated = await Channel.findByIdAndUpdate(
      channelId,
      { $set: { members: uniqueIds } },
      { new: true }
    );
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Channel not found' });
    }
    const { invalidateOrgReadCache } = require('../services/orgReadCache.service');
    await invalidateOrgReadCache(String(updated.organization)).catch(() => null);
    return res.json({ success: true, data: { members: uniqueIds.map(String) } });
  } catch (err) {
    return orgCatch(res, err);
  }
}

module.exports = {
  getVoiceChannelAccess,
  getMembershipRole,
  listActiveMemberships,
  getOrgSummary,
  postAiTaskContext,
  syncMembershipPlacement,
  syncMembershipPlacementOrg,
  backfillRoleScopeAssignments,
  syncHierarchyRolesInternal,
  ensureMembership,
  transferOwner,
  listOrganizationsInternal,
  purgeOrganization,
  purgeAllOrganizations,
  getEnabledProjectRoles,
  getEnabledPositions,
  getDepartmentRoster,
  getUserPlacement,
  createProjectWorkgroupChannel,
  getProjectChannel,
  updateProjectWorkgroupMembers,
};

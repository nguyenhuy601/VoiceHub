const Organization = require('../models/Organization');
const {
  orgUnauthorized,
  orgAccessDenied,
  orgNotFound,
  orgValidation,
  orgConflict,
  orgCatch,
  orgOperationalError,
  orgFail,
  sendServiceError,
} = require('../utils/orgApiError');
const { requireObjectId } = require('../utils/validateInput');
const { toPublicOrganization } = require('../utils/orgDto');
const { membershipCountMap } = require('../utils/membershipCountMap');
const Membership = require('../models/Membership');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const ChannelAccess = require('../models/ChannelAccess');
const ChannelRoleAccess = require('../models/ChannelRoleAccess');
const ScopeRoleAccess = require('../models/ScopeRoleAccess');
const axios = require('axios');
const { emitRealtimeEvent } = require('../clients/realtime.client');
const { syncUserOrgRole, ensureDefaultOrgRoles } = require('../services/rolePermissionOrgSync');
const { syncHierarchyRoles } = require('../services/hierarchyRoleSync');
const { ensureDepartmentDefaultChannels } = require('../services/departmentChannelProvision.service');
const { purgeOrganizationEverywhere } = require('../services/organizationCascadePurge');
const { resolveTaskWorkspaceScope } = require('../services/taskWorkspaceScope.service');
const {
  buildOrganizationStructureData,
  buildAccessibleChannelData,
  fetchOrgNotificationUnread,
} = require('../services/orgShellData.service');
const {
  getCachedAccessibleChannelData,
  getCachedOrganizationStructureData,
  invalidateOrgReadCache,
  invalidateOrgAcl,
} = require('../services/orgReadCache.service');
const { publishOrgEvent, ORG_EVENT_TYPES } = require('../messaging/orgEvents.publisher');
const { getOrgShellVersion } = require('../services/orgShellRealtime.service');
const { buildDocumentsOverview } = require('../services/documentsOverview.service');
const { fetchUserRolesInOrg } = require('../utils/orgRoles');
const { resolveOrgAccess, toObjectId } = require('../utils/orgAccess');
const {
  normalizeRoleChannelPermissions,
  hasAnyRoleChannelPermission,
} = require('../utils/orgChannelAclHelpers');
const { assertCanCreateOrganization } = require('../utils/singleCompanyPolicy');

const getUserId = (req) => {
  const raw = req.user?.id || req.user?.userId || req.user?._id;
  const s = raw != null ? String(raw).trim() : '';
  return s || null;
};
const MAX_OWNED_ORGS_PER_USER = 3;
const RESERVED_SLUGS = new Set(['admin', 'system', 'support', 'api', 'workspace', 'root']);
const STRUCTURE_PROVISION = {
  PENDING: 'pending',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
};
const DEFAULT_STRUCTURE_BLUEPRINT = {
  branches: [
    {
      name: 'Trụ sở chính',
      location: '',
      divisions: [
        {
          name: 'Khối Công nghệ',
          departments: [
            { name: 'Phòng Backend', teams: [{ name: 'Team API' }, { name: 'Team Auth' }] },
          ],
        },
      ],
    },
  ],
};

const normalizeHierarchyBlueprint = (raw, { allowEmpty = false } = {}) => {
  const fallback = DEFAULT_STRUCTURE_BLUEPRINT;
  if (!raw || typeof raw !== 'object') return allowEmpty ? { branches: [] } : fallback;
  const sourceBranches = Array.isArray(raw.branches) ? raw.branches : [];
  if (sourceBranches.length === 0) return allowEmpty ? { branches: [] } : fallback;
  const branches = sourceBranches
    .map((branch, bIdx) => {
      const branchName = String(branch?.name || '').trim() || `Chi nhánh ${bIdx + 1}`;
      const divisionsRaw = Array.isArray(branch?.divisions) ? branch.divisions : [];
      const divisions = divisionsRaw
        .map((division, dIdx) => {
          const divisionName = String(division?.name || '').trim() || `Khối ${dIdx + 1}`;
          const departmentsRaw = Array.isArray(division?.departments) ? division.departments : [];
          const departments = departmentsRaw
            .map((department, depIdx) => {
              const departmentName = String(department?.name || '').trim() || `Phòng ban ${depIdx + 1}`;
              const teamsRaw = Array.isArray(department?.teams) ? department.teams : [];
              const teams = teamsRaw
                .map((team, tIdx) => ({ name: String(team?.name || '').trim() || `Team ${tIdx + 1}` }))
                .slice(0, 30);
              return { name: departmentName, teams: teams.length ? teams : [{ name: 'Team chung' }] };
            })
            .slice(0, 60);
          return {
            name: divisionName,
            departments: departments.length ? departments : [{ name: 'Phòng ban chung', teams: [{ name: 'Team chung' }] }],
          };
        })
        .slice(0, 30);
      return {
        name: branchName,
        location: String(branch?.location || '').trim(),
        divisions: divisions.length ? divisions : [{ name: 'Khối mặc định', departments: [{ name: 'Phòng ban chung', teams: [{ name: 'Team chung' }] }] }],
      };
    })
    .slice(0, 20);
  return { branches };
};

const buildDefaultChannels = ({ organizationId, branchId, divisionId, departmentId, teamId, ownerId }) => [
  {
    name: 'general',
    description: 'Team text chat',
    type: 'chat',
    organization: organizationId,
    branch: branchId,
    division: divisionId,
    department: departmentId,
    team: teamId,
    leader: ownerId,
  },
  {
    name: 'voice',
    description: 'Team voice channel',
    type: 'voice',
    organization: organizationId,
    branch: branchId,
    division: divisionId,
    department: departmentId,
    team: teamId,
    leader: ownerId,
  },
];

const shortId = (id) => String(id || '').slice(-6);

async function fetchUserRoleNamesInOrg(userId, orgId) {
  const roles = await fetchUserRolesInOrg(userId, orgId);
  return roles.map((r) => r.name).filter(Boolean);
}

async function persistScopeRoleAccess(orgId, scopeType, scopeId, entries, actorId) {
  const keepRoleIds = [];
  for (const entry of entries) {
    const roleId = String(entry?.roleId || '').trim();
    if (!roleId) continue;
    const permissions = normalizeRoleChannelPermissions(entry?.permissions || {});
    if (!hasAnyRoleChannelPermission(permissions)) {
      await ScopeRoleAccess.deleteOne({ organization: orgId, scopeType, scopeId, roleId });
      continue;
    }
    keepRoleIds.push(roleId);
    await ScopeRoleAccess.findOneAndUpdate(
      { organization: orgId, scopeType, scopeId, roleId },
      {
        organization: orgId,
        scopeType,
        scopeId,
        roleId,
        permissions,
        updatedBy: actorId || null,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  if (entries.length === 0) {
    await ScopeRoleAccess.deleteMany({ organization: orgId, scopeType, scopeId });
  } else {
    await ScopeRoleAccess.deleteMany({
      organization: orgId,
      scopeType,
      scopeId,
      roleId: { $nin: keepRoleIds },
    });
  }

  const rows = await ScopeRoleAccess.find({ organization: orgId, scopeType, scopeId })
    .select('roleId permissions')
    .lean();
  return rows.map((row) => ({
    roleId: String(row.roleId),
    permissions: normalizeRoleChannelPermissions(row.permissions),
  }));
}

const seedHierarchyStructure = async ({ organizationId, ownerId, blueprint }) => {
  const normalized = normalizeHierarchyBlueprint(blueprint);
  const branchDocs = normalized.branches.map((branchRaw, bIdx) => ({
    organization: organizationId,
    name: branchRaw.name,
    location: branchRaw.location || '',
    isDefault: bIdx === 0,
  }));
  const branches = branchDocs.length ? await Branch.insertMany(branchDocs) : [];

  const divisionsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const divisionRaw = branchRaw.divisions[dIdx];
      divisionsSeed.push({
        __key: `${bIdx}:${dIdx}`,
        organization: organizationId,
        branch: branch._id,
        name: divisionRaw.name,
        isDefault: bIdx === 0 && dIdx === 0,
      });
    }
  }
  const divisions = divisionsSeed.length
    ? await Division.insertMany(
        divisionsSeed.map((item) => ({
          organization: item.organization,
          branch: item.branch,
          name: item.name,
          isDefault: item.isDefault,
        }))
      )
    : [];
  const divisionByKey = new Map(divisionsSeed.map((item, idx) => [item.__key, divisions[idx]]));

  const departmentsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const divisionRaw = branchRaw.divisions[dIdx];
      const division = divisionByKey.get(`${bIdx}:${dIdx}`);
      if (!division) continue;
      for (let depIdx = 0; depIdx < divisionRaw.departments.length; depIdx += 1) {
        const departmentRaw = divisionRaw.departments[depIdx];
        departmentsSeed.push({
          __key: `${bIdx}:${dIdx}:${depIdx}`,
          organization: organizationId,
          branch: branch._id,
          division: division._id,
          name: departmentRaw.name,
          head: ownerId,
        });
      }
    }
  }
  const departments = departmentsSeed.length
    ? await Department.insertMany(
        departmentsSeed.map((item) => ({
          organization: item.organization,
          branch: item.branch,
          division: item.division,
          name: item.name,
          head: item.head,
        }))
      )
    : [];
  const departmentByKey = new Map(departmentsSeed.map((item, idx) => [item.__key, departments[idx]]));

  for (const department of departments) {
    await ensureDepartmentDefaultChannels({
      orgId: organizationId,
      departmentId: department._id,
      department,
      actorId: ownerId,
    });
  }

  const teamsSeed = [];
  for (let bIdx = 0; bIdx < normalized.branches.length; bIdx += 1) {
    const branchRaw = normalized.branches[bIdx];
    const branch = branches[bIdx];
    if (!branch) continue;
    for (let dIdx = 0; dIdx < branchRaw.divisions.length; dIdx += 1) {
      const division = divisionByKey.get(`${bIdx}:${dIdx}`);
      const divisionRaw = branchRaw.divisions[dIdx];
      if (!division) continue;
      for (let depIdx = 0; depIdx < divisionRaw.departments.length; depIdx += 1) {
        const departmentRaw = divisionRaw.departments[depIdx];
        const department = departmentByKey.get(`${bIdx}:${dIdx}:${depIdx}`);
        if (!department) continue;
        for (let tIdx = 0; tIdx < departmentRaw.teams.length; tIdx += 1) {
          const teamRaw = departmentRaw.teams[tIdx];
          teamsSeed.push({
            organization: organizationId,
            branch: branch._id,
            division: division._id,
            department: department._id,
            name: teamRaw.name,
            leader: ownerId,
            isDefault: bIdx === 0 && dIdx === 0 && depIdx === 0 && tIdx === 0,
          });
        }
      }
    }
  }
  const teams = teamsSeed.length ? await Team.insertMany(teamsSeed) : [];

  const channelsSeed = [];
  for (const team of teams) {
    channelsSeed.push(
      ...buildDefaultChannels({
        organizationId,
        branchId: team.branch,
        divisionId: team.division,
        departmentId: team.department,
        teamId: team._id,
        ownerId,
      })
    );
  }
  if (channelsSeed.length) {
    await Channel.insertMany(channelsSeed);
  }
  return normalized;
};

const runStructureSeedInBackground = ({ organizationId, ownerId, normalizedBlueprint }) => {
  setImmediate(async () => {
    try {
      const aliveOrg = await Organization.findOne({ _id: organizationId, isActive: true })
        .select('_id')
        .lean();
      if (!aliveOrg) return;

      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.RUNNING,
            'provisioning.structure.startedAt': new Date(),
            'provisioning.structure.completedAt': null,
            'provisioning.structure.error': '',
          },
        }
      );

      const existingBranchCount = await Branch.countDocuments({ organization: organizationId });
      if (existingBranchCount === 0) {
        await seedHierarchyStructure({
          organizationId,
          ownerId,
          blueprint: normalizedBlueprint,
        });
      }

      const [divisions, departments, teams] = await Promise.all([
        Division.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
        Department.find({ organization: organizationId }).select('_id name').lean(),
        Team.find({ organization: organizationId, isActive: true }).select('_id name').lean(),
      ]);
      await syncHierarchyRoles(organizationId, { divisions, departments, teams });

      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.READY,
            'provisioning.structure.completedAt': new Date(),
            'provisioning.structure.error': '',
          },
        }
      );

      await invalidateOrgReadCache(organizationId, {
        eventType: ORG_EVENT_TYPES.CHANNEL_PROVISIONED,
      });

      const { emitOrgShellUpdated } = require('../services/orgShellRealtime.service');
      emitOrgShellUpdated(organizationId).catch(() => null);
      emitRealtimeEvent({
        event: 'organization:structure_ready',
        userId: String(ownerId),
        payload: {
          organizationId: String(organizationId),
          timestamp: new Date().toISOString(),
        },
      }).catch(() => null);
    } catch (error) {
      await Organization.updateOne(
        { _id: organizationId },
        {
          $set: {
            'provisioning.structure.status': STRUCTURE_PROVISION.FAILED,
            'provisioning.structure.completedAt': new Date(),
            'provisioning.structure.error': String(error?.message || 'seed failed').slice(0, 500),
          },
        }
      ).catch(() => null);
    }
  });
};

const normalizeSlug = (value = '') =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

exports.getMyOrganizations = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return orgUnauthorized(res);
    }
    const userRef = toObjectId(userId);
    if (!userRef) {
      return orgUnauthorized(res);
    }
    const memberships = await Membership.find({ user: userRef, status: 'active' })
      .select('organization role')
      .lean();

    const orgIds = memberships.map((m) => m.organization).filter(Boolean);
    const orgDocs = orgIds.length
      ? await Organization.find({ _id: { $in: orgIds }, isActive: true }).lean()
      : [];
    const orgMap = Object.fromEntries(orgDocs.map((o) => [String(o._id), o]));

    const countRows = orgIds.length
      ? await Membership.aggregate([
          { $match: { organization: { $in: orgIds }, status: 'active' } },
          { $group: { _id: '$organization', n: { $sum: 1 } } },
        ])
      : [];
    const memberCountByOrg = membershipCountMap(countRows);

    /** head / leader theo cấu trúc phòng-team — hiển thị chức vụ (không thay membership.role). */
    const headOrgIds = new Set();
    const leaderOrgIds = new Set();
    if (orgIds.length) {
      const [headDepts, leaderTeams] = await Promise.all([
        Department.find({ organization: { $in: orgIds }, head: userRef })
          .select('organization')
          .lean(),
        Team.find({ organization: { $in: orgIds }, leader: userRef })
          .select('organization')
          .lean(),
      ]);
      for (const d of headDepts) {
        if (d?.organization) headOrgIds.add(String(d.organization));
      }
      for (const t of leaderTeams) {
        if (t?.organization) leaderOrgIds.add(String(t.organization));
      }
    }

    const organizations = memberships
      .map((membership) => {
        const org = orgMap[String(membership.organization)];
        if (!org) return null;
        const oid = String(membership.organization);
        let myStructureRole = null;
        if (headOrgIds.has(oid)) myStructureRole = 'head';
        else if (leaderOrgIds.has(oid)) myStructureRole = 'leader';
        return toPublicOrganization(org, {
          myRole: membership.role,
          myStructureRole,
          memberCount: memberCountByOrg[oid] ?? 0,
        });
      })
      .filter(Boolean);

    res.json({ status: 'success', data: organizations });
  } catch (error) {
    next(error);
  }
};

exports.createOrganization = async (req, res, next) => {
  try {
    const canCreate = await assertCanCreateOrganization(req, res, orgConflict);
    if (!canCreate) return;

    const { name, description, logo, slug, status, type, teamSize, industry, structureBlueprint, skipDefaultStructure } =
      req.body;
    const userId = getUserId(req);
    if (!userId) {
      return orgUnauthorized(res);
    }
    const normalizedName = String(name || '').trim();
    if (normalizedName.length < 2) {
      return orgValidation(res, 'Organization name must be at least 2 characters');
    }

    const normalizedSlug = normalizeSlug(slug || normalizedName);
    if (normalizedSlug.length < 3) {
      return orgValidation(res, 'Slug must be at least 3 characters');
    }
    if (RESERVED_SLUGS.has(normalizedSlug)) {
      return orgFail(res, 422, 'Slug is reserved', 'VALIDATION_REQUIRED');
    }

    const ownerCount = await Membership.countDocuments({
      user: userId,
      role: 'owner',
      status: 'active',
    });
    const maxOwned = process.env.SINGLE_ORG_MODE === 'true' ? 1 : MAX_OWNED_ORGS_PER_USER;
    if (ownerCount >= maxOwned) {
      return orgConflict(res, `Owner can create up to ${maxOwned} organizations`, 'ORG_SLUG_EXISTS');
    }

    const slugExists = await Organization.exists({ slug: normalizedSlug });
    if (slugExists) {
      return orgConflict(res, 'Slug tổ chức đã tồn tại.', 'ORG_SLUG_EXISTS');
    }

    const allowEmptyStructure = Boolean(skipDefaultStructure) || process.env.SINGLE_ORG_MODE === 'true';
    const normalizedBlueprint = normalizeHierarchyBlueprint(structureBlueprint, {
      allowEmpty: allowEmptyStructure,
    });
    const skipStructureSeed = normalizedBlueprint.branches.length === 0;
    const organization = await Organization.create({
      name: normalizedName,
      description,
      logo,
      ownerId: userId,
      slug: normalizedSlug,
      status: ['PENDING', 'ACTIVE', 'SUSPENDED', 'ARCHIVED'].includes(status) ? status : 'ACTIVE',
      type: String(type || '').trim(),
      teamSize: String(teamSize || '').trim(),
      industry: String(industry || '').trim(),
      provisioning: {
        structure: {
          status: skipStructureSeed ? STRUCTURE_PROVISION.READY : STRUCTURE_PROVISION.PENDING,
          startedAt: null,
          completedAt: skipStructureSeed ? new Date() : null,
          error: '',
        },
      },
    });

    // Auto-add creator as owner
    await Membership.create({
      user: userId,
      organization: organization._id,
      role: 'owner',
      status: 'active',
    });

    await syncUserOrgRole(userId, organization._id, 'owner');
    const { ensureOrgMasterDataSeed, mapTeamSizeToCompanySize } = require('../services/orgMasterData.service');
    await ensureOrgMasterDataSeed(organization._id, {
      companySize: mapTeamSizeToCompanySize(teamSize),
    }).catch(() => null);
    if (!skipStructureSeed) {
      runStructureSeedInBackground({
        organizationId: organization._id,
        ownerId: userId,
        normalizedBlueprint,
      });
    }

    emitRealtimeEvent({
      event: 'organization:created',
      userId: String(userId),
      payload: {
        organizationId: String(organization._id),
        name: organization.name,
        timestamp: new Date().toISOString(),
      },
    }).catch(() => null);

    res.status(201).json({
      status: 'success',
      data: {
        ...organization.toObject(),
        structureBlueprint: normalizedBlueprint,
      },
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizationBySlug = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return orgUnauthorized(res);
    }
    const slug = normalizeSlug(req.params.slug);
    if (!slug) {
      return orgValidation(res, 'Invalid slug');
    }
    const organization = await Organization.findOne({ slug, isActive: true });
    if (!organization) {
      return orgNotFound(res);
    }
    const access = await resolveOrgAccess(userId, organization._id);
    if (!access.ok) {
      return orgAccessDenied(res);
    }
    const myRole = access.membership?.role || 'member';

    res.json({
      status: 'success',
      data: toPublicOrganization(organization, { myRole }),
    });
  } catch (error) {
    next(error);
  }
};

exports.getOrganization = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return orgUnauthorized(res);
    }
    const orgId = requireObjectId(res, req.params.id, 'orgId');
    if (!orgId) return;
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return orgNotFound(res);
    }

    const access = await resolveOrgAccess(userId, organization._id);
    if (!access.ok) {
      return orgAccessDenied(res);
    }
    const myRole = access.membership?.role || 'member';

    res.json({ status: 'success', data: toPublicOrganization(organization, { myRole }) });
  } catch (error) {
    next(error);
  }
};

exports.updateOrganization = async (req, res, next) => {
  try {
    const { name, description, logo, settings } = req.body;

    const organization = await Organization.findByIdAndUpdate(
      req.params.id,
      { name, description, logo, settings },
      { new: true, runValidators: true }
    );

    await emitRealtimeEvent({
      event: 'organization:updated',
      userId: String(getUserId(req) || ''),
      payload: {
        organizationId: String(req.params.id),
        name: organization?.name,
        timestamp: new Date().toISOString(),
      },
    });

    res.json({ status: 'success', data: organization });
  } catch (error) {
    next(error);
  }
};

exports.deleteOrganization = async (req, res, next) => {
  try {
    const orgId = req.params.id;
    const userId = getUserId(req);
    const organization = await Organization.findById(orgId);
    if (!organization) {
      return orgNotFound(res);
    }
    if (String(organization.ownerId) !== String(userId)) {
      return orgFail(res, 403, 'Only the organization owner can delete the organization', 'ORG_ACCESS_DENIED');
    }

    await purgeOrganizationEverywhere(orgId);

    publishOrgEvent({
      type: ORG_EVENT_TYPES.ORG_DELETED,
      organizationId: String(orgId),
      userId: userId ? String(userId) : null,
    }).catch(() => null);

    await emitRealtimeEvent({
      event: 'organization:deleted',
      userId: String(userId || ''),
      payload: {
        organizationId: String(orgId),
        timestamp: new Date().toISOString(),
      },
    });
    res.json({ status: 'success', message: 'Organization and related data have been removed' });
  } catch (error) {
    next(error);
  }
};

exports.getOrganizationStructure = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return orgUnauthorized(res);
    }
    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) {
      return orgAccessDenied(res);
    }

    const includeInactive = String(req.query?.includeInactive || '') === '1';
    // Huy: includeInactive bypass cache — panel vô hiệu cần thấy unit đã tắt
    const data = includeInactive
      ? await buildOrganizationStructureData(orgId, { includeInactive: true })
      : await getCachedOrganizationStructureData(orgId, buildOrganizationStructureData);
    return res.json({ status: 'success', data });
  } catch (error) {
    return next(error);
  }
};

/** Kênh (roomId tin nhắn) mà user được phép xem trong tổ chức — dùng cho chat-service search. */
exports.getAccessibleChannelIds = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return orgUnauthorized(res);
    }
    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) {
      return orgAccessDenied(res);
    }
    const data = await getCachedAccessibleChannelData(
      userId,
      orgId,
      access,
      buildAccessibleChannelData
    );
    res.json({ status: 'success', data });
  } catch (error) {
    next(error);
  }
};

/** Gom tài liệu org: structure + attachments search + library (wave-2d). */
exports.getDocumentsOverview = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return orgUnauthorized(res);
    }
    const data = await buildDocumentsOverview(orgId, userId);
    return res.json({ status: 'success', data });
  } catch (error) {
    const handled = orgOperationalError(res, error);
    if (handled) return handled;
    return next(error);
  }
};

/** Gom structure + ACL kênh + task scope + badge thông báo org — một request khi vào workspace. */
exports.getOrgShell = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return orgUnauthorized(res);
    }
    const access = await resolveOrgAccess(userId, orgId);
    if (!access.ok) {
      return orgAccessDenied(res);
    }

    const existingRoles = await fetchUserRolesInOrg(userId, orgId);
    if (existingRoles.length === 0 && access.membership) {
      await ensureDefaultOrgRoles(orgId);
      await syncUserOrgRole(userId, orgId, access.membership.role || 'member');
    }

    const OrgRoleAssignment = require('../models/OrgRoleAssignment');
    const OrgRoleCatalog = require('../models/OrgRoleCatalog');
    const orgOid = toObjectId(orgId);
    const userOid = toObjectId(userId);
    const [orgRoleAssignments, orgRoleCatalog] = await Promise.all([
      orgOid && userOid
        ? OrgRoleAssignment.find({ organizationId: orgOid, userId: userOid }).select('roleKey').lean()
        : Promise.resolve([]),
      orgOid
        ? OrgRoleCatalog.find({ organizationId: orgOid }).select('key label').lean()
        : Promise.resolve([]),
    ]);
    const orgRoleLabelByKey = new Map(
      (orgRoleCatalog || []).map((r) => [String(r.key || '').trim(), String(r.label || r.key || '').trim()])
    );
    const myOrganizationRoles = [...new Set((orgRoleAssignments || []).map((a) => String(a.roleKey || '').trim()).filter(Boolean))]
      .map((roleKey) => ({
        roleKey,
        roleLabel: orgRoleLabelByKey.get(roleKey) || roleKey,
      }));

    const orgDoc = await Organization.findById(orgId).select('name slug logo').lean();
    const [structureSummary, accessData, taskWorkspaceScope, notificationsUnreadOrg, shellVersion] =
      await Promise.all([
        getCachedOrganizationStructureData(orgId, buildOrganizationStructureData),
        getCachedAccessibleChannelData(userId, orgId, access, buildAccessibleChannelData),
        resolveTaskWorkspaceScope(userId, orgId),
        fetchOrgNotificationUnread(userId, orgId),
        getOrgShellVersion(orgId),
      ]);

    if (!taskWorkspaceScope) {
      return orgAccessDenied(res);
    }

    const membershipRole = access.membership?.role
      ? Membership.normalizeRole(access.membership.role)
      : null;

    const scope = accessData.scope || {};
    const isElevated = ['owner', 'admin', 'hr'].includes(String(membershipRole || ''));
    const hasPlacement =
      Boolean(scope.departmentId) ||
      Boolean(scope.teamId) ||
      (Array.isArray(scope.scopedDepartmentIds) && scope.scopedDepartmentIds.length > 0) ||
      (Array.isArray(scope.scopedTeamIds) && scope.scopedTeamIds.length > 0);
    const memberReady = Boolean(isElevated || scope.canSeeAllStructure || hasPlacement);

    return res.json({
      status: 'success',
      data: {
        organization: {
          id: String(orgId),
          name: orgDoc?.name || '',
          slug: orgDoc?.slug || '',
          icon: orgDoc?.logo || null,
          myRole: membershipRole,
          myOrganizationRoles,
        },
        structureSummary,
        access: {
          channelIds: memberReady ? accessData.channelIds : [],
          permissionsByChannelId: memberReady ? accessData.permissionsByChannelId : {},
          projectChannels: memberReady ? accessData.projectChannels || [] : [],
          scope,
          memberReady,
          memberReadyCode: memberReady ? null : 'ORG_MEMBER_NOT_READY',
        },
        taskWorkspaceScope: memberReady
          ? taskWorkspaceScope
          : {
              ...taskWorkspaceScope,
              visibility: 'self',
              canCreateTask: false,
              canUseAiTask: false,
              assignableUserIds: [],
            },
        badges: { notificationsUnreadOrg },
        shellVersion,
      },
    });
  } catch (error) {
    return next(error);
  }
};

/** Phạm vi xem/tạo task trong workspace tổ chức (owner/admin/hr, trưởng phòng, team leader, nhân viên). */
exports.getTaskWorkspaceScope = async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { orgId } = req.params;
    if (!userId) {
      return orgUnauthorized(res);
    }
    const scope = await resolveTaskWorkspaceScope(userId, orgId);
    if (!scope) {
      return orgAccessDenied(res);
    }
    return res.json({ status: 'success', data: scope });
  } catch (error) {
    next(error);
  }
};

exports.listChannelAccess = async (req, res, next) => {
  try {
    const { orgId, channelId } = req.params;
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id name type team department division')
      .lean();
    if (!channel) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    const rows = await ChannelAccess.find({ organization: orgId, channel: channelId })
      .select('user permissions grantedBy grantedAt')
      .lean();
    return res.json({ status: 'success', data: { channel, accesses: rows } });
  } catch (error) {
    return next(error);
  }
};

exports.grantChannelAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, channelId } = req.params;
    const { userId, permissions } = req.body || {};
    if (!userId) {
      return orgValidation(res, 'userId is required');
    }
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!channel) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    const membership = await Membership.findOne({
      user: userId,
      organization: orgId,
      status: 'active',
    })
      .select('_id')
      .lean();
    if (!membership) {
      return orgValidation(res, 'User is not a member of organization');
    }
    const nextPermissions = {
      canRead: permissions?.canRead !== undefined ? Boolean(permissions.canRead) : true,
      canWrite: permissions?.canWrite !== undefined ? Boolean(permissions.canWrite) : false,
      canVoice: permissions?.canVoice !== undefined ? Boolean(permissions.canVoice) : false,
    };
    const row = await ChannelAccess.findOneAndUpdate(
      { organization: orgId, channel: channelId, user: userId },
      {
        organization: orgId,
        channel: channelId,
        user: userId,
        permissions: nextPermissions,
        grantedBy: actorId || null,
        grantedAt: new Date(),
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await invalidateOrgAcl(orgId, String(userId));
    return res.json({ status: 'success', data: row });
  } catch (error) {
    return next(error);
  }
};

exports.revokeChannelAccess = async (req, res, next) => {
  try {
    const { orgId, channelId } = req.params;
    const { userId } = req.body || {};
    if (!userId) {
      return orgValidation(res, 'userId is required');
    }
    await ChannelAccess.deleteOne({
      organization: orgId,
      channel: channelId,
      user: userId,
    });
    await invalidateOrgAcl(orgId, String(userId));
    return res.json({ status: 'success', message: 'Access revoked' });
  } catch (error) {
    return next(error);
  }
};

exports.listChannelRoleAccess = async (req, res, next) => {
  try {
    const { orgId, channelId } = req.params;
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id name type team department division')
      .lean();
    if (!channel) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }
    const rows = await ChannelRoleAccess.find({ organization: orgId, channel: channelId })
      .select('roleId permissions updatedAt')
      .lean();
    return res.json({
      status: 'success',
      data: {
        channel,
        entries: rows.map((row) => ({
          roleId: String(row.roleId),
          permissions: normalizeRoleChannelPermissions(row.permissions),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveChannelRoleAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, channelId } = req.params;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const channel = await Channel.findOne({
      _id: channelId,
      organization: orgId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!channel) {
      return orgFail(res, 404, 'Channel not found', 'ORG_NOT_FOUND');
    }

    const keepRoleIds = [];
    for (const entry of entries) {
      const roleId = String(entry?.roleId || '').trim();
      if (!roleId) continue;
      const permissions = normalizeRoleChannelPermissions(entry?.permissions || {});
      if (!hasAnyRoleChannelPermission(permissions)) {
        await ChannelRoleAccess.deleteOne({ organization: orgId, channel: channelId, roleId });
        continue;
      }
      keepRoleIds.push(roleId);
      await ChannelRoleAccess.findOneAndUpdate(
        { organization: orgId, channel: channelId, roleId },
        {
          organization: orgId,
          channel: channelId,
          roleId,
          permissions,
          updatedBy: actorId || null,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (entries.length === 0) {
      await ChannelRoleAccess.deleteMany({ organization: orgId, channel: channelId });
    } else {
      await ChannelRoleAccess.deleteMany({
        organization: orgId,
        channel: channelId,
        roleId: { $nin: keepRoleIds },
      });
    }

    const rows = await ChannelRoleAccess.find({ organization: orgId, channel: channelId })
      .select('roleId permissions')
      .lean();
    await invalidateOrgAcl(orgId);
    return res.json({
      status: 'success',
      data: {
        entries: rows.map((row) => ({
          roleId: String(row.roleId),
          permissions: normalizeRoleChannelPermissions(row.permissions),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.listDivisionRoleAccess = async (req, res, next) => {
  try {
    const { orgId, divisionId } = req.params;
    const division = await Division.findOne({
      _id: divisionId,
      organization: orgId,
      isActive: true,
    })
      .select('_id name')
      .lean();
    if (!division) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    const rows = await ScopeRoleAccess.find({
      organization: orgId,
      scopeType: 'division',
      scopeId: divisionId,
    })
      .select('roleId permissions')
      .lean();
    return res.json({
      status: 'success',
      data: {
        scope: { type: 'division', id: String(division._id), name: division.name },
        entries: rows.map((row) => ({
          roleId: String(row.roleId),
          permissions: normalizeRoleChannelPermissions(row.permissions),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveDivisionRoleAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, divisionId } = req.params;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const division = await Division.findOne({
      _id: divisionId,
      organization: orgId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!division) {
      return orgFail(res, 404, 'Division not found', 'ORG_NOT_FOUND');
    }
    const saved = await persistScopeRoleAccess(orgId, 'division', divisionId, entries, actorId);
    await invalidateOrgAcl(orgId);
    return res.json({ status: 'success', data: { entries: saved } });
  } catch (error) {
    return next(error);
  }
};

exports.listDepartmentRoleAccess = async (req, res, next) => {
  try {
    const { orgId, departmentId } = req.params;
    const department = await Department.findOne({
      _id: departmentId,
      organization: orgId,
    })
      .select('_id name')
      .lean();
    if (!department) {
      return orgFail(res, 404, 'Department not found', 'ORG_NOT_FOUND');
    }
    const rows = await ScopeRoleAccess.find({
      organization: orgId,
      scopeType: 'department',
      scopeId: departmentId,
    })
      .select('roleId permissions')
      .lean();
    return res.json({
      status: 'success',
      data: {
        scope: { type: 'department', id: String(department._id), name: department.name },
        entries: rows.map((row) => ({
          roleId: String(row.roleId),
          permissions: normalizeRoleChannelPermissions(row.permissions),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveDepartmentRoleAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, departmentId } = req.params;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const department = await Department.findOne({
      _id: departmentId,
      organization: orgId,
    })
      .select('_id')
      .lean();
    if (!department) {
      return orgFail(res, 404, 'Department not found', 'ORG_NOT_FOUND');
    }
    const saved = await persistScopeRoleAccess(orgId, 'department', departmentId, entries, actorId);
    await invalidateOrgAcl(orgId);
    return res.json({ status: 'success', data: { entries: saved } });
  } catch (error) {
    return next(error);
  }
};

exports.listTeamRoleAccess = async (req, res, next) => {
  try {
    const { orgId, teamId } = req.params;
    const team = await Team.findOne({
      _id: teamId,
      organization: orgId,
      isActive: true,
    })
      .select('_id name')
      .lean();
    if (!team) {
      return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    const rows = await ScopeRoleAccess.find({
      organization: orgId,
      scopeType: 'team',
      scopeId: teamId,
    })
      .select('roleId permissions')
      .lean();
    return res.json({
      status: 'success',
      data: {
        scope: { type: 'team', id: String(team._id), name: team.name },
        entries: rows.map((row) => ({
          roleId: String(row.roleId),
          permissions: normalizeRoleChannelPermissions(row.permissions),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
};

exports.saveTeamRoleAccess = async (req, res, next) => {
  try {
    const actorId = getUserId(req);
    const { orgId, teamId } = req.params;
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    const team = await Team.findOne({
      _id: teamId,
      organization: orgId,
      isActive: true,
    })
      .select('_id')
      .lean();
    if (!team) {
      return orgFail(res, 404, 'Team not found', 'ORG_NOT_FOUND');
    }
    const saved = await persistScopeRoleAccess(orgId, 'team', teamId, entries, actorId);
    await invalidateOrgAcl(orgId);
    return res.json({ status: 'success', data: { entries: saved } });
  } catch (error) {
    return next(error);
  }
};

const axios = require('axios');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Division = require('../models/Division');
const Department = require('../models/Department');
const Team = require('../models/Team');
const Channel = require('../models/Channel');
const ChannelAccess = require('../models/ChannelAccess');
const ChannelRoleAccess = require('../models/ChannelRoleAccess');
const ScopeRoleAccess = require('../models/ScopeRoleAccess');
const Membership = require('../models/Membership');
const { syncHierarchyRoles } = require('./hierarchyRoleSync');
const { fetchUserRolesInOrg } = require('../utils/orgRoles');
const { toObjectId } = require('../utils/orgAccess');
const {
  resolveStructureVisibilityFromRoles,
  channelInStructureVisibility,
  resolveUserHierarchyScopes,
  buildTeamDepartmentMap,
  isDeptOnlyChannel,
  userHasTeamInDepartment,
} = require('../utils/memberPlacementScope');
const {
  isMultiPlacementReadEnabled,
  resolveEffectiveScopesFromAssignments,
  pickPrimaryScope,
} = require('./memberScopePolicy.service');
const {
  buildChannelRoleAclMap,
  buildScopeRoleAclMap,
  resolveEffectiveRolePerm,
  normalizeRoleChannelPermissions,
  mergeRoleChannelPermissions,
  hasAnyRoleChannelPermission,
  hasExecutiveRbacRole,
} = require('../utils/orgChannelAclHelpers');

const STRUCTURE_PROVISION = {
  PENDING: 'pending',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
};

const NOTIFICATION_SERVICE_URL = String(process.env.NOTIFICATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!NOTIFICATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: NOTIFICATION_SERVICE_URL');
const NOTIFICATION_INTERNAL_TOKEN = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();

async function buildOrganizationStructureData(orgId, { includeInactive = false } = {}) {
  // Huy: Dual-read — ưu tiên OU tree nếu có; vẫn build legacy + gắn levels/unitsTree
  const {
    isDynamicStructureEnabled,
    listUnitsTree,
    projectOuTreeToLegacyBranches,
    findLevelSchema,
  } = require('./orgUnitTree.service');

  let levels = null;
  let unitsTree = null;
  let usedOu = false;

  if (isDynamicStructureEnabled()) {
    try {
      const schema = await findLevelSchema(orgId);
      if (schema?.levels?.length) {
        levels = schema.levels;
        unitsTree = await listUnitsTree(orgId, { includeInactive });
        const ouCount = await require('../models/OrganizationalUnit').countDocuments({
          organization: orgId,
        });
        if (ouCount === 0) {
          // Huy: lazy backfill từ legacy khi chưa có OU (schema đã setup)
          const { backfillOrganizationToOu } = require('./orgStructureMigrate.service');
          await backfillOrganizationToOu(orgId);
          unitsTree = await listUnitsTree(orgId, { includeInactive });
        }
        if (unitsTree?.length) {
          usedOu = true;
        }
      }
    } catch (e) {
      console.warn('[orgShellData] OU dual-read fallback:', e.message);
    }
  }

  const branchFilter = { organization: orgId };
  const divisionFilter = { organization: orgId };
  const departmentFilter = { organization: orgId };
  const teamFilter = { organization: orgId };
  if (!includeInactive) {
    branchFilter.isActive = true;
    divisionFilter.isActive = true;
    departmentFilter.isActive = { $ne: false };
    teamFilter.isActive = true;
  }

  const [branches, divisions, departments, teams, channels, organization] = await Promise.all([
    Branch.find(branchFilter).sort({ createdAt: 1 }).lean(),
    Division.find(divisionFilter).sort({ createdAt: 1 }).lean(),
    Department.find(departmentFilter).sort({ createdAt: 1 }).lean(),
    Team.find(teamFilter).sort({ createdAt: 1 }).lean(),
    Channel.find({ organization: orgId, isActive: true }).sort({ createdAt: 1 }).lean(),
    Organization.findById(orgId).select('provisioning.structure').lean(),
  ]);

  // Huy: đơn vị tạo qua hierarchy trước khi có reverse DW — sync sang OU rồi đọc lại tree
  if (isDynamicStructureEnabled() && levels?.length) {
    try {
      const { syncMissingLegacyToOu, dualWriteSyncOuActive } = require('./orgOuDualWrite.service');
      const { created } = await syncMissingLegacyToOu(orgId, {
        branches,
        divisions,
        departments,
        teams,
      });
      // Huy: đồng bộ isActive legacy → OU (vô hiệu trước khi có sync)
      await Promise.all([
        ...branches.map((b) => dualWriteSyncOuActive(orgId, 'Branch', b._id, b.isActive !== false)),
        ...divisions.map((d) => dualWriteSyncOuActive(orgId, 'Division', d._id, d.isActive !== false)),
        ...departments.map((dep) =>
          dualWriteSyncOuActive(orgId, 'Department', dep._id, dep.isActive !== false)
        ),
        ...teams.map((t) => dualWriteSyncOuActive(orgId, 'Team', t._id, t.isActive !== false)),
      ]);
      if (created > 0 || includeInactive) {
        unitsTree = await listUnitsTree(orgId, { includeInactive });
        if (unitsTree?.length) usedOu = true;
      }
    } catch (e) {
      console.warn('[orgShellData] syncMissingLegacyToOu:', e.message);
    }
  }

  const channelsByTeam = new Map();
  const channelsByDepartment = new Map();
  const channelsByDivision = new Map();
  for (const channel of channels) {
    const teamKey = String(channel.team || '');
    const departmentKey = String(channel.department || '');
    const divisionKey = String(channel.division || '');
    if (teamKey) {
      if (!channelsByTeam.has(teamKey)) channelsByTeam.set(teamKey, []);
      channelsByTeam.get(teamKey).push(channel);
      continue;
    }
    if (departmentKey) {
      if (!channelsByDepartment.has(departmentKey)) channelsByDepartment.set(departmentKey, []);
      channelsByDepartment.get(departmentKey).push(channel);
      continue;
    }
    if (divisionKey) {
      if (!channelsByDivision.has(divisionKey)) channelsByDivision.set(divisionKey, []);
      channelsByDivision.get(divisionKey).push(channel);
    }
  }

  const { nestLegacyOrgStructure } = require('./nestLegacyOrgStructure');
  let { branches: tree, divisionsFlat } = nestLegacyOrgStructure({
    orgId,
    branches,
    divisions,
    departments,
    teams,
    channelsByTeam,
    channelsByDepartment,
    channelsByDivision,
  });

  // Huy: nếu OU tree có dữ liệu và legacy trống (hoặc prefer OU), project sang branches
  if (usedOu && unitsTree?.length && (!tree.length || String(process.env.ORG_STRUCTURE_PREFER_OU || '1') === '1')) {
    const projected = projectOuTreeToLegacyBranches(unitsTree);
    if (projected.length) {
      // gắn channels legacy theo legacyRef id nếu trùng
      tree = projected;
    }
  }

  syncHierarchyRoles(orgId, { divisions, departments, teams }).catch(() => null);

  return {
    branches: tree,
    divisionsFlat,
    // Huy: dynamic structure payload
    levels: levels || null,
    unitsTree: unitsTree || null,
    structureSource: usedOu ? 'ou' : 'legacy',
    provisioning: organization?.provisioning?.structure || {
      status: STRUCTURE_PROVISION.READY,
      startedAt: null,
      completedAt: null,
      error: '',
    },
  };
}

async function buildAccessibleChannelData(userId, orgId, access) {
  const membership =
    access.membership ||
    ({
      role: 'member',
    });
  const [channels, divisions, departments, teams] = await Promise.all([
    Channel.find({ organization: orgId, isActive: true })
      .select('_id members team division department')
      .lean(),
    Division.find({ organization: orgId, isActive: true }).select('_id name branch').lean(),
    Department.find({ organization: orgId }).select('_id name branch division').lean(),
    Team.find({ organization: orgId, isActive: true })
      .select('_id name branch division department')
      .lean(),
  ]);
  const aclRows = await ChannelAccess.find({
    organization: orgId,
    user: toObjectId(userId) || userId,
  })
    .select('channel permissions')
    .lean();
  const aclByChannelId = new Map(
    aclRows.map((row) => [
      String(row.channel),
      {
        canRead: Boolean(row.permissions?.canRead),
        canWrite: Boolean(row.permissions?.canWrite),
        canVoice: Boolean(row.permissions?.canVoice),
      },
    ])
  );
  const userRoles = await fetchUserRolesInOrg(userId, orgId);
  const userRoleIds = new Set(userRoles.map((r) => r.id));
  const roleNames = userRoles.map((r) => r.name);
  const effectiveScopes =
    isMultiPlacementReadEnabled() && userId
      ? await resolveEffectiveScopesFromAssignments(orgId, userId)
      : resolveUserHierarchyScopes(roleNames, { divisions, departments, teams });
  const [channelRoleAclRows, scopeRoleAclRows] = await Promise.all([
    ChannelRoleAccess.find({ organization: orgId }).select('channel roleId permissions').lean(),
    ScopeRoleAccess.find({ organization: orgId }).select('scopeType scopeId roleId permissions').lean(),
  ]);
  const channelRoleByChannelId = buildChannelRoleAclMap(channelRoleAclRows, userRoleIds);
  const divisionRoleById = buildScopeRoleAclMap(
    scopeRoleAclRows.filter((r) => r.scopeType === 'division'),
    userRoleIds
  );
  const departmentRoleById = buildScopeRoleAclMap(
    scopeRoleAclRows.filter((r) => r.scopeType === 'department'),
    userRoleIds
  );
  const teamRoleById = buildScopeRoleAclMap(
    scopeRoleAclRows.filter((r) => r.scopeType === 'team'),
    userRoleIds
  );
  const membershipRole = Membership.normalizeRole(membership.role);
  const isOrgAdminScope =
    membershipRole === 'owner' || membershipRole === 'admin' || membershipRole === 'hr';
  const isStructureAdmin = isOrgAdminScope || hasExecutiveRbacRole(roleNames);

  const uid = String(userId);
  const permissionsByChannelId = {};
  const channelIds = [];
  const scopedFromVisibleChannels = {
    divisionIds: new Set(),
    departmentIds: new Set(),
    teamIds: new Set(),
  };

  const structureVisibility = !isStructureAdmin
    ? isMultiPlacementReadEnabled()
      ? {
          mode:
            effectiveScopes.teamIds.size || effectiveScopes.departmentIds.size || effectiveScopes.divisionIds.size
              ? 'multi'
              : 'none',
          divisionIds: new Set(effectiveScopes.divisionIds),
          departmentIds: new Set(effectiveScopes.departmentIds),
          teamIds: new Set(effectiveScopes.teamIds),
        }
      : resolveStructureVisibilityFromRoles(roleNames, { divisions, departments, teams })
    : { mode: 'all', divisionIds: new Set(), departmentIds: new Set(), teamIds: new Set() };

  const teamDepartmentByTeamId = buildTeamDepartmentMap(teams);

  for (const ch of channels) {
    const channelId = String(ch._id);
    const acl = aclByChannelId.get(channelId) || null;
    let roleAcl = null;
    for (const role of userRoles) {
      const roleId = String(role.id || '');
      if (!roleId) continue;
      const effective = resolveEffectiveRolePerm(
        channelRoleByChannelId,
        divisionRoleById,
        departmentRoleById,
        teamRoleById,
        ch,
        roleId
      );
      if (effective && hasAnyRoleChannelPermission(effective)) {
        roleAcl = mergeRoleChannelPermissions(
          roleAcl || normalizeRoleChannelPermissions({}),
          effective
        );
      }
    }

    let canSee = false;
    let canRead = false;
    let canWrite = false;
    let canDelete = false;
    let canVoice = false;

    if (isStructureAdmin) {
      canSee = true;
      canRead = true;
      canWrite = true;
      canDelete = true;
      canVoice = true;
    } else if (roleAcl) {
      canSee = roleAcl.canSee;
      canRead = roleAcl.canRead;
      canWrite = roleAcl.canWrite;
      canDelete = roleAcl.canDelete;
      canVoice = roleAcl.canVoice;
    } else if (acl) {
      canSee = Boolean(acl.canRead);
      canRead = Boolean(acl.canRead);
      canWrite = Boolean(acl.canWrite);
      canVoice = Boolean(acl.canVoice);
    }

    if (ch.members && ch.members.length > 0) {
      const inLegacyMemberList = ch.members.some((m) => String(m) === uid || String(m?._id || m) === uid);
      if (inLegacyMemberList) {
        if (!roleAcl) {
          canSee = true;
          canRead = true;
          canWrite = true;
          canDelete = true;
          canVoice = true;
        } else {
          canSee = canSee || true;
          canRead = canRead || true;
        }
      }
    }

    const inStructure =
      isStructureAdmin ||
      channelInStructureVisibility(ch, structureVisibility, teamDepartmentByTeamId);
    if (!inStructure && !isStructureAdmin) {
      canSee = false;
      canRead = false;
      canWrite = false;
      canDelete = false;
      canVoice = false;
    } else if (
      !isStructureAdmin &&
      inStructure &&
      isDeptOnlyChannel(ch) &&
      !roleAcl &&
      !acl &&
      !canRead
    ) {
      const depId = String(ch.department || '');
      if (
        structureVisibility.departmentIds?.has(depId) ||
        userHasTeamInDepartment(structureVisibility.teamIds, depId, teamDepartmentByTeamId)
      ) {
        canSee = true;
        canRead = true;
        canWrite = true;
        canVoice = true;
      }
    }

    const visible = canSee || canRead;
    permissionsByChannelId[channelId] = {
      canSee: visible,
      canRead,
      canWrite,
      canDelete,
      canVoice,
    };
    if (canRead) {
      channelIds.push(channelId);
    }
    if (!isStructureAdmin && canRead) {
      if (ch.division) scopedFromVisibleChannels.divisionIds.add(String(ch.division));
      if (ch.department) scopedFromVisibleChannels.departmentIds.add(String(ch.department));
      if (ch.team) scopedFromVisibleChannels.teamIds.add(String(ch.team));
    }
  }

  let rolePlacement = {
    branchId: null,
    divisionId: null,
    departmentId: null,
    teamId: null,
  };

  let structureMode = 'none';
  if (!isStructureAdmin) {
    if (structureVisibility.mode !== 'none') {
      structureMode = structureVisibility.mode;
      for (const id of structureVisibility.divisionIds) {
        scopedFromVisibleChannels.divisionIds.add(String(id));
      }
      for (const id of structureVisibility.departmentIds) {
        scopedFromVisibleChannels.departmentIds.add(String(id));
      }
      for (const id of structureVisibility.teamIds) {
        scopedFromVisibleChannels.teamIds.add(String(id));
      }
    } else {
      structureMode = 'channel';
      const deptIds = [...scopedFromVisibleChannels.departmentIds];
      const teamIds = [...scopedFromVisibleChannels.teamIds];
      if (deptIds.length) {
        const deptRows = await Department.find({
          _id: { $in: deptIds },
          organization: orgId,
        })
          .select('division branch')
          .lean();
        for (const row of deptRows) {
          if (row.division) scopedFromVisibleChannels.divisionIds.add(String(row.division));
        }
      }
      if (teamIds.length) {
        for (const row of teams.filter((t) => teamIds.includes(String(t._id)))) {
          if (row.department) scopedFromVisibleChannels.departmentIds.add(String(row.department));
          if (row.division) scopedFromVisibleChannels.divisionIds.add(String(row.division));
        }
      }
    }

    rolePlacement = pickPrimaryScope(structureVisibility);
  } else {
    structureMode = 'all';
  }

  const scopeBranchId = rolePlacement.branchId || null;
  const scopeDivisionId = rolePlacement.divisionId || null;
  const scopeDepartmentId = rolePlacement.departmentId || null;
  const scopeTeamId = rolePlacement.teamId || null;

  return {
    channelIds,
    permissionsByChannelId,
    scope: {
      branchId: scopeBranchId,
      divisionId: scopeDivisionId,
      departmentId: scopeDepartmentId,
      teamId: scopeTeamId,
      canSeeAllStructure: isStructureAdmin,
      structureMode,
      scopedDivisionIds: [...scopedFromVisibleChannels.divisionIds],
      scopedDepartmentIds: [...scopedFromVisibleChannels.departmentIds],
      scopedTeamIds: [...scopedFromVisibleChannels.teamIds],
    },
  };
}

async function fetchOrgNotificationUnread(userId, orgId) {
  if (!userId || !orgId) return 0;
  try {
    const headers = { 'x-user-id': String(userId) };
    if (NOTIFICATION_INTERNAL_TOKEN) {
      headers['x-internal-notification-token'] = NOTIFICATION_INTERNAL_TOKEN;
    }
    const url = `${NOTIFICATION_SERVICE_URL}/api/notifications`;
    const res = await axios.get(url, {
      params: {
        scope: 'organization',
        organizationId: String(orgId),
        limit: 1,
      },
      headers,
      timeout: 5000,
      validateStatus: () => true,
    });
    const payload = res.data?.data ?? res.data;
    return Number(payload?.unreadCount) || 0;
  } catch {
    return 0;
  }
}

module.exports = {
  buildOrganizationStructureData,
  buildAccessibleChannelData,
  fetchOrgNotificationUnread,
};

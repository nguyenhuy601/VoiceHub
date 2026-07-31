/**
 * Dual-write RBAC hierarchy roles (dep_ / team_) when People Graph members change.
 * S2S via GATEWAY_INTERNAL_TOKEN — role-permission bypasses requireOrgRoleManager.
 */
const axios = require('axios');
const { logger } = require('@enterprise/shared');
const { ensureDepartmentRole, ensureTeamRole } = require('../services/hierarchyRoleSync');

const ROLE_PERMISSION_BASE = String(process.env.ROLE_PERMISSION_SERVICE_URL || '')
  .trim()
  .replace(/\/+$/, '');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function shortId(id) {
  return String(id || '').slice(-6);
}

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (GATEWAY_INTERNAL_TOKEN) h['x-gateway-internal-token'] = GATEWAY_INTERNAL_TOKEN;
  return h;
}

async function listRoles(serverId) {
  if (!ROLE_PERMISSION_BASE || !GATEWAY_INTERNAL_TOKEN) return [];
  const res = await axios.get(
    `${ROLE_PERMISSION_BASE}/api/roles/server/${encodeURIComponent(String(serverId))}`,
    { headers: headers(), timeout: 8000, validateStatus: () => true }
  );
  if (res.status !== 200 || !Array.isArray(res.data?.data)) return [];
  return res.data.data;
}

function findRoleIdByTag(roles, tag) {
  const found = (roles || []).find((r) => String(r?.name || '').includes(tag));
  return found?._id || found?.id || null;
}

async function postAssignOrRemove(path, { userId, serverId, roleId }) {
  if (!ROLE_PERMISSION_BASE || !GATEWAY_INTERNAL_TOKEN) return false;
  const res = await axios.post(
    `${ROLE_PERMISSION_BASE}/api/roles/${path}`,
    { userId: String(userId), serverId: String(serverId), roleId: String(roleId) },
    { headers: headers(), timeout: 8000, validateStatus: () => true }
  );
  if (res.status >= 200 && res.status < 300) return true;
  logger.warn(`[hierarchyRoleAssign] ${path} failed`, {
    status: res.status,
    message: res.data?.message,
    userId: String(userId),
    roleId: String(roleId),
  });
  return false;
}

async function assignDepartmentHierarchyRole(organizationId, userId, departmentId, departmentName) {
  if (!userId || !departmentId) return false;
  try {
    await ensureDepartmentRole(organizationId, departmentId, departmentName);
    const roles = await listRoles(organizationId);
    const roleId = findRoleIdByTag(roles, `dep_${shortId(departmentId)}`);
    if (!roleId) {
      logger.warn('[hierarchyRoleAssign] dep role missing after ensure', {
        departmentId: String(departmentId),
      });
      return false;
    }
    return postAssignOrRemove('assign', {
      userId,
      serverId: organizationId,
      roleId,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleAssign] assignDepartment failed', error.message);
    return false;
  }
}

async function revokeDepartmentHierarchyRole(organizationId, userId, departmentId) {
  if (!userId || !departmentId) return false;
  try {
    const roles = await listRoles(organizationId);
    const roleId = findRoleIdByTag(roles, `dep_${shortId(departmentId)}`);
    if (!roleId) return true;
    return postAssignOrRemove('remove', {
      userId,
      serverId: organizationId,
      roleId,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleAssign] revokeDepartment failed', error.message);
    return false;
  }
}

async function assignTeamHierarchyRole(organizationId, userId, teamId, teamName) {
  if (!userId || !teamId) return false;
  try {
    await ensureTeamRole(organizationId, teamId, teamName);
    const roles = await listRoles(organizationId);
    const roleId = findRoleIdByTag(roles, `team_${shortId(teamId)}`);
    if (!roleId) {
      logger.warn('[hierarchyRoleAssign] team role missing after ensure', {
        teamId: String(teamId),
      });
      return false;
    }
    return postAssignOrRemove('assign', {
      userId,
      serverId: organizationId,
      roleId,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleAssign] assignTeam failed', error.message);
    return false;
  }
}

async function revokeTeamHierarchyRole(organizationId, userId, teamId) {
  if (!userId || !teamId) return false;
  try {
    const roles = await listRoles(organizationId);
    const roleId = findRoleIdByTag(roles, `team_${shortId(teamId)}`);
    if (!roleId) return true;
    return postAssignOrRemove('remove', {
      userId,
      serverId: organizationId,
      roleId,
    });
  } catch (error) {
    logger.warn('[hierarchyRoleAssign] revokeTeam failed', error.message);
    return false;
  }
}

/**
 * Diff before/after department patches → assign/revoke dep_ roles (best-effort).
 * @param {Array<{ _id: string, members: string[] }>} beforeDepts
 * @param {Array<{ deptId: string, members: string[] }>} patches
 * @param {Map<string, string>|Record<string, string>} [deptNameById]
 */
async function syncDepartmentHierarchyRolesFromPatches(
  organizationId,
  beforeDepts,
  patches,
  deptNameById = {}
) {
  const nameOf = (deptId) => {
    if (deptNameById instanceof Map) return deptNameById.get(String(deptId)) || '';
    return deptNameById[String(deptId)] || '';
  };
  const beforeById = new Map(
    (beforeDepts || []).map((d) => [String(d._id || d.id), new Set((d.members || []).map(String))])
  );

  const assigns = [];
  const revokes = [];
  for (const patch of patches || []) {
    const deptId = String(patch.deptId || '');
    if (!deptId) continue;
    const before = beforeById.get(deptId) || new Set();
    const after = new Set((patch.members || []).map(String));
    for (const uid of after) {
      if (uid && !before.has(uid)) assigns.push({ userId: uid, departmentId: deptId });
    }
    for (const uid of before) {
      if (uid && !after.has(uid)) revokes.push({ userId: uid, departmentId: deptId });
    }
  }

  for (const row of assigns) {
    await assignDepartmentHierarchyRole(
      organizationId,
      row.userId,
      row.departmentId,
      nameOf(row.departmentId)
    );
  }
  for (const row of revokes) {
    await revokeDepartmentHierarchyRole(organizationId, row.userId, row.departmentId);
  }
}

/**
 * Sync team_ roles when Team.members array is replaced.
 */
async function syncTeamHierarchyRolesFromMemberChange(
  organizationId,
  teamId,
  teamName,
  previousMemberIds,
  nextMemberIds
) {
  const before = new Set((previousMemberIds || []).map(String).filter(Boolean));
  const after = new Set((nextMemberIds || []).map(String).filter(Boolean));
  for (const uid of after) {
    if (!before.has(uid)) {
      await assignTeamHierarchyRole(organizationId, uid, teamId, teamName);
    }
  }
  for (const uid of before) {
    if (!after.has(uid)) {
      await revokeTeamHierarchyRole(organizationId, uid, teamId);
    }
  }
}

module.exports = {
  assignDepartmentHierarchyRole,
  revokeDepartmentHierarchyRole,
  assignTeamHierarchyRole,
  revokeTeamHierarchyRole,
  syncDepartmentHierarchyRolesFromPatches,
  syncTeamHierarchyRolesFromMemberChange,
};

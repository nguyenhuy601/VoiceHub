import {
  departmentHeadId,
  flattenOrgStructure,
  teamLeaderId,
  unitId,
  unitName,
} from './adminOrgStructureUtils';
import {
  ORGANIZATION_ROLE_KEYS,
  ORGANIZATION_ROLE_LABELS,
} from './roleTaxonomy';
import { coalesceJobTitle } from './jobTitleProfile';

export function memberJobTitle(member) {
  return coalesceJobTitle(member);
}

export function resolveOrgRolesForUser(userId, departments, teams) {
  const uid = String(userId || '').trim();
  if (!uid) return [];

  const roles = [];
  for (const dept of departments || []) {
    if (departmentHeadId(dept) !== uid) continue;
    roles.push({
      id: `dept-${unitId(dept)}`,
      roleKey: ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
      scopeType: 'department',
      scopeName: unitName(dept),
      editPath: `/app/admin/org-structure/departments/head?unitId=${encodeURIComponent(unitId(dept))}&userId=${encodeURIComponent(uid)}`,
    });
  }
  for (const team of teams || []) {
    if (teamLeaderId(team) !== uid) continue;
    roles.push({
      id: `team-${unitId(team)}`,
      roleKey: ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      scopeType: 'team',
      scopeName: unitName(team),
      editPath: `/app/admin/org-structure/teams/leader?unitId=${encodeURIComponent(unitId(team))}&userId=${encodeURIComponent(uid)}`,
    });
  }
  return roles;
}

export function buildOrgRoleBadgeByUserId(structure) {
  const flat = flattenOrgStructure(structure);
  const map = new Map();
  for (const dept of flat.departments) {
    const uid = departmentHeadId(dept);
    if (!uid) continue;
    const prev = map.get(uid) || [];
    if (!prev.includes('dept_head')) prev.push('dept_head');
    map.set(uid, prev);
  }
  for (const team of flat.teams) {
    const uid = teamLeaderId(team);
    if (!uid) continue;
    const prev = map.get(uid) || [];
    if (!prev.includes('team_lead')) prev.push('team_lead');
    map.set(uid, prev);
  }
  return map;
}

/**
 * Org Role rows per user: People Graph (head/leader) + catalog assignments.
 * @returns {Map<string, Array<{ id: string, label: string, scopeName?: string }>>}
 */
export function buildOrgRoleRowsByUserId(structure, assignments = [], t) {
  const flat = flattenOrgStructure(structure);
  const map = new Map();

  const push = (uid, row) => {
    const id = String(uid || '').trim();
    if (!id || !row?.id) return;
    const prev = map.get(id) || [];
    if (prev.some((r) => r.id === row.id)) return;
    prev.push(row);
    map.set(id, prev);
  };

  for (const dept of flat.departments) {
    const uid = departmentHeadId(dept);
    if (!uid) continue;
    push(uid, {
      id: `dept-${unitId(dept)}`,
      label: typeof t === 'function' ? t('adminUsers.orgRoleBadgeDeptHead') : 'Trưởng phòng',
      scopeName: unitName(dept),
    });
  }
  for (const team of flat.teams) {
    const uid = teamLeaderId(team);
    if (!uid) continue;
    push(uid, {
      id: `team-${unitId(team)}`,
      label: typeof t === 'function' ? t('adminUsers.orgRoleBadgeTeamLead') : 'Trưởng nhóm',
      scopeName: unitName(team),
    });
  }

  for (const a of assignments || []) {
    const uid = String(a.userId || '').trim();
    const roleKey = String(a.roleKey || '').trim();
    if (!uid || !roleKey) continue;
    // Skip duplicates of system structural keys already from People Graph
    if (
      roleKey === ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER ||
      roleKey === ORGANIZATION_ROLE_KEYS.TEAM_MANAGER
    ) {
      continue;
    }
    push(uid, {
      id: `assign-${roleKey}-${uid}`,
      label: String(a.roleLabel || ORGANIZATION_ROLE_LABELS[roleKey] || roleKey).trim(),
      scopeName: a.scopeName || '',
    });
  }

  return map;
}

export function orgRoleBadgeLabel(key, t) {
  if (key === 'dept_head') return t('adminUsers.orgRoleBadgeDeptHead');
  if (key === 'team_lead') return t('adminUsers.orgRoleBadgeTeamLead');
  return ORGANIZATION_ROLE_LABELS[key] || key;
}

export function inferJobTitleForBackfill(membershipRole) {
  const role = String(membershipRole || 'member').toLowerCase();
  if (role === 'owner' || role === 'admin') return 'Director';
  if (role === 'hr') return 'QA';
  return 'Junior';
}

export function unwrapOrgList(res) {
  const body = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

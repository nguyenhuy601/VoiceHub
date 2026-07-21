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

export function memberJobTitle(member) {
  return String(member?.jobTitle || member?.preferences?.jobTitle || '').trim();
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

export function buildResponsibilityByUserIdFromKeyLists(entries) {
  const map = new Map();
  for (const { key, userIds } of entries || []) {
    const k = String(key || '').trim();
    if (!k) continue;
    for (const rawId of userIds || []) {
      const uid = String(rawId || '').trim();
      if (!uid) continue;
      const prev = map.get(uid) || [];
      if (!prev.includes(k)) prev.push(k);
      map.set(uid, prev);
    }
  }
  return map;
}

export function formatResponsibilityBadges(keys, { maxVisible = 2 } = {}) {
  const list = Array.isArray(keys) ? keys.filter(Boolean) : [];
  if (!list.length) return { visible: [], overflow: 0 };
  const visible = list.slice(0, maxVisible);
  return { visible, overflow: Math.max(0, list.length - maxVisible) };
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

export function inferResponsibilityKeysForBackfill({ jobTitle, membershipRole }) {
  const title = String(jobTitle || '').toLowerCase();
  const role = String(membershipRole || 'member').toLowerCase();
  const keys = [];

  if (title.includes('backend')) keys.push('backend');
  if (title.includes('frontend')) keys.push('frontend');
  if (title.includes('qa') || title.includes('quality')) keys.push('qa');
  if (title.includes('devops')) keys.push('devops');
  if (title.includes('architect')) keys.push('architecture');

  if (keys.length) return [...new Set(keys)];
  if (role === 'owner' || role === 'admin') return ['product'];
  return [];
}

export function unwrapOrgList(res) {
  const body = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

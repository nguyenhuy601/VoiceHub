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
import { createTranslator } from '../locales/buildStrings';
import { readStoredLocale } from './localeFormat';

function resolveTranslator(t) {
  if (typeof t === 'function') return t;
  return createTranslator(readStoredLocale());
}

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
  const tr = resolveTranslator(t);
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
      label: tr('adminUsers.orgRoleBadgeDeptHead'),
      scopeName: unitName(dept),
    });
  }
  for (const team of flat.teams) {
    const uid = teamLeaderId(team);
    if (!uid) continue;
    push(uid, {
      id: `team-${unitId(team)}`,
      label: tr('adminUsers.orgRoleBadgeTeamLead'),
      scopeName: unitName(team),
    });
  }

  for (const a of assignments || []) {
    const uid = String(a.userId || '').trim();
    const roleKey = String(a.roleKey || '').trim();
    if (!uid || !roleKey) continue;
    // Skip duplicates of system structural keys already from People Graph
    const structuralKeys = new Set([
      ORGANIZATION_ROLE_KEYS.DEPARTMENT_MANAGER,
      ORGANIZATION_ROLE_KEYS.TEAM_LEAD,
      ORGANIZATION_ROLE_KEYS.TEAM_MANAGER,
      'department_manager',
      'team_lead',
      'team_manager',
    ]);
    if (structuralKeys.has(roleKey) || structuralKeys.has(roleKey.toUpperCase())) {
      continue;
    }
    push(uid, {
      id: `assign-${roleKey}-${uid}`,
      label: String(
        ORGANIZATION_ROLE_LABELS[roleKey] ||
          ORGANIZATION_ROLE_LABELS[roleKey.toUpperCase()] ||
          ORGANIZATION_ROLE_LABELS[roleKey.toLowerCase()] ||
          a.roleLabel ||
          roleKey
      ).trim(),
      roleKey,
      scopeName: a.scopeName || '',
    });
  }

  return map;
}

export function orgRoleBadgeLabel(key, t) {
  const tr = resolveTranslator(t);
  if (key === 'dept_head') return tr('adminUsers.orgRoleBadgeDeptHead');
  if (key === 'team_lead' || key === 'TEAM_LEAD') return tr('adminUsers.orgRoleBadgeTeamLead');
  return (
    ORGANIZATION_ROLE_LABELS[key] ||
    ORGANIZATION_ROLE_LABELS[String(key || '').toUpperCase()] ||
    ORGANIZATION_ROLE_LABELS[String(key || '').toLowerCase()] ||
    key
  );
}

export function unwrapOrgList(res) {
  const body = res?.data?.data ?? res?.data ?? res;
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

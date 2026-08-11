/**
 * Persona dashboard từ Org Role + Position (cấu trúc) + membership.
 * Không dùng gói Permission / JWT systemRole để chọn persona.
 */
import {
  extractOrganizationRoleKeys,
  HR_ORG_ROLE_KEYS,
  MANAGER_ORG_ROLE_KEYS,
} from './organizationRoleKeys.js';

const MANAGER_MEMBERSHIP = new Set([
  'manager',
  'head',
  'pm',
  'project_manager',
  'team_lead',
  'tl',
  'lead',
]);

const MANAGER_STRUCTURE = new Set(['head', 'leader']);

export function resolveDashPersona({
  uiRole,
  membershipRole,
  structureRole,
  organizationRoleKeys,
  hasOrg,
} = {}) {
  const u = String(uiRole || '').toLowerCase();
  const m = String(membershipRole || '').toLowerCase();
  const s = String(structureRole || '').toLowerCase();
  const orgKeys = extractOrganizationRoleKeys(organizationRoleKeys);
  if (u === 'guest') return 'guest';
  if (!hasOrg || u === 'personal') return 'personal';
  if (m === 'hr' || orgKeys.some((k) => HR_ORG_ROLE_KEYS.has(k))) return 'hr';
  if (m === 'owner' || u === 'owner') return 'owner';
  if (m === 'admin' || u === 'admin') return 'admin';
  if (
    MANAGER_MEMBERSHIP.has(m) ||
    MANAGER_STRUCTURE.has(s) ||
    u === 'manager' ||
    orgKeys.some((k) => MANAGER_ORG_ROLE_KEYS.has(k))
  ) {
    return 'manager';
  }
  return 'member';
}

export function dashPersonaShowsOrgHealth(persona) {
  return ['manager', 'owner', 'admin', 'hr'].includes(String(persona || ''));
}

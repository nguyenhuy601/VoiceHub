/**
 * Persona dashboard từ org membership + UI role (không dùng để đánh giá NV).
 */
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

export function resolveDashPersona({ uiRole, membershipRole, structureRole, hasOrg } = {}) {
  const u = String(uiRole || '').toLowerCase();
  const m = String(membershipRole || '').toLowerCase();
  const s = String(structureRole || '').toLowerCase();
  if (u === 'guest') return 'guest';
  if (!hasOrg || u === 'personal') return 'personal';
  if (m === 'hr') return 'hr';
  if (m === 'owner' || u === 'owner') return 'owner';
  if (m === 'admin' || u === 'admin') return 'admin';
  if (MANAGER_MEMBERSHIP.has(m) || MANAGER_STRUCTURE.has(s) || u === 'manager') return 'manager';
  return 'member';
}

export function dashPersonaShowsOrgHealth(persona) {
  return ['manager', 'owner', 'admin', 'hr'].includes(String(persona || ''));
}

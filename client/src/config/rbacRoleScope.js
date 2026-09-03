/**
 * Scope của Permission Pack / Role — không phải catalog quyền.
 * Enum khớp services/role-permission-service Role.scope.
 */

export const ROLE_SCOPES = [
  { id: 'GLOBAL', labelKey: 'adminRbac.scopeGlobal', fallback: 'GLOBAL — Toàn hệ thống' },
  { id: 'ORGANIZATION', labelKey: 'adminRbac.scopeOrganization', fallback: 'ORGANIZATION — Toàn công ty' },
  { id: 'DEPARTMENT', labelKey: 'adminRbac.scopeDepartment', fallback: 'DEPARTMENT — Trong phòng ban' },
  { id: 'TEAM', labelKey: 'adminRbac.scopeTeam', fallback: 'TEAM — Trong nhóm' },
  { id: 'PERSONAL', labelKey: 'adminRbac.scopePersonal', fallback: 'PERSONAL — Chỉ bản thân' },
];

export const DEFAULT_ROLE_SCOPE = 'ORGANIZATION';

/** Gói Permission trên `/rbac/roles` — chỉ ORGANIZATION. */
export const PACK_ROLE_SCOPES = ROLE_SCOPES.filter((item) => item.id === 'ORGANIZATION');

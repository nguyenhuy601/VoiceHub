/**
 * Nhãn / mô tả Vai trò tổ chức theo locale UI — không tin label DB (hay lẫn EN khi UI VI).
 */

const LABEL_PATH = 'adminRbac.orgRoleLabel';
const DESC_PATH = 'adminRbac.orgRoleDesc';

/** Alias legacy → UPPER SoT (mirror shared/config/masterData/organizationRoles). */
const LEGACY_ORG_ROLE_ALIASES = Object.freeze({
  department_manager: 'DEPARTMENT_MANAGER',
  team_lead: 'TEAM_LEAD',
  team_manager: 'TEAM_LEAD',
  director: 'DIRECTOR',
  resource_manager: 'RESOURCE_MANAGER',
  auditor: 'AUDITOR',
  mentor: 'MENTOR',
  hr_approver: 'HR_APPROVER',
  member: 'MEMBER',
  org_member: 'MEMBER',
  organization_administrator: 'IT_ADMIN',
  it_admin: 'IT_ADMIN',
});

/** VI fallback khi không có t() (unit test / non-React). */
export const ORG_ROLE_LABEL_VI_FALLBACK = Object.freeze({
  DEPARTMENT_MANAGER: 'Trưởng phòng',
  TEAM_LEAD: 'Trưởng nhóm',
  DIRECTOR: 'Giám đốc tổ chức',
  IT_ADMIN: 'Quản trị hệ thống',
  RESOURCE_MANAGER: 'Quản lý nguồn lực',
  HR_APPROVER: 'Nhân sự',
  AUDITOR: 'Kiểm toán',
  MENTOR: 'Người hướng dẫn',
  MEMBER: 'Thành viên',
  ORG_OWNER: 'Chủ sở hữu tổ chức',
  ORG_ADMIN: 'Quản trị viên tổ chức',
  ORG_MEMBER_MANAGER: 'Quản lý thành viên',
  RECRUITMENT_COORDINATOR: 'Điều phối tuyển dụng',
  CAPACITY_PLANNER: 'Lập kế hoạch năng lực',
  WORK_SCHEDULE_APPROVER: 'Phê duyệt lịch làm việc',
  EFFORT_ACTUAL_APPROVER: 'Phê duyệt effort thực tế',
  PMO_MANAGER: 'Quản lý PMO',
  PROJECT_APPROVER: 'Phê duyệt dự án',
  PROJECT_PLAN_REVIEWER: 'Rà soát kế hoạch dự án',
  PROJECT_RESOURCE_APPROVER: 'Phê duyệt nguồn lực dự án',
  PROJECT_AUDITOR: 'Kiểm toán dự án',
});

export function resolveOrgRoleCanonicalKey(rawKey) {
  const raw = String(rawKey || '').trim();
  if (!raw) return '';
  const lower = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (LEGACY_ORG_ROLE_ALIASES[lower]) return LEGACY_ORG_ROLE_ALIASES[lower];
  return lower ? lower.toUpperCase() : '';
}

/**
 * Ẩn hàng trùng canonical (vd. department_manager + DEPARTMENT_MANAGER → cùng «Trưởng phòng»).
 * Ưu tiên giữ đúng code UPPER SoT; nếu không có thì giữ hàng đầu trong nhóm.
 */
export function isRedundantOrgRoleAliasRow(role, allRoles = []) {
  const key = String(role?.key || role?.code || '').trim();
  if (!key) return false;
  const canon = resolveOrgRoleCanonicalKey(key);
  if (!canon) return false;
  const siblings = (allRoles || []).filter(
    (r) => resolveOrgRoleCanonicalKey(r?.key || r?.code) === canon
  );
  if (siblings.length <= 1) return false;

  const hasCanonical = siblings.some((r) => String(r?.key || r?.code || '').trim() === canon);
  if (hasCanonical) return key !== canon;

  const first = String(siblings[0]?.key || siblings[0]?.code || '').trim();
  return key !== first;
}

/** Catalog / picker: một option mỗi canonical. */
export function filterOrgRoleCatalogRows(roles = []) {
  const list = Array.isArray(roles) ? roles : [];
  return list.filter((row) => !isRedundantOrgRoleAliasRow(row, list));
}

function lookupI18n(t, basePath, canonical) {
  if (typeof t !== 'function' || !canonical) return '';
  const path = `${basePath}.${canonical}`;
  const value = t(path);
  if (value == null || value === path) return '';
  return String(value).trim();
}

/**
 * @param {string} roleKey
 * @param {string} [roleLabel] — chỉ dùng khi không có i18n / fallback
 * @param {Function} [t]
 */
export function localizedOrgRoleLabel(roleKey, roleLabel, t) {
  const canonical = resolveOrgRoleCanonicalKey(roleKey);
  const fromI18n = lookupI18n(t, LABEL_PATH, canonical);
  if (fromI18n) return fromI18n;
  if (canonical && ORG_ROLE_LABEL_VI_FALLBACK[canonical]) {
    return ORG_ROLE_LABEL_VI_FALLBACK[canonical];
  }
  const label = String(roleLabel || '').trim();
  if (label) return label;
  return canonical || String(roleKey || '').trim();
}

/**
 * @param {string} roleKey
 * @param {string} [roleDescription]
 * @param {Function} [t]
 */
export function localizedOrgRoleDescription(roleKey, roleDescription, t) {
  const canonical = resolveOrgRoleCanonicalKey(roleKey);
  const fromI18n = lookupI18n(t, DESC_PATH, canonical);
  if (fromI18n) return fromI18n;
  return String(roleDescription || '').trim();
}

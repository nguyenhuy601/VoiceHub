/**
 * Nhãn Vai trò dự án theo locale — thay suffix EN trong «Dự án — …».
 */

const LABEL_PATH = 'adminRbac.projectRoleLabel';
const PREFIX_PATH = 'adminRbac.projectRoleLabelPrefix';

const LEGACY_PROJECT_ROLE_ALIASES = Object.freeze({
  tech_lead: 'TECHNICAL_LEAD',
  architect: 'SOLUTION_ARCHITECT',
  senior_developer: 'FULLSTACK_DEVELOPER',
  developer: 'BACKEND_DEVELOPER',
  junior: 'BACKEND_DEVELOPER',
  intern: 'OBSERVER',
  qa: 'QA_ENGINEER',
  tester: 'QA_ENGINEER',
  reviewer: 'OBSERVER',
  release_manager: 'DEVOPS_ENGINEER',
  watcher: 'OBSERVER',
  owner: 'PROJECT_MANAGER',
  editor: 'BACKEND_DEVELOPER',
  viewer: 'OBSERVER',
});

export const PROJECT_ROLE_LABEL_VI_FALLBACK = Object.freeze({
  SPONSOR: 'Nhà tài trợ',
  STAKEHOLDER: 'Bên liên quan',
  PROJECT_MANAGER: 'Quản lý dự án',
  PRODUCT_OWNER: 'Chủ sản phẩm',
  SCRUM_MASTER: 'Điều phối Scrum',
  SOLUTION_ARCHITECT: 'Kiến trúc sư giải pháp',
  TECHNICAL_LEAD: 'Trưởng kỹ thuật',
  BUSINESS_ANALYST: 'Phân tích nghiệp vụ',
  BACKEND_DEVELOPER: 'Lập trình Backend',
  FRONTEND_DEVELOPER: 'Lập trình Frontend',
  MOBILE_DEVELOPER: 'Lập trình Mobile',
  FULLSTACK_DEVELOPER: 'Lập trình Full-stack',
  QA_LEAD: 'Trưởng QA',
  QA_ENGINEER: 'Kỹ sư QA',
  UI_UX_DESIGNER: 'Thiết kế UI/UX',
  DEVOPS_ENGINEER: 'Kỹ sư DevOps',
  OBSERVER: 'Quan sát viên',
});

export function resolveProjectRoleCanonicalKey(rawKey) {
  const lower = String(rawKey || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  if (!lower) return '';
  if (LEGACY_PROJECT_ROLE_ALIASES[lower]) return LEGACY_PROJECT_ROLE_ALIASES[lower];
  return lower.toUpperCase();
}

/**
 * Ẩn alias legacy / casing trùng (tech_lead + TECHNICAL_LEAD → cùng «Dự án — Trưởng kỹ thuật»).
 */
export function isRedundantProjectRoleAliasRow(role, allRoles = []) {
  const key = String(role?.key || role?.code || '').trim();
  if (!key) return false;
  const canon = resolveProjectRoleCanonicalKey(key);
  if (!canon) return false;
  const siblings = (allRoles || []).filter(
    (r) => resolveProjectRoleCanonicalKey(r?.key || r?.code) === canon
  );
  if (siblings.length <= 1) return false;

  const hasCanonical = siblings.some((r) => String(r?.key || r?.code || '').trim() === canon);
  if (hasCanonical) return key !== canon;

  const first = String(siblings[0]?.key || siblings[0]?.code || '').trim();
  return key !== first;
}

export function filterProjectRoleCatalogRows(roles = []) {
  const list = Array.isArray(roles) ? roles : [];
  return list.filter((row) => !isRedundantProjectRoleAliasRow(row, list));
}

function lookupI18n(t, path) {
  if (typeof t !== 'function' || !path) return '';
  const value = t(path);
  if (value == null || value === path) return '';
  return String(value).trim();
}

function stripProjectPrefix(raw) {
  return String(raw || '')
    .replace(/^(Dự án|Project)\s*[—–\-:]\s*/i, '')
    .trim();
}

/**
 * @param {string} roleKey
 * @param {string} [rawLabel]
 * @param {Function} [t]
 */
export function localizedProjectRoleLabel(roleKey, rawLabel, t) {
  const canonical = resolveProjectRoleCanonicalKey(roleKey);
  const suffixFromI18n = lookupI18n(t, `${LABEL_PATH}.${canonical}`);
  const suffix =
    suffixFromI18n ||
    (canonical && PROJECT_ROLE_LABEL_VI_FALLBACK[canonical]) ||
    stripProjectPrefix(rawLabel) ||
    String(rawLabel || roleKey || '').trim();

  let prefix = lookupI18n(t, PREFIX_PATH) || 'Dự án —';
  if (prefix && !/\s$/.test(prefix)) prefix = `${prefix} `;
  if (!suffix) return prefix.trim() || String(roleKey || '').trim();
  return `${prefix}${suffix}`;
}

/** Chip / danh sách: cùng từ điển locale, không gắn prefix «Dự án —». */
export function localizedProjectRoleShortLabel(roleKey, rawLabel, t) {
  const full = localizedProjectRoleLabel(roleKey, rawLabel, t);
  return stripProjectPrefix(full) || full;
}

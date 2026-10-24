import { localizedOrgRoleLabel } from './orgRoleLocale.js';

/** systemRole=admin → nhà cung cấp nền tảng (không phải Giám đốc tổ chức). */
export function memberIsSystemAdmin(member) {
  return String(member?.systemRole || '')
    .trim()
    .toLowerCase() === 'admin';
}

/**
 * Ưu tiên nhãn theo locale (t); fallback VI map / label API.
 * @param {string} roleKey
 * @param {string} [roleLabel]
 * @param {Function} [t]
 */
export function canonicalizeOrgRoleLabel(roleKey, roleLabel, t) {
  return localizedOrgRoleLabel(roleKey, roleLabel, t);
}

/**
 * @param {Array<{ label?: string, roleKey?: string, roleLabel?: string }>} rows
 * @param {Function} [t]
 */
export function formatOrgRoleRowsLabel(rows, t) {
  const labels = [];
  for (const row of rows || []) {
    const label = canonicalizeOrgRoleLabel(row?.roleKey, row?.label || row?.roleLabel, t);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.join(', ');
}

/**
 * Nhãn badge danh sách người (RBAC / picker): Nhà cung cấp | vai tổ chức | chưa gán.
 * Không dùng membership admin/hr/member làm SoT.
 *
 * @param {object} member
 * @param {{ orgRoleRows?: Array, t?: Function }} [opts]
 */
export function effectiveOrgRoleLabel(member, { orgRoleRows, t } = {}) {
  if (memberIsSystemAdmin(member)) {
    return typeof t === 'function' ? t('adminUsers.roleVendor') : 'Nhà cung cấp';
  }
  const fromRows = formatOrgRoleRowsLabel(orgRoleRows, t);
  if (fromRows) return fromRows;
  return typeof t === 'function' ? t('adminUsers.orgRoleNone') : 'Chưa gán Vai trò tổ chức';
}

/**
 * Map userId → rows từ org-role-assignments (+ nhãn từ vị trí nếu có).
 * @param {Array} assignments — { userId, roleKey, roleLabel }
 * @param {Record<string, Array<{label?: string}>>} [roleFromPosition]
 * @param {Function} [t]
 */
export function buildOrgRoleRowsMapFromAssignments(assignments = [], roleFromPosition = {}, t) {
  const map = {};
  for (const a of assignments || []) {
    const uid = String(a?.userId || '').trim();
    if (!uid) continue;
    const label = canonicalizeOrgRoleLabel(a.roleKey, a.roleLabel, t);
    if (!label) continue;
    const prev = map[uid] || [];
    if (!prev.some((r) => r.label === label && String(r.roleKey || '') === String(a.roleKey || ''))) {
      prev.push({ label, roleKey: a.roleKey, roleLabel: a.roleLabel });
    }
    map[uid] = prev;
  }
  // Gộp vai từ vị trí — không bỏ qua khi đã có gán catalog.
  for (const [uid, rows] of Object.entries(roleFromPosition || {})) {
    const prev = map[uid] || [];
    for (const row of rows || []) {
      const label = canonicalizeOrgRoleLabel(row.roleKey, row.label || row.roleLabel, t);
      if (!label) continue;
      if (
        !prev.some((r) =>
          r.roleKey && row.roleKey ? String(r.roleKey) === String(row.roleKey) : r.label === label
        )
      ) {
        prev.push({ label, roleKey: row.roleKey });
      }
    }
    map[uid] = prev;
  }
  return map;
}

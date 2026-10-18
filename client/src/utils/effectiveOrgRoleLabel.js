import { ORGANIZATION_ROLE_LABELS } from './roleTaxonomy.js';

/** systemRole=admin → mặt phẳng bên bán (không phải Giám đốc tổ chức). */
export function memberIsSystemAdmin(member) {
  return String(member?.systemRole || '')
    .trim()
    .toLowerCase() === 'admin';
}

/**
 * Ưu tiên nhãn VI theo code; fallback roleLabel từ API.
 * @param {string} roleKey
 * @param {string} [roleLabel]
 */
export function canonicalizeOrgRoleLabel(roleKey, roleLabel) {
  const key = String(roleKey || '')
    .trim()
    .toLowerCase();
  if (key && ORGANIZATION_ROLE_LABELS[key]) return ORGANIZATION_ROLE_LABELS[key];
  const label = String(roleLabel || '').trim();
  if (label) return label;
  return key;
}

/**
 * @param {Array<{ label?: string, roleKey?: string, roleLabel?: string }>} rows
 */
export function formatOrgRoleRowsLabel(rows) {
  const labels = [];
  for (const row of rows || []) {
    const label = canonicalizeOrgRoleLabel(row?.roleKey, row?.label || row?.roleLabel);
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels.join(', ');
}

/**
 * Nhãn badge danh sách người (RBAC / picker): Bên bán | vai tổ chức | chưa gán.
 * Không dùng membership admin/hr/member làm SoT.
 *
 * @param {object} member
 * @param {{ orgRoleRows?: Array, t?: Function }} [opts]
 */
export function effectiveOrgRoleLabel(member, { orgRoleRows, t } = {}) {
  if (memberIsSystemAdmin(member)) {
    return typeof t === 'function' ? t('adminUsers.roleVendor') : 'Bên bán';
  }
  const fromRows = formatOrgRoleRowsLabel(orgRoleRows);
  if (fromRows) return fromRows;
  return typeof t === 'function' ? t('adminUsers.orgRoleNone') : 'Chưa gán Vai trò tổ chức';
}

/**
 * Map userId → rows từ org-role-assignments (+ nhãn từ vị trí nếu có).
 * @param {Array} assignments — { userId, roleKey, roleLabel }
 * @param {Record<string, Array<{label?: string}>>} [roleFromPosition]
 */
export function buildOrgRoleRowsMapFromAssignments(assignments = [], roleFromPosition = {}) {
  const map = {};
  for (const a of assignments || []) {
    const uid = String(a?.userId || '').trim();
    if (!uid) continue;
    const label = canonicalizeOrgRoleLabel(a.roleKey, a.roleLabel);
    if (!label) continue;
    const prev = map[uid] || [];
    if (!prev.some((r) => r.label === label && String(r.roleKey || '') === String(a.roleKey || ''))) {
      prev.push({ label, roleKey: a.roleKey, roleLabel: a.roleLabel });
    }
    map[uid] = prev;
  }
  for (const [uid, rows] of Object.entries(roleFromPosition || {})) {
    if (map[uid]?.length) continue;
    map[uid] = (rows || []).map((row) => ({
      label: canonicalizeOrgRoleLabel(row.roleKey, row.label || row.roleLabel),
      roleKey: row.roleKey,
    }));
  }
  return map;
}

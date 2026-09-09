import { memberDisplayName, memberUserId } from '../../../utils/adminUserUtils.js';

function isPlaceholderName(label, userId) {
  const id = String(userId || '').trim();
  const lab = String(label || '').trim();
  if (!lab) return true;
  if (id && lab === id.slice(-6)) return true;
  return false;
}

export function memberHasRealDisplayName(member) {
  if (!member) return false;
  const id = memberUserId(member);
  const label = memberDisplayName(member, '');
  return Boolean(label) && !isPlaceholderName(label, id);
}

/** Ưu tiên row có tên thật (không phải đuôi userId). */
export function pickNamedMember(...rows) {
  for (const row of rows) {
    if (memberHasRealDisplayName(row)) return row;
  }
  return rows.find(Boolean) || null;
}

/**
 * Tên chip seed member: viewMembers / deptRoster trước, rồi map org-wide.
 * Không dùng employeeCode. Chỉ slice(-6) khi không còn displayName/email.
 */
export function resolveWizardMemberLabel(userId, sources = []) {
  const id = String(userId || '').trim();
  if (!id) return '';
  for (const source of sources) {
    if (!source) continue;
    if (typeof source.get === 'function') {
      const row = source.get(id);
      if (memberHasRealDisplayName(row)) return memberDisplayName(row);
      continue;
    }
    if (Array.isArray(source)) {
      const row = source.find((m) => memberUserId(m) === id);
      if (memberHasRealDisplayName(row)) return memberDisplayName(row);
    }
  }
  return id.slice(-6);
}

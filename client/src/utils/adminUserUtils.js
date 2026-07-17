export function memberUserId(member) {
  return String(member?.userId || member?.user?._id || member?.user || member?._id || '').trim();
}

/** Tên hiển thị — đọc cả profile lồng `user.*` (membership populate). */
export function memberDisplayName(member, fallback = '—') {
  const nested = member?.user && typeof member.user === 'object' ? member.user : null;
  const email = String(member?.email || nested?.email || '').trim();
  const emailLocal = email.includes('@') ? email.split('@')[0] : '';
  return (
    member?.displayName ||
    nested?.displayName ||
    member?.fullName ||
    nested?.fullName ||
    member?.username ||
    nested?.username ||
    emailLocal ||
    memberUserId(member).slice(-6) ||
    fallback
  );
}

/** Gắn nhãn userId khi không có trong map thành viên (vd. systemRole=admin bị ẩn khỏi list). */
export function memberLabelById(membersById, userId, fallback = '—') {
  const id = String(userId || '').trim();
  if (!id) return fallback;
  const member = typeof membersById?.get === 'function' ? membersById.get(id) : null;
  return memberDisplayName(member || { userId: id }, fallback);
}

export function memberEmail(member) {
  return String(member?.email || '').trim() || '—';
}

export function memberOrgRole(member) {
  return String(member?.role || member?.orgRole || 'member').toLowerCase();
}

export function memberStatusKey(member) {
  if (member?.isLocked) return 'locked';
  if (member?.isActive === false) return 'inactive';
  if (member?.mustChangePassword) return 'mustChangePassword';
  return 'active';
}

export function memberStatusLabel(member, t) {
  const key = memberStatusKey(member);
  if (key === 'locked') return t('adminUsers.statusLocked');
  if (key === 'inactive') return t('adminUsers.statusInactive');
  if (key === 'mustChangePassword') return t('adminUsers.statusMustChangePassword');
  return t('adminUsers.statusActive');
}

export function memberDepartmentId(member) {
  return String(member?.department || member?.departmentId || '').trim();
}

export function memberTeamId(member) {
  return String(member?.team || member?.teamId || '').trim();
}

/** Chưa gắn phòng ban và chưa gắn nhóm — dùng picker «Gán phòng ban / nhóm». */
export function memberIsUnplaced(member) {
  return !memberDepartmentId(member) && !memberTeamId(member);
}

/**
 * Ứng viên gán trưởng phòng: đã thuộc phòng ban và chưa là head phòng nào.
 * @param {object} member
 * @param {{ headUserIds?: Set<string>|Iterable<string>, departmentId?: string }} [opts]
 *   - headUserIds: tập userId đang là trưởng phòng
 *   - departmentId: nếu có — chỉ người thuộc đúng phòng ban đang chọn
 */
export function memberEligibleForDeptHead(member, opts = {}) {
  const uid = memberUserId(member);
  if (!uid) return false;
  const deptId = memberDepartmentId(member);
  if (!deptId) return false;
  const headIds = opts.headUserIds;
  if (headIds) {
    const set = typeof headIds.has === 'function' ? headIds : new Set(headIds);
    if (set.has(uid)) return false;
  }
  const scopeDept = String(opts.departmentId || '').trim();
  if (scopeDept && deptId !== scopeDept) return false;
  return true;
}

const ELEVATED_ORG_ROLES = new Set(['owner', 'admin', 'hr']);

/** Thành viên thường chưa gán phòng ban/nhóm hoặc chưa có UserRole RBAC. */
export function memberNeedsOnboardingAssignment(member, assignmentsByUserId) {
  if (ELEVATED_ORG_ROLES.has(memberOrgRole(member))) return false;
  return (
    memberIsUnplaced(member) || memberIsWithoutRbacRole(member, assignmentsByUserId)
  );
}

/**
 * Chưa có UserRole RBAC trong org — dùng picker «Gán vai trò».
 * @param {object} member
 * @param {Record<string, unknown[]>|Map<string, unknown[]>} [assignmentsByUserId]
 *   map userId → danh sách role từ getUserRoles; thiếu key = chưa load → không đưa vào hàng đợi.
 */
export function memberIsWithoutRbacRole(member, assignmentsByUserId) {
  const uid = memberUserId(member);
  if (!uid) return false;

  if (assignmentsByUserId != null) {
    const roles =
      typeof assignmentsByUserId.get === 'function'
        ? assignmentsByUserId.get(uid)
        : assignmentsByUserId[uid];
    if (roles === undefined) return false;
    return !Array.isArray(roles) || roles.length === 0;
  }

  if (Array.isArray(member?.rbacRoles)) return member.rbacRoles.length === 0;
  if (Array.isArray(member?.rbacRoleIds)) return member.rbacRoleIds.length === 0;
  return false;
}

/** Huy: chuẩn hoá chuỗi tìm kiếm (bỏ dấu) — tìm «Lan» khớp «Trần Lan». */
export function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function memberMatchesQuery(member, query) {
  const q = normalizeSearchText(query);
  if (!q) return true;
  const hay = normalizeSearchText(
    [
      memberDisplayName(member, ''),
      memberEmail(member),
      member?.username,
      member?.jobTitle,
      memberOrgRole(member),
      memberUserId(member),
      member?.departmentName,
    ]
      .filter(Boolean)
      .join(' ')
  );
  return hay.includes(q);
}

/**
 * Nhãn hiển thị cho danh sách UserRole RBAC.
 * @param {unknown[]} roles
 * @param {(role: object) => string} [displayNameFn]
 */
export function formatRbacRoleLabels(roles, displayNameFn) {
  const list = Array.isArray(roles) ? roles : [];
  const names = list
    .map((row) => {
      if (typeof displayNameFn === 'function') return displayNameFn(row);
      return String(row?.name || row?.role?.name || row?.displayName || '').trim();
    })
    .filter(Boolean);
  return names;
}

export function unwrapApi(payload) {
  return payload?.data ?? payload;
}

export function parseCsvInviteRows(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const rows = [];
  const start = lines[0].toLowerCase().includes('email') ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i].split(/[,;\t]/).map((p) => p.trim());
    const [email, firstName = '', lastName = '', role = 'member'] = parts;
    if (!email) continue;
    rows.push({ email, firstName, lastName, role: role || 'member' });
  }
  return rows;
}

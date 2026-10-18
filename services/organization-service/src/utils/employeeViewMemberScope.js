const ORG_WIDE_SCOPES = new Set(['ORGANIZATION', 'SYSTEM', 'GLOBAL']);

function employeeViewScope(grantScopes) {
  const raw = grantScopes && grantScopes['organization.employee.view'];
  if (!raw) return null;
  const scope = String(raw).trim().toUpperCase();
  return scope || null;
}

/** SELF chỉ thấy mình. DEPARTMENT trở lên mới mở bảng nhân sự quản trị. */
function scopeOpensAdminTable(scope) {
  return scope === 'DEPARTMENT' || ORG_WIDE_SCOPES.has(scope);
}

function memberUserId(member) {
  return String(member?.user?._id || member?.user || member?.userId || '');
}

/**
 * Cắt dòng bảng nhân sự theo phạm vi mã organization.employee.view.
 * DEPARTMENT không có phòng nào → chỉ mình, không trả cả công ty.
 */
function filterMembersByEmployeeView({ viewerUserId, scope, departmentMemberIds, members }) {
  const list = Array.isArray(members) ? members : [];
  const selfId = String(viewerUserId || '');
  if (ORG_WIDE_SCOPES.has(scope)) return list;
  if (scope === 'DEPARTMENT') {
    const allowed = new Set((departmentMemberIds || []).map((id) => String(id || '')).filter(Boolean));
    if (!allowed.size) {
      return list.filter((row) => memberUserId(row) === selfId);
    }
    if (selfId) allowed.add(selfId);
    return list.filter((row) => allowed.has(memberUserId(row)));
  }
  return list.filter((row) => memberUserId(row) === selfId);
}

module.exports = {
  ORG_WIDE_SCOPES,
  employeeViewScope,
  scopeOpensAdminTable,
  filterMembersByEmployeeView,
};

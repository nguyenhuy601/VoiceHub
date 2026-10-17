/**
 * Cùng quy tắc với auth-service: system admin chỉ khi bản ghi auth còn active và systemRole=admin.
 * @param {{ systemRole?: string, isActive?: boolean } | null | undefined} row
 */
function evaluateStoredSystemAdmin(row) {
  if (!row) return { allow: false, reason: 'missing' };
  if (row.isActive === false) return { allow: false, reason: 'inactive' };
  const role = String(row.systemRole || '').trim().toLowerCase();
  if (role !== 'admin') return { allow: false, reason: 'role' };
  return { allow: true, reason: 'ok' };
}

module.exports = {
  evaluateStoredSystemAdmin,
};

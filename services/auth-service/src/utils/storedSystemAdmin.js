/**
 * Quyết định system admin từ bản ghi UserAuth (kho auth), không từ claim JWT.
 * @param {{ systemRole?: string, isActive?: boolean } | null | undefined} row
 * @returns {{ allow: boolean, reason: 'ok' | 'missing' | 'inactive' | 'role' }}
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

/**
 * Người tạo không được gán vai trò thì không được nhận Backend Developer
 * từ board ACL `editor` (LEGACY editor → backend_developer).
 */

function creatorHasExplicitProjectRole(members, creatorUserId) {
  const uid = String(creatorUserId || '').trim();
  if (!uid) return false;
  for (const row of Array.isArray(members) ? members : []) {
    if (String(row?.userId || row?.id || '').trim() !== uid) continue;
    const keys = Array.isArray(row?.projectRoleKeys) ? row.projectRoleKeys : [];
    if (keys.some((key) => String(key || '').trim())) return true;
  }
  return false;
}

function isCreatorDefaultEditorAcl(userId, boardRole, createdBy) {
  return (
    String(userId || '').trim() !== '' &&
    String(userId || '').trim() === String(createdBy || '').trim() &&
    String(boardRole || '').trim().toLowerCase() === 'editor'
  );
}

function isCreatorDefaultEditorMembership(row, createdBy) {
  return (
    String(row?.userId || '').trim() === String(createdBy || '').trim() &&
    String(row?.legacyBoardRole || '').trim().toLowerCase() === 'editor'
  );
}

module.exports = {
  creatorHasExplicitProjectRole,
  isCreatorDefaultEditorAcl,
  isCreatorDefaultEditorMembership,
};

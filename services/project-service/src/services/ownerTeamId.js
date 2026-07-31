/**
 * Swimlane ownerTeamId helpers (pure — không phụ thuộc org HTTP).
 */

function normalizeOwnerTeamId(ownerTeamId) {
  if (ownerTeamId == null || ownerTeamId === '') return null;
  const id = String(ownerTeamId).trim();
  if (!/^[a-f0-9]{24}$/i.test(id)) return null;
  return id;
}

/**
 * null/empty = chưa gán team.
 * org visibility: mọi OID hợp lệ.
 * scope có teamIds: phải nằm trong danh sách.
 */
function canAssignOwnerTeam(scope, ownerTeamId) {
  if (ownerTeamId == null || ownerTeamId === '') return true;
  const id = String(ownerTeamId);
  if (!/^[a-f0-9]{24}$/i.test(id)) return false;
  if (!scope) return false;
  if (scope.visibility === 'org') return true;
  const teamIds = Array.isArray(scope.teamIds) ? scope.teamIds.map(String) : [];
  if (!teamIds.length) return true;
  return teamIds.includes(id);
}

module.exports = {
  normalizeOwnerTeamId,
  canAssignOwnerTeam,
};

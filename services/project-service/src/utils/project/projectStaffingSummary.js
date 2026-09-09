function summarizeProjectRoleStaffing(requiredProjectRoles = [], memberships = [], roleKey = '') {
  const targetRoleKey = String(roleKey || '').trim().toLowerCase();
  const requiredRoleRow = (Array.isArray(requiredProjectRoles) ? requiredProjectRoles : []).find(
    (row) => String(row?.roleKey || '').trim().toLowerCase() === targetRoleKey
  ) || { roleKey: targetRoleKey, requiredCount: 0 };
  const currentRoleUserIds = new Set(
    (Array.isArray(memberships) ? memberships : [])
      .filter((row) => String(row?.projectRoleKey || '').trim().toLowerCase() === targetRoleKey)
      .map((row) => String(row?.userId || '').trim())
      .filter(Boolean)
  );
  const requiredCount = Number(requiredRoleRow.requiredCount) || 0;
  const currentCount = currentRoleUserIds.size;
  return {
    roleKey: targetRoleKey,
    requiredCount,
    currentCount,
    remainingCount: Math.max(requiredCount - currentCount, 0),
    isFilled: requiredCount > 0 && currentCount >= requiredCount,
  };
}

module.exports = { summarizeProjectRoleStaffing };

/**
 * Stamp org position onto pool items and the project roles that position may fill.
 * Matching reads orgPositionRoleKeys. Project membership roles are granted later, on confirm.
 */

const {
  ROLE_ORG_POSITION_CODES,
  orgPositionMatchesRole,
} = require('../../staffing/orgPositionSuggestMatch');

function roleKeysForOrgPosition(position) {
  if (!position || (!position.positionCode && !position.positionName)) return [];
  const keys = [];
  for (const roleKey of Object.keys(ROLE_ORG_POSITION_CODES)) {
    if (orgPositionMatchesRole(position, roleKey)) keys.push(roleKey);
  }
  return keys;
}

/**
 * @param {object[]} poolItems
 * @param {Array<{ userId?: string, positionCode?: string, positionName?: string }>} positions
 */
function attachOrgPositionRoleKeys(poolItems = [], positions = []) {
  const byUser = new Map();
  for (const row of positions || []) {
    const userId = String(row?.userId || '').trim();
    const positionCode = String(row?.positionCode || '').trim();
    const positionName = String(row?.positionName || '').trim();
    if (!userId || (!positionCode && !positionName) || byUser.has(userId)) continue;
    byUser.set(userId, { positionCode, positionName });
  }

  return (poolItems || []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const userId = String(item.userId || item.employeeId || '').trim();
    const position = userId ? byUser.get(userId) : null;
    const orgPositionRoleKeys = roleKeysForOrgPosition(position);
    if (!position) {
      if (!Object.prototype.hasOwnProperty.call(item, 'orgPositionRoleKeys')) return item;
      const next = { ...item };
      delete next.orgPosition;
      delete next.orgPositionRoleKeys;
      return next;
    }
    return {
      ...item,
      orgPosition: position,
      ...(orgPositionRoleKeys.length ? { orgPositionRoleKeys } : {}),
    };
  });
}

module.exports = {
  attachOrgPositionRoleKeys,
  roleKeysForOrgPosition,
};

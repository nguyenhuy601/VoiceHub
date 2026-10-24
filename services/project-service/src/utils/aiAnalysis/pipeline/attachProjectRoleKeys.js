/**
 * Stamp project role keys from membership rows onto pool items.
 * Keys stay as stored (backend_developer). Empty keys are dropped.
 * Callers resolve ProjectRole.key before calling — this function does not read titles or ROLE-* ids.
 */

function normalizeProjectRoleKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

/**
 * @param {object[]} poolItems
 * @param {Array<{ userId?: string, projectRoleKey?: string }>} memberships
 * @returns {object[]}
 */
function attachProjectRoleKeys(poolItems = [], memberships = []) {
  const keysByUser = new Map();
  for (const row of memberships || []) {
    const userId = String(row?.userId || '').trim();
    const key = normalizeProjectRoleKey(row?.projectRoleKey);
    if (!userId || !key) continue;
    if (!keysByUser.has(userId)) keysByUser.set(userId, []);
    const list = keysByUser.get(userId);
    if (!list.includes(key)) list.push(key);
  }

  return (poolItems || []).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const userId = String(item.userId || item.employeeId || '').trim();
    const keys = userId ? keysByUser.get(userId) : null;
    if (!keys || !keys.length) {
      if (!Object.prototype.hasOwnProperty.call(item, 'projectRoleKeys')) return item;
      const next = { ...item };
      delete next.projectRoleKeys;
      return next;
    }
    return { ...item, projectRoleKeys: keys };
  });
}

module.exports = {
  attachProjectRoleKeys,
  normalizeProjectRoleKey,
};

export function uniqueRoleKeys(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function keysEqual(left, right) {
  const a = uniqueRoleKeys(left);
  const b = uniqueRoleKeys(right);
  if (a.length !== b.length) return false;
  const set = new Set(b);
  return a.every((key) => set.has(key));
}

export function nextKeysForAssign(current, roleKey) {
  return uniqueRoleKeys([...(current || []), roleKey]);
}

export function nextKeysForReplace(current, fromKey, toKey) {
  const keys = uniqueRoleKeys(current);
  const from = String(fromKey || '').trim();
  const to = String(toKey || '').trim();
  if (!from || !to || from === to || !keys.includes(from)) return keys;
  return uniqueRoleKeys(keys.map((key) => (key === from ? to : key)));
}

export function nextKeysForRemove(current, roleKey) {
  const drop = String(roleKey || '').trim();
  return uniqueRoleKeys(current).filter((key) => key !== drop);
}

export function assignmentMapFromRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const userId = String(row?.userId || '').trim();
    const roleKey = String(row?.roleKey || '').trim();
    if (!userId || !roleKey) continue;
    const list = map.get(userId) || [];
    list.push(roleKey);
    map.set(userId, list);
  }
  return map;
}

/**
 * Đọc toàn bộ gán hiện có, rồi ghi lại từng user có thay đổi.
 * @param {{
 *   userIds: string[],
 *   nextKeysForUser: (current: string[]) => string[],
 *   listRows: () => Promise<Array<{ userId?: string, roleKey?: string }>>,
 *   saveKeys: (userId: string, roleKeys: string[]) => Promise<unknown>,
 * }} input
 */
export async function applyOrgRoleBulk({ userIds, nextKeysForUser, listRows, saveKeys }) {
  const map = assignmentMapFromRows(await listRows());
  let changed = 0;
  let skipped = 0;
  for (const rawId of userIds || []) {
    const userId = String(rawId || '').trim();
    if (!userId) continue;
    const current = uniqueRoleKeys(map.get(userId) || []);
    const next = uniqueRoleKeys(nextKeysForUser(current));
    if (keysEqual(current, next)) {
      skipped += 1;
      continue;
    }
    await saveKeys(userId, next);
    changed += 1;
  }
  return { changed, skipped };
}

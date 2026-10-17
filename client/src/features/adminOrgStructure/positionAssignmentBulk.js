export function uniqueIds(values) {
  return [...new Set((values || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function activeAssignmentByUser(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.status && String(row.status) !== 'active') continue;
    const userId = String(row?.userId || '').trim();
    const positionId = String(row?.positionId?._id || row?.positionId?.id || row?.positionId || '').trim();
    const assignmentId = String(row?._id || row?.id || '').trim();
    if (!userId || !positionId || map.has(userId)) continue;
    map.set(userId, { positionId, assignmentId });
  }
  return map;
}

/**
 * @param {string[]} userIds
 * @param {Map<string, { positionId: string, assignmentId: string }>} byUser
 * @param {{ mode: 'assign' | 'replace' | 'remove', fromId?: string, toId?: string }} action
 */
export function partitionPositionChange(userIds, byUser, action) {
  const changed = [];
  const skipped = [];
  const fromId = String(action.fromId || '').trim();
  const toId = String(action.toId || '').trim();
  for (const userId of uniqueIds(userIds)) {
    const current = byUser.get(userId) || null;
    if (action.mode === 'assign') {
      if (!toId || (current && current.positionId === toId)) skipped.push(userId);
      else changed.push(userId);
    } else if (action.mode === 'replace') {
      if (!fromId || !toId || fromId === toId || !current || current.positionId !== fromId) {
        skipped.push(userId);
      } else changed.push(userId);
    } else if (!current || (fromId && current.positionId !== fromId)) {
      skipped.push(userId);
    } else changed.push(userId);
  }
  return { changed, skipped };
}

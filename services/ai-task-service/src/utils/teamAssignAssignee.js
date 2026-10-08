const { isObjectIdString } = require('./bindObjectIdParam');

/**
 * Trusted assignee ids from a stored team_assign draft payload.
 * @param {Record<string, unknown>|null|undefined} payload
 * @returns {Set<string>}
 */
function collectTrustedAssigneeIds(payload) {
  const trusted = new Set();
  const suggestions = Array.isArray(payload?.suggestions) ? payload.suggestions : [];
  for (const row of suggestions) {
    const id = row?.assigneeId || row?.userId;
    if (isObjectIdString(id)) trusted.add(String(id));
  }
  const members = Array.isArray(payload?.members) ? payload.members : [];
  for (const m of members) {
    const id = m?.userId || m?.id || m?._id;
    if (isObjectIdString(id)) trusted.add(String(id));
  }
  return trusted;
}

/**
 * Resolve assignee for one team-assign item — body assignee only if in trusted set.
 * @param {unknown} itemAssigneeId
 * @param {Set<string>} trusted
 * @returns {string|undefined}
 */
function resolveTeamAssignAssigneeId(itemAssigneeId, trusted) {
  if (!itemAssigneeId || !isObjectIdString(itemAssigneeId)) return undefined;
  const id = String(itemAssigneeId);
  if (!trusted.has(id)) return undefined;
  return id;
}

/**
 * Normalize confirm items: keep title fields from client, clamp assignee to trusted.
 * @param {unknown[]} items
 * @param {Record<string, unknown>|null|undefined} draftPayload
 */
function normalizeTeamAssignItems(items, draftPayload) {
  const trusted = collectTrustedAssigneeIds(draftPayload);
  const source = Array.isArray(items) && items.length ? items : draftPayload?.suggestions || [];
  return source.map((item) => ({
    title: String(item?.title || '').trim(),
    summary: item?.summary || '',
    description: item?.description || '',
    priority: item?.priority || 'medium',
    dueDate: item?.dueDate || null,
    assigneeId: resolveTeamAssignAssigneeId(item?.assigneeId, trusted),
  }));
}

module.exports = {
  collectTrustedAssigneeIds,
  resolveTeamAssignAssigneeId,
  normalizeTeamAssignItems,
};

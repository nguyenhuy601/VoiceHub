/**
 * Merge client edits onto stored project draft payload without allowing
 * scope/org/visibility overwrite (RULE-AI-03).
 * @param {Record<string, unknown>} basePayload
 * @param {unknown} clientPayload
 * @returns {Record<string, unknown>}
 */
function mergeProjectDraftPayload(basePayload, clientPayload) {
  const base =
    basePayload && typeof basePayload === 'object' && !Array.isArray(basePayload)
      ? { ...basePayload }
      : {};
  if (!clientPayload || typeof clientPayload !== 'object' || Array.isArray(clientPayload)) {
    return base;
  }
  const src = clientPayload;
  if (typeof src.title === 'string') base.title = src.title.slice(0, 200);
  if (typeof src.description === 'string') base.description = src.description.slice(0, 5000);
  if (typeof src.projectCode === 'string') base.projectCode = src.projectCode.slice(0, 64);
  if (src.dueDate !== undefined) base.dueDate = src.dueDate || null;
  if (Array.isArray(src.lists)) {
    base.lists = src.lists
      .map((list, index) => {
        const prev = Array.isArray(base.lists) ? base.lists[index] : null;
        const title = String(list?.title || prev?.title || '').trim().slice(0, 120);
        if (!title) return null;
        return {
          ...(prev && typeof prev === 'object' ? prev : {}),
          title,
          // Keep prior teamId/kind from stored draft; ignore client teamId/kind swaps.
          teamId: prev?.teamId ?? null,
          kind: prev?.kind || list?.kind || 'status',
        };
      })
      .filter(Boolean);
  }
  // Intentionally NOT copied from client: organizationId, scopeType, scopeId, visibility, background
  return base;
}

module.exports = {
  mergeProjectDraftPayload,
};

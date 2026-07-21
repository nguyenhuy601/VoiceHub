/**
 * Pure helpers — rank assignable members by Responsibility (unit-testable).
 */

function rankMembersByResponsibility(members, matchingUserIds = []) {
  const match = new Set((matchingUserIds || []).map(String));
  const enriched = (members || []).map((m) => {
    const id = String(m.userId || m.id || '');
    const suggested = match.has(id);
    return {
      ...m,
      userId: id,
      suggested,
      suggestReason: suggested ? 'responsibility' : undefined,
    };
  });
  enriched.sort((a, b) => {
    if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
    const an = String(a.displayName || a.name || a.userId || '');
    const bn = String(b.displayName || b.name || b.userId || '');
    return an.localeCompare(bn, 'vi');
  });
  return enriched;
}

module.exports = { rankMembersByResponsibility };

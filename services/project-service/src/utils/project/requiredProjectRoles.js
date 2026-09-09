function normalizeRequiredProjectRoles(rows = []) {
  const input = Array.isArray(rows) ? rows : [];
  const byKey = new Map();
  for (const row of input) {
    const roleKey = String(row?.roleKey || '').trim().toLowerCase();
    if (!roleKey) continue;
    const rawCount = Number(row?.requiredCount);
    const requiredCount = Number.isFinite(rawCount) ? Math.max(0, Math.floor(rawCount)) : 0;
    if (requiredCount <= 0) {
      byKey.delete(roleKey);
      continue;
    }
    byKey.set(roleKey, { roleKey, requiredCount });
  }
  return [...byKey.values()];
}

module.exports = { normalizeRequiredProjectRoles };

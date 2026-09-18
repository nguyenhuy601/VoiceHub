/**
 * RULE-15 — Role / Skill / Effort trên RESOURCE + WBS.structured (không kind riêng).
 */

function asTrimmed(raw, max = 120) {
  return String(raw || '')
    .trim()
    .slice(0, max);
}

function asNonNegNumber(raw, fallback = null) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

/**
 * @param {unknown} raw
 * @returns {{ roleKey: string, title: string, count: number, skillKeys: string[], effortHours: number|null, notes: string }[]}
 */
function normalizeResourceRoles(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const roleKey = asTrimmed(item.roleKey || item.key, 64).toLowerCase();
    if (!roleKey || seen.has(roleKey)) continue;
    seen.add(roleKey);
    const skillKeys = Array.isArray(item.skillKeys)
      ? [...new Set(item.skillKeys.map((s) => asTrimmed(s, 64).toLowerCase()).filter(Boolean))].slice(
          0,
          32
        )
      : [];
    out.push({
      roleKey,
      title: asTrimmed(item.title || roleKey, 120) || roleKey,
      count: Math.max(1, Math.min(99, Math.floor(asNonNegNumber(item.count, 1) || 1))),
      skillKeys,
      effortHours: asNonNegNumber(item.effortHours, null),
      notes: asTrimmed(item.notes, 500),
    });
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * Normalize RESOURCE.structured — giữ field lạ, chuẩn hoá roles + totalEffortHours.
 * @param {object} structured
 */
function normalizeResourceStructured(structured = {}) {
  const base = structured && typeof structured === 'object' ? { ...structured } : {};
  const roles = normalizeResourceRoles(base.roles);
  const fromRoles = roles.reduce((sum, r) => sum + (r.effortHours || 0) * (r.count || 1), 0);
  const explicit = asNonNegNumber(base.totalEffortHours, null);
  const totalEffortHours = explicit != null ? explicit : fromRoles > 0 ? fromRoles : null;
  return {
    ...base,
    roles,
    ...(totalEffortHours != null ? { totalEffortHours } : {}),
  };
}

/**
 * Normalize WBS.structured effort fields.
 * @param {object} structured
 */
function normalizeWbsStructured(structured = {}) {
  const base = structured && typeof structured === 'object' ? { ...structured } : {};
  const effortHours = asNonNegNumber(base.effortHours, null);
  const storyPoints = asNonNegNumber(base.storyPoints, null);
  const skillKeys = Array.isArray(base.skillKeys)
    ? [...new Set(base.skillKeys.map((s) => asTrimmed(s, 64).toLowerCase()).filter(Boolean))].slice(
        0,
        32
      )
    : undefined;
  return {
    ...base,
    ...(effortHours != null ? { effortHours } : {}),
    ...(storyPoints != null ? { storyPoints } : {}),
    ...(skillKeys ? { skillKeys } : {}),
  };
}

/**
 * Apply kind-aware structured normalize before save.
 * @param {string} kind
 * @param {object} structured
 */
function normalizePlanningStructured(kind, structured) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  if (k === 'RESOURCE') return normalizeResourceStructured(structured);
  if (k === 'WBS') return normalizeWbsStructured(structured);
  return structured && typeof structured === 'object' ? structured : {};
}

module.exports = {
  normalizeResourceRoles,
  normalizeResourceStructured,
  normalizeWbsStructured,
  normalizePlanningStructured,
};

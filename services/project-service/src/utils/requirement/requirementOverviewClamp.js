/**
 * Clamp overview fields to RequirementPack schema before create/save.
 * Customer Raw often puts free-text into Budget / Priority — coerce safely.
 * @param {object} [overview]
 * @returns {object}
 */
function parseBudgetNumber(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = String(value).trim();
  if (!raw) return null;
  // Pure / leading numeric only (avoid "Theo hợp đồng..." → NaN cast fail)
  const cleaned = raw.replace(/[,_\s]/g, '').replace(/[^\d.-]/g, '');
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === '-.') return null;
  // Reject if original was mostly prose (digits ratio low)
  const digitCount = (raw.match(/\d/g) || []).length;
  if (digitCount < 1 || digitCount / raw.length < 0.25) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizePlatform(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 20);
  }
  const s = String(value || '').trim();
  return s ? [s.slice(0, 240)] : [];
}

function clampOverviewForPack(overview = {}) {
  const o = overview && typeof overview === 'object' ? overview : {};
  const next = {
    ...o,
    requirementName: String(o.requirementName || '').trim().slice(0, 240),
    projectObjective: String(o.projectObjective || '').trim().slice(0, 4000),
    businessScope: String(o.businessScope || '').trim().slice(0, 4000),
    expectedUsers: String(o.expectedUsers || '').trim().slice(0, 512),
    expectedScale: String(o.expectedScale || '').trim().slice(0, 128),
    budgetCurrency: String(o.budgetCurrency || '').trim().slice(0, 8),
    priority: String(o.priority || 'Medium').trim().slice(0, 32) || 'Medium',
    platform: normalizePlatform(o.platform),
    budget: parseBudgetNumber(o.budget),
  };
  return next;
}

module.exports = {
  clampOverviewForPack,
  parseBudgetNumber,
  normalizePlatform,
};

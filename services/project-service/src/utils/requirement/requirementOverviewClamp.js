/**
 * Clamp overview fields to RequirementPack schema maxlength before create/save.
 * @param {object} [overview]
 * @returns {object}
 */
function clampOverviewForPack(overview = {}) {
  const o = overview && typeof overview === 'object' ? overview : {};
  return {
    ...o,
    requirementName: String(o.requirementName || '').trim().slice(0, 240),
    projectObjective: String(o.projectObjective || '').trim().slice(0, 4000),
    businessScope: String(o.businessScope || '').trim().slice(0, 4000),
    expectedUsers: String(o.expectedUsers || '').trim().slice(0, 512),
    expectedScale: String(o.expectedScale || '').trim().slice(0, 128),
    budgetCurrency: String(o.budgetCurrency || '').trim().slice(0, 8),
    priority: String(o.priority || 'Medium').trim().slice(0, 32) || 'Medium',
  };
}

module.exports = {
  clampOverviewForPack,
};

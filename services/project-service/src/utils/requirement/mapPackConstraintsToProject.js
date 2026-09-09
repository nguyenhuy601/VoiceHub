const { normalizeRequiredProjectRoles } = require('./requiredProjectRoles');

const DEFAULT_TITLE = 'Requirement pack';
const DEFAULT_BUDGET_CURRENCY = 'VND';

/**
 * Map RequirementPack staffing/overview constraints → Project create fields.
 * Pure helper — no DB / side effects.
 *
 * @param {object} pack
 * @param {{ titleOverride?: string }} [opts]
 * @returns {{
 *   title: string,
 *   description: string,
 *   requiredProjectRoles: Array<{ roleKey: string, requiredCount: number }>,
 *   budgetStub: { amount: number|null, currency: string, note: string } | null,
 *   startDate: Date|string|null,
 *   expectedEndDate: Date|string|null,
 *   dueDate: Date|string|null,
 * }}
 */
function mapPackConstraintsToProject(pack = {}, opts = {}) {
  const overview = pack?.overview && typeof pack.overview === 'object' ? pack.overview : {};
  const staffing = pack?.staffingPlan && typeof pack.staffingPlan === 'object' ? pack.staffingPlan : {};

  const titleOverride = String(opts.titleOverride || '').trim();
  const nameFromOverview = String(overview.requirementName || '').trim();
  const sourceFileName = String(pack?.sourceFileName || '').trim();
  const title = titleOverride || nameFromOverview || sourceFileName || DEFAULT_TITLE;

  const description = String(overview.projectObjective || '').trim();

  const requiredProjectRoles = normalizeRequiredProjectRoles(staffing.requiredRoles || []);

  const budgetRaw = overview.budget;
  const budgetAmount =
    budgetRaw === null || budgetRaw === undefined || budgetRaw === ''
      ? null
      : Number(budgetRaw);
  const hasBudget = Number.isFinite(budgetAmount);
  const currency =
    String(overview.budgetCurrency || staffing.budgetCurrency || '').trim() ||
    DEFAULT_BUDGET_CURRENCY;
  const budgetStub = hasBudget
    ? { amount: budgetAmount, currency: currency.slice(0, 8), note: '' }
    : null;

  const startDate = overview.startDate || staffing.startDate || null;
  const deadline = overview.deadline || null;

  return {
    title,
    description,
    requiredProjectRoles,
    budgetStub,
    startDate,
    expectedEndDate: deadline,
    dueDate: deadline,
  };
}

module.exports = {
  mapPackConstraintsToProject,
  DEFAULT_TITLE,
  DEFAULT_BUDGET_CURRENCY,
};

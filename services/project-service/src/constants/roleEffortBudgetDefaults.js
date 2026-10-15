/**
 * System baseline lines for RoleEffortBudgetTemplate seed (org publishes own version).
 * Illustrative only — not applied as silent hardcode without a published template.
 */

const SYSTEM_ROLE_EFFORT_BUDGET_LINES = Object.freeze([
  {
    roleKey: 'business_analyst',
    deliveryPhase: 'requirement_analysis',
    hoursPerWeek: 12,
    activityLabel: 'Requirements analysis / SRS',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
  {
    roleKey: 'product_owner',
    deliveryPhase: 'requirement_analysis',
    hoursPerWeek: 4,
    activityLabel: 'Goals / priority / SRS approve',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
  {
    roleKey: 'project_manager',
    deliveryPhase: 'requirement_analysis',
    hoursPerWeek: 4,
    activityLabel: 'Coordination / plan / risk',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
  {
    roleKey: 'project_manager',
    deliveryPhase: 'delivery_planning',
    hoursPerWeek: 8,
    activityLabel: 'WBS / schedule / staffing',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
  {
    roleKey: 'business_analyst',
    deliveryPhase: 'delivery_planning',
    hoursPerWeek: 4,
    activityLabel: 'Estimate / dependency input',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
  {
    roleKey: 'product_owner',
    deliveryPhase: 'delivery_planning',
    hoursPerWeek: 2,
    activityLabel: 'Scope / priority on plan',
    spreadPolicy: 'even_weeks',
    enabled: true,
  },
]);

const BUDGET_SEED_ROLES = Object.freeze([
  'business_analyst',
  'product_owner',
  'project_manager',
]);

function isForecastCapacityV1Enabled() {
  return String(process.env.FORECAST_CAPACITY_V1 || '').trim() === '1';
}

module.exports = {
  SYSTEM_ROLE_EFFORT_BUDGET_LINES,
  BUDGET_SEED_ROLES,
  isForecastCapacityV1Enabled,
};

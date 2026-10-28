/**
 * Single owner for Sprint LLM retry counters (serializable).
 */

function defaultRetryBudget(env = {}) {
  const maxApiCalls = Math.max(1, Number(env.SPRINT_LLM_MAX_API_CALLS) || 3);
  const maxValidationRepairs = Math.max(0, Number(env.SPRINT_LLM_MAX_VALIDATION_REPAIRS) || 2);
  const maxSchemaRepairs = Math.max(0, Number(env.SPRINT_LLM_MAX_SCHEMA_REPAIRS) || 2);
  const perCallTimeoutMs = Math.max(5_000, Number(env.SPRINT_LLM_TIMEOUT_MS) || 180_000);
  const wallMs = Math.max(perCallTimeoutMs, Number(env.SPRINT_LLM_DEADLINE_MS) || 600_000);
  return {
    maxApiCalls,
    usedApiCalls: 0,
    maxValidationRepairs,
    usedValidationRepairs: 0,
    maxSchemaRepairs,
    usedSchemaRepairs: 0,
    perCallTimeoutMs,
    deadlineAt: Date.now() + wallMs,
  };
}

function cloneBudget(budget) {
  return budget && typeof budget === 'object' ? { ...budget } : defaultRetryBudget();
}

function pastDeadline(budget) {
  return Number(budget?.deadlineAt) > 0 && Date.now() > Number(budget.deadlineAt);
}

function beginApiCall(budget) {
  const next = cloneBudget(budget);
  next.usedApiCalls = (Number(next.usedApiCalls) || 0) + 1;
  return next;
}

function canCallApi(budget) {
  if (pastDeadline(budget)) return false;
  return (Number(budget?.usedApiCalls) || 0) < (Number(budget?.maxApiCalls) || 0);
}

function canValidationRepair(budget) {
  if (pastDeadline(budget)) return false;
  if (!canCallApi(budget)) return false;
  return (Number(budget?.usedValidationRepairs) || 0) < (Number(budget?.maxValidationRepairs) || 0);
}

function markValidationRepair(budget) {
  const next = cloneBudget(budget);
  next.usedValidationRepairs = (Number(next.usedValidationRepairs) || 0) + 1;
  return next;
}

function canSchemaRepair(budget) {
  if (pastDeadline(budget)) return false;
  if (!canCallApi(budget)) return false;
  return (Number(budget?.usedSchemaRepairs) || 0) < (Number(budget?.maxSchemaRepairs) || 0);
}

function markSchemaRepair(budget) {
  const next = cloneBudget(budget);
  next.usedSchemaRepairs = (Number(next.usedSchemaRepairs) || 0) + 1;
  return next;
}

module.exports = {
  defaultRetryBudget,
  cloneBudget,
  pastDeadline,
  beginApiCall,
  canCallApi,
  canValidationRepair,
  markValidationRepair,
  canSchemaRepair,
  markSchemaRepair,
};

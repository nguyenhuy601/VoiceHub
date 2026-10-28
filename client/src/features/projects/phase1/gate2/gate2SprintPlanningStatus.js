/**
 * Map schedulePlan.meta (Sprint HOW LLM+validate) → Gate2 display fields.
 */

const EXECUTION = Object.freeze({
  DRAFT_READY: 'draft_ready',
  BLOCKED: 'blocked',
  INCOMPLETE: 'incomplete',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

/**
 * @param {string|null|undefined} executionStatus
 * @returns {'READY'|'DRAFT'|'AT_RISK'|'BLOCKING'}
 */
export function gate2StatusFromSprintExecution(executionStatus) {
  switch (String(executionStatus || '').trim()) {
    case EXECUTION.DRAFT_READY:
      return 'READY';
    case EXECUTION.BLOCKED:
    case EXECUTION.FAILED:
      return 'BLOCKING';
    case EXECUTION.INCOMPLETE:
      return 'AT_RISK';
    case EXECUTION.CANCELLED:
      return 'DRAFT';
    default:
      return '';
  }
}

/**
 * @param {object|null|undefined} planMeta — schedulePlan.meta
 */
export function readSprintPlanningMeta(planMeta = {}) {
  const meta = planMeta && typeof planMeta === 'object' ? planMeta : {};
  const executionStatus = meta.executionStatus ? String(meta.executionStatus) : null;
  const validation = meta.allocationValidation && typeof meta.allocationValidation === 'object'
    ? meta.allocationValidation
    : null;
  const issues = Array.isArray(validation?.issues)
    ? validation.issues
    : Array.isArray(meta.errors)
      ? meta.errors
      : [];
  const goalSource = meta.goalSource ? String(meta.goalSource) : null;
  const allocationSource = meta.allocationSource
    ? String(meta.allocationSource)
    : meta.sprintPlanningSource
      ? String(meta.sprintPlanningSource)
      : null;
  return {
    executionStatus,
    validationStatus: validation?.status ? String(validation.status) : null,
    validationChecks: Array.isArray(validation?.checks) ? validation.checks : [],
    validationIssues: issues,
    goalSource,
    sprintPlanningReady: Boolean(meta.sprintPlanningReady),
    allocationSource,
    /** Gate2 "Nguồn" = AI when Sprint HOW LLM proposed (not capacity windows alone). */
    fromLlm:
      goalSource === 'llm' ||
      allocationSource === 'llm' ||
      (executionStatus === 'draft_ready' && goalSource !== 'none'),
  };
}

/**
 * Human label keys for i18n — use with requirements.gate2SprintExec_*
 */
export function sprintExecutionLabelKey(executionStatus) {
  const key = String(executionStatus || '').trim();
  if (!key) return null;
  return `requirements.gate2SprintExec_${key}`;
}

export function sprintValidationLabelKey(validationStatus) {
  const key = String(validationStatus || '').trim();
  if (!key) return null;
  return `requirements.gate2SprintValid_${key}`;
}

export { EXECUTION as SPRINT_EXECUTION_STATUS };

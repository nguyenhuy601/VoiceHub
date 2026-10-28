/**
 * Finalize sprint container patch — materialize only when draft_ready / explicit apply.
 * No heuristicAssign fallback.
 */

const { confirmationFor } = require('./sprintFacts');
const { applyAllocationToSchedulePlan } = require('../../engines/sprintAllocateFromPbis');
const {
  EXECUTION_STATUS,
  GOAL_SOURCE,
  VALIDATION_STATUS,
} = require('./sprintSchema');

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pack(container, schedulePlan) {
  return {
    container: {
      ...container,
      planning: {
        ...(container.planning || {}),
        schedulePlan,
        backlog: container.planning?.backlog,
      },
    },
    meta: schedulePlan.meta,
  };
}

/**
 * Build schedulePlan meta + optional materialize from expanded allocation.
 */
function finalizeSprintPlan({
  container = {},
  facts = {},
  expanded = null,
  allocationValidation = null,
  executionStatus = EXECUTION_STATUS.INCOMPLETE,
  goalSource = GOAL_SOURCE.NONE,
  allocationProposal = null,
  errors = [],
  retryBudget = null,
  rejectedInvent = [],
} = {}) {
  const sourcePlan = container?.planning?.schedulePlan || {};
  const factSprintById = new Map(asArray(facts.sprints).map((s) => [String(s.id), s]));

  let schedulePlan = { ...sourcePlan };
  const shouldMaterialize =
    executionStatus === EXECUTION_STATUS.DRAFT_READY &&
    expanded &&
    allocationValidation?.status === VALIDATION_STATUS.VALIDATED;

  if (shouldMaterialize) {
    const allocation = {
      sprints: asArray(expanded.sprints).map((sprint) => {
        const fact = factSprintById.get(String(sprint.id));
        const feasibility = fact?.feasibility || 'unverified';
        return {
          ...sprint,
          feasibility,
          confirmation: confirmationFor(feasibility, {
            hardGate: Boolean(facts.capacity?.hardGate),
            capacityConflictCount: (facts.capacity?.conflicts || []).length,
            dodGap: (facts.qaOutsideSprint || []).length > 0,
          }),
        };
      }),
      deferred: asArray(expanded.deferred),
      conflicts: [],
      splitProposals: [],
      unallocated: asArray(expanded.unallocated),
      meta: { ...(expanded.meta || {}) },
    };
    schedulePlan = applyAllocationToSchedulePlan(sourcePlan, allocation);
  }

  schedulePlan.openQuestions = [
    ...asArray(facts.openQuestions),
    ...asArray(allocationProposal?.openQuestions),
  ];
  const fromLlm =
    goalSource === GOAL_SOURCE.LLM ||
    (allocationProposal && typeof allocationProposal === 'object') ||
    executionStatus === EXECUTION_STATUS.DRAFT_READY;
  schedulePlan.meta = {
    ...(schedulePlan.meta || {}),
    // Provenance for Gate2 "Nguồn": llm only when Sprint HOW actually proposed via LLM
    allocationSource: fromLlm ? 'llm' : 'none',
    sprintPlanningSource: fromLlm ? 'llm' : 'schedule_windows',
    goalSource,
    executionStatus,
    allocationValidation: allocationValidation
      ? {
          status: allocationValidation.status,
          checks: allocationValidation.checks,
          issues: allocationValidation.issues,
          meta: allocationValidation.meta,
        }
      : null,
    lastAllocationProposal: allocationProposal || null,
    sprintPlanningReady: executionStatus === EXECUTION_STATUS.DRAFT_READY,
    rejectedInvent,
    errors: asArray(errors),
    retryBudget: retryBudget
      ? {
          usedApiCalls: retryBudget.usedApiCalls,
          maxApiCalls: retryBudget.maxApiCalls,
          usedValidationRepairs: retryBudget.usedValidationRepairs,
          maxValidationRepairs: retryBudget.maxValidationRepairs,
        }
      : null,
    sprintLengthDays: sourcePlan.meta?.sprintLengthDays,
  };

  return pack(container, schedulePlan);
}

/**
 * Legacy wrapper — no heuristic. Skip/LLM fail → incomplete, no auto-assign.
 * Prefer finalizeSprintPlan from graph.
 */
function acceptSprint({
  raw = {},
  container = {},
  facts = {},
  skippedReason = null,
  expanded = null,
  allocationValidation = null,
  executionStatus = null,
} = {}) {
  const status =
    executionStatus ||
    (skippedReason || !facts?.ok
      ? facts?.ok === false || skippedReason === 'semantic_incomplete'
        ? EXECUTION_STATUS.BLOCKED
        : EXECUTION_STATUS.INCOMPLETE
      : EXECUTION_STATUS.INCOMPLETE);

  return finalizeSprintPlan({
    container,
    facts,
    expanded,
    allocationValidation,
    executionStatus: status,
    goalSource: GOAL_SOURCE.NONE,
    allocationProposal: raw && Object.keys(raw).length ? raw : null,
    errors: skippedReason
      ? [{ code: 'sprint_skipped', message: String(skippedReason), node: 'accept' }]
      : [],
  });
}

module.exports = {
  acceptSprint,
  finalizeSprintPlan,
};

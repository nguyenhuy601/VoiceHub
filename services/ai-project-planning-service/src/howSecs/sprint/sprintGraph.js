/**
 * Sprint sec — LangGraph: prepare → LLM propose → expand+validate → repair|end.
 * No heuristic fallback.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { buildSprintFacts } = require('./sprintFacts');
const { proposeSprintAllocation } = require('./sprintPropose');
const { finalizeSprintPlan } = require('./sprintAccept');
const { expandSprintAssignment } = require('../../engines/expandSprintAssignment');
const { validateSprintAllocation } = require('../../engines/validateSprintAllocation');
const { packSprintRepairContext } = require('./packSprintRepairContext');
const {
  defaultRetryBudget,
  beginApiCall,
  canCallApi,
  canValidationRepair,
  markValidationRepair,
} = require('./sprintRetryBudget');
const {
  EXECUTION_STATUS,
  GOAL_SOURCE,
  VALIDATION_STATUS,
} = require('./sprintSchema');

function field() {
  return Annotation();
}

function clip(value, max = 80) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function pushError(errors, entry) {
  return [...(Array.isArray(errors) ? errors : []), entry];
}

async function buildSprintSemantic({
  pack = {},
  container = {},
  env = process.env,
  contextPackage = null,
  snapshot = null,
  snapshotId = null,
} = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const facts = buildSprintFacts({ container, pack });
  const layer = await assembleHowToolContext({
    purpose: 'SPRINT',
    pack,
    container,
    env,
    contextPackage,
    snapshot,
    snapshotId,
  });
  const layerSlots = missingSlotsFor('SPRINT', layer);
  const missingSlots = [...(facts.missingSlots || []), ...layerSlots];
  // Facts (windows/PBI/capacity) gate allocation; layer slots are advisory unless facts fail.
  void contextAllowsWork;
  return {
    ok: facts.ok,
    missingSlots,
    openQuestions: facts.openQuestions,
    allowLists: facts.allowLists,
    facts,
    semantic: {
      business: {
        locale,
        projectName: clip(pack.overview?.name || pack.name, 80),
        goals: (pack.businessGoals || []).map((goal) => clip(goal.name || goal.title || goal, 80)),
      },
      system: {
        sprintLengthDays: container?.planning?.schedulePlan?.meta?.sprintLengthDays ?? null,
        cpmPresent: facts.cpmPresent,
        projectDurationHours: facts.projectDurationHours,
      },
      upstream: {
        sprintIds: facts.allowLists.sprintIds,
        pbiIds: facts.allowLists.pbiIds,
      },
      // layer intentionally omitted from prompt path (slimSemanticForPrompt)
    },
  };
}

const SprintState = Annotation.Root({
  pack: field(),
  container: field(),
  // Runtime-only: not intended for checkpoint serialization of functions
  env: field(),
  generateJsonFn: field(),
  contextPackage: field(),
  snapshot: field(),
  snapshotId: field(),
  runId: field(),
  abortSignal: field(),
  semanticOut: field(),
  facts: field(),
  retryBudget: field(),
  allocationProposal: field(),
  expanded: field(),
  allocationValidation: field(),
  repairContext: field(),
  executionStatus: field(),
  goalSource: field(),
  errors: field(),
  result: field(),
  containerPatch: field(),
  route: field(),
});

function isCancelled(state) {
  return Boolean(state.abortSignal?.aborted);
}

function buildSprintSecGraph() {
  const graph = new StateGraph(SprintState);

  graph.addNode('prepare', async (state) => {
    if (isCancelled(state)) {
      return {
        executionStatus: EXECUTION_STATUS.CANCELLED,
        errors: pushError(state.errors, {
          code: 'cancelled',
          message: 'Sprint subgraph cancelled',
          node: 'prepare',
        }),
        route: 'finalize',
      };
    }
    const semanticOut = await buildSprintSemantic({
      pack: state.pack,
      container: state.container,
      env: state.env,
      contextPackage: state.contextPackage,
      snapshot: state.snapshot,
      snapshotId: state.snapshotId,
    });
    const budget = state.retryBudget || defaultRetryBudget(state.env || {});
    if (!semanticOut.ok || !semanticOut.facts?.ok) {
      return {
        semanticOut,
        facts: semanticOut.facts,
        retryBudget: budget,
        executionStatus: EXECUTION_STATUS.BLOCKED,
        goalSource: GOAL_SOURCE.NONE,
        errors: pushError(state.errors, {
          code: 'missing_required_inputs',
          message: (semanticOut.missingSlots || []).join(',') || 'semantic_incomplete',
          node: 'prepare',
        }),
        route: 'finalize',
      };
    }
    if (!isLlmEnabled(state.env)) {
      return {
        semanticOut,
        facts: semanticOut.facts,
        retryBudget: budget,
        executionStatus: EXECUTION_STATUS.INCOMPLETE,
        goalSource: GOAL_SOURCE.NONE,
        errors: pushError(state.errors, {
          code: 'LLM_off',
          message: 'LLM disabled — không auto-assign Story vào Sprint',
          node: 'prepare',
        }),
        route: 'finalize',
      };
    }
    return {
      semanticOut,
      facts: semanticOut.facts,
      retryBudget: budget,
      errors: state.errors || [],
      route: 'propose',
    };
  });

  graph.addNode('propose', async (state) => {
    if (isCancelled(state)) {
      return {
        executionStatus: EXECUTION_STATUS.CANCELLED,
        route: 'finalize',
        errors: pushError(state.errors, {
          code: 'cancelled',
          message: 'cancelled',
          node: 'propose',
        }),
      };
    }
    let budget = state.retryBudget || defaultRetryBudget(state.env || {});
    if (!canCallApi(budget)) {
      return {
        executionStatus: EXECUTION_STATUS.INCOMPLETE,
        goalSource: GOAL_SOURCE.NONE,
        route: 'finalize',
        errors: pushError(state.errors, {
          code: 'retry_exhausted',
          message: 'Hết ngân sách gọi LLM',
          node: 'propose',
        }),
      };
    }
    budget = beginApiCall(budget);
    const proposed = await proposeSprintAllocation({
      semantic: state.semanticOut?.semantic,
      facts: state.facts || state.semanticOut?.facts,
      env: state.env,
      generateJsonFn: state.generateJsonFn,
      repairContext: state.repairContext || null,
      timeoutMs: budget.perCallTimeoutMs,
    });
    if (!proposed.ok) {
      const reason = proposed.meta?.fallbackReason || 'llm_failed';
      const canRetryTransport =
        canCallApi(budget) &&
        ['llm_error', 'timeout', 'llm_skipped'].some((t) => String(reason).includes(t));
      if (canRetryTransport) {
        return {
          retryBudget: budget,
          route: 'propose',
          errors: pushError(state.errors, {
            code: reason,
            message: proposed.meta?.error || reason,
            node: 'propose',
          }),
        };
      }
      return {
        retryBudget: budget,
        allocationProposal: proposed.data,
        executionStatus: EXECUTION_STATUS.INCOMPLETE,
        goalSource: GOAL_SOURCE.NONE,
        route: 'finalize',
        errors: pushError(state.errors, {
          code: reason,
          message: proposed.meta?.error || reason,
          node: 'propose',
        }),
      };
    }
    return {
      retryBudget: budget,
      allocationProposal: proposed.data,
      goalSource: GOAL_SOURCE.LLM,
      route: 'validate',
    };
  });

  graph.addNode('validate', async (state) => {
    if (isCancelled(state)) {
      return {
        executionStatus: EXECUTION_STATUS.CANCELLED,
        route: 'finalize',
      };
    }
    const facts = state.facts || {};
    const sourcePlan = state.container?.planning?.schedulePlan || {};
    try {
      const expanded = expandSprintAssignment({
        sprints: sourcePlan.sprints || facts.sprints || [],
        rawProposal: state.allocationProposal || {},
        pbis: facts.pbis || [],
        allowLists: facts.allowLists || {},
      });
      // Attach capacity from facts/windows onto expanded sprints
      const factById = new Map((facts.sprints || []).map((s) => [String(s.id), s]));
      expanded.sprints = expanded.sprints.map((s) => {
        const fact = factById.get(String(s.id));
        const cap =
          s.capacityHours != null
            ? s.capacityHours
            : fact?.capacityHours != null
              ? fact.capacityHours
              : sourcePlan.meta?.teamCapacityHoursPerSprint ?? null;
        return {
          ...s,
          startDate: s.startDate || fact?.startDate,
          endDate: s.endDate || fact?.endDate,
          capacityHours: cap != null && Number(cap) > 0 ? Number(cap) : s.capacityHours,
        };
      });

      const allocationValidation = validateSprintAllocation({
        expanded,
        facts,
        inventIssues: expanded.inventIssues || [],
      });

      if (allocationValidation.status === VALIDATION_STATUS.VALIDATED) {
        return {
          expanded,
          allocationValidation,
          executionStatus: EXECUTION_STATUS.DRAFT_READY,
          route: 'finalize',
        };
      }
      if (allocationValidation.status === VALIDATION_STATUS.INSUFFICIENT_DATA) {
        return {
          expanded,
          allocationValidation,
          executionStatus: EXECUTION_STATUS.BLOCKED,
          route: 'finalize',
        };
      }
      // invalid
      let budget = state.retryBudget;
      if (canValidationRepair(budget)) {
        budget = markValidationRepair(budget);
        const repairContext = packSprintRepairContext({
          facts,
          allocationProposal: state.allocationProposal,
          allocationValidation,
        });
        return {
          expanded,
          allocationValidation,
          repairContext,
          retryBudget: budget,
          route: 'propose',
        };
      }
      return {
        expanded,
        allocationValidation,
        executionStatus: EXECUTION_STATUS.INCOMPLETE,
        route: 'finalize',
        errors: pushError(state.errors, {
          code: 'validation_exhausted',
          message: 'Hết ngân sách sửa phân bổ sau validate',
          node: 'validate',
        }),
      };
    } catch (err) {
      return {
        executionStatus: EXECUTION_STATUS.FAILED,
        route: 'finalize',
        errors: pushError(state.errors, {
          code: 'validate_throw',
          message: String(err?.message || err).slice(0, 200),
          node: 'validate',
        }),
      };
    }
  });

  graph.addNode('finalize', async (state) => {
    const executionStatus = state.executionStatus || EXECUTION_STATUS.INCOMPLETE;
    const finalized = finalizeSprintPlan({
      container: state.container || {},
      facts: state.facts || state.semanticOut?.facts || {},
      expanded: state.expanded,
      allocationValidation: state.allocationValidation,
      executionStatus,
      goalSource: state.goalSource || GOAL_SOURCE.NONE,
      allocationProposal: state.allocationProposal,
      errors: state.errors || [],
      retryBudget: state.retryBudget,
    });
    return {
      result: {
        schedulePlan: finalized.container?.planning?.schedulePlan,
        meta: finalized.meta,
        executionStatus,
      },
      containerPatch: finalized.container,
      route: 'end',
    };
  });

  graph.addEdge(START, 'prepare');
  graph.addConditionalEdges('prepare', (state) =>
    state.route === 'propose' ? 'propose' : 'finalize'
  );
  graph.addConditionalEdges('propose', (state) => {
    if (state.route === 'propose') return 'propose';
    if (state.route === 'validate') return 'validate';
    return 'finalize';
  });
  graph.addConditionalEdges('validate', (state) =>
    state.route === 'propose' ? 'propose' : 'finalize'
  );
  graph.addEdge('finalize', END);

  return graph.compile();
}

let compiled = null;
async function runSprintSecGraph(input = {}) {
  if (!compiled) compiled = buildSprintSecGraph();
  const out = await compiled.invoke({
    pack: input.pack || {},
    container: input.container || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshot: input.snapshot || null,
    snapshotId: input.snapshotId || null,
    runId: input.runId || null,
    abortSignal: input.abortSignal || null,
    errors: [],
  });
  return {
    result: out.result,
    containerPatch: out.containerPatch,
    executionStatus: out.executionStatus || out.result?.executionStatus,
    errors: out.errors || out.result?.meta?.errors || [],
  };
}

module.exports = {
  runSprintSecGraph,
  buildSprintSecGraph,
  buildSprintSemantic,
  finalizeSprintPlan,
};

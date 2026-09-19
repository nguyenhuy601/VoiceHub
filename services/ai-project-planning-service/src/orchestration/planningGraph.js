const { checkFeasibility } = require('../validation/feasibility');
const { assembleContextPackage } = require('../retrieval/contextAssembly');
const { runIntelligenceStub } = require('../runtime/intelligenceRuntime');
const { planningSkill } = require('../skills/planning.skill');
const { requirementUnderstandingSkill } = require('../skills/requirementUnderstanding.skill');

/**
 * G8 Orchestrator stub — pure JS sequential state machine (no LangGraph dep).
 * Nodes: understand → plan → select → execute → observe → evaluateLocal → feasibility
 *
 * evaluateLocal (G8) ≠ feasibility (G13):
 * - evaluateLocal: enough information to continue the loop?
 * - feasibility: is the whole plan feasible for Gate 2?
 */

const NODES = [
  'understand',
  'plan',
  'select',
  'execute',
  'observe',
  'evaluateLocal',
  'feasibility',
];

/**
 * @param {object} input
 * @returns {Promise<object>} final agent state
 */
async function runPlanningGraph(input = {}) {
  const state = {
    runId: input.runId || null,
    snapshotId: input.snapshotId || null,
    node: null,
    iteration: 0,
    contextPackage: null,
    toolResults: [],
    evaluate: null,
    feasibility: null,
    history: [],
  };

  for (const node of NODES) {
    state.node = node;
    state.history.push(node);

    if (node === 'understand') {
      state.contextPackage = assembleContextPackage({
        query: input.query || 'requirements',
        corpus: input.corpus || [],
      });
      const intel = runIntelligenceStub({
        skill: requirementUnderstandingSkill,
        contextPackage: state.contextPackage,
        objective: 'understand',
        structuredCandidate: { action: 'continue' },
      });
      state.understand = { intel, skill: requirementUnderstandingSkill.skillId };
    } else if (node === 'plan' || node === 'select') {
      const intel = runIntelligenceStub({
        skill: planningSkill,
        contextPackage: state.contextPackage,
        objective: node,
        structuredCandidate: { action: node === 'select' ? 'select_tools' : 'plan' },
        toolCalls: node === 'select' ? [{ toolName: 'EffortTool', arguments: {} }] : [],
      });
      state[node] = intel;
    } else if (node === 'execute') {
      state.toolResults.push({ toolName: 'stub', stub: true });
    } else if (node === 'observe') {
      state.observe = { ok: true };
    } else if (node === 'evaluateLocal') {
      // G8 Evaluate: informational sufficiency — NOT plan feasibility
      const hasContext = Boolean(state.contextPackage);
      state.evaluate = {
        kind: 'evaluate_local',
        enoughInfoToContinue: hasContext,
        reason: hasContext ? 'context_present' : 'missing_context',
      };
    } else if (node === 'feasibility') {
      // G13 Feasibility: whole-plan validator
      state.feasibility = checkFeasibility({
        runId: state.runId,
        snapshotId: state.snapshotId,
        flags: input.feasibilityFlags || {},
        ...input.planState,
      });
    }

    state.iteration += 1;
  }

  return state;
}

module.exports = { runPlanningGraph, NODES };

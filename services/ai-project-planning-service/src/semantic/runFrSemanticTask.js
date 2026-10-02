/**
 * FR SemanticTask entry — G4 pipeline only via Runtime(task=FR).
 */

const { runSemanticTask } = require('./runSemanticTask');
const { TASK_POLICIES } = require('./semanticTaskRegistry');

/**
 * @param {{
 *   snapshot?: object,
 *   pack?: object,
 *   g4Opts?: object,
 *   onProgress?: Function,
 *   runId?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
async function runFrSemanticTask(opts = {}) {
  const { runG4Understanding } = require('../engines/g4Understanding');

  return runSemanticTask({
    taskId: 'fr',
    // FR uses snapshot/corpus; empty-sheet handled inside G4 (data gate / candidates).
    rows: [{ id: 'fr-runtime-sentinel' }],
    pack: opts.pack || {},
    env: opts.env || process.env,
    frRuntimeFn: async () => {
      const g4Out = await runG4Understanding({
        snapshot: opts.snapshot,
        pack: opts.pack,
        ...(opts.g4Opts || {}),
        onProgress: opts.onProgress,
      });

      if (g4Out?.paused || g4Out?.blocked) {
        return {
          items: [],
          llmCalls: Number(g4Out?.g4Understanding?.meta?.llm?.calls) || 0,
          semanticOutput: null,
          proposalFragment: null,
          coverage: { status: 'PARTIAL', reason: g4Out?.paused ? 'data_gate' : 'blocked' },
          meta: { g4Out },
          paused: Boolean(g4Out?.paused),
          blocked: Boolean(g4Out?.blocked),
          g4Out,
        };
      }

      const {
        buildFunctionalRequirementProposal,
      } = require('../requirementAnalysis/functionalRequirements/buildFunctionalRequirementProposal');
      const {
        validateFunctionalRequirements,
      } = require('../requirementAnalysis/functionalRequirements/validateFunctionalRequirements');

      const { evaluateConflictAmbiguityGate } = require('../validation/evaluateConflictAmbiguityGate');
      const conflictAmbiguityGate = evaluateConflictAmbiguityGate({
        g4Understanding: g4Out.g4Understanding,
        validation: g4Out.validation,
      });
      const g4Understanding = {
        ...g4Out.g4Understanding,
        conflictAmbiguityGate,
        meta: {
          ...(g4Out.g4Understanding?.meta || {}),
          conflictAmbiguityGate,
        },
      };

      const { synthesis: _s, ...sem } = g4Understanding;
      const validated = validateFunctionalRequirements({ g4Understanding: sem });
      const proposalFragment = buildFunctionalRequirementProposal({
        validated,
        generationId: opts.runId || null,
      });

      return {
        items: proposalFragment?.items || [],
        llmCalls: Number(g4Understanding?.meta?.llm?.calls) || (g4Understanding?.meta?.llm ? 1 : 0),
        semanticOutput: g4Understanding,
        proposalFragment,
        coverage: { status: 'AVAILABLE' },
        meta: { conflictAmbiguityGate, g4Out },
        g4Understanding,
        conflictAmbiguityGate,
        g4Out,
      };
    },
  }).then((sem) => {
    const g4Meta = sem.meta || {};
    return {
      ...sem,
      status: sem.status || TASK_POLICIES.RUN,
      paused: Boolean(g4Meta.g4Out?.paused || sem.meta?.paused),
      blocked: Boolean(g4Meta.g4Out?.blocked || sem.meta?.blocked),
      g4Understanding: g4Meta.g4Understanding || sem.semanticOutput,
      conflictAmbiguityGate: g4Meta.conflictAmbiguityGate,
      proposalFragment: sem.proposalFragment || g4Meta.proposalFragment || null,
      g4Out: g4Meta.g4Out,
    };
  });
}

module.exports = { runFrSemanticTask };

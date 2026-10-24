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
function failClosedProposedFr(reason, meta = null) {
  const proposalFragment = {
    section: 'functionalRequirements',
    items: [],
    relations: [],
    clarificationQuestions: [],
    meta: {
      frFromCrSkipped: true,
      frFromCrReason: reason,
      coverage: { status: 'NO_DATA', reason },
    },
  };
  return {
    status: TASK_POLICIES.RUN,
    items: [],
    llmCalls: Number(meta?.llmCalls) || 0,
    proposalFragment,
    coverage: { status: 'NO_DATA', reason },
    semanticOutput: null,
    g4Understanding: { requirements: [], meta: { frFromCrReason: reason } },
    meta: { frFromCr: meta, fallbackReason: reason },
  };
}

async function runFrSemanticTask(opts = {}) {
  const { runG4Understanding } = require('../engines/g4Understanding');
  const env = opts.env || process.env;
  const packIn = opts.pack || {};
  const { isCustomerRawIntakePack } = require('./rawSectionDerivePolicy');
  const { isWhatFrFromCrFlagOn } = require('../contracts/frFromCrContract');
  const {
    listCustomerRawIntake,
    proposeFrFromCrWithLlm,
    overlayAnalyzedFr,
    mergeProposedFrRequirements,
    isCustomerRequirementId,
  } = require('../engines/frProposeFromCrLlm');

  const crIntake = listCustomerRawIntake(packIn, opts.snapshot, env);
  const listedIds = []
    .concat(packIn.functionalRequirements || [], opts.snapshot?.functionalRequirements || [])
    .map((row) => String(row?.logicalId || row?.id || row?.externalId || '').trim())
    .filter(Boolean);
  const hasAnalyzedFr = listedIds.some((id) => !isCustomerRequirementId(id));
  // Customer Raw pack always proposes FR-*. A non-raw pack proposes only when every listed id is CR.
  const customerRaw =
    crIntake.length > 0 && (isCustomerRawIntakePack(packIn) || !hasAnalyzedFr);
  let snapshot = opts.snapshot;
  let pack = packIn;
  /** @type {Map<string, object>} */
  let proposedById = new Map();
  let frFromCrMeta = null;

  if (customerRaw && crIntake.length) {
    if (!isWhatFrFromCrFlagOn(env)) {
      return failClosedProposedFr('WHAT_FR_FROM_CR_off');
    }
    const proposed = await proposeFrFromCrWithLlm({
      pack: packIn,
      snapshot: opts.snapshot,
      env,
      generateJsonFn: opts.generateJsonFn,
    });
    frFromCrMeta = proposed.meta || null;
    if (!proposed.ok || !Array.isArray(proposed.items) || !proposed.items.length) {
      return failClosedProposedFr(
        proposed.meta?.fallbackReason || 'missing_proposed_fr',
        frFromCrMeta
      );
    }
    const overlaid = overlayAnalyzedFr(opts.snapshot, packIn, proposed.items);
    snapshot = overlaid.snapshot;
    pack = overlaid.pack;
    proposedById = new Map(proposed.items.map((row) => [String(row.id), row]));
  }

  return runSemanticTask({
    taskId: 'fr',
    // FR uses snapshot/corpus; empty-sheet handled inside G4 (data gate / candidates).
    rows: [{ id: 'fr-runtime-sentinel' }],
    pack,
    env,
    frRuntimeFn: async () => {
      // Understand node already built priorPartial from CR intake. Resume would
      // keep those CR ids and the post-filter would drop every proposed FR.
      const g4Opts = { ...(opts.g4Opts || {}) };
      if (proposedById.size) delete g4Opts.priorPartial;
      const g4Out = await runG4Understanding({
        snapshot,
        pack,
        ...g4Opts,
        onProgress: opts.onProgress,
      });

      if ((g4Out?.paused || g4Out?.blocked) && !proposedById.size) {
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

      const {
        evaluateRequirementIntegrityGate,
      } = require('../validation/requirementIntegrityGate');
      // RULE-RIG: persist Integrity Gate; keep conflictAmbiguityGate key for compat.
      const g4Body =
        g4Out?.g4Understanding && typeof g4Out.g4Understanding === 'object'
          ? g4Out.g4Understanding
          : { requirements: [], relationships: [], ambiguities: [], assumptions: [], meta: {} };
      const requirementIntegrityGate = evaluateRequirementIntegrityGate({
        g4Understanding: g4Body,
        validation: g4Out?.validation,
      });
      const conflictAmbiguityGate = requirementIntegrityGate;
      const g4Understanding = {
        ...g4Body,
        conflictAmbiguityGate,
        requirementIntegrityGate,
        meta: {
          ...(g4Body.meta || {}),
          conflictAmbiguityGate,
          requirementIntegrityGate,
        },
      };

      const { synthesis: _s, ...sem } = g4Understanding;
      if (proposedById.size) {
        const g4Count = Array.isArray(sem.requirements) ? sem.requirements.length : 0;
        sem.requirements = mergeProposedFrRequirements(
          [...proposedById.values()],
          sem.requirements
        );
        console.info(
          `[fr-from-cr] proposalItems=${sem.requirements.length} g4Req=${g4Count}`
        );
      } else if (Array.isArray(sem.requirements)) {
        sem.requirements = sem.requirements.filter(
          (row) => !isCustomerRequirementId(row?.id || row?.frId)
        );
      }
      const validated = validateFunctionalRequirements({ g4Understanding: sem });
      const proposalFragment = buildFunctionalRequirementProposal({
        validated,
        generationId: opts.runId || null,
      });

      // Phase WHAT FrDecompose — Epic→Story SoT for Gate1 / HOW (fail-soft).
      let frDecomposeMeta = null;
      try {
        const {
          proposeFrDecomposeWithLlm,
        } = require('../engines/frDecomposeLlm');
        const semanticBrief = {
          business: {
            locale: opts.pack?.aiAnalysis?.deriveLocale || opts.pack?.locale || null,
          },
          ambiguities: Array.isArray(sem.ambiguities) ? sem.ambiguities.slice(0, 12) : [],
        };
        const dec = await proposeFrDecomposeWithLlm({
          pack: opts.pack || {},
          proposalItems: proposalFragment?.items || [],
          semantic: semanticBrief,
          env: opts.env || process.env,
          generateJsonFn: opts.generateJsonFn,
        });
        frDecomposeMeta = dec.meta || null;
        if (dec.ok && dec.backlogStructure) {
          proposalFragment.backlogStructure = dec.backlogStructure;
          const cqFromDecompose = (dec.backlogStructure.openQuestions || []).map((q, i) => ({
            logicalId: q.code || `CQ-DECOMPOSE-${i + 1}`,
            requirementId: Array.isArray(q.frIds) ? q.frIds[0] || null : null,
            kind: 'decompose',
            message: q.message || '',
            status: 'NEEDS_CONFIRMATION',
          }));
          if (cqFromDecompose.length) {
            proposalFragment.clarificationQuestions = [
              ...(proposalFragment.clarificationQuestions || []),
              ...cqFromDecompose,
            ];
          }
        } else if (dec.meta?.reasonCodes) {
          proposalFragment.meta = {
            ...(proposalFragment.meta || {}),
            frDecomposeSkipped: true,
            frDecomposeReason: dec.meta.fallbackReason || dec.meta.reasonCodes.join(','),
          };
        }
      } catch (err) {
        console.warn(
          '[runFrSemanticTask] frDecompose fail-soft',
          String(err?.message || err)
        );
        proposalFragment.meta = {
          ...(proposalFragment.meta || {}),
          frDecomposeSkipped: true,
          frDecomposeReason: String(err?.message || err || 'fr_decompose_throw'),
        };
      }

      const decompCalls = Number(frDecomposeMeta?.llmCalls) || 0;
      const g4Calls =
        Number(g4Understanding?.meta?.llm?.calls) || (g4Understanding?.meta?.llm ? 1 : 0);

      return {
        items: proposalFragment?.items || [],
        llmCalls: g4Calls + decompCalls,
        semanticOutput: g4Understanding,
        proposalFragment,
        coverage: { status: 'AVAILABLE' },
        meta: {
          conflictAmbiguityGate,
          requirementIntegrityGate,
          g4Out,
          frDecompose: frDecomposeMeta,
          frFromCr: frFromCrMeta,
        },
        g4Understanding,
        conflictAmbiguityGate,
        requirementIntegrityGate,
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
      requirementIntegrityGate:
        g4Meta.requirementIntegrityGate || g4Meta.conflictAmbiguityGate,
      proposalFragment: sem.proposalFragment || g4Meta.proposalFragment || null,
      g4Out: g4Meta.g4Out,
    };
  });
}

module.exports = { runFrSemanticTask };

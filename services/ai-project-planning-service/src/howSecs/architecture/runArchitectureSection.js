/**
 * Architecture sec pipeline (this folder only): Semantic → Fact → Propose → Accept.
 */

const { buildArchitectureSemantic } = require('./architectureSemantic');
const { buildArchitectureFacts } = require('./architectureFacts');
const { proposeArchitectureWithLlm } = require('./architecturePropose');
const {
  acceptArchitectureProposal,
  toArchitectureEngineResult,
} = require('./architectureAccept');
const { applyArchitectureToContainer } = require('../../engines/architecture');

/**
 * @returns {Promise<{ result: object, containerPatch: object, semantic: object|null, facts: object|null }>}
 */
async function runArchitectureSection({
  pack = {},
  container = {},
  toolData = {},
  snapshot = null,
  env = process.env,
  generateJsonFn = null,
} = {}) {
  const semOut = buildArchitectureSemantic({
    pack,
    container,
    toolData,
    snapshot,
    env,
  });

  if (!semOut.ok) {
    const accepted = acceptArchitectureProposal({
      raw: { items: [], openQuestions: semOut.openQuestions },
      semantic: semOut.semantic,
      facts: { allowLists: semOut.allowLists, catalogFacts: [] },
      openQuestionsIn: [
        ...semOut.openQuestions,
        {
          code: 'ARCH_SEMANTIC_INCOMPLETE',
          message: `Thiếu semantic: ${semOut.missingSlots.join(', ')}`,
        },
      ],
    });
    const result = toArchitectureEngineResult(accepted, { llmCalls: 0 });
    result.meta.source = 'semantic_incomplete';
    result.meta.missingSlots = semOut.missingSlots;
    return {
      result,
      containerPatch: applyArchitectureToContainer(container, result),
      semantic: semOut.semantic,
      facts: null,
    };
  }

  const facts = buildArchitectureFacts({
    semantic: semOut.semantic,
    allowLists: semOut.allowLists,
  });

  const proposed = await proposeArchitectureWithLlm({
    semantic: semOut.semantic,
    facts,
    env,
    generateJsonFn,
  });

  const accepted = acceptArchitectureProposal({
    raw: proposed.ok ? proposed.data : { items: [], openQuestions: [] },
    semantic: semOut.semantic,
    facts,
    openQuestionsIn: [
      ...semOut.openQuestions,
      ...(proposed.ok
        ? []
        : [
            {
              code: 'ARCH_LLM_SKIP_OR_FAIL',
              message: proposed.meta?.fallbackReason || 'llm_unavailable',
            },
          ]),
    ],
  });

  const result = toArchitectureEngineResult(accepted, {
    model: proposed.meta?.model || null,
    llmCalls: proposed.meta?.llmCalls || 0,
  });
  if (!proposed.ok) {
    result.meta.llmFallback = proposed.meta?.fallbackReason || 'llm_failed';
  }

  return {
    result,
    containerPatch: applyArchitectureToContainer(container, result),
    semantic: semOut.semantic,
    facts,
  };
}

module.exports = { runArchitectureSection };

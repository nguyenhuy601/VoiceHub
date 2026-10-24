/**
 * Architecture LLM Propose — must consume SEMANTIC first; no invent outside ALLOW.
 */

const { isLlmEnabled } = require('../../runtime/ollamaGenerate');
const { invokeHowSemanticLlm } = require('../../engines/howSemanticLlm');
const { LAYERS, IMPACT_LEVELS } = require('./architectureSchema');
const { factsPromptSlice } = require('./architectureFacts');

function buildArchitecturePrompt({ semantic, facts, languageInstruction = '' }) {
  const allow = facts?.allowLists || semantic?.allowLists || {};
  const shape = {
    items: [
      {
        impactId: 'string',
        title: 'business title',
        summary: '1-2 sentences business impact',
        component: 'name from capability/catalog or FR-derived label',
        layer: LAYERS.join('|'),
        impactLevel: IMPACT_LEVELS.join('|'),
        sourceFrIds: ['FR id from ALLOW only'],
        capabilityIds: ['capability id from ALLOW only'],
      },
    ],
    openQuestions: [{ code: 'string', message: 'string' }],
  };

  const system = [
    'You are a solution architect for an enterprise delivery project.',
    'Return JSON only matching SHAPE.',
    'Read SEMANTIC (business + system + upstream) before FACTS.',
    'Use only ids/names in ALLOW. Never invent FR, capability, user, env, API, or database entities not listed.',
    'Every item MUST include sourceFrIds and/or capabilityIds from ALLOW (non-empty when ALLOW has ids).',
    'Prefer one impact row per FR×layer needed; title/summary business-readable; component may reuse capability/catalog name.',
    'If SEMANTIC/FACTS are insufficient, return items:[] and openQuestions — do not mock or invent layers.',
    languageInstruction || '',
  ]
    .filter(Boolean)
    .join(' ');

  const user = [
    `SEMANTIC=${JSON.stringify({
      business: semantic.business,
      system: {
        environments: semantic.system?.environments || [],
        architectureCatalog: semantic.system?.architectureCatalog || [],
      },
      upstream: {
        capabilityBrief: semantic.upstream?.capabilityBrief || [],
        wbsLeafBrief: semantic.upstream?.wbsLeafBrief || [],
        gapBrief: semantic.upstream?.gapBrief || [],
      },
    })}`,
    `FACTS=${JSON.stringify(factsPromptSlice(facts))}`,
    `ALLOW=${JSON.stringify({
      frIds: allow.frIds || [],
      capabilityIds: allow.capabilityIds || [],
      catalogNames: allow.catalogNames || [],
      layers: LAYERS,
      impactLevels: IMPACT_LEVELS,
    })}`,
    `SHAPE=${JSON.stringify(shape)}`,
  ].join('\n');

  return { system, user };
}

/**
 * @returns {Promise<{ ok: boolean, data: object|null, meta: object, skipped?: boolean }>}
 */
async function proposeArchitectureWithLlm({
  semantic = null,
  facts = null,
  env = process.env,
  generateJsonFn = null,
} = {}) {
  if (!semantic || typeof semantic !== 'object') {
    return {
      ok: false,
      data: null,
      skipped: true,
      meta: { fallbackReason: 'missing_SEMANTIC', llmCalls: 0 },
    };
  }
  if (!isLlmEnabled(env)) {
    return {
      ok: false,
      data: null,
      skipped: true,
      meta: { fallbackReason: 'LLM_off', llmCalls: 0 },
    };
  }

  let languageInstruction = '';
  try {
    const { languageInstruction: langFn } = require('../../semantic/buildSemanticDeriveContext');
    languageInstruction = langFn(semantic.business?.locale || 'vi');
  } catch {
    languageInstruction = '';
  }

  const { system, user } = buildArchitecturePrompt({
    semantic,
    facts,
    languageInstruction,
  });

  const llm = await invokeHowSemanticLlm({
    system,
    user,
    env,
    generateJsonFn,
    timeoutMs: 90_000,
  });

  if (!llm.ok) {
    return {
      ok: false,
      data: null,
      meta: {
        fallbackReason: llm.meta?.fallbackReason || 'llm_failed',
        llmCalls: llm.meta?.llmCalls || 1,
        model: llm.meta?.model || null,
      },
    };
  }

  return {
    ok: true,
    data: llm.data,
    meta: { llmCalls: 1, model: llm.meta?.model || null },
  };
}

module.exports = {
  buildArchitecturePrompt,
  proposeArchitectureWithLlm,
};

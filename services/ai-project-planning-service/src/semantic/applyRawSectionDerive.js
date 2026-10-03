/**

 * Apply Raw derive (LLM + deterministic) onto srsProposal after sheet ingest.

 */



const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');

const { getRegistryEntry } = require('../srsProposal/contracts/analysisEngineRegistry');

const { runAllRawSectionDerives } = require('./runRawSectionDerive');

const { buildActorsFromRaw, buildScopeFromRaw } = require('../srsProposal/engines/actorsFromRaw');
const { buildAssumptionsFromRaw } = require('../srsProposal/engines/assumptionsFromRaw');

const {

  shouldRawDeriveSection,

  isCustomerRawIntakePack,

  isRawSectionDeriveEnabled,

  hasRawDeriveSource,

  LLM_DERIVE_SECTIONS,

  DETERMINISTIC_RAW_SECTIONS,

  isLlmDeriveSectionLocked,

  isDeterministicRawSectionLocked,

} = require('./rawSectionDerivePolicy');

const { TASK_POLICIES } = require('./semanticTaskRegistry');



function sectionEmpty(proposal, section) {

  const items = proposal?.generated?.[section]?.items;

  return !Array.isArray(items) || items.length === 0;

}



const SECTION_BY_ENGINE = Object.freeze({

  bg: 'businessGoals',

  br: 'businessRules',

  bpm: 'processes',

  uc: 'useCases',

  data: 'entities',

  interface: 'interfaces',

  actors: 'actors',

  scope: 'scope',

  assumption: 'assumptions',

});



/**

 * Soft-stamp locked sections so Gate1 shows DERIVE_LOCKED (not false DERIVE_EMPTY).

 */

function stampLockedSection(proposal, resultsById, deriveStatuses, engineId) {

  const entry = getRegistryEntry(engineId);

  const section = SECTION_BY_ENGINE[engineId] || entry?.writesSection;

  if (!section || !sectionEmpty(proposal, section)) return proposal;



  const coverage = { status: 'NO_DATA', reason: 'DERIVE_LOCKED' };

  deriveStatuses[engineId] = 'DERIVE_LOCKED';

  const next = applyProposalFragment(

    proposal,

    {

      section,

      items: [],

      meta: {

        engineId,

        coverage,

        validation: { errors: [], warnings: [] },

        kind: 'raw_section_derive_locked',

      },

    },

    { bumpProposalVersion: false, allowLegacyWrite: engineId === 'actors' || engineId === 'assumption' }

  );

  resultsById[engineId] = {

    execution: { status: 'SKIPPED', diagnostics: [] },

    items: [],

    coverage,

    validation: { errors: [], warnings: [] },

    meta: { engineId, section, rawDerive: true, locked: true },

  };

  return next;

}



/**

 * @param {{

 *   proposal: object,

 *   pack: object,

 *   resultsById?: object,

 *   env?: NodeJS.ProcessEnv,

 *   invokeFn?: Function,

 * }} opts

 */

async function applyRawSectionDerive(opts = {}) {

  const pack = opts.pack || {};

  const env = opts.env || process.env;

  let proposal = opts.proposal;

  const resultsById = { ...(opts.resultsById || {}) };

  const deriveStatuses = {};



  if (

    !isRawSectionDeriveEnabled(env) ||

    !isCustomerRawIntakePack(pack) ||

    !hasRawDeriveSource(pack)

  ) {

    console.info(

      '[raw_derive_skip] enabled=%s customerRaw=%s hasSource=%s',

      isRawSectionDeriveEnabled(env),

      isCustomerRawIntakePack(pack),

      hasRawDeriveSource(pack)

    );

    return {
      proposal,
      resultsById,
      deriveStatuses,
      timingMeta: { bg_derive: { ms: 0, llmCalls: 0, reason: 'raw_derive_skip' } },
    };

  }



  // Deterministic scope when proposal scope empty (actors may be locked)

  if (sectionEmpty(proposal, 'scope') && shouldRawDeriveSection('scope', pack, env)) {

    const scopeOut = buildScopeFromRaw(pack, env, { snapshot: opts.snapshot });

    if (scopeOut.items.length) {

      proposal = applyProposalFragment(

        proposal,

        {

          section: 'scope',

          items: scopeOut.items,

          meta: {

            engineId: 'scope',

            coverage: scopeOut.coverage,

            validation: { errors: [], warnings: [] },

            kind: 'raw_derive_deterministic',

          },

        },

        { bumpProposalVersion: false }

      );

      resultsById.scope = {

        execution: { status: 'SUCCESS', diagnostics: [] },

        items: scopeOut.items,

        coverage: scopeOut.coverage,

        validation: { errors: [], warnings: [] },

        meta: { engineId: 'scope', section: 'scope', rawDerive: true },

      };

    } else {

      resultsById.scope = {

        ...(resultsById.scope || {}),

        items: [],

        coverage: scopeOut.coverage,

        meta: { engineId: 'scope', section: 'scope', rawDerive: true },

      };

    }

    deriveStatuses.scope = scopeOut.coverage?.reason || 'ok';

  }



  if (sectionEmpty(proposal, 'actors') && shouldRawDeriveSection('actors', pack, env)) {

    const actorsOut = buildActorsFromRaw(pack, env);

    if (actorsOut.items.length) {

      proposal = applyProposalFragment(

        proposal,

        {

          section: 'actors',

          items: actorsOut.items,

          meta: {

            engineId: 'actors',

            coverage: actorsOut.coverage,

            validation: { errors: [], warnings: [] },

            kind: 'raw_derive_deterministic',

          },

        },

        { bumpProposalVersion: false, allowLegacyWrite: true }

      );

      resultsById.actors = {

        execution: { status: 'SUCCESS', diagnostics: [] },

        items: actorsOut.items,

        coverage: actorsOut.coverage,

        validation: { errors: [], warnings: [] },

        meta: { engineId: 'actors', section: 'actors', rawDerive: true },

      };

    }

    deriveStatuses.actors = actorsOut.coverage?.reason || 'ok';

  }



  if (sectionEmpty(proposal, 'assumptions') && shouldRawDeriveSection('assumption', pack, env)) {

    const asmOut = buildAssumptionsFromRaw(pack, { snapshot: opts.snapshot });

    if (asmOut.items.length) {

      proposal = applyProposalFragment(

        proposal,

        {

          section: 'assumptions',

          items: asmOut.items,

          meta: {

            engineId: 'assumption',

            coverage: asmOut.coverage,

            validation: { errors: [], warnings: [] },

            kind: 'raw_derive_deterministic',

          },

        },

        { bumpProposalVersion: false, allowLegacyWrite: true }

      );

      resultsById.assumption = {

        execution: { status: 'SUCCESS', diagnostics: [] },

        items: asmOut.items,

        coverage: asmOut.coverage,

        validation: { errors: [], warnings: [] },

        meta: { engineId: 'assumption', section: 'assumptions', rawDerive: true },

      };

    }

    deriveStatuses.assumption = asmOut.coverage?.reason || 'ok';

  }



  // Active LLM derive (UC → BG by default). Throws RAW_DERIVE_FAILED on critical fail.

  const deriveStartedAt = Date.now();
  const derived = await runAllRawSectionDerives({

    pack,

    env,

    invokeFn: opts.invokeFn,
    proposal,
    g4Understanding: opts.g4Understanding,
    evidence: opts.evidence,
    snapshot: opts.snapshot,

  });
  const deriveWallMs = Math.max(0, Date.now() - deriveStartedAt);
  const bgResult = derived.bg || null;

  for (const [engineId, result] of Object.entries(derived)) {

    deriveStatuses[engineId] = result.reason || result.status;

    const entry = getRegistryEntry(engineId);

    const section = result.section || entry?.writesSection;

    if (!section) continue;



    if (result.status === TASK_POLICIES.RUN && result.items?.length) {

      if (!sectionEmpty(proposal, section)) continue;

      proposal = applyProposalFragment(

        proposal,

        {

          section,

          items: result.items,

          meta: {

            engineId,

            coverage: result.coverage,

            validation: { errors: [], warnings: [] },

            kind: 'raw_section_derive',

          },

        },

        { bumpProposalVersion: false }

      );

      resultsById[engineId] = {

        execution: { status: 'SUCCESS', diagnostics: [] },

        items: result.items,

        coverage: result.coverage,

        validation: { errors: [], warnings: [] },

        meta: { engineId, section, rawDerive: true },

      };

      continue;

    }



    // Soft gap for non-critical / skipped (should not reach for active UC/BG — those throw)

    if (sectionEmpty(proposal, section) && result.coverage?.reason) {

      const reason = result.coverage.reason;

      if (reason === 'SHEET_PRESENT') continue;

      proposal = applyProposalFragment(

        proposal,

        {

          section,

          items: [],

          meta: {

            engineId,

            coverage: { status: 'NO_DATA', reason },

            validation: { errors: [], warnings: [] },

            kind: 'raw_section_derive',

          },

        },

        { bumpProposalVersion: false }

      );

      resultsById[engineId] = {

        execution: { status: 'SUCCESS', diagnostics: [] },

        items: [],

        coverage: { status: 'NO_DATA', reason },

        validation: { errors: [], warnings: [] },

        meta: { engineId, section, rawDerive: true },

      };

    }

  }



  // Stamp locked LLM + deterministic sections

  for (const engineId of LLM_DERIVE_SECTIONS) {

    if (isLlmDeriveSectionLocked(engineId, env)) {

      proposal = stampLockedSection(proposal, resultsById, deriveStatuses, engineId);

    }

  }

  for (const engineId of DETERMINISTIC_RAW_SECTIONS) {

    if (isDeterministicRawSectionLocked(engineId, env)) {

      proposal = stampLockedSection(proposal, resultsById, deriveStatuses, engineId);

    }

  }



  const bySection = {};
  let deriveLlmCalls = 0;
  let deriveItems = 0;
  for (const [engineId, result] of Object.entries(derived || {})) {
    const genMs = Number(result?.generationMs);
    const itemsN = Array.isArray(result?.items) ? result.items.length : 0;
    const calls = Number(result?.llmCalls) || 0;
    deriveLlmCalls += calls;
    deriveItems += itemsN;
    bySection[engineId] = {
      ms: Number.isFinite(genMs) ? genMs : null,
      items: itemsN,
      llmCalls: calls,
      reason: result?.reason || result?.status || null,
      promptChars: Number(result?.promptChars) || 0,
      maxTokens: result?.maxTokens ?? null,
      quality: result?.quality || null,
    };
  }

  const timingMeta = {
    // Stage name kept for backward logs; ms = full derive wall (all unlocked secs).
    bg_derive: {
      ms: deriveWallMs,
      wallMs: deriveWallMs,
      evalCount: Number(bgResult?.evalCount) || 0,
      promptEvalCount: Number(bgResult?.promptEvalCount) || 0,
      promptChars: Number(bgResult?.promptChars) || 0,
      maxTokens: bgResult?.maxTokens ?? null,
      reason: bgResult?.reason || deriveStatuses.bg || null,
      items: deriveItems,
      llmCalls: deriveLlmCalls,
      bySection,
    },
  };

  return { proposal, resultsById, deriveStatuses, timingMeta };

}



module.exports = {

  applyRawSectionDerive,

};



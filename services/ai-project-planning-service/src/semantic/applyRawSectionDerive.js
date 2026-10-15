/**
 * Apply Raw derive (LLM + deterministic) onto srsProposal after sheet ingest.
 *
 * Wave-1: Assumption derive removed; scope = extract-first then LLM if still empty.
 */

const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { getRegistryEntry } = require('../srsProposal/contracts/analysisEngineRegistry');
const { runAllRawSectionDerives } = require('./runRawSectionDerive');
const { buildActorsFromRaw, buildScopeFromRaw } = require('../srsProposal/engines/actorsFromRaw');
const { decomposeFrCandidates } = require('../engines/frCandidateDecompose');
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
  nfr: 'nonFunctionalRequirements',
  scope: 'scope',
  actors: 'actors',
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
    { bumpProposalVersion: false, allowLegacyWrite: engineId === 'actors' }
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
  let pack = opts.pack || {};
  const env = opts.env || process.env;
  let proposal = opts.proposal;
  const resultsById = { ...(opts.resultsById || {}) };
  const deriveStatuses = {};
  let frDecomposeMeta = null;

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

  // Extract-first: listed scope in Raw → FILL before LLM (RULE extract when certain).
  if (sectionEmpty(proposal, 'scope')) {
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
      deriveStatuses.scope = scopeOut.coverage?.reason || 'ok';
    }
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

  const deriveStartedAt = Date.now();
  let frDecomposeSpan = { ms: 0, llmCalls: 0, heuristic: 0, skipped: 0, concurrency: null, reason: 'off' };
  const frCount = Array.isArray(pack.functionalRequirements) ? pack.functionalRequirements.length : 0;
  const decomposeOn =
    String(env.PHASE1_FR_DECOMPOSE ?? '1').trim().toLowerCase() !== '0' &&
    String(env.PHASE1_FR_DECOMPOSE ?? '1').trim().toLowerCase() !== 'false';
  if (decomposeOn && frCount > 0) {
    const frStartedAt = Date.now();
    try {
      const dec = await decomposeFrCandidates({
        pack,
        env,
        generateJsonFn: opts.generateJsonFn,
      });
      frDecomposeMeta = dec.meta || null;
      const frMs = Math.max(0, Date.now() - frStartedAt);
      frDecomposeSpan = {
        ms: frMs,
        wallMs: frMs,
        llmCalls: Number(dec.meta?.llmCalls) || 0,
        heuristic: Number(dec.meta?.heuristic) || 0,
        skipped: Number(dec.meta?.skipped) || 0,
        concurrency: dec.meta?.concurrency ?? null,
        sourceFrCount: frCount,
        candidateCount: Array.isArray(dec.candidates) ? dec.candidates.length : 0,
        reason: 'run',
      };
      if (dec.ok && Array.isArray(dec.candidates) && dec.candidates.length > frCount) {
        pack = dec.pack;
      }
      // eslint-disable-next-line no-console
      console.info(
        '[fr_decompose_timing] wallMs=%d sourceFr=%d candidates=%d llmCalls=%d heuristic=%d concurrency=%d',
        frMs,
        frCount,
        Array.isArray(dec.candidates) ? dec.candidates.length : 0,
        dec.meta?.llmCalls || 0,
        dec.meta?.heuristic || 0,
        dec.meta?.concurrency ?? 0
      );
    } catch (err) {
      frDecomposeSpan = {
        ...frDecomposeSpan,
        ms: Math.max(0, Date.now() - frStartedAt),
        wallMs: Math.max(0, Date.now() - frStartedAt),
        reason: 'error',
      };
      console.warn('[fr_decompose] soft-fail', err?.message || err);
    }
  }

  const sectionStartedAt = Date.now();
  const derived = await runAllRawSectionDerives({
    pack,
    env,
    invokeFn: opts.invokeFn,
    proposal,
    g4Understanding: opts.g4Understanding,
    evidence: opts.evidence,
    snapshot: opts.snapshot,
    locale:
      opts.locale ||
      opts.g4Opts?.locale ||
      pack?.aiAnalysis?.deriveLocale ||
      null,
  });
  const rawSectionMs = Math.max(0, Date.now() - sectionStartedAt);
  const deriveWallMs = Math.max(0, Date.now() - deriveStartedAt);
  const bgResult = derived.bg || null;

  for (const [engineId, result] of Object.entries(derived)) {
    deriveStatuses[engineId] = result.reason || result.status;
    const entry = getRegistryEntry(engineId);
    const section = result.section || SECTION_BY_ENGINE[engineId] || entry?.writesSection;
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
        {
          bumpProposalVersion: false,
          allowLegacyWrite: engineId === 'actors',
        }
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
      fr_decompose: frDecomposeSpan,
      raw_section_derive: {
        ms: rawSectionMs,
        wallMs: rawSectionMs,
        llmCalls: deriveLlmCalls,
        items: deriveItems,
        bySection,
      },
    },
    fr_decompose: frDecomposeSpan,
    raw_section_derive: {
      ms: rawSectionMs,
      wallMs: rawSectionMs,
      llmCalls: deriveLlmCalls,
      items: deriveItems,
    },
  };

  return {
    proposal,
    resultsById,
    deriveStatuses,
    timingMeta,
    pack,
    frDecomposeMeta,
  };
}

module.exports = {
  applyRawSectionDerive,
};

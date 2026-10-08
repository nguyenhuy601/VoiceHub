/**
 * WHAT Requirement policy (Wave 0+; rename from whatG4Policy in W7-D).
 * G4 = FR semantic engine only — persist via analyses.srsProposal, ZERO g4Understanding write.
 */

const { isAiAnalysisWhatJob } = require('../../constants/aiAnalysisJobs.constants');
const {
  migrateLegacyRequirementAnalysis,
} = require('../srsProposal/migrateLegacyRequirementAnalysis');
const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { applyCompleteness } = require('../srsProposal/completeness');
const { assertProposalCallbackCas } = require('../srsProposal/cas');
const { isSrsProposal } = require('../srsProposal/srsProposalSchema');
const { populateNonFrSections } = require('../srsProposal/populateNonFrSections');

/**
 * WHAT_G4_ENABLED default on. Set 0/false/off to restore legacy 4-job / tools_propose local.
 */
function isWhatG4Enabled(env = process.env) {
  const raw = String(env.WHAT_G4_ENABLED ?? '1').trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(raw)) return false;
  return true;
}

/**
 * Throw 409 when client tries to run a classic WHAT job under G4 mode.
 * @param {string} job
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 */
function assertWhatJobDeprecatedForG4(job, opts = {}) {
  if (!isWhatG4Enabled(opts.env)) return;
  if (!isAiAnalysisWhatJob(job)) return;
  const err = new Error(
    `WHAT job "${job}" is deprecated — use phase_what requirement run (prepare → FR analysis → Gate 1)`
  );
  err.statusCode = 409;
  err.errorCode = 'WHAT_JOB_DEPRECATED_USE_G4';
  err.details = { job, use: 'phase_what', mode: 'g4' };
  throw err;
}

/**
 * After Gate1 approve: mark phase_what ready/approved (compat for HOW unlock).
 * Does NOT create or confirm container.jobs (RULE-PO-03).
 * @param {object} container
 * @param {{ source?: string, at?: string }} [opts]
 */
function markPhaseWhatGate1Approved(container, opts = {}) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  if (next.jobs != null) delete next.jobs;
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  next.phaseRuns.phase_what = {
    ...(next.phaseRuns.phase_what || {}),
    status: next.phaseRuns.phase_what?.status || 'ready',
    gate1: 'approved',
  };
  if (opts.source != null) {
    next.phaseRuns.phase_what.source = String(opts.source);
  }
  if (opts.at != null) {
    next.phaseRuns.phase_what.confirmedAt = String(opts.at);
  }
  return next;
}

/** @deprecated Use markPhaseWhatGate1Approved — no WHAT job shells */
const autoConfirmWhatJobShells = markPhaseWhatGate1Approved;

/**
 * Apply FR / requirement analysis result into analyses.srsProposal.
 * ZERO writes to analyses.g4Understanding on new runs (T-G4-NOWRITE).
 *
 * Accepts either:
 * - proposalFragment from analyzeFunctionalRequirements
 * - legacy g4Understanding shape (migrated, synthesis not into FR)
 *
 * @param {object} container
 * @param {object} frOrLegacy
 * @param {object} [meta]
 */
function applyRequirementProposalToContainer(container, frOrLegacy, meta = {}) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  next.analyses = { ...(next.analyses || {}) };

  const incomingGen =
    meta.generationId ||
    frOrLegacy?.meta?.generationId ||
    frOrLegacy?.generationId ||
    meta.remoteRunId ||
    null;

  const existingProposal = next.analyses.srsProposal;
  if (existingProposal && (incomingGen || meta.proposalVersion != null)) {
    const cas = assertProposalCallbackCas(existingProposal, {
      generationId: incomingGen,
      proposalVersion: meta.baseProposalVersion,
      reviewVersion: meta.expectedReviewVersion,
    });
    if (!cas.ok) {
      const err = new Error(cas.reason);
      err.statusCode = 409;
      err.errorCode = cas.errorCode;
      throw err;
    }
  }

  let proposal;
  if (frOrLegacy?.section === 'functionalRequirements') {
    proposal = applyProposalFragment(existingProposal, frOrLegacy, {
      generationId: incomingGen,
      bumpProposalVersion: true,
    });
  } else if (isSrsProposal(frOrLegacy)) {
    proposal = frOrLegacy;
  } else {
    // Legacy G4 shape → migrate (synthesis not into FR)
    proposal = migrateLegacyRequirementAnalysis(frOrLegacy, {
      generationId: incomingGen,
      source: meta.source || 'requirement_callback',
    });
  }

  proposal = applyCompleteness(proposal);

  // W2 legacy: populateNonFr only when explicitly requested (PHASE1_LEGACY_POPULATE_NON_FR path)
  if (meta.populateNonFr === true) {
    proposal = populateNonFrSections(proposal, {
      pack: meta.pack || {},
      snapshot: meta.snapshot || null,
      rawRecord: meta.rawRecord || null,
    });
  }

  // Explicit: do NOT assign analyses.g4Understanding
  if (Object.prototype.hasOwnProperty.call(next.analyses, 'g4Understanding')) {
    // Preserve legacy read-only for old packs; never overwrite with new run
  }

  next.analyses.srsProposal = proposal;

  next.phaseRuns = { ...(next.phaseRuns || {}) };
  next.phaseRuns.phase_what = {
    ...(next.phaseRuns.phase_what || {}),
    status: meta.status || 'ready',
    mode: meta.mode || 'requirement',
    remoteRunId: meta.remoteRunId || next.phaseRuns.phase_what?.remoteRunId || null,
    snapshotId: meta.snapshotId || next.phaseRuns.phase_what?.snapshotId || null,
    completedAt: meta.completedAt || new Date().toISOString(),
    durationMs:
      meta.durationMs ??
      frOrLegacy?.meta?.durationMs ??
      proposal?.generated?.functionalRequirements?.meta?.durationMs ??
      null,
    error: meta.error || null,
    partial: Boolean(frOrLegacy?.meta?.partial || meta.partial),
    computeStatus: meta.computeStatus || 'completed',
    callbackStatus: meta.callbackStatus || 'acked',
    stage: meta.stage || 'completed',
    llm: frOrLegacy?.meta?.llm || meta.llm || null,
    candidateCount:
      frOrLegacy?.meta?.candidateCount ??
      meta.candidateCount ??
      proposal?.generated?.functionalRequirements?.items?.length ??
      null,
    proposalVersion: proposal.proposalVersion,
    generationId: proposal.generationId,
    readyForGate1: Boolean(proposal.completeness?.readyForGate1),
  };
  return next;
}

/**
 * @deprecated Use applyRequirementProposalToContainer — no g4Understanding write.
 * Kept for call-site compatibility; forwards to srsProposal path.
 */
function applyG4UnderstandingToContainer(container, g4Understanding, meta = {}) {
  return applyRequirementProposalToContainer(container, g4Understanding, {
    ...meta,
    mode: meta.mode || 'g4',
    source: meta.source || 'legacy_g4_callback',
  });
}

function hasReadySrsProposal(containerOrPack) {
  const analyses =
    containerOrPack?.analyses ||
    containerOrPack?.aiAnalysis?.analyses ||
    {};
  const proposal = analyses.srsProposal;
  if (isSrsProposal(proposal)) {
    const items = proposal.generated?.functionalRequirements?.items;
    return Array.isArray(items) && items.length > 0;
  }
  return false;
}

function hasReadyG4Understanding(containerOrPack) {
  if (hasReadySrsProposal(containerOrPack)) return true;
  // Legacy packs only
  const analyses =
    containerOrPack?.analyses ||
    containerOrPack?.aiAnalysis?.analyses ||
    {};
  const g4 = analyses.g4Understanding;
  if (!g4 || typeof g4 !== 'object') return false;
  return Array.isArray(g4.requirements);
}

/** W7-D alias */
const whatRequirementPolicy = {
  isWhatG4Enabled,
  assertWhatJobDeprecatedForG4,
  markPhaseWhatGate1Approved,
  autoConfirmWhatJobShells,
  applyRequirementProposalToContainer,
  applyG4UnderstandingToContainer,
  hasReadyG4Understanding,
  hasReadySrsProposal,
};

module.exports = {
  isWhatG4Enabled,
  assertWhatJobDeprecatedForG4,
  markPhaseWhatGate1Approved,
  autoConfirmWhatJobShells,
  applyRequirementProposalToContainer,
  applyG4UnderstandingToContainer,
  hasReadyG4Understanding,
  hasReadySrsProposal,
  whatRequirementPolicy,
};

/**
 * WHAT Requirement policy.
 * FR semantic engine result → analyses.srsProposal only.
 * Pack blobs analyses.g4Understanding / analyses.frUnderstanding are retired (strip on apply).
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
 * Drop retired pack-persist blobs. Runtime engine state is unrelated.
 * @param {object|null|undefined} analyses
 */
function stripLegacyUnderstandingBlobs(analyses) {
  if (!analyses || typeof analyses !== 'object') return analyses;
  delete analyses.g4Understanding;
  delete analyses.frUnderstanding;
  return analyses;
}

/**
 * Throw 409 when client tries to run a classic WHAT job (use phase_what).
 * @param {string} job
 */
function assertWhatJobDeprecated(job) {
  if (!isAiAnalysisWhatJob(job)) return;
  const err = new Error(
    `WHAT job "${job}" is deprecated — use phase_what requirement run (prepare → FR analysis → Gate 1)`
  );
  err.statusCode = 409;
  err.errorCode = 'WHAT_JOB_DEPRECATED_USE_PHASE_WHAT';
  err.details = { job, use: 'phase_what', mode: 'requirement' };
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
 * Never persists analyses.g4Understanding / analyses.frUnderstanding.
 *
 * Accepts either:
 * - proposalFragment / full srsProposal
 * - transient engine FR understanding shape from APS callback (migrated, not stored as blob)
 *
 * @param {object} container
 * @param {object} frOrLegacy
 * @param {object} [meta]
 */
function applyRequirementProposalToContainer(container, frOrLegacy, meta = {}) {
  const next = container && typeof container === 'object' ? { ...container } : {};
  next.analyses = { ...(next.analyses || {}) };
  stripLegacyUnderstandingBlobs(next.analyses);

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
    // Transient engine FR understanding shape → srsProposal (not pack blob)
    proposal = migrateLegacyRequirementAnalysis(frOrLegacy, {
      generationId: incomingGen,
      source: meta.source || 'requirement_callback',
    });
  }

  proposal = applyCompleteness(proposal);

  if (meta.populateNonFr === true) {
    proposal = populateNonFrSections(proposal, {
      pack: meta.pack || {},
      snapshot: meta.snapshot || null,
      rawRecord: meta.rawRecord || null,
    });
  }

  stripLegacyUnderstandingBlobs(next.analyses);
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

module.exports = {
  assertWhatJobDeprecated,
  markPhaseWhatGate1Approved,
  autoConfirmWhatJobShells,
  applyRequirementProposalToContainer,
  hasReadySrsProposal,
  stripLegacyUnderstandingBlobs,
  whatRequirementPolicy: {
    assertWhatJobDeprecated,
    markPhaseWhatGate1Approved,
    autoConfirmWhatJobShells,
    applyRequirementProposalToContainer,
    hasReadySrsProposal,
    stripLegacyUnderstandingBlobs,
  },
};

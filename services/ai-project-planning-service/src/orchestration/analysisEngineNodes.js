/**
 * WHAT meta-gate node for whatPhaseGraph assemble.
 * Legacy enterTools / per-engine fan-out removed — sections run via Pattern B.
 */

const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { createEmptySrsProposal, isSrsProposal } = require('../srsProposal/srsProposalSchema');
const { buildFoundationUnderstanding, applyFoundationToProposal } = require('../srsProposal/foundation');
const { runMetaGate } = require('../srsProposal/metaGate');

const META_GATE_NODE_ID = 'metaGate';

function ensureProposal(state) {
  if (isSrsProposal(state.srsProposal)) return state.srsProposal;
  let proposal = createEmptySrsProposal({ source: 'analysis_engine_graph' });
  if (
    state.proposalFragment?.section === 'functionalRequirements' &&
    Array.isArray(state.proposalFragment.items) &&
    state.proposalFragment.items.length
  ) {
    proposal = applyProposalFragment(proposal, state.proposalFragment, {
      bumpProposalVersion: true,
      generationId: state.proposalFragment?.meta?.generationId || state.runId,
    });
  }
  const foundation = buildFoundationUnderstanding({
    rawRecord: state.pack?.aiAnalysis?.analyses?.customerRawRecord || null,
    snapshot: state.snapshot || null,
  });
  return applyFoundationToProposal(proposal, foundation);
}

/**
 * Meta Gate — CHECK only (sectionReviews / Gate1 readiness).
 * RULE-META-01: no LLM, no applyRawSectionDerive, no domain candidate production.
 */
async function runMetaGateNode(state) {
  const { markStage, startSpan } = require('./whatTiming');
  let whatTiming = state.whatTiming || null;
  const endMeta = startSpan();
  let proposal = ensureProposal(state);
  const resultsById = { ...(state.engineResultsById || {}) };
  proposal = runMetaGate(proposal, { resultsById });
  if (state.runId) proposal.generationId = String(state.runId);

  const container =
    state.container && typeof state.container === 'object'
      ? { ...state.container }
      : { analyses: {}, phaseRuns: {} };
  container.analyses = { ...(container.analyses || {}), srsProposal: proposal };
  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    phase_what: {
      ...(container.phaseRuns?.phase_what || {}),
      readyForGate1: Boolean(proposal.completeness?.readyForGate1),
      gateDecision: proposal.completeness?.gateDecision || proposal.meta?.gateDecision || null,
      analysisEngineGraph: true,
    },
  };

  if (whatTiming) {
    whatTiming = markStage(whatTiming, 'meta', { ms: endMeta() });
  }

  return {
    srsProposal: proposal,
    engineResultsById: resultsById,
    container,
    history: [...(state.history || []), META_GATE_NODE_ID],
    whatTiming,
  };
}

module.exports = {
  META_GATE_NODE_ID,
  ensureProposal,
  runMetaGateNode,
};

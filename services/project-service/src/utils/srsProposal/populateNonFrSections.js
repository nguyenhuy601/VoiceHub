/**
 * Populate non-FR Analysis sections via Analysis engines orchestrator + Meta Gate.
 * Hot path (phase_what callback): APS full srsProposal — do NOT call this when
 * fullSrsProposal is present (avoids wiping Raw-derived DERIVED sections).
 * Legacy only: PHASE1_LEGACY_POPULATE_NON_FR=1 && fragment-only callback.
 */

const { runAnalysisEnginesSync } = require('./engines/runAnalysisEnginesSync');
const { runMetaGate } = require('./metaGate');

/**
 * @param {object} proposal
 * @param {{ pack?: object, snapshot?: object, rawRecord?: object, proposalFragment?: object }} [opts]
 */
function populateNonFrSections(proposal, opts = {}) {
  if (!proposal || typeof proposal !== 'object') return proposal;
  const { proposal: next, resultsById } = runAnalysisEnginesSync({
    proposal,
    pack: opts.pack || {},
    snapshot: opts.snapshot || null,
    rawRecord: opts.rawRecord || null,
    proposalFragment: opts.proposalFragment || null,
    skipFrIfPresent: true,
  });
  return runMetaGate(next, { resultsById });
}

async function populateNonFrSectionsAsync(proposal, opts = {}) {
  return populateNonFrSections(proposal, opts);
}

module.exports = {
  populateNonFrSections,
  populateNonFrSectionsAsync,
};

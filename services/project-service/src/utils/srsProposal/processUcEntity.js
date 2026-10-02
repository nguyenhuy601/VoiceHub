/**
 * Process / BPM + UC + Entity after FR (Wave 5).
 * Must not feed back into FR input projection.
 */

const { applyProposalFragment } = require('./srsProposalReducer');

function buildProcessUcEntity(input = {}) {
  const frItems = Array.isArray(input.functionalRequirements)
    ? input.functionalRequirements
    : [];
  const processes = (Array.isArray(input.processes) ? input.processes : []).map((p, i) => ({
    logicalId: p.logicalId || p.id || `PROC-${i + 1}`,
    title: p.title || p.name || `Process ${i + 1}`,
    steps: Array.isArray(p.steps) ? p.steps : [],
    relatedFrIds: p.relatedFrIds || [],
    ...p,
  }));
  // Derive stub UCs from FR when none provided
  const useCases =
    Array.isArray(input.useCases) && input.useCases.length
      ? input.useCases.map((u, i) => ({
          logicalId: u.logicalId || u.id || `UC-${i + 1}`,
          title: u.title || u.name || `UC ${i + 1}`,
          primaryActor: u.primaryActor || null,
          relatedFrIds: u.relatedFrIds || [],
          ...u,
        }))
      : frItems.slice(0, 50).map((fr, i) => ({
          logicalId: `UC-FROM-${fr.logicalId || fr.id || i + 1}`,
          title: `UC: ${fr.title || fr.id}`,
          relatedFrIds: [fr.logicalId || fr.id],
          status: 'PROPOSED',
        }));
  const entities = (Array.isArray(input.entities) ? input.entities : []).map((e, i) => ({
    logicalId: e.logicalId || e.id || `ENT-${i + 1}`,
    name: e.name || e.title || `Entity ${i + 1}`,
    attributes: Array.isArray(e.attributes) ? e.attributes : [],
    ...e,
  }));
  return { processes, useCases, entities };
}

function applyProcessUcEntityToProposal(proposal, built) {
  let next = proposal;
  next = applyProposalFragment(
    next,
    { section: 'processes', items: built.processes || [], meta: { kind: 'process' } },
    { bumpProposalVersion: true }
  );
  next = applyProposalFragment(
    next,
    { section: 'useCases', items: built.useCases || [], meta: { kind: 'uc' } },
    { bumpProposalVersion: false }
  );
  next = applyProposalFragment(
    next,
    { section: 'entities', items: built.entities || [], meta: { kind: 'entity' } },
    { bumpProposalVersion: false }
  );
  return next;
}

module.exports = {
  buildProcessUcEntity,
  applyProcessUcEntityToProposal,
};

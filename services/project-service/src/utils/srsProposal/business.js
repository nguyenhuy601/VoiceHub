/**
 * Business Understanding — Business Goals + Business Rules only (Wave 3).
 * RULE-BR-FR-01: BR→FR derived items are PROPOSED (applied at FR build time).
 */

const { applyProposalFragment } = require('./srsProposalReducer');

/**
 * @param {{ goals?: object[], rules?: object[], context?: object }} input
 */
function buildBusinessUnderstanding(input = {}) {
  const goals = (Array.isArray(input.goals) ? input.goals : []).map((g, i) => ({
    logicalId: g.logicalId || g.id || `BG-${i + 1}`,
    title: g.title || g.name || `Goal ${i + 1}`,
    description: g.description || '',
    priority: g.priority || null,
    ...g,
  }));
  const rules = (Array.isArray(input.rules) ? input.rules : []).map((r, i) => ({
    logicalId: r.logicalId || r.id || `BR-${i + 1}`,
    title: r.title || r.name || `Rule ${i + 1}`,
    description: r.description || r.text || '',
    sourceRole: r.sourceRole || 'business_rule',
    ...r,
  }));
  return { businessGoals: goals, businessRules: rules };
}

/**
 * Derive FR stubs from BR — status must be PROPOSED.
 */
function deriveProposedFrFromBusinessRules(rules = []) {
  return (Array.isArray(rules) ? rules : []).map((br, i) => ({
    logicalId: `FR-FROM-${br.logicalId || br.id || i + 1}`,
    id: `FR-FROM-${br.logicalId || br.id || i + 1}`,
    title: `Implement: ${br.title || br.logicalId || i + 1}`,
    description: br.description || '',
    status: 'PROPOSED',
    derivedFromBr: br.logicalId || br.id,
    sourceKind: 'business_rule',
    origin: 'br_to_fr',
  }));
}

function applyBusinessToProposal(proposal, business) {
  let next = proposal;
  next = applyProposalFragment(
    next,
    {
      section: 'businessGoals',
      items: business.businessGoals || [],
      meta: { kind: 'business' },
    },
    { bumpProposalVersion: true }
  );
  next = applyProposalFragment(
    next,
    {
      section: 'businessRules',
      items: business.businessRules || [],
      meta: { kind: 'business' },
    },
    { bumpProposalVersion: false }
  );
  return next;
}

module.exports = {
  buildBusinessUnderstanding,
  deriveProposedFrFromBusinessRules,
  applyBusinessToProposal,
};

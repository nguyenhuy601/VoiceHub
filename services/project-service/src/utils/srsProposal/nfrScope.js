/**
 * NFR / Rule / Scope proposal fragments (Wave 4 companion to FR).
 */

const { applyProposalFragment } = require('./srsProposalReducer');

function buildNfrRuleScopeFragments(input = {}) {
  const nfr = (Array.isArray(input.nfr) ? input.nfr : []).map((n, i) => ({
    logicalId: n.logicalId || n.id || `NFR-${i + 1}`,
    title: n.title || n.name || `NFR ${i + 1}`,
    category: n.category || 'general',
    description: n.description || '',
    status: n.status || 'EXTRACTED',
    sourceRefs: n.sourceRefs || [],
    ...n,
  }));
  const scope = (Array.isArray(input.scope) ? input.scope : []).map((s, i) => ({
    logicalId: s.logicalId || s.id || `SCOPE-${i + 1}`,
    title: s.title || s.name || `Scope ${i + 1}`,
    inScope: s.inScope !== false,
    description: s.description || '',
    ...s,
  }));
  return { nfr, scope };
}

function applyNfrRuleScopeToProposal(proposal, fragments) {
  let next = proposal;
  next = applyProposalFragment(
    next,
    {
      section: 'nonFunctionalRequirements',
      items: fragments.nfr || [],
      meta: { kind: 'nfr' },
    },
    { bumpProposalVersion: true }
  );
  next = applyProposalFragment(
    next,
    {
      section: 'scope',
      items: fragments.scope || [],
      meta: { kind: 'scope' },
    },
    { bumpProposalVersion: false }
  );
  return next;
}

module.exports = {
  buildNfrRuleScopeFragments,
  applyNfrRuleScopeToProposal,
};

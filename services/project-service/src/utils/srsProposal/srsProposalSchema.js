/**
 * analyses.srsProposal — Requirement Analysis Proposal persist (debt name: srsProposal).
 * Kind: requirement_analysis_proposal. SRS Draft is separate (after Gate1).
 */

const {
  ANALYSIS_PROPOSAL_KIND,
  ANALYSIS_SECTION_KEYS,
  LEGACY_SECTION_KEYS,
} = require('./contracts/analysisSections');

const SRS_PROPOSAL_SCHEMA_VERSION = 1;

function emptySection() {
  return { items: [], relations: [], clarificationQuestions: [], evidence: null, meta: {} };
}

function createEmptySrsProposal(meta = {}) {
  const generated = {
    synthesis: null,
  };
  for (const key of ANALYSIS_SECTION_KEYS) {
    generated[key] = emptySection();
  }
  for (const key of LEGACY_SECTION_KEYS) {
    generated[key] = emptySection();
  }

  return {
    schemaVersion: SRS_PROPOSAL_SCHEMA_VERSION,
    proposalVersion: meta.proposalVersion ?? 1,
    generationId: meta.generationId || null,
    reviewVersion: meta.reviewVersion ?? 0,
    generated,
    review: {
      decisions: {},
      locks: {},
      summary: {
        totalItems: 0,
        accepted: 0,
        edited: 0,
        rejected: 0,
        pending: 0,
        blockingPending: 0,
        complete: false,
      },
    },
    completeness: {
      coverage: {},
      missingAreas: [],
      readyForGate1: false,
      missingForGate1: [],
      sectionReviews: [],
    },
    meta: {
      kind: ANALYSIS_PROPOSAL_KIND,
      source: meta.source || 'fr_analysis',
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
    },
  };
}

function isSrsProposal(obj) {
  return Boolean(obj && typeof obj === 'object' && obj.generated && typeof obj.generated === 'object');
}

module.exports = {
  SRS_PROPOSAL_SCHEMA_VERSION,
  ANALYSIS_PROPOSAL_KIND,
  createEmptySrsProposal,
  emptySection,
  isSrsProposal,
};

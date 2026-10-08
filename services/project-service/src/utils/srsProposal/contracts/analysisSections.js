/**
 * Analysis Proposal section catalog (Requirement Analysis output — NOT SRS).
 * Sheet names are input representation; engine ownership is by section key.
 */

/** Sections Analysis engines may write (V1). */
const ANALYSIS_SECTION_KEYS = Object.freeze([
  'traceability',
  'businessGoals',
  'businessRules',
  'processes',
  'functionalRequirements',
  'useCases',
  'nonFunctionalRequirements',
  'scope',
  'interfaces',
  'entities',
  'glossary',
  'assumptions',
]);

/** Legacy foundation keys — read-compatible; engines must not write. */
const LEGACY_SECTION_KEYS = Object.freeze(['actors', 'domain', 'context']);

/** Reducer accepts Analysis + legacy + synthesis hints. */
const REDUCER_SECTION_KEYS = Object.freeze([
  ...ANALYSIS_SECTION_KEYS,
  ...LEGACY_SECTION_KEYS,
  'synthesis',
]);

const SECTION_TO_ENGINE = Object.freeze({
  traceability: 'traceability',
  businessGoals: 'bg',
  businessRules: 'br',
  processes: 'bpm',
  functionalRequirements: 'fr',
  useCases: 'uc',
  nonFunctionalRequirements: 'nfr',
  scope: 'scope',
  interfaces: 'interface',
  entities: 'data',
  glossary: 'glossary',
  assumptions: 'assumption',
});

const ANALYSIS_PROPOSAL_KIND = 'requirement_analysis_proposal';

function isAnalysisSection(section) {
  return ANALYSIS_SECTION_KEYS.includes(String(section || ''));
}

function isLegacySection(section) {
  return LEGACY_SECTION_KEYS.includes(String(section || ''));
}

module.exports = {
  ANALYSIS_SECTION_KEYS,
  LEGACY_SECTION_KEYS,
  REDUCER_SECTION_KEYS,
  SECTION_TO_ENGINE,
  ANALYSIS_PROPOSAL_KIND,
  isAnalysisSection,
  isLegacySection,
};

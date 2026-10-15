/**
 * Analysis Proposal section catalog (Requirement Analysis output — NOT SRS).
 * Sheet names are input representation; engine ownership is by section key.
 *
 * Wave-1 trim: interfaces / glossary / assumptions / traceability → legacy read-only
 * (engines must not write; Gate1 tabs omit).
 */

/** Sections Analysis engines may write (V1 active). */
const ANALYSIS_SECTION_KEYS = Object.freeze([
  'businessGoals',
  'businessRules',
  'processes',
  'functionalRequirements',
  'useCases',
  'nonFunctionalRequirements',
  'scope',
  'entities',
]);

/**
 * Legacy / deprecated keys — read-compatible for old packs; engines must not write.
 * Includes foundation (actors/domain/context) + Gate1-trimmed sections.
 */
const LEGACY_SECTION_KEYS = Object.freeze([
  'actors',
  'domain',
  'context',
  'interfaces',
  'glossary',
  'assumptions',
  'traceability',
]);

/** Reducer accepts Analysis + legacy + synthesis hints. */
const REDUCER_SECTION_KEYS = Object.freeze([
  ...ANALYSIS_SECTION_KEYS,
  ...LEGACY_SECTION_KEYS,
  'synthesis',
]);

const SECTION_TO_ENGINE = Object.freeze({
  businessGoals: 'bg',
  businessRules: 'br',
  processes: 'bpm',
  functionalRequirements: 'fr',
  useCases: 'uc',
  nonFunctionalRequirements: 'nfr',
  scope: 'scope',
  entities: 'data',
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

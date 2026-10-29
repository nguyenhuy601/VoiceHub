/**
 * Backlog structure — Feature/Story SoT separate from FR identity.
 */

const SHAPE_VERSION = 'backlog-structure';
/** Mid-flag packs may still carry the old shape string — accept then normalize. */
const LEGACY_SHAPE_VERSION = 'backlog-structure-v3';

const COVERAGE_STATUS = Object.freeze({
  COVERED: 'COVERED',
  PARTIALLY_COVERED: 'PARTIALLY_COVERED',
  NEEDS_CLARIFICATION: 'NEEDS_CLARIFICATION',
  OUT_OF_SCOPE: 'OUT_OF_SCOPE',
  MISSING_REF: 'MISSING_REF',
  PROPOSED: 'PROPOSED',
});

const CLASSIFICATION_TYPES = Object.freeze({
  EPIC: 'EPIC',
  FEATURE: 'FEATURE',
  STORY: 'STORY',
  UNCLEAR: 'UNCLEAR',
});

const RECONCILE_DECISIONS = Object.freeze({
  KEEP: 'KEEP',
  NEW: 'NEW',
  SPLIT: 'SPLIT',
  MERGE: 'MERGE',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
});

function isBacklogStructureShapeVersion(raw) {
  const v = String(raw || '').trim();
  return v === SHAPE_VERSION || v === LEGACY_SHAPE_VERSION;
}

module.exports = {
  SHAPE_VERSION,
  LEGACY_SHAPE_VERSION,
  COVERAGE_STATUS,
  CLASSIFICATION_TYPES,
  RECONCILE_DECISIONS,
  isBacklogStructureShapeVersion,
};

/**
 * Analysis artifact kinds, lifecycle, sources, trace link types.
 * SSOT: docs/adr/0001-project-delivery-phase-and-req-analysis.md
 */

const ANALYSIS_ARTIFACT_KINDS = Object.freeze([
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'SCOPE',
]);

/** Kinds PO may import/edit as product author */
const PO_AUTHOR_KINDS = Object.freeze(['BG', 'SCOPE']);

const ANALYSIS_ARTIFACT_STATUSES = Object.freeze([
  'draft',
  'ba_review',
  'tech_review',
  'po_review',
  'approved',
  'rejected',
]);

const ANALYSIS_ARTIFACT_SOURCES = Object.freeze([
  'import_excel',
  'import_bpmn',
  'import_pdf',
  'manual',
  'seed_from_pack',
  'seed_from_fr_row',
]);

const ARTIFACT_TRACE_LINK_TYPES = Object.freeze([
  'derives',
  'implements',
  'constrains',
  'scopes',
]);

const CUSTOMER_DOC_CLASSES = Object.freeze([
  'requirement_xlsx',
  'business_description',
  'bpmn',
  'other',
]);

/**
 * draft → ba_review → tech_review → po_review → approved
 *         ↘ rejected → draft
 */
const ARTIFACT_STATUS_TRANSITIONS = Object.freeze({
  draft: ['ba_review'],
  ba_review: ['tech_review', 'rejected'],
  tech_review: ['po_review', 'rejected'],
  po_review: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: [],
});

/** Permission required to take each forward transition */
const ARTIFACT_TRANSITION_PERMISSION = Object.freeze({
  'draft:ba_review': 'analysis:submit_ba_review',
  'ba_review:tech_review': 'analysis:ba_review',
  'ba_review:rejected': 'analysis:ba_review',
  'tech_review:po_review': 'analysis:tech_review',
  'tech_review:rejected': 'analysis:tech_review',
  'po_review:approved': 'analysis:po_review',
  'po_review:rejected': 'analysis:po_review',
  'rejected:draft': 'analysis:artifact_edit',
});

function canTransitionArtifactStatus(from, to) {
  const a = String(from || '')
    .trim()
    .toLowerCase();
  const b = String(to || '')
    .trim()
    .toLowerCase();
  if (!ANALYSIS_ARTIFACT_STATUSES.includes(a) || !ANALYSIS_ARTIFACT_STATUSES.includes(b)) {
    return false;
  }
  if (a === b) return true;
  return (ARTIFACT_STATUS_TRANSITIONS[a] || []).includes(b);
}

function permissionForArtifactTransition(from, to) {
  const a = String(from || '')
    .trim()
    .toLowerCase();
  const b = String(to || '')
    .trim()
    .toLowerCase();
  return ARTIFACT_TRANSITION_PERMISSION[`${a}:${b}`] || null;
}

function isValidArtifactKind(kind) {
  return ANALYSIS_ARTIFACT_KINDS.includes(String(kind || '').trim().toUpperCase());
}

function normalizeArtifactKind(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return ANALYSIS_ARTIFACT_KINDS.includes(k) ? k : null;
}

module.exports = {
  ANALYSIS_ARTIFACT_KINDS,
  PO_AUTHOR_KINDS,
  ANALYSIS_ARTIFACT_STATUSES,
  ANALYSIS_ARTIFACT_SOURCES,
  ARTIFACT_TRACE_LINK_TYPES,
  CUSTOMER_DOC_CLASSES,
  ARTIFACT_STATUS_TRANSITIONS,
  ARTIFACT_TRANSITION_PERMISSION,
  canTransitionArtifactStatus,
  permissionForArtifactTransition,
  isValidArtifactKind,
  normalizeArtifactKind,
};

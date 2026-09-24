/**
 * Analysis artifact kinds, lifecycle, sources, trace link types.
 * SSOT: docs/adr/0001-project-delivery-phase-and-req-analysis.md
 * Four workbooks: docs/adr/0003-phase1-four-workbooks.md
 * Wave 1 (DEC P1-B/C): changes_requested — không về draft đỏ khi request changes / reject.
 */

const ANALYSIS_ARTIFACT_KINDS = Object.freeze([
  'BG',
  'BR',
  'BPM',
  'FR',
  'UC',
  'NFR',
  'SCOPE',
  /** DEC A — IEEE-facing analysis kinds (optional for Phase 1 gate). */
  'INTERFACE',
  'DATA',
  'GLOSSARY',
  'ASSUMPTION',
]);

/** Kinds PO may import/edit as product author */
const PO_AUTHOR_KINDS = Object.freeze(['BG', 'SCOPE']);

const ANALYSIS_ARTIFACT_STATUSES = Object.freeze([
  'draft',
  'ba_review',
  'tech_review',
  'po_review',
  'approved',
  'changes_requested',
  'rejected',
]);

/** Statuses where BA may edit content (DEC P1-C/E). */
const ARTIFACT_CONTENT_EDITABLE_STATUSES = Object.freeze(['draft', 'changes_requested']);

/** Transitions that require a non-empty review note. */
const ARTIFACT_NOTE_REQUIRED_TARGETS = Object.freeze(['changes_requested', 'rejected']);

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
  'customer_raw',
  'customer_file',
  'reference_attachment',
  'requirement_analysis',
  'requirement_xlsx', // legacy alias — prefer customer_raw / requirement_analysis
  'business_description',
  'bpmn',
  'other',
]);

/**
 * draft → ba_review → tech_review → po_review → approved
 * When Tech optional (no TL): ba_review → po_review allowed (DEC D6).
 */
const ARTIFACT_STATUS_TRANSITIONS = Object.freeze({
  draft: ['ba_review'],
  ba_review: ['tech_review', 'po_review', 'changes_requested', 'rejected'],
  tech_review: ['po_review', 'changes_requested', 'rejected'],
  po_review: ['approved', 'changes_requested', 'rejected'],
  changes_requested: ['tech_review', 'po_review', 'ba_review'],
  rejected: [],
  approved: [],
});

/** Permission required to take each forward transition */
const ARTIFACT_TRANSITION_PERMISSION = Object.freeze({
  'draft:ba_review': 'analysis:submit_ba_review',
  'ba_review:tech_review': 'analysis:ba_review',
  'ba_review:po_review': 'analysis:ba_review', // Tech skip — BA advances to PO queue
  'ba_review:changes_requested': 'analysis:ba_review',
  'ba_review:rejected': 'analysis:ba_review',
  'tech_review:po_review': 'analysis:tech_review',
  'tech_review:changes_requested': 'analysis:tech_review',
  'tech_review:rejected': 'analysis:tech_review',
  'po_review:approved': 'analysis:po_review',
  'po_review:changes_requested': 'analysis:po_review',
  'po_review:rejected': 'analysis:po_review',
  'changes_requested:ba_review': 'analysis:submit_ba_review',
  'changes_requested:tech_review': 'analysis:submit_ba_review',
  'changes_requested:po_review': 'analysis:submit_ba_review',
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

/**
 * When leaving changes_requested, only allow return to the gate that requested changes.
 * @param {string} from
 * @param {string} to
 * @param {string} [changesRequestedFrom]
 */
function canResubmitFromChangesRequested(from, to, changesRequestedFrom) {
  const a = String(from || '')
    .trim()
    .toLowerCase();
  const b = String(to || '')
    .trim()
    .toLowerCase();
  if (a !== 'changes_requested') return true;
  const ret = String(changesRequestedFrom || '')
    .trim()
    .toLowerCase();
  if (!ret) {
    // Legacy rows: default Tech gate (most common return).
    return b === 'tech_review';
  }
  return b === ret;
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

function isArtifactContentEditableStatus(status) {
  return ARTIFACT_CONTENT_EDITABLE_STATUSES.includes(
    String(status || '')
      .trim()
      .toLowerCase()
  );
}

function isReviewNoteRequired(toStatus) {
  return ARTIFACT_NOTE_REQUIRED_TARGETS.includes(
    String(toStatus || '')
      .trim()
      .toLowerCase()
  );
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
  ARTIFACT_CONTENT_EDITABLE_STATUSES,
  ARTIFACT_NOTE_REQUIRED_TARGETS,
  ANALYSIS_ARTIFACT_SOURCES,
  ARTIFACT_TRACE_LINK_TYPES,
  CUSTOMER_DOC_CLASSES,
  ARTIFACT_STATUS_TRANSITIONS,
  ARTIFACT_TRANSITION_PERMISSION,
  canTransitionArtifactStatus,
  canResubmitFromChangesRequested,
  permissionForArtifactTransition,
  isArtifactContentEditableStatus,
  isReviewNoteRequired,
  isValidArtifactKind,
  normalizeArtifactKind,
};

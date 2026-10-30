/**
 * Minimal provenance control for WHAT/HOW generate context (Wave 1).
 * Rejected/superseded out; AI draft not treated as confirmed baseline.
 */

const ORIGIN = Object.freeze({
  CUSTOMER_IMPORT: 'customer_import',
  USER_EDIT: 'user_edit',
  AI_SYNTHESIS: 'ai_synthesis',
  SYSTEM: 'system',
  UNKNOWN: 'unknown',
});

const APPROVAL = Object.freeze({
  DRAFT: 'draft',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUPERSEDED: 'superseded',
});

function metaOf(doc) {
  if (!doc || typeof doc !== 'object') return {};
  return doc.metadata && typeof doc.metadata === 'object' ? doc.metadata : doc;
}

function originOf(doc) {
  const m = metaOf(doc);
  const raw = String(m.origin || doc.origin || ORIGIN.UNKNOWN).trim().toLowerCase();
  if (raw === 'customer_import' || raw === 'customer' || raw === 'import') {
    return ORIGIN.CUSTOMER_IMPORT;
  }
  if (raw === 'user_edit' || raw === 'user') return ORIGIN.USER_EDIT;
  if (raw === 'ai_synthesis' || raw === 'ai' || raw === 'ai_draft') {
    return ORIGIN.AI_SYNTHESIS;
  }
  if (raw === 'system') return ORIGIN.SYSTEM;
  return ORIGIN.UNKNOWN;
}

function approvalOf(doc) {
  const m = metaOf(doc);
  const raw = String(m.approvalStatus || doc.approvalStatus || '').trim().toLowerCase();
  if (raw === 'approved') return APPROVAL.APPROVED;
  if (raw === 'rejected') return APPROVAL.REJECTED;
  if (raw === 'superseded') return APPROVAL.SUPERSEDED;
  if (raw === 'draft') return APPROVAL.DRAFT;
  return APPROVAL.DRAFT;
}

/**
 * Default generate context: drop rejected/superseded.
 * @param {object} doc
 */
function isExcludedFromGenerate(doc) {
  const status = approvalOf(doc);
  return status === APPROVAL.REJECTED || status === APPROVAL.SUPERSEDED;
}

/**
 * AI draft may appear as candidate comparison but not as confirmed baseline evidence.
 * @param {object} doc
 */
function isAiDraft(doc) {
  return originOf(doc) === ORIGIN.AI_SYNTHESIS;
}

/**
 * Filter corpus/hits for generate context (baseline path).
 * @param {object[]} docs
 * @param {{ allowAiDraftAsCandidate?: boolean }} [opts]
 */
function filterDocsForGenerate(docs, opts = {}) {
  const list = Array.isArray(docs) ? docs : [];
  return list.filter((doc) => {
    if (isExcludedFromGenerate(doc)) return false;
    if (!opts.allowAiDraftAsCandidate && isAiDraft(doc)) return false;
    return true;
  });
}

/**
 * Attach default provenance onto metadata object (additive).
 */
function withProvenanceDefaults(metadata = {}, defaults = {}) {
  const m = metadata && typeof metadata === 'object' ? { ...metadata } : {};
  if (m.origin == null) m.origin = defaults.origin || ORIGIN.UNKNOWN;
  if (m.approvalStatus == null) m.approvalStatus = defaults.approvalStatus || APPROVAL.DRAFT;
  if (defaults.tenantId && m.tenantId == null) m.tenantId = defaults.tenantId;
  if (defaults.projectId && m.projectId == null) m.projectId = defaults.projectId;
  if (defaults.snapshotId && m.snapshotId == null) m.snapshotId = defaults.snapshotId;
  if (defaults.sourceVersion != null && m.sourceVersion == null) {
    m.sourceVersion = defaults.sourceVersion;
  }
  if (defaults.spanId != null && m.spanId == null) m.spanId = defaults.spanId;
  if (defaults.derivedFrom != null && m.derivedFrom == null) {
    m.derivedFrom = defaults.derivedFrom;
  }
  return m;
}

module.exports = {
  ORIGIN,
  APPROVAL,
  originOf,
  approvalOf,
  isExcludedFromGenerate,
  isAiDraft,
  filterDocsForGenerate,
  withProvenanceDefaults,
};

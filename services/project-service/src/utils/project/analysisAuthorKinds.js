/**
 * SoT: which analysis artifact kinds a permission set may create/edit.
 * Must stay aligned with assertCanAuthorKind in analysis.service.js.
 */
const {
  ANALYSIS_ARTIFACT_KINDS,
  PO_AUTHOR_KINDS,
  normalizeArtifactKind,
} = require('../../constants/analysisArtifact');
const { hasPermission } = require('./projectPermissionMatrix');

/** Sentinel: all kinds in ANALYSIS_ARTIFACT_KINDS. */
const ANALYSIS_AUTHOR_KINDS_ALL = '*';

/**
 * @param {string[]} permissions
 * @param {{ bypass?: boolean }} [opts]
 * @returns {'*'|string[]}
 */
function resolveAnalysisAuthorKinds(permissions = [], { bypass = false } = {}) {
  if (bypass) return ANALYSIS_AUTHOR_KINDS_ALL;

  const canImport = hasPermission(permissions, 'analysis:artifact_import');
  const canEdit = hasPermission(permissions, 'analysis:artifact_edit');
  if (!canImport && !canEdit) return [];

  const hasBaAuthor =
    hasPermission(permissions, 'analysis:submit_ba_review') ||
    hasPermission(permissions, 'analysis:ba_review');
  // Same condition as assertCanAuthorKind: PO product author limited to BG/SCOPE.
  const isPoLimited =
    hasPermission(permissions, 'analysis:po_review') &&
    !hasPermission(permissions, 'analysis:ba_review') &&
    !hasBaAuthor &&
    !canImport;

  if (isPoLimited) {
    return [...PO_AUTHOR_KINDS];
  }

  // BA (import and/or submit/ba_review) or edit without PO-only pattern → all kinds.
  return ANALYSIS_AUTHOR_KINDS_ALL;
}

/**
 * @param {'*'|string[]|null|undefined} authorKinds
 * @param {string} kind
 * @returns {boolean}
 */
function isAnalysisKindAllowed(authorKinds, kind) {
  if (authorKinds === ANALYSIS_AUTHOR_KINDS_ALL || authorKinds === '*') return true;
  if (!Array.isArray(authorKinds) || !authorKinds.length) return false;
  const k = normalizeArtifactKind(kind);
  if (!k) return false;
  return authorKinds.includes(k);
}

/**
 * @param {string[]} permissions
 * @param {string} kind
 * @param {{ bypass?: boolean }} [opts]
 */
function canAuthorAnalysisKind(permissions, kind, { bypass = false } = {}) {
  return isAnalysisKindAllowed(resolveAnalysisAuthorKinds(permissions, { bypass }), kind);
}

module.exports = {
  ANALYSIS_AUTHOR_KINDS_ALL,
  ANALYSIS_ARTIFACT_KINDS,
  PO_AUTHOR_KINDS,
  resolveAnalysisAuthorKinds,
  isAnalysisKindAllowed,
  canAuthorAnalysisKind,
};

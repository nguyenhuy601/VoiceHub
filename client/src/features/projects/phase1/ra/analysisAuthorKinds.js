/**
 * FE helper — mirror BE resolveAnalysisAuthorKinds / isAnalysisKindAllowed.
 * Prefer capabilities.analysisAuthorKinds from hub; fallback when BE cũ.
 */

const PO_AUTHOR_KINDS = Object.freeze(['BG', 'SCOPE']);

function normalizeKind(kind) {
  return String(kind || '')
    .trim()
    .toUpperCase();
}

/**
 * Fallback when analysisAuthorKinds missing on capabilities.
 * @param {object} capabilities
 * @returns {'*'|string[]}
 */
export function fallbackAnalysisAuthorKinds(capabilities = {}) {
  if (capabilities.canImportAnalysis || capabilities.canBaAuthorAnalysis) {
    return '*';
  }
  if (
    capabilities.canEditAnalysis &&
    capabilities.canReviewAnalysisPo &&
    !capabilities.canReviewAnalysisBa
  ) {
    return [...PO_AUTHOR_KINDS];
  }
  if (capabilities.canEditAnalysis) {
    return '*';
  }
  return [];
}

/**
 * @param {object} capabilities
 * @returns {'*'|string[]}
 */
export function resolveClientAnalysisAuthorKinds(capabilities = {}) {
  const raw = capabilities.analysisAuthorKinds;
  if (raw === '*' || raw === 'all') return '*';
  if (Array.isArray(raw)) return raw.map(normalizeKind).filter(Boolean);
  return fallbackAnalysisAuthorKinds(capabilities);
}

/**
 * @param {object} capabilities
 * @param {string} kind
 */
export function canAuthorAnalysisKindOnClient(capabilities, kind) {
  const allowed = resolveClientAnalysisAuthorKinds(capabilities);
  if (allowed === '*') return true;
  if (!Array.isArray(allowed) || !allowed.length) return false;
  const k = normalizeKind(kind);
  return Boolean(k) && allowed.includes(k);
}

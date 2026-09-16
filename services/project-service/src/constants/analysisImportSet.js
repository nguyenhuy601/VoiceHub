/**
 * Analysis Import Set — aggregate Raw + Analysis + Pack/Artifacts.
 * SSOT business rules: 1 ACTIVE set / project; cascade trash/restore.
 */

const IMPORT_SET_STATUSES = Object.freeze(['draft', 'active', 'trashed']);

const IMPORT_SET_ERROR_CODES = Object.freeze({
  SLOT_RAW_TAKEN: 'IMPORT_SET_RAW_SLOT_TAKEN',
  SLOT_ANALYSIS_TAKEN: 'IMPORT_SET_ANALYSIS_SLOT_TAKEN',
  MISSING_RAW: 'IMPORT_SET_MISSING_RAW',
  MISSING_ANALYSIS: 'IMPORT_SET_MISSING_ANALYSIS',
  MISSING_PACK: 'IMPORT_SET_MISSING_PACK',
  NOT_TRASHED: 'IMPORT_SET_NOT_TRASHED',
  NOT_FOUND: 'IMPORT_SET_NOT_FOUND',
  INCOMPLETE_FOR_RESTORE: 'IMPORT_SET_INCOMPLETE_FOR_RESTORE',
  INCOMPLETE_FOR_ACTIVATE: 'IMPORT_SET_INCOMPLETE_FOR_ACTIVATE',
  MIX_FORBIDDEN: 'IMPORT_SET_MIX_FORBIDDEN',
});

function httpError(message, statusCode, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

/**
 * @param {{ rawDocumentId?: unknown }} set
 */
function assertCanAttachRaw(set) {
  if (set?.rawDocumentId) {
    throw httpError(
      'Import Set đã có file Raw — trash set hoặc dùng set khác',
      409,
      IMPORT_SET_ERROR_CODES.SLOT_RAW_TAKEN
    );
  }
}

/**
 * @param {{ analysisDocumentId?: unknown }} set
 */
function assertCanAttachAnalysis(set) {
  if (set?.analysisDocumentId) {
    throw httpError(
      'Import Set đã có file Analysis — trash set hoặc dùng set khác',
      409,
      IMPORT_SET_ERROR_CODES.SLOT_ANALYSIS_TAKEN
    );
  }
}

/**
 * Activate requires Raw + Analysis + Pack (RULE-01 / RULE-06).
 * @param {{ rawDocumentId?: unknown, analysisDocumentId?: unknown, packId?: unknown }} set
 */
function assertCanActivate(set) {
  if (!set?.rawDocumentId) {
    throw httpError(
      'Thiếu file Raw — gắn Customer Requirement Raw trước khi confirm Analysis',
      400,
      IMPORT_SET_ERROR_CODES.MISSING_RAW
    );
  }
  if (!set?.analysisDocumentId) {
    throw httpError(
      'Thiếu file Analysis',
      400,
      IMPORT_SET_ERROR_CODES.MISSING_ANALYSIS
    );
  }
  if (!set?.packId) {
    throw httpError(
      'Thiếu RequirementPack — confirm import trước khi activate',
      400,
      IMPORT_SET_ERROR_CODES.MISSING_PACK
    );
  }
}

/**
 * Restore only from trash and only when set is complete (RULE-04).
 * @param {{ status?: string, rawDocumentId?: unknown, analysisDocumentId?: unknown, packId?: unknown }} set
 */
function assertCanRestore(set) {
  if (String(set?.status || '') !== 'trashed') {
    throw httpError(
      'Chỉ restore Import Set đang ở thùng rác',
      409,
      IMPORT_SET_ERROR_CODES.NOT_TRASHED
    );
  }
  if (!set?.rawDocumentId || !set?.analysisDocumentId || !set?.packId) {
    throw httpError(
      'Import Set không đủ Raw + Analysis + Pack để restore',
      409,
      IMPORT_SET_ERROR_CODES.INCOMPLETE_FOR_RESTORE
    );
  }
}

/**
 * @param {{ activatingSetId: string, currentActiveSetId?: string | null }} args
 * @returns {{ activateId: string, trashIds: string[] }}
 */
function planActivateSwap({ activatingSetId, currentActiveSetId }) {
  const activateId = String(activatingSetId);
  const trashIds = [];
  if (currentActiveSetId && String(currentActiveSetId) !== activateId) {
    trashIds.push(String(currentActiveSetId));
  }
  return { activateId, trashIds };
}

/**
 * @param {{ restoreSetId: string, currentActiveSetId?: string | null }} args
 * @returns {{ activateId: string, trashIds: string[] }}
 */
function planRestoreSwap({ restoreSetId, currentActiveSetId }) {
  return planActivateSwap({
    activatingSetId: restoreSetId,
    currentActiveSetId,
  });
}

/**
 * Reject attaching a document that already belongs to another set (RULE-05).
 * @param {{ importSetId?: unknown }} doc
 * @param {string} targetSetId
 */
function assertDocumentBelongsToSetOrEmpty(doc, targetSetId) {
  const existing = doc?.importSetId ? String(doc.importSetId) : '';
  if (existing && existing !== String(targetSetId)) {
    throw httpError(
      'Không được mix Raw/Analysis giữa các Import Set',
      409,
      IMPORT_SET_ERROR_CODES.MIX_FORBIDDEN
    );
  }
}

module.exports = {
  IMPORT_SET_STATUSES,
  IMPORT_SET_ERROR_CODES,
  assertCanAttachRaw,
  assertCanAttachAnalysis,
  assertCanActivate,
  assertCanRestore,
  planActivateSwap,
  planRestoreSwap,
  assertDocumentBelongsToSetOrEmpty,
};

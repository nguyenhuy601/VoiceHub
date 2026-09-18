/**
 * Analysis Import Set — aggregate Raw + Analysis + Pack/Artifacts.
 * SSOT business rules: 1 ACTIVE set / project; cascade trash/restore; set-level gate.
 */

const IMPORT_SET_STATUSES = Object.freeze([
  'draft',
  'pending_review',
  'rejected',
  'active',
  'trashed',
]);

const RETENTION_DAYS = Math.max(
  1,
  Number.parseInt(process.env.IMPORT_SET_RETENTION_DAYS || '30', 10) || 30
);

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
  TRANSITION_DENIED: 'IMPORT_SET_TRANSITION_DENIED',
  PUBLISH_DENIED: 'IMPORT_SET_PUBLISH_DENIED',
  TECH_REVIEWER_REQUIRED: 'TECH_REVIEWER_REQUIRED',
  STORAGE_REQUIRED: 'IMPORT_SET_STORAGE_REQUIRED',
});

/** Set gate forward targets (while status=pending_review) */
const SET_GATE_TARGETS = Object.freeze(['tech_review', 'po_review', 'approved', 'rejected']);

const SET_GATE_TRANSITION_PERMISSION = Object.freeze({
  'pending_review:tech_review': 'analysis:ba_review',
  'pending_review:po_review': 'analysis:tech_review',
  'pending_review:approved': 'analysis:po_review',
  'pending_review:rejected': 'analysis:ba_review',
});

function httpError(message, statusCode, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function isPhase1SetGateEnabled() {
  const v = String(process.env.PHASE1_SET_GATE_ENABLED || '').trim().toLowerCase();
  if (v === '0' || v === 'false') return false;
  if (v === '1' || v === 'true') return true;
  return true;
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

/**
 * @param {Date | string | number | null | undefined} trashedAt
 * @param {number} [retentionDays]
 */
function computeRetention(trashedAt, retentionDays = RETENTION_DAYS) {
  if (!trashedAt) {
    return { purgeAfterAt: null, retentionDaysLeft: null };
  }
  const at = trashedAt instanceof Date ? trashedAt : new Date(trashedAt);
  if (Number.isNaN(at.getTime())) {
    return { purgeAfterAt: null, retentionDaysLeft: null };
  }
  const purgeAfterAt = new Date(at.getTime() + retentionDays * 86400000);
  const msLeft = purgeAfterAt.getTime() - Date.now();
  const retentionDaysLeft = Math.max(0, Math.ceil(msLeft / 86400000));
  return { purgeAfterAt, retentionDaysLeft };
}

function hasGateStamp(stamp) {
  return Boolean(stamp?.userId && stamp?.at);
}

/**
 * @param {{ status?: string, review?: { ba?: object, tech?: object, po?: object } }} set
 */
function assertCanPublish(set) {
  if (String(set?.status || '') !== 'pending_review') {
    throw httpError(
      'Chỉ publish Import Set đang chờ duyệt',
      409,
      IMPORT_SET_ERROR_CODES.PUBLISH_DENIED
    );
  }
  const review = set?.review || {};
  if (!hasGateStamp(review.ba) || !hasGateStamp(review.tech) || !hasGateStamp(review.po)) {
    throw httpError(
      'Chưa đủ 3 cổng duyệt (BA, Tech, PO)',
      409,
      IMPORT_SET_ERROR_CODES.PUBLISH_DENIED
    );
  }
}

/**
 * @param {{ status?: string, review?: { ba?: object, tech?: object, po?: object } }} set
 * @param {string} toStatus
 */
function planSetTransition(set, toStatus) {
  const from = String(set?.status || '').trim().toLowerCase();
  const to = String(toStatus || '')
    .trim()
    .toLowerCase();
  if (from !== 'pending_review') {
    throw httpError(
      'Chỉ chuyển trạng thái khi Import Set đang pending_review',
      409,
      IMPORT_SET_ERROR_CODES.TRANSITION_DENIED
    );
  }
  if (!SET_GATE_TARGETS.includes(to)) {
    throw httpError('toStatus không hợp lệ', 400, IMPORT_SET_ERROR_CODES.TRANSITION_DENIED);
  }
  const review = set?.review || {};
  if (to === 'tech_review') {
    if (hasGateStamp(review.ba)) {
      throw httpError('BA đã duyệt', 409, IMPORT_SET_ERROR_CODES.TRANSITION_DENIED);
    }
  } else if (to === 'po_review') {
    if (!hasGateStamp(review.ba)) {
      throw httpError('Cần BA duyệt trước', 409, IMPORT_SET_ERROR_CODES.TRANSITION_DENIED);
    }
    if (hasGateStamp(review.tech)) {
      throw httpError('Tech đã duyệt', 409, IMPORT_SET_ERROR_CODES.TRANSITION_DENIED);
    }
  } else if (to === 'approved') {
    if (!hasGateStamp(review.ba) || !hasGateStamp(review.tech)) {
      throw httpError('Cần BA và Tech duyệt trước', 409, IMPORT_SET_ERROR_CODES.TRANSITION_DENIED);
    }
    // PO stamp may already exist after a timed-out publish — allow idempotent republish.
    if (hasGateStamp(review.po)) {
      return {
        from,
        to,
        permission: SET_GATE_TRANSITION_PERMISSION['pending_review:approved'],
        publish: true,
        republish: true,
      };
    }
  } else if (to === 'rejected') {
    /* always allowed from pending_review */
  }

  const permKey = `${from}:${to === 'approved' ? 'approved' : to}`;
  const permission = SET_GATE_TRANSITION_PERMISSION[permKey] || null;
  return { from, to, permission, publish: to === 'approved', republish: false };
}

function permissionForSetTransition(from, to) {
  const a = String(from || '').trim().toLowerCase();
  const b = String(to || '').trim().toLowerCase();
  return SET_GATE_TRANSITION_PERMISSION[`${a}:${b}`] || null;
}

module.exports = {
  IMPORT_SET_STATUSES,
  RETENTION_DAYS,
  IMPORT_SET_ERROR_CODES,
  SET_GATE_TARGETS,
  SET_GATE_TRANSITION_PERMISSION,
  isPhase1SetGateEnabled,
  assertCanAttachRaw,
  assertCanAttachAnalysis,
  assertCanActivate,
  assertCanRestore,
  planActivateSwap,
  planRestoreSwap,
  assertDocumentBelongsToSetOrEmpty,
  computeRetention,
  assertCanPublish,
  planSetTransition,
  permissionForSetTransition,
  hasGateStamp,
};

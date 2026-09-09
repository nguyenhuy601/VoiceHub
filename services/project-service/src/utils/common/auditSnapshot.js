/**
 * Pure helpers — field-level before/after for AuditEvent (Phase 6).
 */

function pickAuditFields(doc, keys = []) {
  const src = doc && typeof doc === 'object' ? doc : {};
  const out = {};
  for (const key of keys) {
    const k = String(key || '').trim();
    if (!k) continue;
    const val = src[k];
    out[k] = val === undefined ? null : val;
  }
  return out;
}

function buildBeforeAfter(beforeDoc, afterDoc, keys) {
  return {
    before: pickAuditFields(beforeDoc, keys),
    after: pickAuditFields(afterDoc, keys),
  };
}

function isProjectAuditV1Enabled() {
  const raw = String(process.env.PROJECT_AUDIT_V1 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/** User API không được xóa audit — luôn 403. */
function createAppendOnlyDeleteError() {
  const err = new Error('Audit events are append-only');
  err.statusCode = 403;
  err.errorCode = 'AUDIT_APPEND_ONLY';
  return err;
}

module.exports = {
  pickAuditFields,
  buildBeforeAfter,
  isProjectAuditV1Enabled,
  createAppendOnlyDeleteError,
};

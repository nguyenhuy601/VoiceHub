/**
 * Phase 4 checklist SoD + evidence rules (pure; unit-tested).
 * PO-only: acceptance_signed_off, handover_completed (handover:accept qua role matrix).
 * PM: release_notes, deployment_verified (delivery_phase:change).
 * UAT Pass vẫn dùng uat:sign_off (PO+PM). Creator/admin không bypass tick nghiệm thu.
 */

const PO_CHECKLIST_IDS = Object.freeze(['acceptance_signed_off', 'handover_completed']);
const PM_CHECKLIST_IDS = Object.freeze(['release_notes', 'deployment_verified']);

function checklistIdsChanged(prev = {}, next = {}, ids = []) {
  return ids.filter((id) => Boolean(prev[id]) !== Boolean(next[id]));
}

/**
 * @returns {{ ok: true } | { ok: false, statusCode: number, errorCode: string, message: string }}
 */
function assertHandoverChecklistAuthz({
  prevChecklist = {},
  nextChecklist = {},
  canPhase = false,
  canAccept = false,
} = {}) {
  const poChanged = checklistIdsChanged(prevChecklist, nextChecklist, PO_CHECKLIST_IDS);
  const pmChanged = checklistIdsChanged(prevChecklist, nextChecklist, PM_CHECKLIST_IDS);

  if (!poChanged.length && !pmChanged.length) {
    return { ok: true };
  }
  if (poChanged.length && !canAccept) {
    return {
      ok: false,
      statusCode: 403,
      errorCode: 'HANDOVER_ACCEPT_FORBIDDEN',
      message:
        'Chỉ Product Owner được xác nhận nghiệm thu và hoàn tất bàn giao',
    };
  }
  if (pmChanged.length && !canPhase) {
    return {
      ok: false,
      statusCode: 403,
      errorCode: 'HANDOVER_CHECKLIST_FORBIDDEN',
      message: 'Chỉ Project Manager được cập nhật mục checklist bàn giao này',
    };
  }
  return { ok: true };
}

function resolvePipelineUrl(deployEvidence) {
  return String(deployEvidence?.pipelineUrl || '')
    .trim()
    .slice(0, 500);
}

function isHttpsOrHttpUrl(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

/**
 * When turning deployment_verified on, require https? pipeline URL on evidence.
 * @returns {{ ok: true } | { ok: false, statusCode: number, errorCode: string, message: string }}
 */
function assertDeployVerifiedEvidence({
  prevChecklist = {},
  nextChecklist = {},
  deployEvidence = null,
} = {}) {
  const turningOn =
    nextChecklist.deployment_verified === true && prevChecklist.deployment_verified !== true;
  if (!turningOn) return { ok: true };
  const url = resolvePipelineUrl(deployEvidence);
  if (!isHttpsOrHttpUrl(url)) {
    return {
      ok: false,
      statusCode: 409,
      errorCode: 'DEPLOY_VERIFY_NEED_EVIDENCE_URL',
      message:
        'Cần lưu bằng chứng deploy (URL pipeline https) trước khi tick “Đã verify deploy”',
    };
  }
  return { ok: true };
}

function buildChecklistMetaPatch({
  prevChecklist = {},
  nextChecklist = {},
  prevMeta = {},
  userId = null,
  now = null,
} = {}) {
  const at = now instanceof Date ? now : new Date();
  const by =
    userId != null && String(userId).trim() ? String(userId).trim() : null;
  const base =
    prevMeta && typeof prevMeta === 'object' && !Array.isArray(prevMeta) ? { ...prevMeta } : {};
  const allIds = new Set([
    ...Object.keys(prevChecklist || {}),
    ...Object.keys(nextChecklist || {}),
    ...PO_CHECKLIST_IDS,
    ...PM_CHECKLIST_IDS,
  ]);
  for (const id of allIds) {
    if (Boolean(prevChecklist[id]) === Boolean(nextChecklist[id])) continue;
    base[id] = { at, byUserId: by };
  }
  return base;
}

module.exports = {
  PO_CHECKLIST_IDS,
  PM_CHECKLIST_IDS,
  checklistIdsChanged,
  assertHandoverChecklistAuthz,
  assertDeployVerifiedEvidence,
  buildChecklistMetaPatch,
  resolvePipelineUrl,
  isHttpsOrHttpUrl,
};

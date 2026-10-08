import toast from 'react-hot-toast';

import { requirementAPI } from '../../services/api/requirementAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

/** Gate1 codes that allow forceApprove + overrideReason retry */
const GATE1_FORCEABLE_CODES = new Set([
  'GATE_A_FAILED',
  'GATE_A_MISSING',
  'CONFLICT_AMBIGUITY_BLOCKING',
  'CONFLICT_AMBIGUITY_OVERRIDE_REASON_REQUIRED',
  'G4_UNDERSTANDING_MISSING',
]);

function readErrorCode(error) {
  return (
    error?.response?.data?.errorCode ||
    error?.errorCode ||
    error?.data?.errorCode ||
    ''
  );
}

function forcePromptMessage(code, t) {
  if (code === 'CONFLICT_AMBIGUITY_BLOCKING' || code === 'CONFLICT_AMBIGUITY_OVERRIDE_REASON_REQUIRED') {
    return (
      t('requirements.gate1ForceConflictPrompt') ||
      'Còn conflict/ambiguity. Nhập lý do để force duyệt Gate 1 (hoặc Cancel):'
    );
  }
  if (code === 'G4_UNDERSTANDING_MISSING') {
    return (
      t('requirements.gate1ForceG4Prompt') ||
      'Thiếu kết quả AI Requirement. Nhập lý do để force duyệt Gate 1 (hoặc Cancel):'
    );
  }
  return (
    t('requirements.gate1ForceReasonPrompt') ||
    'Gate A chưa đạt. Nhập lý do để force duyệt (hoặc Cancel):'
  );
}

function forcePromptTitle(code, t) {
  if (code === 'CONFLICT_AMBIGUITY_BLOCKING' || code === 'CONFLICT_AMBIGUITY_OVERRIDE_REASON_REQUIRED') {
    return t('requirements.gate1ForceConflictTitle') || 'Force duyệt Gate 1 — Integrity';
  }
  if (code === 'G4_UNDERSTANDING_MISSING') {
    return t('requirements.gate1ForceG4Title') || 'Force duyệt Gate 1 — thiếu G4';
  }
  return t('requirements.gate1ForceReasonTitle') || 'Force duyệt Gate 1';
}

/**
 * Approve pack; if Gate1 policy blocks (409/400 forceable), ask overrideReason via modal callback.
 * @param {{ requestForceReason: (ctx: { code: string, message: string, title: string }) => Promise<string|null> }} args
 * — required; no window.prompt bypass.
 */
export async function approveRequirementPackWithGate1({
  orgId,
  packId,
  t,
  body = {},
  requestForceReason,
}) {
  try {
    await requirementAPI.approvePack(orgId, packId, body);
    return { ok: true, forced: Boolean(body.forceApprove) };
  } catch (error) {
    const code = readErrorCode(error);
    if (!GATE1_FORCEABLE_CODES.has(code)) {
      throw error;
    }
    if (typeof requestForceReason !== 'function') {
      const err = new Error(
        t('requirements.gate1ForceReasonRequired') ||
          'Cần nhập lý do force duyệt Gate 1 (modal).'
      );
      err.statusCode = 400;
      err.errorCode = 'GATE1_FORCE_REASON_UI_REQUIRED';
      throw err;
    }
    const reasonRaw = await requestForceReason({
      code,
      message: forcePromptMessage(code, t),
      title: forcePromptTitle(code, t),
    });
    if (reasonRaw == null) {
      return { ok: false, cancelled: true };
    }
    const overrideReason = String(reasonRaw).trim().slice(0, 2000);
    if (!overrideReason) {
      toast.error(
        t('requirements.gate1ForceReasonRequired') || 'Cần lý do khi force duyệt Gate 1.'
      );
      return { ok: false, cancelled: false };
    }
    await requirementAPI.approvePack(orgId, packId, {
      ...body,
      forceApprove: true,
      overrideReason,
    });
    return { ok: true, forced: true };
  }
}

export function readPackGateA(pack) {
  const gateA = pack?.aiAnalysis?.analyses?.requirementTools?.gateA;
  if (!gateA || typeof gateA !== 'object') return null;
  return {
    passed: Boolean(gateA.passed),
    checks: Array.isArray(gateA.checks) ? gateA.checks : [],
    thresholds: gateA.thresholds || null,
  };
}

/** Extract failed Gate A check ids from approve 409 details (or pack). */
export function listFailedGateACheckIds(errorOrGateA) {
  const fromDetails =
    errorOrGateA?.response?.data?.details?.gateA?.failedChecks ||
    errorOrGateA?.details?.gateA?.failedChecks ||
    errorOrGateA?.failedChecks;
  if (Array.isArray(fromDetails) && fromDetails.length) {
    return fromDetails.map((c) => c?.id).filter(Boolean);
  }
  const checks =
    errorOrGateA?.response?.data?.details?.gateA?.checks ||
    errorOrGateA?.details?.gateA?.checks ||
    errorOrGateA?.checks;
  if (Array.isArray(checks)) {
    return checks.filter((c) => c && c.passed === false).map((c) => c.id).filter(Boolean);
  }
  return [];
}

export function formatGateAApproveError(error, { t, fallback }) {
  return formatGate1ApproveError(error, { t, fallback });
}

export function formatGate1ApproveError(error, { t, fallback }) {
  const code = readErrorCode(error);
  if (code === 'GATE_A_FAILED') {
    const failedIds = listFailedGateACheckIds(error);
    const base = t('requirements.gateAFailed') || resolveApiErrorMessage(error, { t, fallback });
    if (!failedIds.length) return base;
    const labels = failedIds
      .map((id) => {
        const key = `requirements.gateACheck${id.charAt(0).toUpperCase()}${id.slice(1)}`;
        const translated = t(key);
        return translated && translated !== key ? translated : id;
      })
      .join(', ');
    return `${base} (${labels})`;
  }
  if (code === 'GATE_A_MISSING') {
    return t('requirements.gateAMissing') || resolveApiErrorMessage(error, { t, fallback });
  }
  if (code === 'CONFLICT_AMBIGUITY_BLOCKING') {
    const blocking =
      error?.response?.data?.details?.gate?.blocking ||
      error?.details?.gate?.blocking ||
      [];
    const preview = Array.isArray(blocking)
      ? blocking
          .slice(0, 5)
          .map((b) => {
            const id = b?.requirementId || b?.from || b?.id;
            const missing = Array.isArray(b?.missing) ? b.missing.join('/') : '';
            if (id && missing) return `${id}[${missing}]`;
            return id || b?.message || b?.code;
          })
          .filter(Boolean)
          .join(', ')
      : '';
    const base =
      t('requirements.gate1IntegrityBlocking') ||
      t('requirements.gate1ConflictBlocking') ||
      resolveApiErrorMessage(error, { t, fallback });
    return preview ? `${base} (${preview})` : base;
  }
  if (code === 'G4_UNDERSTANDING_MISSING') {
    return (
      t('requirements.gate1G4Missing') ||
      resolveApiErrorMessage(error, { t, fallback })
    );
  }
  return resolveApiErrorMessage(error, { t, fallback });
}

export { GATE1_FORCEABLE_CODES, forcePromptMessage, forcePromptTitle };

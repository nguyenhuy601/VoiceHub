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
      'Thiếu G4 Understanding. Nhập lý do để force duyệt Gate 1 (hoặc Cancel):'
    );
  }
  return (
    t('requirements.gate1ForceReasonPrompt') ||
    'Gate A chưa đạt. Nhập lý do để force duyệt (hoặc Cancel):'
  );
}

/**
 * Approve pack; if Gate1 policy blocks (409/400 forceable), prompt overrideReason and retry.
 */
export async function approveRequirementPackWithGate1({
  orgId,
  packId,
  t,
  body = {},
}) {
  try {
    await requirementAPI.approvePack(orgId, packId, body);
    return { ok: true, forced: Boolean(body.forceApprove) };
  } catch (error) {
    const code = readErrorCode(error);
    if (!GATE1_FORCEABLE_CODES.has(code)) {
      throw error;
    }
    const reasonRaw = window.prompt(forcePromptMessage(code, t), '');
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
  };
}

export function formatGateAApproveError(error, { t, fallback }) {
  return formatGate1ApproveError(error, { t, fallback });
}

export function formatGate1ApproveError(error, { t, fallback }) {
  const code = readErrorCode(error);
  if (code === 'GATE_A_FAILED') {
    return t('requirements.gateAFailed') || resolveApiErrorMessage(error, { t, fallback });
  }
  if (code === 'GATE_A_MISSING') {
    return t('requirements.gateAMissing') || resolveApiErrorMessage(error, { t, fallback });
  }
  if (code === 'CONFLICT_AMBIGUITY_BLOCKING') {
    return (
      t('requirements.gate1ConflictBlocking') ||
      resolveApiErrorMessage(error, { t, fallback })
    );
  }
  if (code === 'G4_UNDERSTANDING_MISSING') {
    return (
      t('requirements.gate1G4Missing') ||
      resolveApiErrorMessage(error, { t, fallback })
    );
  }
  return resolveApiErrorMessage(error, { t, fallback });
}

export { GATE1_FORCEABLE_CODES };

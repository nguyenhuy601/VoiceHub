import toast from 'react-hot-toast';

import { requirementAPI } from '../../services/api/requirementAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

/**
 * Approve pack; if Gate A blocks (409), prompt for overrideReason and retry with forceApprove.
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
    const code =
      error?.response?.data?.errorCode ||
      error?.errorCode ||
      error?.data?.errorCode ||
      '';
    if (code !== 'GATE_A_FAILED' && code !== 'GATE_A_MISSING') {
      throw error;
    }
    const reasonRaw = window.prompt(
      t('requirements.gate1ForceReasonPrompt') ||
        'Gate A chưa đạt. Nhập lý do để force duyệt (hoặc Cancel):',
      ''
    );
    if (reasonRaw == null) {
      return { ok: false, cancelled: true };
    }
    const overrideReason = String(reasonRaw).trim().slice(0, 2000);
    if (!overrideReason) {
      toast.error(
        t('requirements.gate1ForceReasonRequired') || 'Cần lý do khi force duyệt Gate A.'
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
  const code =
    error?.response?.data?.errorCode || error?.errorCode || error?.data?.errorCode || '';
  if (code === 'GATE_A_FAILED') {
    return t('requirements.gateAFailed') || resolveApiErrorMessage(error, { t, fallback });
  }
  if (code === 'GATE_A_MISSING') {
    return t('requirements.gateAMissing') || resolveApiErrorMessage(error, { t, fallback });
  }
  return resolveApiErrorMessage(error, { t, fallback });
}

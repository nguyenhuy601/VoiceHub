import { isAssignmentEngineEnabled } from './assignmentEngineMode';

/**
 * FE pre-check trước khi gọi API.
 * Khi Assignment Engine bật: không chặn theo Team.leader / ownerTeamId (BE evaluate Delegation Graph).
 * Khi tắt: shim chuẩn vàng 2 tầng (rollback).
 */
export function canSetCardAssignee(scope, ownerTeamId) {
  if (isAssignmentEngineEnabled()) {
    return { ok: true, messageKey: null, engine: true };
  }
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role === 'owner' || role === 'admin') {
    return { ok: true };
  }
  const teamId = String(ownerTeamId || '').trim();
  if (!teamId) {
    return {
      ok: false,
      messageKey: 'taskBoard.assignNeedTeamFirst',
    };
  }
  const led = new Set((scope?.ledTeamIds || []).map(String));
  if (led.has(teamId)) {
    return { ok: true };
  }
  return {
    ok: false,
    messageKey: 'taskBoard.assignOnlyTeamLead',
  };
}

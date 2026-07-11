/** Chuẩn vàng 2 tầng — mirror BE goldenAssignPolicy (FE toast trước khi gọi API). */
export function canSetCardAssignee(scope, ownerTeamId) {
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

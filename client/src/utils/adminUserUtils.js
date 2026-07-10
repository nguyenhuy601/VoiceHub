export function memberUserId(member) {
  return String(member?.userId || member?.user?._id || member?.user || member?._id || '').trim();
}

export function memberDisplayName(member, fallback = '—') {
  const email = String(member?.email || '').trim();
  const emailLocal = email.includes('@') ? email.split('@')[0] : '';
  return (
    member?.displayName ||
    member?.fullName ||
    member?.username ||
    emailLocal ||
    memberUserId(member).slice(-6) ||
    fallback
  );
}

export function memberEmail(member) {
  return String(member?.email || '').trim() || '—';
}

export function memberOrgRole(member) {
  return String(member?.role || member?.orgRole || 'member').toLowerCase();
}

export function memberStatusLabel(member, t) {
  if (member?.isLocked) return t('adminUsers.statusLocked');
  if (member?.isActive === false) return t('adminUsers.statusInactive');
  if (member?.mustChangePassword) return t('adminUsers.statusMustChangePassword');
  return t('adminUsers.statusActive');
}

export function unwrapApi(payload) {
  return payload?.data ?? payload;
}

export function parseCsvInviteRows(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const rows = [];
  const start = lines[0].toLowerCase().includes('email') ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const parts = lines[i].split(/[,;\t]/).map((p) => p.trim());
    const [email, firstName = '', lastName = '', role = 'member'] = parts;
    if (!email) continue;
    rows.push({ email, firstName, lastName, role: role || 'member' });
  }
  return rows;
}

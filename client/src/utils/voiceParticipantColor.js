const PALETTE = ['#2563EB', '#22D3EE', '#10B981', '#8B5CF6', '#F59E0B', '#EF4444'];

export function voiceParticipantColor(seed = '') {
  const s = String(seed || 'user');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
    hash |= 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

export function voiceParticipantInitials(name = '') {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) || '?').toUpperCase();
}

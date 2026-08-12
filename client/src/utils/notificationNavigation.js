/** @typedef {{ actionUrl?: string, data?: Record<string, unknown> }} NotificationLike */

export function isVoiceRoomInviteNotification(notif) {
  const kind = String(notif?.data?.kind || '').trim();
  return kind === 'voice_room_invite' || kind === 'voice_invite';
}

/**
 * Đường dẫn in-app tới màn prejoin xin vào phòng (VoiceRoomPage ?join=1).
 * @param {NotificationLike | null | undefined} notif
 * @returns {string | null}
 */
export function resolveVoiceRoomInvitePath(notif) {
  if (!notif) return null;

  const data = notif.data && typeof notif.data === 'object' ? notif.data : {};
  const actionUrl = String(notif.actionUrl || '').trim();

  const normalizePath = (pathname) => {
    let path = String(pathname || '').trim();
    if (!path) return '';
    if (path.startsWith('/voice/')) {
      path = path.replace(/^\/voice/, '/app/communicate/voice');
    }
    if (path === '/voice') {
      path = '/app/communicate/voice';
    }
    return path;
  };

  if (actionUrl) {
    try {
      const parsed = actionUrl.startsWith('http')
        ? new URL(actionUrl)
        : new URL(actionUrl, typeof window !== 'undefined' ? window.location.origin : 'https://voicehub.local');
      const path = normalizePath(parsed.pathname);
      if (path.startsWith('/app/communicate/voice')) {
        const params = new URLSearchParams(parsed.search);
        if (!params.has('join')) {
          params.set('join', '1');
        }
        const qs = params.toString();
        return qs ? `${path}?${qs}` : path;
      }
    } catch {
      /* fall through */
    }
  }

  const roomId = String(data.roomId || '').trim();
  if (roomId) {
    return `/app/communicate/voice/${encodeURIComponent(roomId)}?join=1`;
  }

  return null;
}

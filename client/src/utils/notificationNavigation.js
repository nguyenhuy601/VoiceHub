/** @typedef {{ actionUrl?: string, data?: Record<string, unknown>, organizationId?: string, projectId?: string }} NotificationLike */

function buildProjectHubPath(projectId, query = {}) {
  const pid = String(projectId || '').trim();
  const base = pid
    ? `/app/collaborate/projects/${encodeURIComponent(pid)}`
    : '/app/collaborate/projects';
  const params = new URLSearchParams();
  const orgId = String(query?.organizationId || query?.orgId || '').trim();
  const boardId = String(query?.boardId || '').trim();
  if (orgId) params.set('organizationId', orgId);
  if (boardId) params.set('boardId', boardId);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

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

/**
 * Chỉ nhận path in-app `/app/...` (kèm query). Bỏ URL ngoài / legacy `/tasks/:id`.
 * @param {string} [actionUrl]
 * @returns {string | null}
 */
export function parseSafeAppPath(actionUrl) {
  const raw = String(actionUrl || '').trim();
  if (!raw) return null;
  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(raw) || raw.startsWith('//')) return null;
  try {
    const parsed = new URL(raw, 'https://voicehub.local');
    const path = String(parsed.pathname || '').trim();
    if (!path.startsWith('/app/')) return null;
    const qs = parsed.search || '';
    return `${path}${qs}`;
  } catch {
    if (raw.startsWith('/app/') && !raw.includes('://')) {
      return raw.split('#')[0];
    }
    return null;
  }
}

/**
 * Ưu tiên actionUrl `/app/...`, không thì Hub Project theo projectId.
 * @param {NotificationLike | null | undefined} notif
 * @returns {string | null}
 */
export function resolveNotificationAppPath(notif) {
  if (!notif) return null;
  const fromAction = parseSafeAppPath(notif.actionUrl || notif.data?.actionUrl);
  if (fromAction) return fromAction;
  const data = notif.data && typeof notif.data === 'object' ? notif.data : {};
  const projectId = String(data.projectId || notif.projectId || '').trim();
  if (!projectId) return null;
  return buildProjectHubPath(projectId, {
    organizationId: data.organizationId || notif.organizationId,
    boardId: data.boardId,
  });
}

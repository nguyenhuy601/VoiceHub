/** @typedef {{ actionUrl?: string, data?: Record<string, unknown> }} NotificationLike */

/**
 * Chuẩn hoá pathname legacy → `/app/...`.
 * @param {string} pathname
 * @param {string} [search]
 */
export function normalizeLegacyAppPath(pathname, search = '') {
  let path = String(pathname || '').trim();
  if (!path) return null;
  if (path.startsWith('/voice/')) {
    path = path.replace(/^\/voice/, '/app/communicate/voice');
  } else if (path === '/voice') {
    path = '/app/communicate/voice';
  } else if (path.startsWith('/chat/friends')) {
    path = `/app/communicate${path}`;
  } else if (path.startsWith('/documents')) {
    path = `/app/collaborate/documents${path === '/documents' ? '' : path.slice('/documents'.length)}`;
  } else if (path.startsWith('/organizations/')) {
    path = `/app/collaborate${path}`;
  } else if (path === '/organizations') {
    path = '/app/collaborate/workspaces';
  }
  if (!path.startsWith('/app/')) return null;
  const qs = search || '';
  return `${path}${qs}`;
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

  if (actionUrl) {
    try {
      const parsed = actionUrl.startsWith('http') || actionUrl.startsWith('//')
        ? new URL(actionUrl)
        : new URL(actionUrl, typeof window !== 'undefined' ? window.location.origin : 'https://voicehub.local');
      const normalized = normalizeLegacyAppPath(parsed.pathname, parsed.search || '');
      if (normalized && normalized.startsWith('/app/communicate/voice')) {
        const [pathOnly, qsRaw] = normalized.split('?');
        const params = new URLSearchParams(qsRaw || '');
        if (!params.has('join')) params.set('join', '1');
        const qs = params.toString();
        return qs ? `${pathOnly}?${qs}` : pathOnly;
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
 * Chỉ nhận path in-app `/app/...` (kèm query). Cho phép absolute URL cùng path /app hoặc legacy đã map.
 * @param {string} [actionUrl]
 * @returns {string | null}
 */
export function parseSafeAppPath(actionUrl) {
  const raw = String(actionUrl || '').trim();
  if (!raw) return null;
  try {
    const parsed =
      raw.startsWith('http') || raw.startsWith('//')
        ? new URL(raw)
        : new URL(raw, 'https://voicehub.local');
    return normalizeLegacyAppPath(parsed.pathname, parsed.search || '');
  } catch {
    if (raw.startsWith('/app/') && !raw.includes('://')) {
      return raw.split('#')[0];
    }
    const legacy = normalizeLegacyAppPath(raw.split('?')[0], raw.includes('?') ? `?${raw.split('?')[1]}` : '');
    return legacy;
  }
}

/**
 * Ưu tiên actionUrl `/app/...`, không thì Hub Project theo projectId / room channel.
 * @param {NotificationLike | null | undefined} notif
 * @returns {string | null}
 */
export function resolveNotificationAppPath(notif) {
  if (!notif) return null;
  const fromAction = parseSafeAppPath(notif.actionUrl || notif.data?.actionUrl);
  if (fromAction) return fromAction;
  const data = notif.data && typeof notif.data === 'object' ? notif.data : {};
  const kind = String(data.kind || '').trim();
  const organizationId = String(data.organizationId || notif.organizationId || '').trim();
  const roomId = String(data.roomId || '').trim();
  if ((kind === 'project_mention' || kind === 'cross_team_work') && organizationId && roomId) {
    const projectId = String(data.projectId || '').trim();
    if (projectId) {
      return buildProjectHubPath(projectId, { organizationId, boardId: data.boardId });
    }
    return `/app/collaborate/organizations/${encodeURIComponent(organizationId)}/channels?channelId=${encodeURIComponent(roomId)}`;
  }
  const projectId = String(data.projectId || notif.projectId || '').trim();
  if (!projectId) return null;
  return buildProjectHubPath(projectId, {
    organizationId,
    boardId: data.boardId,
  });
}

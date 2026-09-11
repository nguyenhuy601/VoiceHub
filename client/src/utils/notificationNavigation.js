import {
  buildProjectsModulePath,
  buildProjectsPickerPath,
  mapCollaboratePathToDualSuite,
} from './suitePathUtils.js';

/** @typedef {{ actionUrl?: string, data?: Record<string, unknown>, organizationId?: string, projectId?: string }} NotificationLike */

/**
 * Normalize legacy in-app paths (collaborate → dual suite, /voice → communicate).
 * @param {string} pathname
 * @param {string} [search]
 * @returns {string}
 */
export function normalizeLegacyAppPath(pathname, search = '') {
  const path = String(pathname || '').replace(/\/+/g, '/');
  const qsRaw = typeof search === 'string' ? search.replace(/^\?/, '') : '';
  const qs = qsRaw ? `?${qsRaw}` : '';

  if (path.startsWith('/app/collaborate')) {
    return mapCollaboratePathToDualSuite(path, qs);
  }

  const voiceMatch = path.match(/^\/voice\/([^/]+)\/?$/);
  if (voiceMatch) {
    return `/app/communicate/voice/${encodeURIComponent(voiceMatch[1])}${qs}`;
  }

  return `${path}${qs}`;
}

function buildProjectHubPath(projectId, query = {}) {
  const pid = String(projectId || '').trim();
  if (!pid) return buildProjectsPickerPath(query?.organizationId || query?.orgId || '');
  return buildProjectsModulePath(pid, 'overview', {
    organizationId: query?.organizationId || query?.orgId,
    boardId: query?.boardId,
  });
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
  if (fromAction) {
    if (fromAction.startsWith('/app/collaborate')) {
      const qIdx = fromAction.indexOf('?');
      const pathOnly = qIdx >= 0 ? fromAction.slice(0, qIdx) : fromAction;
      const search = qIdx >= 0 ? fromAction.slice(qIdx) : '';
      return mapCollaboratePathToDualSuite(pathOnly, search);
    }
    return fromAction;
  }
  const data = notif.data && typeof notif.data === 'object' ? notif.data : {};
  const projectId = String(data.projectId || notif.projectId || '').trim();
  if (!projectId) return null;
  return buildProjectHubPath(projectId, {
    organizationId: data.organizationId || notif.organizationId,
    boardId: data.boardId,
  });
}

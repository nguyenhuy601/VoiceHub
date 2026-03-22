import api from './api';

/** Event document — lắng nghe ở NotificationsPage để refetch */
export const NOTIFICATIONS_REFRESH_EVENT = 'voicehub:notifications-refresh';

export function emitNotificationsRefresh() {
  try {
    window.dispatchEvent(new CustomEvent(NOTIFICATIONS_REFRESH_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Sau accept/reject kết bạn: server đánh dấu đã đọc thông báo liên quan tới counterpartyId
 * (requester khi bạn là người nhận lời mời).
 */
export async function markFriendNotificationsResolved(counterpartyId) {
  if (!counterpartyId) return { ok: false };
  try {
    await api.patch('/notifications/read-friend-related', {
      counterpartyId: String(counterpartyId),
    });
    emitNotificationsRefresh();
    return { ok: true };
  } catch (e) {
    console.warn('[notificationSync] markFriendNotificationsResolved', e?.message || e);
    return { ok: false };
  }
}

/**
 * Logic receipt tin kênh (FE) — đồng bộ với roomReadCursorLogic BE.
 */

export function compareMessageIds(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function isMessageSeenByCursor(messageId, lastReadMessageId) {
  if (!messageId || !lastReadMessageId) return false;
  return compareMessageIds(messageId, lastReadMessageId) <= 0;
}

/**
 * @returns {'sent'|'seen'}
 */
export function resolveOutgoingRoomReceipt({
  messageId,
  peerCursors = [],
  excludeUserId = '',
} = {}) {
  const mid = String(messageId || '').trim();
  const self = String(excludeUserId || '').trim();
  if (!mid) return 'sent';
  for (const row of peerCursors) {
    const uid = String(row?.userId || '').trim();
    if (self && uid === self) continue;
    if (isMessageSeenByCursor(mid, row?.lastReadMessageId)) return 'seen';
  }
  return 'sent';
}

/**
 * So sánh messageId (ObjectId hex) — id mới hơn thì lớn hơn.
 * @param {string|null|undefined} a
 * @param {string|null|undefined} b
 * @returns {number} negative if a<b, 0 if equal, positive if a>b
 */
function compareMessageIds(a, b) {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  if (!left && !right) return 0;
  if (!left) return -1;
  if (!right) return 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Tin đã được user xem nếu cursor >= messageId.
 */
function isMessageSeenByCursor(messageId, lastReadMessageId) {
  if (!messageId || !lastReadMessageId) return false;
  return compareMessageIds(messageId, lastReadMessageId) <= 0;
}

/**
 * Chỉ advance khi candidate mới hơn cursor hiện tại.
 */
function shouldAdvanceCursor(currentLastReadMessageId, candidateMessageId) {
  if (!candidateMessageId) return false;
  if (!currentLastReadMessageId) return true;
  return compareMessageIds(candidateMessageId, currentLastReadMessageId) > 0;
}

/**
 * Receipt label cho tin gửi đi: seen nếu ≥1 peer cursor >= message.
 * @param {{ messageId: string, peerCursors?: Array<{ userId?: string, lastReadMessageId?: string }>, excludeUserId?: string }} opts
 * @returns {'sent'|'seen'}
 */
function resolveOutgoingRoomReceipt({ messageId, peerCursors = [], excludeUserId = '' } = {}) {
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

module.exports = {
  compareMessageIds,
  isMessageSeenByCursor,
  shouldAdvanceCursor,
  resolveOutgoingRoomReceipt,
};

/**
 * Ghi tin DM vào cache fetchQuery (queryKeys.dm.messages).
 * State local mất khi rời /app/communicate/chat/friends; cache giữ tin khi quay lại (staleTime).
 * Không persist tin tạm (temp- / _optimistic).
 */

import { queryKeys } from '../lib/queryKeys.js';

export function isTransientDmMessage(row) {
  const id = String(row?._id || row?.id || '').trim();
  return !id || id.startsWith('temp-') || row?._optimistic === true;
}

export function persistableDmMessages(list) {
  return (Array.isArray(list) ? list : []).filter((row) => !isTransientDmMessage(row));
}

function participantId(value) {
  return String(value?._id || value || '').trim();
}

/** True khi mọi tin đã persist thuộc hội thoại với peer (tránh ghi nhầm khi đang đổi bạn). */
export function dmListMatchesPeer(list, peerId) {
  const pid = String(peerId || '').trim();
  if (!pid) return false;
  const persisted = persistableDmMessages(list);
  if (!persisted.length) return true;
  return persisted.every((row) => {
    const sender = participantId(row.senderId);
    const receiver = participantId(row.receiverId);
    return sender === pid || receiver === pid;
  });
}

/**
 * @param {object|undefined} prev — { arr, totalPages, currentPage, nextPageToken, hasMore }
 * @param {object[]} list
 */
export function applyDmConversationCache(prev, list) {
  const arr = persistableDmMessages(list);
  if (prev && typeof prev === 'object' && !Array.isArray(prev)) {
    return { ...prev, arr };
  }
  return {
    arr,
    totalPages: 1,
    currentPage: 1,
    nextPageToken: null,
    hasMore: false,
  };
}

export function persistDmConversationCache(queryClient, peerId, list) {
  const pid = String(peerId || '').trim();
  if (!queryClient || !pid) return;
  const persisted = persistableDmMessages(list);
  if (!persisted.length) return;
  if (!dmListMatchesPeer(list, pid)) return;
  queryClient.setQueryData(queryKeys.dm.messages(pid), (prev) =>
    applyDmConversationCache(prev, list)
  );
}

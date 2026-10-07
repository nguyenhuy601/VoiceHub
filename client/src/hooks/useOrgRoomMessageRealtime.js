import { useEffect } from 'react';

/**
 * Listen room:message_edited|deleted|recalled và room:poll_updated cho kênh org/project.
 * Caller cung cấp callback patch/remove — không giữ state nội bộ.
 */
export default function useOrgRoomMessageRealtime({
  roomId = '',
  on,
  off,
  onEdited,
  onRecalled,
  onDeleted,
  onPollUpdated,
  enabled = true,
} = {}) {
  useEffect(() => {
    if (!enabled || !roomId || typeof on !== 'function' || typeof off !== 'function') {
      return undefined;
    }
    const roomKey = String(roomId);

    const matchesRoom = (msg) => {
      const rid = String(msg?.roomId || msg?.room || '');
      return rid === roomKey;
    };

    const handleEdited = (msg) => {
      if (!matchesRoom(msg)) return;
      onEdited?.(msg);
    };

    const handleRecalled = (msg) => {
      if (!matchesRoom(msg)) return;
      onRecalled?.(msg);
    };

    const handleDeleted = (payload) => {
      const msg = payload && typeof payload === 'object' ? payload : null;
      if (msg && (msg.roomId || msg.room) && !matchesRoom(msg)) return;
      const id = msg?.messageId || msg?._id || msg?.id || payload?.messageId;
      if (!id) return;
      onDeleted?.(msg || { _id: id, id, messageId: id, roomId: roomKey });
    };

    const handlePoll = (msg) => {
      if (!matchesRoom(msg)) return;
      onPollUpdated?.(msg);
    };

    on('room:message_edited', handleEdited);
    on('room:message_recalled', handleRecalled);
    on('room:message_deleted', handleDeleted);
    on('room:poll_updated', handlePoll);
    return () => {
      off('room:message_edited', handleEdited);
      off('room:message_recalled', handleRecalled);
      off('room:message_deleted', handleDeleted);
      off('room:poll_updated', handlePoll);
    };
  }, [enabled, roomId, on, off, onEdited, onRecalled, onDeleted, onPollUpdated]);
}

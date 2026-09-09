import { useEffect } from 'react';
import { useSocket } from '../context/SocketContext';

const HEARTBEAT_MS = 30000;

/**
 * Báo server khi user đang mở đúng room Project Chat — skip Inbox @mention.
 */
export function useProjectRoomChatFocus({ enabled = true, roomId = '' } = {}) {
  const { emit, connected } = useSocket();
  const rid = String(roomId || '').trim();

  useEffect(() => {
    if (!enabled || !connected || !rid || typeof emit !== 'function') return undefined;

    const send = (active) => {
      emit('room:chat_focus', { roomId: rid, active: Boolean(active) });
    };

    send(true);
    const timer = setInterval(() => send(true), HEARTBEAT_MS);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') send(false);
      else send(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      send(false);
    };
  }, [enabled, connected, emit, rid]);
}

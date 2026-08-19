import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useOrgShell } from './queries/useOrgShell';
import { useOrgChannelMessages } from './queries/useOrgChannelMessages';
import api from '../services/api';
import { normalizeOrgChatMessage } from '../utils/normalizeOrgChatMessage';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { useAppStrings } from '../locales/appStrings';

const unwrapData = (payload) => payload?.data ?? payload;

function messageId(row) {
  return String(row?._id || row?.id || '').trim();
}

function mergeById(base, extra) {
  const map = new Map();
  for (const row of [...(base || []), ...(extra || [])]) {
    const id = messageId(row);
    if (!id) continue;
    if (!map.has(id)) map.set(id, row);
  }
  return [...map.values()].sort(
    (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );
}

/**
 * Chat kênh Project — shell org + messages. Không load cây phòng ban.
 */
export default function useProjectOrgChat({
  organizationId = '',
  projectIdFilter = '',
  channelId = '',
} = {}) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const { on, off, joinRoom, leaveRoom } = useSocket();
  const orgId = String(organizationId || '').trim();
  const filterPid = String(projectIdFilter || '').trim();
  const requestedChannelId = String(channelId || '').trim();

  const { data: shell, isLoading: shellLoading, isError: shellError } = useOrgShell(orgId);
  const access = shell?.access || {};
  const matrix = access.permissionsByChannelId || {};
  const allProjectChannels = useMemo(
    () => (Array.isArray(access.projectChannels) ? access.projectChannels : []),
    [access.projectChannels]
  );

  const projectChannels = useMemo(() => {
    if (!filterPid) return allProjectChannels;
    return allProjectChannels.filter((ch) => String(ch.projectId || '') === filterPid);
  }, [allProjectChannels, filterPid]);

  const selectedChannel = useMemo(() => {
    if (!requestedChannelId) return null;
    return (
      projectChannels.find((ch) => String(ch._id) === requestedChannelId) || null
    );
  }, [projectChannels, requestedChannelId]);

  const selectedChannelId = selectedChannel?._id ? String(selectedChannel._id) : '';
  const perm = matrix[selectedChannelId] || {};
  const canRead = Boolean(perm.canSee || perm.canRead);
  const canWrite = Boolean(perm.canWrite);

  const messagesQuery = useOrgChannelMessages(selectedChannelId, orgId, {
    enabled: Boolean(selectedChannelId) && canRead,
  });

  const [extraMessages, setExtraMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    setExtraMessages([]);
    setMessageInput('');
  }, [selectedChannelId]);

  const appendLocal = useCallback((raw) => {
    const normalized = normalizeOrgChatMessage(raw?.data !== undefined ? unwrapData(raw) : raw);
    if (!normalized) return;
    const id = messageId(normalized);
    setExtraMessages((prev) => {
      if (id && prev.some((m) => messageId(m) === id)) return prev;
      return [...prev, normalized];
    });
  }, []);

  useEffect(() => {
    if (!selectedChannelId || !orgId || !joinRoom || !leaveRoom) return undefined;
    const roomKey = String(selectedChannelId);
    joinRoom(roomKey, orgId);
    const onNew = (msg) => {
      const rid = String(msg?.roomId || msg?.room || '');
      if (rid !== roomKey) return;
      appendLocal(msg);
    };
    on?.('room:new_message', onNew);
    return () => {
      off?.('room:new_message', onNew);
      leaveRoom(roomKey);
    };
  }, [selectedChannelId, orgId, joinRoom, leaveRoom, on, off, appendLocal]);

  const messages = useMemo(
    () => mergeById(messagesQuery.messages || [], extraMessages),
    [messagesQuery.messages, extraMessages]
  );

  const sendMessage = useCallback(
    async (opts = {}) => {
      const contextProjectId = String(opts.contextProjectId || '').trim();
      const contextProjectName = String(opts.contextProjectName || '').trim();
      const contextRefLabel = String(opts.contextRefs?.[0]?.label || '').trim();
      const content =
        String(messageInput || '').trim() ||
        contextRefLabel ||
        (contextProjectId ? contextProjectName || t('orgPanel.contextCallFallback') : '');
      if (!content || !selectedChannelId || sending) return;
      if (!canWrite) {
        toast.error(t('orgPanel.composerReadOnly'));
        return;
      }
      setSending(true);
      try {
        const body = {
          roomId: selectedChannelId,
          content,
          messageType: 'text',
          organizationId: orgId || undefined,
        };
        if (contextProjectId) {
          body.visibility = {
            mode: 'project_intersection',
            projectId: contextProjectId,
            ...(contextProjectName ? { projectName: contextProjectName } : {}),
          };
        }
        const contextRefs = Array.isArray(opts.contextRefs) ? opts.contextRefs : [];
        if (contextRefs.length) {
          body.refs = contextRefs
            .map((row) => ({
              kind: row.kind,
              id: row.id,
              projectId: row.projectId,
              ...(row.label ? { label: String(row.label).slice(0, 120) } : {}),
            }))
            .filter((row) => row.kind && row.id && row.projectId);
        }
        const payload = await api.post('/messages', body);
        appendLocal(unwrapData(payload));
        setMessageInput('');
        opts.onSent?.();
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('organizations.sendMessageFail') })
        );
      } finally {
        setSending(false);
      }
    },
    [messageInput, selectedChannelId, sending, canWrite, orgId, t, appendLocal]
  );

  return {
    orgId,
    currentUser: user,
    currentUserId: String(user?.userId || user?._id || user?.id || '').trim(),
    shellLoading,
    shellError,
    projectChannels,
    selectedChannel,
    selectedChannelId,
    canRead,
    canWrite,
    messages,
    loadingMessages: messagesQuery.isLoading,
    hasMoreOlder: messagesQuery.hasMoreOlder,
    loadingOlder: messagesQuery.loadingOlder,
    loadOlderMessages: messagesQuery.loadOlderMessages,
    messageInput,
    setMessageInput,
    sending,
    sendMessage,
    channelPermissionMatrix: matrix,
  };
}

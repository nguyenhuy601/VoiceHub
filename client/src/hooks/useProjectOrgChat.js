import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useOrgShell } from './queries/useOrgShell';
import { useOrgChannelMessages } from './queries/useOrgChannelMessages';
import api from '../services/api';
import dmMessageService from '../services/dmMessageService';
import {
  normalizeOrgChatMessage,
  normalizeOrgChatMessages,
} from '../utils/normalizeOrgChatMessage';
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

function pickDefaultGeneralChannelId(channels, projectIdFilter = '') {
  const pid = String(projectIdFilter || '').trim();
  const list = Array.isArray(channels) ? channels : [];
  const general =
    list.find(
      (ch) =>
        String(ch.projectChannelKind || '') === 'general' &&
        (!pid || String(ch.projectId || '') === pid)
    ) || list.find((ch) => String(ch.projectChannelKind || '') === 'general');
  return general?._id ? String(general._id) : '';
}

function resolveProjectChannelCanWrite(perm, channel) {
  if (!channel) return false;
  const kind = String(channel.projectChannelKind || '');
  const isAnnouncement =
    kind === 'announcement' || String(channel.type || '').toLowerCase() === 'announcement';
  if (isAnnouncement) return Boolean(perm?.canWrite);
  if (perm?.canWrite === true) return true;
  if (perm?.canWrite === false) return false;
  const canRead = Boolean(perm?.canSee || perm?.canRead);
  if (canRead && (kind === 'general' || kind === 'cross_team' || kind === 'team')) return true;
  return Boolean(perm?.canWrite);
}

/**
 * Chat kênh Project — shell org + messages. Không load cây phòng ban.
 */
export default function useProjectOrgChat({
  organizationId = '',
  projectIdFilter = '',
  channelId = '',
  onSelectChannel = null,
} = {}) {
  const { t } = useAppStrings();
  const { user } = useAuth();
  const { on, off, joinRoom, leaveRoom } = useSocket();
  const orgId = String(organizationId || '').trim();
  const filterPid = String(projectIdFilter || '').trim();
  const requestedChannelId = String(channelId || '').trim();
  const currentUserId = String(user?.userId || user?._id || user?.id || '').trim();

  const {
    data: shell,
    isLoading: shellLoading,
    isError: shellError,
    refetch: refetchShell,
  } = useOrgShell(orgId);
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

  const effectiveChannelId = useMemo(() => {
    if (
      requestedChannelId &&
      projectChannels.some((ch) => String(ch._id) === requestedChannelId)
    ) {
      return requestedChannelId;
    }
    return pickDefaultGeneralChannelId(projectChannels, filterPid);
  }, [requestedChannelId, projectChannels, filterPid]);

  useEffect(() => {
    if (requestedChannelId || !effectiveChannelId || !onSelectChannel) return undefined;
    onSelectChannel(effectiveChannelId);
    return undefined;
  }, [requestedChannelId, effectiveChannelId, onSelectChannel]);

  const selectedChannel = useMemo(() => {
    if (!effectiveChannelId) return null;
    return projectChannels.find((ch) => String(ch._id) === effectiveChannelId) || null;
  }, [projectChannels, effectiveChannelId]);

  const selectedChannelId = effectiveChannelId;
  const perm = matrix[selectedChannelId] || {};
  const canRead = Boolean(perm.canSee || perm.canRead);
  const canWrite = resolveProjectChannelCanWrite(perm, selectedChannel);

  const messagesQuery = useOrgChannelMessages(selectedChannelId, orgId, {
    enabled: Boolean(selectedChannelId) && canRead,
  });

  const [extraMessages, setExtraMessages] = useState([]);
  const [messageOverrides, setMessageOverrides] = useState({});
  const [deletedMessageIds, setDeletedMessageIds] = useState(() => new Set());
  const [messageInput, setMessageInput] = useState('');
  const [sending, setSending] = useState(false);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    setExtraMessages([]);
    setMessageOverrides({});
    setDeletedMessageIds(new Set());
    setMessageInput('');
    setReplyToMessage(null);
    setEditingMessageId(null);
    setEditDraft('');
  }, [selectedChannelId]);

  const patchMessage = useCallback((id, patch) => {
    const sid = String(id || '').trim();
    if (!sid) return;
    setMessageOverrides((prev) => ({
      ...prev,
      [sid]: { ...(prev[sid] || {}), ...patch },
    }));
  }, []);

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

  const messages = useMemo(() => {
    const fromApi = normalizeOrgChatMessages(messagesQuery.messages || []);
    const merged = mergeById(fromApi, extraMessages);
    return merged
      .filter((m) => !deletedMessageIds.has(messageId(m)))
      .filter((m) => !m.isDeleted)
      .map((m) => {
        const id = messageId(m);
        const ov = messageOverrides[id];
        const row = ov ? { ...m, ...ov } : m;
        return normalizeOrgChatMessage(row);
      });
  }, [messagesQuery.messages, extraMessages, messageOverrides, deletedMessageIds]);

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
        const replyId = replyToMessage?._id || replyToMessage?.id;
        if (replyId) body.replyToMessageId = String(replyId);
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
        setReplyToMessage(null);
        opts.onSent?.();
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('organizations.sendMessageFail') })
        );
      } finally {
        setSending(false);
      }
    },
    [
      messageInput,
      selectedChannelId,
      sending,
      canWrite,
      orgId,
      t,
      appendLocal,
      replyToMessage,
    ]
  );

  const sendFileMessage = useCallback(
    async (file, opts = {}) => {
      const onProgress = typeof opts === 'function' ? opts : opts?.onProgress;
      const caption = typeof opts === 'object' && opts !== null ? opts.caption : undefined;
      if (!file || !selectedChannelId || sending) return false;
      if (!canWrite) {
        toast.error(t('orgPanel.composerReadOnly'));
        return false;
      }
      setSending(true);
      try {
        const { uploadChatFileAndCreateMessage } = await import('../services/chatFileUpload');
        const replyId = replyToMessage?._id || replyToMessage?.id;
        const msg = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'org_room',
            roomId: selectedChannelId,
            organizationId: orgId || undefined,
            caption: String(caption || '').trim(),
            replyToMessageId: replyId ? String(replyId) : undefined,
          },
          onProgress
        );
        appendLocal(msg);
        setReplyToMessage(null);
        return true;
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, { t, fallback: t('organizations.sendMessageFail') })
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [selectedChannelId, sending, canWrite, orgId, t, appendLocal, replyToMessage, setReplyToMessage]
  );

  const userAlreadyReacted = useCallback(
    (msg, emoji) => {
      if (!currentUserId || !emoji) return false;
      const rows = Array.isArray(msg?.reactions) ? msg.reactions : [];
      return rows.some(
        (r) =>
          String(r.emoji || '') === String(emoji) &&
          String(r.userId?._id || r.userId || '') === currentUserId
      );
    },
    [currentUserId]
  );

  const toggleReaction = useCallback(
    async (msg, emoji) => {
      const mid = messageId(msg);
      if (!mid || mid.startsWith('temp-') || !emoji) return;
      const remove = userAlreadyReacted(msg, emoji);
      try {
        const resp = remove
          ? await dmMessageService.removeReaction(mid, emoji)
          : await dmMessageService.addReaction(mid, emoji);
        const updated = dmMessageService.unwrap(resp);
        patchMessage(mid, updated);
      } catch {
        toast.error(t('friendChat.reactionFail'));
      }
    },
    [userAlreadyReacted, patchMessage, t]
  );

  const saveMessageEdit = useCallback(
    async (mid, content) => {
      const trimmed = String(content || '').trim();
      if (!trimmed || !mid) return false;
      setSavingEdit(true);
      try {
        const res = await api.patch(`/messages/${mid}/edit`, { content: trimmed });
        if (res?.success === false) {
          throw new Error(res?.message || 'Edit failed');
        }
        const row = res?.data ?? res;
        const normalized = normalizeOrgChatMessage(row);
        patchMessage(mid, normalized || { content: trimmed, editedAt: new Date().toISOString() });
        toast.success(t('organizations.msgUpdated'));
        return true;
      } catch (error) {
        toast.error(resolveApiErrorMessage(error, { t, fallback: t('organizations.editFail') }));
        return false;
      } finally {
        setSavingEdit(false);
      }
    },
    [patchMessage, t]
  );

  const deleteMessage = useCallback(
    async (mid) => {
      if (!mid) return false;
      try {
        await api.delete(`/messages/${mid}`);
        setDeletedMessageIds((prev) => new Set([...prev, String(mid)]));
        toast.success(t('organizations.msgDeleted'));
        return true;
      } catch {
        toast.error(t('organizations.deleteFail'));
        return false;
      }
    },
    [t]
  );

  const recallMessage = useCallback(
    async (mid) => {
      if (!mid) return false;
      try {
        const resp = await dmMessageService.recallMessage(mid);
        const updated = dmMessageService.unwrap(resp);
        patchMessage(mid, updated);
        toast.success(t('friendChat.recallOk'));
        return true;
      } catch {
        toast.error(t('friendChat.recallFail'));
        return false;
      }
    },
    [patchMessage, t]
  );

  const forwardMessage = useCallback(
    async (sourceMessage, channelIds, note = '') => {
      if (!sourceMessage || !Array.isArray(channelIds) || !channelIds.length) return false;
      const chName = selectedChannel?.projectName || t('organizations.channelNameFallback');
      const preview = String(sourceMessage.content || '').trim().slice(0, 500);
      const header = t('organizations.forwardHeader', { name: chName });
      const body = [note, header, preview].filter(Boolean).join('\n\n');
      setSending(true);
      try {
        for (const cid of channelIds) {
          await api.post('/messages', {
            roomId: cid,
            content: body,
            messageType: 'text',
            organizationId: orgId || undefined,
          });
        }
        toast.success(t('organizations.forwardOk'));
        return true;
      } catch {
        toast.error(t('organizations.forwardFail'));
        return false;
      } finally {
        setSending(false);
      }
    },
    [selectedChannel, orgId, t]
  );

  const beginEditMessage = useCallback((msg) => {
    const id = messageId(msg);
    if (!id) return;
    setEditingMessageId(id);
    setEditDraft(String(msg?.content || ''));
  }, []);

  const cancelEditMessage = useCallback(() => {
    if (savingEdit) return;
    setEditingMessageId(null);
    setEditDraft('');
  }, [savingEdit]);

  const submitEditMessage = useCallback(async () => {
    if (!editingMessageId) return;
    const ok = await saveMessageEdit(editingMessageId, editDraft);
    if (ok) {
      setEditingMessageId(null);
      setEditDraft('');
    }
  }, [editingMessageId, editDraft, saveMessageEdit]);

  return {
    orgId,
    currentUser: user,
    currentUserId,
    shellLoading,
    shellError,
    refetchShell,
    projectChannels,
    selectedChannel,
    selectedChannelId,
    canRead,
    canWrite,
    messages,
    loadingMessages: messagesQuery.isLoading,
    messagesError: messagesQuery.isError,
    refetchMessages: messagesQuery.refetch,
    hasMoreOlder: messagesQuery.hasMoreOlder,
    loadingOlder: messagesQuery.loadingOlder,
    loadOlderMessages: messagesQuery.loadOlderMessages,
    messageInput,
    setMessageInput,
    sending,
    sendMessage,
    sendFileMessage,
    appendMessage: appendLocal,
    channelPermissionMatrix: matrix,
    replyToMessage,
    setReplyToMessage,
    editingMessageId,
    editDraft,
    setEditDraft,
    savingEdit,
    beginEditMessage,
    cancelEditMessage,
    submitEditMessage,
    toggleReaction,
    deleteMessage,
    recallMessage,
    forwardMessage,
  };
}

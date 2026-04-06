import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';
import { ChatMessageAttachmentBody } from '../../components/Chat/ChatFileAttachment';
import ChannelMessageToolbar from '../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../components/Organization/ChannelMessageMoreMenu';
import ForwardToFriendModal from '../../components/Organization/ForwardToFriendModal';
import FriendChatRightPanel from '../../components/Chat/FriendChatRightPanel';
import { Toast } from '../../components/Shared';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import ChatUploadProgressBar from '../../components/Chat/ChatUploadProgressBar';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { useSocket } from '../../context/SocketContext';

function FriendChatPage() {
  const [friends, setFriends] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [toast, setToast] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const [lastDmAtByFriendId, setLastDmAtByFriendId] = useState({});
  /** Đang gọi API để chọn hội thoại mặc định (tránh nháy "chọn bạn") */
  const [resolvingDefaultChat, setResolvingDefaultChat] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  /** null = không upload; 0–100 khi đang gửi file/ảnh */
  const [uploadProgress, setUploadProgress] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});
  const { user } = useAuth();
  const { emit, on, off } = useSocket();

  // Trong hệ thống hiện tại, ID đăng nhập lưu ở field userId (Auth service),
  // còn _id là của profile. Tin nhắn lưu senderId theo userId.
  const currentUserId = user?.userId || user?._id || user?.id;
  const currentUserName = getUserDisplayName(user) || 'Bạn';
  const currentUserAvatar = user?.avatar || '🧑';

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Load danh sách bạn bè từ friend-service
  const loadFriends = useCallback(async () => {
    setFriendsLoading(true);
    try {
      const resp = await friendService.getFriends();
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.friends || result;
      setFriends(Array.isArray(list) ? list : []);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không tải được danh sách bạn bè', 'fail');
      setFriends([]);
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  // Map friends + sắp xếp theo tin nhắn gần nhất (mới nhất trên cùng)
  const viewFriends = useMemo(() => {
    const rows = friends.map((f) => {
      const u = f.friendId || f;
      return {
        id: u?._id || u?.id || f.id,
        name: u?.displayName || u?.username || 'Người dùng',
        avatar: u?.avatar || '👤',
        status: u?.status || 'offline',
      };
    });
    return [...rows].sort(
      (a, b) =>
        (lastDmAtByFriendId[String(b.id)] || 0) - (lastDmAtByFriendId[String(a.id)] || 0)
    );
  }, [friends, lastDmAtByFriendId]);

  /** Lấy thời gian tin DM gần nhất với mỗi bạn (từ API /messages, không receiverId) */
  const fetchLastDmActivity = useCallback(async () => {
    if (!currentUserId) return {};
    try {
      const resp = await api.get('/messages', { params: { limit: 500, page: 1 } });
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.messages || [];
      if (!Array.isArray(list)) return {};
      const myId = String(currentUserId);
      const last = {};
      for (const m of list) {
        if (!m?.receiverId || m.roomId) continue;
        const s = String(m.senderId?._id || m.senderId || '');
        const r = String(m.receiverId?._id || m.receiverId || '');
        let partner = null;
        if (s === myId) partner = r;
        else if (r === myId) partner = s;
        if (!partner) continue;
        const t = m.createdAt ? new Date(m.createdAt).getTime() : 0;
        if (!last[partner] || t > last[partner]) last[partner] = t;
      }
      return last;
    } catch {
      return {};
    }
  }, [currentUserId]);

  // Khi có danh sách bạn: tự chọn người đã nhắn gần nhất (không ghi đè nếu user đã chọn)
  useEffect(() => {
    if (!currentUserId) return;
    if (friends.length === 0) {
      setSelectedFriendId(null);
      setResolvingDefaultChat(false);
      return;
    }
    let cancelled = false;
    setResolvingDefaultChat(true);
    (async () => {
      try {
        const lastMap = await fetchLastDmActivity();
        if (cancelled) return;
        setLastDmAtByFriendId((prev) => {
          const next = { ...prev };
          Object.entries(lastMap).forEach(([k, v]) => {
            next[String(k)] = v;
          });
          return next;
        });
        setSelectedFriendId((prev) => {
          if (prev) return prev;
          const rows = friends.map((f) => {
            const u = f.friendId || f;
            return {
              id: u?._id || u?.id || f.id,
              name: u?.displayName || u?.username || 'Người dùng',
              avatar: u?.avatar || '👤',
              status: u?.status || 'offline',
            };
          });
          const sorted = [...rows].sort(
            (a, b) => (lastMap[String(b.id)] || 0) - (lastMap[String(a.id)] || 0)
          );
          const withDm = sorted.find((f) => lastMap[String(f.id)]);
          if (withDm) return withDm.id;
          return rows[0]?.id ?? null;
        });
      } finally {
        if (!cancelled) setResolvingDefaultChat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [friends, currentUserId, fetchLastDmActivity]);

  // Load messages khi chọn bạn
  const loadMessages = useCallback(
    async (friendId) => {
      if (!friendId) return;
      setLoadingMessages(true);
      try {
        const resp = await api.get('/messages', { params: { receiverId: friendId } });
        const payload = resp?.data || resp;
        const result = payload?.data || payload;
        const list = result?.messages || result || [];
        setMessages(Array.isArray(list) ? list : []);
      } catch (err) {
        showToast(err.response?.data?.message || err.message || 'Không tải được tin nhắn', 'fail');
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    []
  );

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    if (selectedFriendId) {
      loadMessages(selectedFriendId);
    }
  }, [selectedFriendId, loadMessages]);

  // Gửi tin nhắn qua socket-service (realtime) + optimistic UI
  const handleSend = async () => {
    if (!selectedFriendId || !message.trim()) return;

    try {
      const text = message.trim();
      const tempId = `temp-${Date.now()}`;
      const replyRef = replyingToMessage?._id || replyingToMessage?.id;
      const validReplyId =
        replyRef && !String(replyRef).startsWith('temp-') ? replyRef : null;

      const optimistic = {
        _id: tempId,
        senderId: currentUserId,
        receiverId: selectedFriendId,
        content: text,
        createdAt: new Date().toISOString(),
        _optimistic: true,
        ...(validReplyId ? { replyToMessageId: validReplyId } : {}),
      };

      setMessages((prev) => [...prev, optimistic]);
      setMessage('');
      setReplyingToMessage(null);
      setLastDmAtByFriendId((prev) => ({
        ...prev,
        [String(selectedFriendId)]: Date.now(),
      }));
      const payload = {
        receiverId: selectedFriendId,
        content: text,
        messageType: 'text',
      };
      if (validReplyId) payload.replyToMessageId = validReplyId;
      emit('friend:send', payload);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Gửi tin nhắn thất bại', 'fail');
    }
  };

  // Lắng nghe tin nhắn realtime từ socket-service
  useEffect(() => {
    if (!on || !off || !currentUserId) return;

    const myIdStr = String(currentUserId);

    const isMessageForCurrentConversation = (m) => {
      if (!m) return false;
      const sender = m.senderId?._id || m.senderId;
      const receiver = m.receiverId?._id || m.receiverId;
      if (!sender || !receiver || !selectedFriendId) return false;

      const senderStr = String(sender);
      const receiverStr = String(receiver);
      const friendIdStr = String(selectedFriendId);

      // Tin nhắn giữa mình và người bạn đang chọn (2 chiều)
      const case1 = senderStr === myIdStr && receiverStr === friendIdStr;
      const case2 = senderStr === friendIdStr && receiverStr === myIdStr;
      return case1 || case2;
    };

    const bumpLastDmFromPayload = (m) => {
      if (!m?.receiverId || m.roomId) return;
      const s = String(m.senderId?._id || m.senderId || '');
      const r = String(m.receiverId?._id || m.receiverId || '');
      let partner = null;
      if (s === myIdStr) partner = r;
      else if (r === myIdStr) partner = s;
      if (!partner) return;
      const t = m.createdAt ? new Date(m.createdAt).getTime() : Date.now();
      setLastDmAtByFriendId((prev) => ({ ...prev, [partner]: t }));
    };

    const appendIfRelevant = (m) => {
      if (!isMessageForCurrentConversation(m)) return;

      setMessages((prev) => {
        const id = m._id || m.id;
        if (id && prev.some((x) => (x._id || x.id) === id)) {
          return prev;
        }
        return [...prev, m];
      });
    };

    const handleNewMessage = (m) => {
      bumpLastDmFromPayload(m);
      appendIfRelevant(m);
    };

    const handleSentMessage = (m) => {
      bumpLastDmFromPayload(m);
      if (!isMessageForCurrentConversation(m)) return;
      setMessages((prev) => {
        const withoutOpt = prev.filter((x) => !x._optimistic);
        const id = m._id || m.id;
        if (id && withoutOpt.some((x) => (x._id || x.id) === id)) {
          return withoutOpt;
        }
        return [...withoutOpt, m];
      });
    };

    on('friend:new_message', handleNewMessage);
    on('friend:sent', handleSentMessage);

    return () => {
      off('friend:new_message', handleNewMessage);
      off('friend:sent', handleSentMessage);
    };
  }, [on, off, currentUserId, selectedFriendId]);

  const currentFriend = viewFriends.find((f) => f.id === selectedFriendId) || null;

  const composerEmojiList = useMemo(
    () => [
      '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎',
      '🥳', '🤩', '😇', '🤔', '😢', '😭', '😡', '😴',
      '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
      '❤️', '💜', '🧡', '💙', '🔥', '✨', '🎉', '🚀',
    ],
    []
  );

  const filteredComposerEmojis = useMemo(() => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return composerEmojiList;
    return composerEmojiList.filter((emoji) => emoji.toLowerCase().includes(keyword));
  }, [composerEmojiList, emojiSearch]);

  const appendEmoji = (emoji) => {
    setMessage((prev) => `${prev || ''}${emoji}`);
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const handleFriendFileSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedFriendId) return;
    setUploadProgress(0);
    try {
      const normalized = await uploadChatFileAndCreateMessage(
        api,
        file,
        {
          retentionContext: 'dm',
          receiverId: selectedFriendId,
        },
        (p) => setUploadProgress(p)
      );
      showToast('Đã gửi file', 'success');
      const id = normalized?._id || normalized?.id;
      setMessages((prev) => {
        if (id && prev.some((x) => String(x._id || x.id) === String(id))) {
          return prev;
        }
        return [...prev, normalized];
      });
      setLastDmAtByFriendId((prev) => ({
        ...prev,
        [String(selectedFriendId)]: Date.now(),
      }));
    } catch (err) {
      showToast(
        err.response?.data?.message || err.message || 'Gửi file thất bại',
        'fail'
      );
    } finally {
      setUploadProgress(null);
    }
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('vi-VN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const unwrapPayload = (payload) => payload?.data ?? payload;

  const plainTextForMessage = (msg) => {
    if (!msg) return '';
    const t = msg.messageType || 'text';
    if (t === 'text') return String(msg.content || '');
    if (t === 'file' || t === 'image')
      return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || '[Đính kèm]';
    return String(msg.content || '');
  };

  /** Ảnh / file: không hiện sao chép. Còn lại: có nội dung chuỗi (kể cả link). */
  const canShowCopyTextInMenu = (msg) => {
    if (!msg) return false;
    const t = String(msg.messageType || 'text').toLowerCase();
    if (t === 'image' || t === 'file') return false;
    if (msg.fileMeta) return false;
    const raw = msg.content;
    if (raw == null) return false;
    const s = typeof raw === 'string' ? raw : String(raw);
    return s.trim().length > 0;
  };

  const handleMessageRowMouseEnter = (messageId, event) => {
    const el = event?.currentTarget;
    if (!el) return;
    const needBelow = shouldPlaceToolbarBelowBubble(el);
    const next = needBelow ? 'below' : 'above';
    setToolbarPlacementById((prev) => {
      const key = String(messageId);
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
  };

  const canEditDmMessage = (msg) => {
    if (!msg || msg._optimistic) return false;
    const t = msg.messageType || 'text';
    if (t !== 'text') return false;
    if (msg.fileMeta) return false;
    return true;
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId) return;
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content: trimmed });
      const raw = unwrapPayload(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      showToast('Đã cập nhật tin nhắn', 'success');
      cancelEdit();
    } catch {
      showToast('Không thể chỉnh sửa', 'fail');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || !window.confirm('Xoá tin nhắn này?')) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      showToast('Đã xoá tin nhắn', 'success');
    } catch {
      showToast('Không thể xoá', 'fail');
    }
  };

  const handleForwardRequest = (msg) => {
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return String(forwardSourceMessage.content || '').slice(0, 500);
  }, [forwardSourceMessage]);

  const handleForwardConfirm = async ({ friendIds, note }) => {
    if (!forwardSourceMessage || !friendIds?.length) return;
    const preview = String(forwardSourceMessage.content || '').trim().slice(0, 500);
    const fromName = currentFriend?.name || 'Trò chuyện';
    const header = `📎 Chuyển tiếp từ ${fromName}`;
    const body = [note, header, preview].filter(Boolean).join('\n\n');
    setForwarding(true);
    try {
      for (const fid of friendIds) {
        await api.post('/messages', {
          receiverId: fid,
          content: body,
          messageType: 'text',
        });
      }
      showToast('Đã chuyển tiếp', 'success');
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
      const t = Date.now();
      setLastDmAtByFriendId((prev) => {
        const next = { ...prev };
        friendIds.forEach((id) => {
          next[String(id)] = t;
        });
        return next;
      });
    } catch {
      showToast('Chuyển tiếp thất bại', 'fail');
    } finally {
      setForwarding(false);
    }
  };

  const handleQuickReactMessage = (_m, _emoji) => {
    showToast('Phản hồi nhanh (emoji) đồng bộ server sẽ bổ sung sau.', 'info');
  };

  const replyLabelForDm = (msg) => {
    if (!msg) return 'Bạn bè';
    const sid = msg.senderId?._id || msg.senderId;
    if (String(sid || '') === String(currentUserId || '')) return 'Bạn';
    return currentFriend?.name || 'Bạn bè';
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#0b0e14] text-slate-100">
      {/* Khung 1: Sidebar nav chỉ icon, thanh trượt riêng */}
      <NavigationSidebar />
      <div className="flex-1 flex h-full min-w-0">
        {/* Khung 2: Danh sách bạn bè - thanh trượt riêng, chỉ hiện khi cần */}
        <div className="w-72 shrink-0 bg-[#0f1218] p-4 border-r border-white/[0.06] overflow-y-auto h-full scrollbar-overlay">
          <h2 className="text-xl font-extrabold text-white mb-4">Chat bạn bè</h2>
          <h3 className="text-sm font-bold text-[#8e9297] mb-2">Bạn bè</h3>
          <div className="space-y-2">
            {friendsLoading ? (
              <div className="text-xs text-[#8e9297] py-2">Đang tải…</div>
            ) : (
              viewFriends.map((f) => (
                <div
                  key={f.id}
                  onClick={() => setSelectedFriendId(f.id)}
                  className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer hover:bg-[#1a1d26]/80 ${
                    selectedFriendId === f.id ? 'bg-[#1a1d26]' : ''
                  }`}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#8e44ad] to-pink-500 flex items-center justify-center text-base shadow-sm">
                    {f.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="text-white font-medium text-sm">{f.name}</div>
                    <div className="text-xs text-gray-500">
                      {f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
                    </div>
                  </div>
                </div>
              ))
            )}
            {!friendsLoading && viewFriends.length === 0 && (
              <div className="text-xs text-[#8e9297]">Chưa có bạn bè. Hãy thêm bạn ở trang Liên Hệ.</div>
            )}
          </div>
        </div>

        {/* Khung 3–4: Khu vực chat + sidebar phải */}
        <div className="flex-1 flex h-full min-w-0 bg-[#0b0e14]">
          <div className="flex-1 flex flex-col h-full min-w-0">
          {friendsLoading ? (
            <div className="flex-1 flex items-center justify-center text-[#8e9297]">
              Đang tải danh sách bạn…
            </div>
          ) : viewFriends.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-[#8e9297] px-4 text-center">
              Chưa có bạn bè. Hãy thêm bạn ở trang Liên hệ để bắt đầu chat.
            </div>
          ) : resolvingDefaultChat ? (
            <div className="flex-1 flex items-center justify-center text-[#8e9297]">
              Đang mở cuộc trò chuyện…
            </div>
          ) : !currentFriend ? (
            <div className="flex-1 flex items-center justify-center text-[#8e9297]">
              Chọn một người bạn để bắt đầu chat
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-white/[0.06] bg-[#0b0e14] px-4 py-3">
                <h2 className="text-lg font-bold text-white">{currentFriend.name}</h2>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3 scrollbar-overlay">
                {loadingMessages ? (
                  <div className="text-center text-[#8e9297]">Đang tải tin nhắn...</div>
                ) : (
                  // Sắp xếp theo thời gian tăng dần: tin cũ ở trên, mới ở dưới
                  [...messages]
                    .sort((a, b) => {
                      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return ta - tb;
                    })
                    .map((m) => {
                    const mid = m._id || m.id;
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || 'Bạn bè';

                    const avatar = isMine
                      ? currentUserAvatar
                      : currentFriend?.avatar || '👤';

                    const replyId = m.replyToMessageId;
                    const parentMsg = replyId
                      ? [...messages].find((x) => String(x._id || x.id) === String(replyId))
                      : null;
                    const replyPreview = parentMsg
                      ? plainTextForMessage(parentMsg).slice(0, 160)
                      : 'Tin nhắn gốc';
                    const isEditing = editingMessageId && String(editingMessageId) === String(mid);
                    const showToolbar = !isEditing && uploadProgress == null;
                    const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                    return (
                      <div
                        key={mid}
                        className={`flex items-start gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMine && (
                          <div className="mr-0.5 w-9 h-9 rounded-full bg-gradient-to-br from-[#8e44ad] to-pink-500 flex items-center justify-center text-sm flex-shrink-0 shadow-sm">
                            {avatar}
                          </div>
                        )}
                        <div
                          className="group relative max-w-[min(80%,28rem)]"
                          onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                        >
                          {showToolbar && (
                            <div
                              className={`absolute z-20 opacity-0 transition-opacity group-hover:opacity-100 ${
                                toolbarPlace === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
                              } ${isMine ? 'right-0' : 'left-0'}`}
                            >
                              <ChannelMessageToolbar
                                recentReactionsStorageKey="vh_dm_recent_reactions"
                                isMine={isMine}
                                showEdit={isMine && canEditDmMessage(m)}
                                disabled={uploadProgress != null}
                                onQuickReact={(emoji) => handleQuickReactMessage(m, emoji)}
                                onOpenEmojiPicker={() => {}}
                                onMiddleAction={() => {
                                  if (isMine && canEditDmMessage(m)) {
                                    setEditingMessageId(mid);
                                    setEditDraft(String(m.content || ''));
                                  } else {
                                    setReplyingToMessage(m);
                                  }
                                }}
                                onForward={() => handleForwardRequest(m)}
                                onMore={(e) => {
                                  const r = e?.currentTarget?.getBoundingClientRect?.();
                                  if (r) {
                                    setMoreMenu({ open: true, anchorRect: r, message: m });
                                  }
                                }}
                              />
                            </div>
                          )}
                          <div
                            className={`inline-block w-full rounded-2xl border border-white/[0.06] bg-[#1a1d26] px-3.5 py-2.5 text-sm shadow-sm ${
                              isMine ? 'rounded-tr-md' : 'rounded-tl-md'
                            }`}
                          >
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
                              <span className="text-xs font-semibold text-[#a29bfe] truncate max-w-[12rem]">
                                {displayName}
                              </span>
                              <span className="text-[11px] text-[#8e9297] tabular-nums">
                                {formatTime(m.createdAt)}
                              </span>
                              {m.editedAt && (
                                <span className="text-[10px] text-[#8e9297]/70">(đã chỉnh sửa)</span>
                              )}
                            </div>
                            {replyId && (
                              <div className="mb-2 border-l-2 border-[#a29bfe]/50 pl-2 text-[11px] text-[#8e9297]">
                                <span className="font-semibold text-[#a29bfe]">
                                  @{replyLabelForDm(parentMsg || {})}{' '}
                                </span>
                                <span className="line-clamp-2">{replyPreview}</span>
                              </div>
                            )}
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  value={editDraft}
                                  onChange={(e) => setEditDraft(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      submitEdit(mid);
                                    }
                                    if (e.key === 'Escape') cancelEdit();
                                  }}
                                  rows={3}
                                  className="w-full resize-y rounded-lg border border-white/20 bg-black/35 px-2 py-1.5 text-sm text-white outline-none focus:border-[#a29bfe]/50"
                                />
                                <p className="text-[11px] text-[#8e9297]">
                                  nhấn escape để{' '}
                                  <button
                                    type="button"
                                    className="text-[#a29bfe] hover:underline"
                                    onClick={cancelEdit}
                                  >
                                    hủy
                                  </button>
                                  {' • '}
                                  nhấn enter để{' '}
                                  <button
                                    type="button"
                                    className="text-[#a29bfe] hover:underline"
                                    onClick={() => submitEdit(mid)}
                                  >
                                    lưu
                                  </button>
                                </p>
                              </div>
                            ) : (
                              <ChatMessageAttachmentBody message={m} />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="relative shrink-0">
                <ChatUploadProgressBar
                  percent={uploadProgress}
                  label="Đang tải tệp lên…"
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <UnifiedChatComposer
                  wrapperClassName="shrink-0 border-t border-white/[0.06] bg-[#0f1218] p-3.5"
                  topSlot={
                    replyingToMessage ? (
                      <div className="mb-2 flex items-center justify-between gap-2 rounded-t-xl border border-white/[0.08] bg-[#1a1d21] px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <span className="text-[#8e9297]">Đang phản hồi </span>
                          <span className="font-semibold text-[#a29bfe]">
                            {replyLabelForDm(replyingToMessage)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className="rounded-full p-1.5 text-[#8e9297] transition hover:bg-white/10 hover:text-white"
                          aria-label="Huỷ trả lời"
                        >
                          ✕
                        </button>
                      </div>
                    ) : null
                  }
                  value={message}
                  onChange={setMessage}
                  onSend={handleSend}
                  placeholder={
                    uploadProgress != null
                      ? 'Đang gửi tệp…'
                      : currentFriend
                        ? `Nhắn ${currentFriend.name}`
                        : 'Chọn bạn để nhắn tin'
                  }
                  disabled={!selectedFriendId || uploadProgress != null}
                  sendDisabled={!message.trim()}
                  sendLabel="Gửi"
                  plusItems={[
                    {
                      key: 'upload-file',
                      icon: '📁',
                      label: 'Tải lên tệp',
                      onClick: () => fileInputRef.current?.click(),
                    },
                    {
                      key: 'upload-image',
                      icon: '🖼️',
                      label: 'Gửi hình ảnh',
                      onClick: () => imageInputRef.current?.click(),
                    },
                  ]}
                  actionItems={[
                    {
                      key: 'emoji',
                      title: 'Emoji',
                      content: '🙂',
                      className: 'w-8 text-lg',
                      onClick: () => {
                        setEmojiPickerTab('emoji');
                        setShowEmojiPicker((prev) => !prev);
                      },
                    },
                  ]}
                />

                {showEmojiPicker && (
                  <>
                    <button
                      type="button"
                      aria-label="Đóng bảng emoji"
                      onClick={() => setShowEmojiPicker(false)}
                      className="fixed inset-0 z-40 cursor-default bg-black/30"
                    />
                    <div className="fixed bottom-24 right-8 z-50 h-[420px] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl">
                      <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
                        {[
                          { id: 'gif', label: 'Ảnh động' },
                          { id: 'sticker', label: 'Sticker' },
                          { id: 'emoji', label: 'Emoji' },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setEmojiPickerTab(tab.id)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                              emojiPickerTab === tab.id
                                ? 'bg-slate-700 text-white'
                                : 'text-gray-300 hover:bg-slate-800/70'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="border-b border-slate-700 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                            placeholder="Tìm emoji hợp lý nhất"
                            className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                          />
                        </div>
                      </div>

                      <div className="h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
                        {emojiPickerTab !== 'emoji' ? (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            Mục này đang ở bản beta.
                          </div>
                        ) : (
                          <div className="grid grid-cols-9 gap-2">
                            {filteredComposerEmojis.map((emoji, idx) => (
                              <button
                                key={`${emoji}-${idx}`}
                                type="button"
                                onClick={() => appendEmoji(emoji)}
                                className="h-11 rounded-lg bg-[#111a2c] text-2xl transition hover:bg-slate-700/80"
                              >
                                {emoji}
                              </button>
                            ))}
                            {filteredComposerEmojis.length === 0 && (
                              <div className="col-span-9 rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-gray-400">
                                Không tìm thấy emoji phù hợp.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          </div>

          <ChannelMessageMoreMenu
            open={moreMenu.open}
            anchorRect={moreMenu.anchorRect}
            onClose={() => setMoreMenu({ open: false, anchorRect: null, message: null })}
            isMine={
              moreMenu.message
                ? String(moreMenu.message?.senderId?._id || moreMenu.message?.senderId || '') ===
                  String(currentUserId || '')
                : false
            }
            canCopy={canShowCopyTextInMenu(moreMenu.message)}
            onCopyText={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              const raw = msg.content;
              if (raw == null) return;
              const s = typeof raw === 'string' ? raw : String(raw);
              const trimmed = s.trim();
              if (trimmed) navigator.clipboard.writeText(trimmed);
            }}
            onReply={() => moreMenu.message && setReplyingToMessage(moreMenu.message)}
            onForward={() => moreMenu.message && handleForwardRequest(moreMenu.message)}
            onEdit={() => {
              const msg = moreMenu.message;
              if (!msg || !canEditDmMessage(msg)) return;
              setEditingMessageId(msg._id || msg.id);
              setEditDraft(String(msg.content || ''));
            }}
            onDelete={() => {
              const msg = moreMenu.message;
              if (msg) handleDeleteMessage(msg._id || msg.id);
            }}
          />

          <ForwardToFriendModal
            isOpen={forwardModalOpen}
            onClose={() => {
              setForwardModalOpen(false);
              setForwardSourceMessage(null);
            }}
            friends={viewFriends}
            excludeFriendId={selectedFriendId}
            previewText={forwardPreviewText}
            loading={false}
            submitting={forwarding}
            onConfirm={handleForwardConfirm}
          />

          {currentFriend && !resolvingDefaultChat && viewFriends.length > 0 && (
            <FriendChatRightPanel
              friend={currentFriend}
              messages={messages}
              onMute={() => showToast('Tắt thông báo — sẽ có trong bản sau', 'info')}
              onPin={() => showToast('Ghim hội thoại — sẽ có trong bản sau', 'info')}
              onCreateGroup={() => showToast('Tạo nhóm trò chuyện — sẽ có trong bản sau', 'info')}
            />
          )}
        </div>
      </div>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default FriendChatPage;


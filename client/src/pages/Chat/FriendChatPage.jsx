import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { Bell, Calendar, MoreHorizontal, Phone, Video } from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';
import { ChatMessageAttachmentBody } from '../../components/Chat/ChatFileAttachment';
import ChannelMessageToolbar from '../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../components/Organization/ChannelMessageMoreMenu';
import ForwardToFriendModal from '../../components/Organization/ForwardToFriendModal';
import CreateTaskFromAiModal from '../../components/Chat/CreateTaskFromAiModal';
import FriendChatRightPanel from '../../components/Chat/FriendChatRightPanel';
import organizationService from '../../services/organizationService';
import { getAiTaskEligibility, AI_TASK_TOOLTIP_SHORT } from '../../utils/aiTaskEligibility';
import { Toast } from '../../components/Shared';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import ChatUploadProgressBar from '../../components/Chat/ChatUploadProgressBar';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { useSocket } from '../../context/SocketContext';

/** Chữ ký tên hiển thị trong avatar tròn (theo mockup sidebar DM). */
function friendInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  const one = parts[0] || '';
  return one.slice(0, 2).toUpperCase() || '?';
}

function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDividerLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const t0 = startOf(d);
  const now = new Date();
  const today0 = startOf(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday0 = startOf(y);
  const dd = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  if (t0 === today0) return `HÔM NAY — ${dd}`;
  if (t0 === yesterday0) return `HÔM QUA — ${dd}`;
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

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
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState(null);
  const [defaultOrgIdForTask, setDefaultOrgIdForTask] = useState(null);
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});
  const { user } = useAuth();
  const { emit, on, off, onlineUsers, connected: socketConnected } = useSocket();

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
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await organizationService.getMyOrganizations();
        const payload = r?.data ?? r;
        const list =
          payload?.organizations ||
          payload?.data?.organizations ||
          (Array.isArray(payload) ? payload : []);
        const arr = Array.isArray(list) ? list : [];
        const first = arr[0];
        const oid = first?._id || first?.id;
        if (!cancelled && oid) setDefaultOrgIdForTask(String(oid));
      } catch {
        /* DM vẫn dùng được; tạo task cần org */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Map friends + sắp xếp theo tin nhắn gần nhất; presence realtime khớp Dashboard (onlineUsers từ socket)
  const viewFriends = useMemo(() => {
    const rows = friends.map((f) => {
      const u = f.friendId || f;
      const uname = typeof u?.username === 'string' ? u.username.trim() : '';
      const title =
        typeof u?.title === 'string'
          ? u.title.trim()
          : typeof u?.headline === 'string'
            ? u.headline.trim()
            : '';
      const subtitle =
        title ||
        (uname ? `@${uname}` : '') ||
        'TRÒ CHUYỆN TRỰC TIẾP';
      const id = u?._id || u?.userId || u?.id || f.id;
      const rawFriendId = f.friendId;
      const presenceKeys = [
        id,
        u?.userId,
        u?._id,
        u?.id,
        typeof rawFriendId === 'string' || typeof rawFriendId === 'number' ? rawFriendId : null,
        rawFriendId && typeof rawFriendId === 'object' ? rawFriendId._id || rawFriendId.userId : null,
      ]
        .filter((x) => x != null && typeof x !== 'object')
        .map(String);
      const uniqueKeys = [...new Set(presenceKeys)];
      return {
        id,
        name: u?.displayName || u?.username || 'Người dùng',
        avatar: u?.avatar || '👤',
        status: String(u?.status || 'offline').toLowerCase(),
        subtitle,
        _presenceKeys: uniqueKeys,
      };
    });
    const sorted = [...rows].sort(
      (a, b) =>
        (lastDmAtByFriendId[String(b.id)] || 0) - (lastDmAtByFriendId[String(a.id)] || 0)
    );
    const onlineSet = new Set((onlineUsers || []).map(String));
    return sorted.map((row) => {
      const { _presenceKeys, ...rest } = row;
      const inLiveList = (_presenceKeys || [String(rest.id)]).some((k) => onlineSet.has(String(k)));
      /** Khi socket đã nối: chỉ tin danh sách online từ server (khớp Dashboard). */
      if (socketConnected) {
        return { ...rest, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...rest,
        status: inLiveList ? 'online' : rest.status,
      };
    });
  }, [friends, lastDmAtByFriendId, onlineUsers, socketConnected]);

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
              id: u?._id || u?.userId || u?.id || f.id,
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

  const sortedChatMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const lastOutgoingMessageId = useMemo(() => {
    if (!currentUserId) return null;
    const myId = String(currentUserId);
    for (let i = sortedChatMessages.length - 1; i >= 0; i--) {
      const m = sortedChatMessages[i];
      const sid = String(m.senderId?._id || m.senderId || '');
      if (sid === myId) return m._id || m.id;
    }
    return null;
  }, [sortedChatMessages, currentUserId]);

  const filteredComposerEmojis = useMemo(() => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return COMPOSER_EMOJI_LIST;
    return COMPOSER_EMOJI_LIST.filter((emoji) => emoji.toLowerCase().includes(keyword));
  }, [emojiSearch]);

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

  const menuCreateTaskCheck = useMemo(
    () => getAiTaskEligibility(moreMenu.message, { organizationId: defaultOrgIdForTask }),
    [moreMenu.message, defaultOrgIdForTask]
  );

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
        {/* Cột 2: rail avatar bạn bè (mockup — thanh chọn tím, chấm online) */}
        <div className="w-[76px] shrink-0 flex flex-col bg-[#0c0f15] border-r border-white/[0.06] h-full min-h-0">
          <div className="shrink-0 px-2 pt-3 pb-2 border-b border-white/[0.05]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-center text-[#6d7380]">
              Bạn bè
            </p>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-overlay px-2 py-2 flex flex-col items-stretch gap-1">
            {friendsLoading ? (
              <div className="text-[10px] text-center text-[#6d7380] py-4 leading-relaxed">
                Đang tải…
              </div>
            ) : (
              viewFriends.map((f) => {
                const active = selectedFriendId === f.id;
                const avatarUrl =
                  typeof f.avatar === 'string' && /^https?:\/\//i.test(f.avatar) ? f.avatar : null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id)}
                    title={f.name}
                    aria-label={`Mở chat với ${f.name}`}
                    aria-current={active ? 'true' : undefined}
                    className="group relative flex w-full justify-center rounded-xl py-2 outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[#5865F2]/50"
                  >
                    {active && (
                      <span
                        className="pointer-events-none absolute left-0 top-1/2 z-10 h-9 w-[3px] -translate-y-1/2 rounded-r-full bg-[#5865F2] shadow-[0_0_12px_rgba(88,101,242,0.55)]"
                        aria-hidden
                      />
                    )}
                    <div className="relative">
                      <div
                        className={`flex h-11 w-11 items-center justify-center overflow-hidden rounded-full border text-[11px] font-bold tracking-tight text-white shadow-inner transition ${
                          active
                            ? 'border-[#5865F2]/80 bg-[#1e2230] ring-2 ring-[#5865F2]/35'
                            : 'border-white/[0.08] bg-[#151923] group-hover:border-white/15'
                        }`}
                      >
                        {avatarUrl ? (
                          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <span className="select-none">{friendInitials(f.name)}</span>
                        )}
                      </div>
                      <span
                        className={`pointer-events-none absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0c0f15] ${
                          f.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'
                        }`}
                        title={f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
                      />
                    </div>
                  </button>
                );
              })
            )}
            {!friendsLoading && viewFriends.length === 0 && (
              <div className="text-[10px] text-center text-[#6d7380] px-1 py-4 leading-relaxed">
                Chưa có bạn. Thêm ở Liên hệ.
              </div>
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
              <header className="shrink-0 border-b border-white/[0.06] bg-[#0b0e14] px-4 py-3">
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#151923] text-sm font-bold text-white shadow-inner">
                      {(() => {
                        const url =
                          typeof currentFriend.avatar === 'string' &&
                          /^https?:\/\//i.test(currentFriend.avatar)
                            ? currentFriend.avatar
                            : null;
                        if (url) {
                          return (
                            <img src={url} alt="" className="h-full w-full object-cover" />
                          );
                        }
                        return <span className="select-none">{friendInitials(currentFriend.name)}</span>;
                      })()}
                    </div>
                    <span
                      className={`pointer-events-none absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[#0b0e14] ${
                        currentFriend.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <h2 className="truncate text-base font-bold tracking-tight text-white">
                        {currentFriend.name}
                      </h2>
                    </div>
                    <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-[#a29bfe]">
                      {currentFriend.subtitle}
                    </p>
                    <p className="mt-0.5 text-xs text-[#8e9297]">
                      {currentFriend.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {['# trò-chuyện', '# tin-nhắn'].map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-white/[0.08] bg-[#12151f] px-2.5 py-0.5 text-[11px] font-medium text-[#b4b8c4]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      title="Gọi thoại"
                      onClick={() => showToast('Gọi thoại — sẽ có trong bản sau', 'info')}
                      className="rounded-xl p-2.5 text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Phone className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title="Gọi video"
                      onClick={() => showToast('Gọi video — sẽ có trong bản sau', 'info')}
                      className="rounded-xl p-2.5 text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Video className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title="Đặt lịch"
                      onClick={() => showToast('Đặt lịch — sẽ có trong bản sau', 'info')}
                      className="flex items-center gap-1.5 rounded-xl border border-white/[0.08] bg-[#12151f] px-2.5 py-1.5 text-xs font-semibold text-[#e3e5e8] transition hover:bg-white/[0.06]"
                    >
                      <Calendar className="h-4 w-4 shrink-0" strokeWidth={2} />
                      Đặt lịch
                    </button>
                    <button
                      type="button"
                      title="Thông báo"
                      onClick={() => showToast('Thông báo cuộc trò chuyện — sẽ có trong bản sau', 'info')}
                      className="rounded-xl p-2.5 text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <Bell className="h-5 w-5" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title="Thêm"
                      onClick={() => showToast('Menu thêm — sẽ có trong bản sau', 'info')}
                      className="rounded-xl p-2.5 text-[#b4b8c4] transition hover:bg-white/[0.06] hover:text-white"
                    >
                      <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </header>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 scrollbar-overlay bg-[#080a0f]">
                {loadingMessages ? (
                  <div className="text-center text-[#8e9297]">Đang tải tin nhắn...</div>
                ) : (
                  sortedChatMessages.map((m, idx) => {
                    const mid = m._id || m.id;
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || 'Bạn bè';

                    const friendMsgAvatarUrl =
                      typeof currentFriend?.avatar === 'string' &&
                      /^https?:\/\//i.test(currentFriend.avatar)
                        ? currentFriend.avatar
                        : null;

                    const prev = idx > 0 ? sortedChatMessages[idx - 1] : null;
                    const showDayDivider =
                      !prev || messageDayKey(m.createdAt) !== messageDayKey(prev.createdAt);

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

                    const showReadReceipt =
                      isMine &&
                      !m._optimistic &&
                      lastOutgoingMessageId != null &&
                      String(mid) === String(lastOutgoingMessageId);

                    const mineBubble = isMine
                      ? 'border-[#5865F2]/35 bg-gradient-to-br from-[#5865F2] to-[#4752c4] text-white shadow-md shadow-[#5865F2]/15'
                      : 'border-white/[0.06] bg-[#1a1d26] text-slate-100';

                    return (
                      <Fragment key={mid}>
                        {showDayDivider && (
                          <div className="flex justify-center py-2">
                            <span className="rounded-full border border-white/[0.06] bg-[#12151f] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8e9297]">
                              {formatDateDividerLabel(m.createdAt)}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex w-full items-end gap-2 ${
                            isMine ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          {!isMine && (
                            <div className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.08] bg-[#151923] text-[11px] font-bold text-white shadow-sm">
                              {friendMsgAvatarUrl ? (
                                <img src={friendMsgAvatarUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className="select-none">{friendInitials(currentFriend.name)}</span>
                              )}
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
                              className={`inline-block w-full rounded-2xl border px-3.5 py-2.5 text-sm shadow-sm ${
                                isMine ? 'rounded-tr-md' : 'rounded-tl-md'
                              } ${mineBubble}`}
                            >
                              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span
                                  className={`max-w-[12rem] truncate text-xs font-semibold ${
                                    isMine ? 'text-white/95' : 'text-[#a29bfe]'
                                  }`}
                                >
                                  {displayName}
                                </span>
                                <span
                                  className={`text-[11px] tabular-nums ${
                                    isMine ? 'text-white/70' : 'text-[#8e9297]'
                                  }`}
                                >
                                  {formatTime(m.createdAt)}
                                </span>
                                {m.editedAt && (
                                  <span
                                    className={`text-[10px] ${isMine ? 'text-white/55' : 'text-[#8e9297]/70'}`}
                                  >
                                    (đã chỉnh sửa)
                                  </span>
                                )}
                              </div>
                              {replyId && (
                                <div
                                  className={`mb-2 border-l-2 pl-2 text-[11px] ${
                                    isMine
                                      ? 'border-white/40 text-white/85'
                                      : 'border-[#a29bfe]/50 text-[#8e9297]'
                                  }`}
                                >
                                  <span
                                    className={`font-semibold ${isMine ? 'text-white' : 'text-[#a29bfe]'}`}
                                  >
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
                              {showReadReceipt && (
                                <p className="mt-1.5 text-right text-[10px] font-medium text-white/70">
                                  Đã đọc
                                </p>
                              )}
                            </div>
                          </div>
                          {isMine && (
                            <div className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#5865F2]/40 bg-[#1e2230] text-[10px] font-bold uppercase tracking-tight text-[#a29bfe] shadow-sm">
                              {typeof currentUserAvatar === 'string' &&
                              /^https?:\/\//i.test(currentUserAvatar) ? (
                                <img src={currentUserAvatar} alt="" className="h-full w-full rounded-full object-cover" />
                              ) : (
                                <span className="select-none">ME</span>
                              )}
                            </div>
                          )}
                        </div>
                      </Fragment>
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
                  richToolbar
                  wrapperClassName="shrink-0 border-t border-white/[0.06] bg-[#0b0e14] px-4 py-3"
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
                        ? `Nhắn ${currentFriend.name}...`
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
            onCreateTask={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              setCreateTaskSourceMessage(msg);
              setCreateTaskModalOpen(true);
            }}
            createTaskDisabled={!menuCreateTaskCheck.ok}
            createTaskHoverTitle={
              menuCreateTaskCheck.ok ? AI_TASK_TOOLTIP_SHORT : menuCreateTaskCheck.reason
            }
          />

          <CreateTaskFromAiModal
            isOpen={createTaskModalOpen}
            onClose={() => {
              setCreateTaskModalOpen(false);
              setCreateTaskSourceMessage(null);
            }}
            messageId={createTaskSourceMessage?._id || createTaskSourceMessage?.id}
            organizationId={defaultOrgIdForTask}
            currentUserId={currentUserId}
            messagePreview={
              createTaskSourceMessage ? plainTextForMessage(createTaskSourceMessage).slice(0, 500) : ''
            }
            onConfirmed={() => showToast('Đã tạo task từ AI', 'success')}
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


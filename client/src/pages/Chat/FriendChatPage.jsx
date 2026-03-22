import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Modal, NotificationModal } from '../../components/Shared';
import friendService from '../../services/friendService';
import { markFriendNotificationsResolved } from '../../services/notificationSync';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { useSocket } from '../../context/SocketContext';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';

function FriendChatPage() {
  const messageEndRef = useRef(null);
  const [friends, setFriends] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isContactsModalOpen, setIsContactsModalOpen] = useState(false);
  const [friendModalTab, setFriendModalTab] = useState('contacts');
  const [friendCenterTab, setFriendCenterTab] = useState('online');
  const [friendCenterSearch, setFriendCenterSearch] = useState('');
  const [actionMenuFriendId, setActionMenuFriendId] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [activityByFriend, setActivityByFriend] = useState({});
  const [chatSearch, setChatSearch] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const [activeMessageMenuId, setActiveMessageMenuId] = useState(null);
  const [activeReactionPickerId, setActiveReactionPickerId] = useState(null);
  const [messageReactions, setMessageReactions] = useState({});
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingDraft, setEditingDraft] = useState('');
  const [confirmDeleteMessageId, setConfirmDeleteMessageId] = useState(null);
  const [pinnedByFriend, setPinnedByFriend] = useState({});
  const [notificationModal, setNotificationModal] = useState(null);
  /** Tin kênh tổ chức chưa đọc — sidebar trái */
  const [orgUnreadMessages, setOrgUnreadMessages] = useState([]);
  const [loadingOrgUnread, setLoadingOrgUnread] = useState(true);
  const [roomMetaById, setRoomMetaById] = useState({});
  /** Tooltip tin tổ chức — fixed bên phải dòng (tránh bị clip overflow sidebar) */
  const [orgUnreadHoverTip, setOrgUnreadHoverTip] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { emit, on, off, onlineUsers } = useSocket();

  // Trong hệ thống hiện tại, ID đăng nhập lưu ở field userId (Auth service),
  // còn _id là của profile. Tin nhắn lưu senderId theo userId.
  const currentUserId = user?.userId || user?._id || user?.id;
  const currentUserName = getUserDisplayName(user) || 'Bạn';
  const currentUserAvatar = user?.avatar || '🧑';
  const quickEmojis = ['😀', '😂', '😍', '👍', '🔥', '🎉', '❤️', '👏'];
  const composerEmojiList = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎',
    '🥳', '🤩', '😇', '🤔', '😢', '😭', '😡', '😴',
    '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
    '❤️', '💜', '🧡', '💙', '🔥', '✨', '🎉', '🚀',
  ];
  const filteredComposerEmojis = useMemo(() => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return composerEmojiList;
    return composerEmojiList.filter((emoji) => emoji.toLowerCase().includes(keyword));
  }, [composerEmojiList, emojiSearch]);

  const showToast = (message, type = 'success') => {
    setNotificationModal({
      type,
      title: type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo',
      message,
    });
  };

  const getPinnedStorageKey = useCallback(
    () => `friend-chat:pinned:${currentUserId || 'guest'}`,
    [currentUserId]
  );

  const getMessageId = useCallback((item) => String(item?._id || item?.id || ''), []);

  const getRenderableMessageContent = useCallback((item) => {
    if (item?.isDeleted) return 'Tin nhắn đã bị xóa';
    if (item?.isRecalled) return 'Tin nhắn đã được thu hồi';
    return item?.content || '';
  }, []);

  const appendEmoji = (emoji) => {
    setMessage((prev) => `${prev}${emoji}`);
    setShowEmojiPicker(false);
    setActiveReactionPickerId(null);
    setEmojiSearch('');
  };

  const handleCopyMessage = async (item) => {
    const text = getRenderableMessageContent(item);
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      showToast('Đã sao chép nội dung tin nhắn', 'success');
    } catch (error) {
      showToast('Không thể sao chép tin nhắn', 'fail');
    }
  };

  const handleTogglePinMessage = (item) => {
    const friendId = String(selectedFriendId || '');
    const messageId = getMessageId(item);
    if (!friendId || !messageId) return;

    setPinnedByFriend((prev) => {
      const current = Array.isArray(prev[friendId]) ? prev[friendId] : [];
      const exists = current.includes(messageId);
      const next = exists ? current.filter((id) => id !== messageId) : [messageId, ...current];
      showToast(exists ? 'Đã bỏ ghim tin nhắn' : 'Đã ghim tin nhắn', 'success');
      return { ...prev, [friendId]: next.slice(0, 10) };
    });
    setActiveMessageMenuId(null);
  };

  const handleStartEditMessage = (item) => {
    if (!item || item.isDeleted || item.isRecalled) return;
    const messageId = getMessageId(item);
    if (!messageId) return;
    setEditingMessageId(messageId);
    setEditingDraft(item.content || '');
    setActiveMessageMenuId(null);
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingDraft('');
  };

  const handleSaveEditMessage = async (messageId) => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) {
      showToast('Không xác định được tin nhắn để chỉnh sửa', 'fail');
      return;
    }

    const targetMessage = messages.find((item) => getMessageId(item) === normalizedMessageId);
    if (!targetMessage?._id) {
      showToast('Tin nhắn chưa đồng bộ xong, vui lòng thử lại sau vài giây', 'fail');
      return;
    }

    const nextContent = String(editingDraft || '').trim();
    if (!nextContent) {
      showToast('Nội dung chỉnh sửa không được để trống', 'fail');
      return;
    }

    try {
      const candidateEndpoints = [
        `/messages/${normalizedMessageId}/edit`,
        `/chat/messages/${normalizedMessageId}/edit`,
        `/messages/${normalizedMessageId}`,
      ];

      let updatedMessage = null;
      let lastError = null;

      for (const endpoint of candidateEndpoints) {
        try {
          const response = await api.patch(endpoint, { content: nextContent });
          const payload = response?.data || response;
          updatedMessage = payload?.data || payload;
          break;
        } catch (requestError) {
          lastError = requestError;
          const status = requestError?.status || requestError?.response?.status;
          // Interceptor đã normalize lỗi; fallback cho cả 404/403 giữa các endpoint tương thích.
          if (status !== 404 && status !== 403) {
            throw requestError;
          }
        }
      }

      if (!updatedMessage && lastError) {
        throw lastError;
      }

      setMessages((prev) =>
        prev.map((item) =>
          getMessageId(item) === normalizedMessageId
            ? {
                ...item,
                ...(updatedMessage && typeof updatedMessage === 'object' ? updatedMessage : {}),
                content: updatedMessage?.content || nextContent,
                editedAt: updatedMessage?.editedAt || new Date().toISOString(),
              }
            : item
        )
      );
      handleCancelEditMessage();
      showToast('Đã cập nhật tin nhắn', 'success');
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.data?.message || error?.message || 'Không thể chỉnh sửa tin nhắn',
        'fail'
      );
    }
  };

  const handleRecallMessage = async (messageId) => {
    try {
      const normalizedMessageId = String(messageId || '').trim();
      if (!normalizedMessageId) {
        showToast('Không xác định được tin nhắn để thu hồi', 'fail');
        return;
      }

      const candidateRequests = [
        async () => api.patch(`/messages/${normalizedMessageId}/recall`),
        async () => api.patch(`/chat/messages/${normalizedMessageId}/recall`),
        // Backend cũ chưa có recall endpoint: fallback sang soft delete để vẫn cập nhật dữ liệu thật.
        async () => api.delete(`/messages/${normalizedMessageId}`),
      ];

      let lastError = null;
      let recalled = false;

      for (const requestFn of candidateRequests) {
        try {
          await requestFn();
          recalled = true;
          break;
        } catch (requestError) {
          lastError = requestError;
          const status = requestError?.status || requestError?.response?.status;
          if (status !== 404 && status !== 403) {
            throw requestError;
          }
        }
      }

      if (!recalled && lastError) {
        throw lastError;
      }

      setMessages((prev) =>
        prev.map((item) =>
          getMessageId(item) === normalizedMessageId
            ? {
                ...item,
                isRecalled: true,
                recalledAt: new Date().toISOString(),
                originalContent: item.content,
              }
            : item
        )
      );
      handleCancelEditMessage();
      setActiveMessageMenuId(null);
      showToast('Đã thu hồi tin nhắn', 'success');
    } catch (error) {
      showToast(
        error?.response?.data?.message || error?.data?.message || error?.message || 'Không thể thu hồi tin nhắn',
        'fail'
      );
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((item) => getMessageId(item) !== String(messageId)));
      setMessageReactions((prev) => {
        const next = { ...prev };
        delete next[String(messageId)];
        return next;
      });
      setActiveMessageMenuId(null);
      setActiveReactionPickerId(null);
      setConfirmDeleteMessageId(null);
      showToast('Đã xóa tin nhắn', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Không thể xóa tin nhắn', 'fail');
    }
  };

  const handleToggleReaction = (messageId, emoji) => {
    if (!messageId || !emoji) return;
    setMessageReactions((prev) => {
      const current = Array.isArray(prev[messageId]) ? prev[messageId] : [];
      const exists = current.includes(emoji);
      const nextList = exists ? current.filter((item) => item !== emoji) : [...current, emoji];
      return { ...prev, [messageId]: nextList };
    });
    setActiveReactionPickerId(null);
  };

  const getReactionCountMap = (messageId) => {
    const list = Array.isArray(messageReactions[messageId]) ? messageReactions[messageId] : [];
    return list.reduce((acc, emoji) => {
      acc[emoji] = (acc[emoji] || 0) + 1;
      return acc;
    }, {});
  };

  // Load danh sách bạn bè từ friend-service
  const loadFriends = useCallback(async () => {
    try {
      const resp = await friendService.getFriends();
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.friends || result;
      setFriends(Array.isArray(list) ? list : []);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không tải được danh sách bạn bè', 'fail');
      setFriends([]);
    }
  }, []);

  const buildChannelRoomMetaMap = useCallback(async () => {
    const map = {};
    try {
      const orgRes = await api.get('/organizations/my');
      const orgPayload = orgRes?.data ?? orgRes;
      const orgList = Array.isArray(orgPayload)
        ? orgPayload
        : Array.isArray(orgPayload?.data)
          ? orgPayload.data
          : [];
      for (const org of orgList) {
        const orgId = org._id || org.id;
        const orgName = org.name || 'Tổ chức';
        const deptRes = await api.get(`/organizations/${orgId}/departments`);
        const deptPayload = deptRes?.data ?? deptRes;
        const depts = Array.isArray(deptPayload)
          ? deptPayload
          : Array.isArray(deptPayload?.data)
            ? deptPayload.data
            : [];
        for (const dept of depts) {
          const deptId = dept._id;
          const deptName = dept.name || 'Phòng ban';
          const chRes = await api.get(`/organizations/${orgId}/departments/${deptId}/channels`);
          const chPayload = chRes?.data ?? chRes;
          const chs = Array.isArray(chPayload)
            ? chPayload
            : Array.isArray(chPayload?.data)
              ? chPayload.data
              : [];
          for (const ch of chs) {
            const id = String(ch._id);
            map[id] = {
              orgName,
              deptName,
              channelName: ch.name || 'Kênh',
              orgId: String(orgId),
              deptId: String(deptId),
              channelId: id,
            };
          }
        }
      }
    } catch (e) {
      console.warn('[FriendChat] buildChannelRoomMetaMap', e);
    }
    return map;
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingOrgUnread(true);
      try {
        const [metaMap, unreadRes] = await Promise.all([
          buildChannelRoomMetaMap(),
          api.get('/chat/messages/unread/org', { params: { limit: 40 } }),
        ]);
        if (cancelled) return;
        setRoomMetaById(metaMap);
        const raw = unreadRes?.data ?? unreadRes;
        const inner = raw?.data ?? raw;
        const list = Array.isArray(inner?.messages) ? inner.messages : [];
        setOrgUnreadMessages(list);
      } catch {
        if (!cancelled) {
          setOrgUnreadMessages([]);
          setRoomMetaById({});
        }
      } finally {
        if (!cancelled) setLoadingOrgUnread(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [buildChannelRoomMetaMap]);

  const truncateOrgUnreadPreview = (text, len = 44) => {
    const s = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return 'Tin nhắn mới';
    return s.length > len ? `${s.slice(0, len)}…` : s;
  };

  const handleOpenOrgUnread = (msg) => {
    const roomId = String(msg?.roomId || '');
    const orgId = String(msg?.organizationId || '');
    const meta = roomMetaById[roomId];
    navigate('/organizations', {
      state: {
        openWorkspace: {
          organizationId: meta?.orgId || orgId,
          departmentId: meta?.deptId || '',
          channelId: roomId,
        },
      },
    });
  };

  const onlineUserSet = useMemo(
    () => new Set((onlineUsers || []).map((id) => String(id))),
    [onlineUsers]
  );

  /** Trạng thái online = socket (users:online) hoặc profile user-service */
  const viewFriends = useMemo(() => {
    return friends.map((f) => {
      const u = f.friendId || f;
      const id = u?._id || u?.id || f.id;
      const idStr = String(id || '');
      const socketOnline = idStr && onlineUserSet.has(idStr);
      const dbStatus = String(u?.status || 'offline').toLowerCase();
      const isOnline = socketOnline || dbStatus === 'online';
      return {
        id,
        name: u?.displayName || u?.username || 'Người dùng',
        avatar: u?.avatar || '👤',
        status: isOnline ? 'online' : 'offline',
      };
    });
  }, [friends, onlineUserSet]);

  const getMessageTimestamp = (msg) => {
    const raw = msg?.createdAt || msg?.updatedAt;
    if (!raw) return Date.now();
    const ts = new Date(raw).getTime();
    return Number.isFinite(ts) ? ts : Date.now();
  };

  const toPreview = (content) => {
    const text = String(content || '').trim();
    if (!text) return 'Tin nhắn mới';
    return text.length > 42 ? `${text.slice(0, 42)}...` : text;
  };

  const upsertFriendActivity = useCallback((friendId, msg) => {
    if (!friendId || !msg) return;
    const nextData = {
      timestamp: getMessageTimestamp(msg),
      preview: toPreview(msg.content),
    };
    setActivityByFriend((prev) => {
      const old = prev[friendId];
      if (old && old.timestamp >= nextData.timestamp) return prev;
      return { ...prev, [friendId]: nextData };
    });
  }, []);

  const loadPendingRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const resp = await friendService.getPendingRequests();
      const list = Array.isArray(resp?.data) ? resp.data : resp?.data?.data ?? [];
      setPendingRequests(Array.isArray(list) ? list : []);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không tải được danh sách yêu cầu', 'fail');
      setPendingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const handleSearchFriend = async () => {
    const phone = String(searchPhone || '').trim();
    if (!phone) {
      showToast('Xin hãy nhập số điện thoại', 'fail');
      return;
    }

    try {
      const resp = await friendService.searchByPhone(phone);
      const userData = resp?.data || resp;
      if (!userData) {
        setSearchResult(null);
        showToast('Không tìm thấy người dùng', 'info');
        return;
      }
      setSearchResult(userData);
    } catch (err) {
      if (err.status === 404 || err.response?.status === 404) {
        showToast('Không tìm thấy người dùng', 'info');
      } else {
        showToast(err.response?.data?.message || err.message || 'Lỗi khi tìm kiếm', 'fail');
      }
      setSearchResult(null);
    }
  };

  const handleSendFriendRequest = async (targetUserId) => {
    const userId = targetUserId?.toString?.() ?? targetUserId;
    if (!userId) return;
    try {
      await friendService.sendRequest(userId);
      showToast('Đã gửi lời mời kết bạn', 'success');
      setSearchResult((prev) =>
        prev && (prev.userId?.toString?.() === userId.toString() || prev.userId === userId)
          ? { ...prev, relationship: { status: 'pending' } }
          : prev
      );
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không gửi được lời mời', 'fail');
    }
  };

  const handleAcceptRequest = async (requestId) => {
    const id = requestId?.toString?.() ?? requestId;
    if (!id) return;
    try {
      await friendService.acceptRequest(id);
      await markFriendNotificationsResolved(id);
      showToast('Đã chấp nhận lời mời', 'success');
      await Promise.all([loadPendingRequests(), loadFriends()]);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không chấp nhận được', 'fail');
    }
  };

  const handleRejectRequest = async (requestId) => {
    const id = requestId?.toString?.() ?? requestId;
    if (!id) return;
    try {
      await friendService.rejectRequest(id);
      await markFriendNotificationsResolved(id);
      showToast('Đã từ chối lời mời', 'success');
      loadPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không từ chối được', 'fail');
    }
  };

  const handleStartVoiceCall = (friendId, mode = 'audio') => {
    if (!friendId) return;
    navigate(`/voice/friend-${friendId}?mode=${mode}`);
    setActionMenuFriendId(null);
  };

  const handleRemoveFriend = async (friendId) => {
    if (!friendId) return;
    if (!window.confirm('Bạn có chắc muốn xóa người bạn này?')) return;
    try {
      await friendService.removeFriend(friendId);
      showToast('Đã xóa bạn', 'success');
      setActionMenuFriendId(null);
      if (String(selectedFriendId) === String(friendId)) {
        setSelectedFriendId(null);
        setMessages([]);
      }
      loadFriends();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không xóa được bạn', 'fail');
    }
  };

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
        const safeList = Array.isArray(list) ? list : [];
        setMessages(safeList);

        if (safeList.length > 0) {
          const latest = safeList.reduce((latestMsg, item) => {
            if (!latestMsg) return item;
            return getMessageTimestamp(item) > getMessageTimestamp(latestMsg) ? item : latestMsg;
          }, null);
          if (latest) {
            upsertFriendActivity(friendId, latest);
          }
        }
      } catch (err) {
        showToast(err.response?.data?.message || err.message || 'Không tải được tin nhắn', 'fail');
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [upsertFriendActivity]
  );

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  useEffect(() => {
    loadPendingRequests();
  }, [loadPendingRequests]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(getPinnedStorageKey());
      if (!raw) {
        setPinnedByFriend({});
        return;
      }
      const parsed = JSON.parse(raw);
      setPinnedByFriend(parsed && typeof parsed === 'object' ? parsed : {});
    } catch (error) {
      setPinnedByFriend({});
    }
  }, [getPinnedStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(getPinnedStorageKey(), JSON.stringify(pinnedByFriend));
    } catch (error) {
      // Ignore storage write errors
    }
  }, [getPinnedStorageKey, pinnedByFriend]);

  useEffect(() => {
    if (!isContactsModalOpen) return;
    if (friendModalTab === 'requests') {
      loadPendingRequests();
    }
  }, [isContactsModalOpen, friendModalTab, loadPendingRequests]);

  useEffect(() => {
    if (selectedFriendId) {
      loadMessages(selectedFriendId);
    }
  }, [selectedFriendId, loadMessages]);

  useEffect(() => {
    setChatSearch('');
    setShowEmojiPicker(false);
    setActiveReactionPickerId(null);
    setActiveMessageMenuId(null);
    handleCancelEditMessage();
  }, [selectedFriendId]);

  useEffect(() => {
    const handleDocumentClick = (event) => {
      if (!event.target.closest('.message-reaction-root')) {
        setActiveReactionPickerId(null);
      }

      if (!event.target.closest('.message-menu-root')) {
        setActiveMessageMenuId(null);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
    };
  }, []);

  // Gửi tin nhắn qua socket-service (realtime)
  const handleSend = async () => {
    if (!selectedFriendId || !message.trim()) return;

    try {
      emit('friend:send', {
        receiverId: selectedFriendId,
        content: message.trim(),
        messageType: 'text',
      });
      // Xóa input, chờ server trả về qua sự kiện socket
      setMessage('');
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

    const appendIfRelevant = (m) => {
      if (!isMessageForCurrentConversation(m)) return;
      upsertFriendActivity(selectedFriendId, m);

      setMessages((prev) => {
        const id = m._id || m.id;
        if (id && prev.some((x) => (x._id || x.id) === id)) {
          return prev;
        }
        return [...prev, m];
      });
    };

    const handleNewMessage = (m) => {
      appendIfRelevant(m);
    };

    const handleSentMessage = (m) => {
      appendIfRelevant(m);
    };

    on('friend:new_message', handleNewMessage);
    on('friend:sent', handleSentMessage);

    return () => {
      off('friend:new_message', handleNewMessage);
      off('friend:sent', handleSentMessage);
    };
  }, [on, off, currentUserId, selectedFriendId, upsertFriendActivity]);

  useEffect(() => {
    if (!on || !off) return;

    const refreshFriendViews = () => {
      loadPendingRequests();
      loadFriends();
    };

    const handleFriendRequestEvent = () => {
      refreshFriendViews();
    };

    on('friend:request_sent', handleFriendRequestEvent);
    on('friend:request_accepted', handleFriendRequestEvent);
    on('friend:request_rejected', handleFriendRequestEvent);
    on('friend:removed', handleFriendRequestEvent);

    return () => {
      off('friend:request_sent', handleFriendRequestEvent);
      off('friend:request_accepted', handleFriendRequestEvent);
      off('friend:request_rejected', handleFriendRequestEvent);
      off('friend:removed', handleFriendRequestEvent);
    };
  }, [on, off, loadPendingRequests, loadFriends]);

  /** Backend xóa DM khi hủy kết bạn — đồng bộ UI (cả phía người còn lại) */
  useEffect(() => {
    if (!on || !off || !currentUserId) return;

    const handleDmCleared = (payload) => {
      const a = String(payload?.userIdA || '');
      const b = String(payload?.userIdB || '');
      const my = String(currentUserId);
      if (!a || !b) return;
      const peer = a === my ? b : b === my ? a : null;
      if (!peer) return;

      setActivityByFriend((prev) => {
        const next = { ...prev };
        delete next[peer];
        return next;
      });
      setPinnedByFriend((prev) => {
        const next = { ...prev };
        delete next[peer];
        return next;
      });
      if (selectedFriendId && String(selectedFriendId) === String(peer)) {
        setMessages([]);
      }
    };

    on('friend:dm_cleared', handleDmCleared);
    return () => off('friend:dm_cleared', handleDmCleared);
  }, [on, off, currentUserId, selectedFriendId]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return ta - tb;
      }),
    [messages]
  );

  const normalizedChatSearch = chatSearch.trim().toLowerCase();

  const filteredConversationMessages = useMemo(() => {
    if (!normalizedChatSearch) return sortedMessages;
    return sortedMessages.filter((item) =>
      String(getRenderableMessageContent(item)).toLowerCase().includes(normalizedChatSearch)
    );
  }, [sortedMessages, normalizedChatSearch, getRenderableMessageContent]);

  const pinnedMessageIds = useMemo(() => {
    const friendId = String(selectedFriendId || '');
    return friendId && Array.isArray(pinnedByFriend[friendId]) ? pinnedByFriend[friendId] : [];
  }, [pinnedByFriend, selectedFriendId]);

  const pinnedMessages = useMemo(() => {
    if (pinnedMessageIds.length === 0) return [];
    return sortedMessages.filter((item) => pinnedMessageIds.includes(getMessageId(item)));
  }, [pinnedMessageIds, sortedMessages, getMessageId]);

  useEffect(() => {
    if (!selectedFriendId) return;
    requestAnimationFrame(() => {
      messageEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    });
  }, [selectedFriendId, filteredConversationMessages.length]);

  useEffect(() => {
    const id = location.state?.selectFriendId;
    if (!id) return;
    setSelectedFriendId(String(id));
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location.state, location.pathname, location.search, navigate]);

  const currentFriend = viewFriends.find((f) => f.id === selectedFriendId) || null;

  const recentActiveFriends = [...viewFriends]
    .sort((a, b) => {
      const aOnline = a.status === 'online' ? 1 : 0;
      const bOnline = b.status === 'online' ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.name.localeCompare(b.name, 'vi');
    })
    .slice(0, 6);

  const pendingCount = pendingRequests.length;
  const onlineCount = viewFriends.filter((f) => f.status === 'online').length;

  const normalizedCenterSearch = friendCenterSearch.trim().toLowerCase();
  const centerFriends = viewFriends.filter((f) => {
    if (friendCenterTab === 'online' && f.status !== 'online') return false;
    if (!normalizedCenterSearch) return true;
    return String(f.name || '').toLowerCase().includes(normalizedCenterSearch);
  });

  const handleComposerFeature = useCallback((featureName) => {
    showToast(`${featureName} đang ở bản beta`, 'info');
  }, []);

  const composerPlusItems = useMemo(
    () => [
      { key: 'upload-file', icon: '📁', label: 'Tải lên tệp', onClick: () => handleComposerFeature('Tải lên tệp') },
      { key: 'topic', icon: '🧵', label: 'Tạo chủ đề', onClick: () => handleComposerFeature('Tạo chủ đề') },
      { key: 'poll', icon: '🗳️', label: 'Tạo khảo sát', onClick: () => handleComposerFeature('Tạo khảo sát') },
      { key: 'apps', icon: '✳️', label: 'Dùng các ứng dụng', onClick: () => handleComposerFeature('Ứng dụng chat') },
    ],
    [handleComposerFeature]
  );

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString('vi-VN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  return (
    <div className="h-screen flex overflow-hidden bg-[#020817] text-slate-100">
      {/* Khung 1: Sidebar nav chỉ icon, thanh trượt riêng */}
      <NavigationSidebar />
      <div className="flex-1 flex h-full min-w-0 relative">
        {/* Khung 2: Tin chưa đọc theo tổ chức */}
        <div className="w-64 shrink-0 bg-slate-900/60 p-3.5 border-r border-slate-800 overflow-y-auto h-full scrollbar-overlay relative">
          <div className="mb-4">
            <h2 className="text-base md:text-lg font-bold text-white tracking-tight leading-snug">
              Tổ chức
            </h2>
            <p className="text-[11px] md:text-xs text-gray-400 mt-1">Tin chưa đọc</p>
          </div>

          <div className="space-y-1.5 pb-3">
            {loadingOrgUnread && (
              <div className="text-xs text-gray-500 py-2">Đang tải tin chưa đọc…</div>
            )}
            {!loadingOrgUnread &&
              orgUnreadMessages.map((msg, idx) => {
                const roomId = String(msg?.roomId || '');
                const meta = roomMetaById[roomId];
                const orgDisplayName = meta?.orgName || 'Tổ chức';
                const preview = truncateOrgUnreadPreview(getRenderableMessageContent(msg));
                return (
                  <div
                    key={`org-unread-${String(msg?._id || msg?.id || idx)}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenOrgUnread(msg)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenOrgUnread(msg);
                      }
                    }}
                    onMouseEnter={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      setOrgUnreadHoverTip({
                        top: rect.top + rect.height / 2,
                        left: rect.right + 8,
                        deptName: meta?.deptName,
                        channelName: meta?.channelName,
                        orgName: meta?.orgName,
                      });
                    }}
                    onMouseLeave={() => setOrgUnreadHoverTip(null)}
                    className="relative flex items-start gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-800/60 border border-transparent"
                  >
                    <div className="relative shrink-0 mt-0.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm">
                        💬
                      </div>
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#020817] bg-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-white font-semibold text-sm truncate">{orgDisplayName}</div>
                      <div className="text-[11px] text-gray-500 truncate">{preview}</div>
                    </div>
                  </div>
                );
              })}
            {!loadingOrgUnread && orgUnreadMessages.length === 0 && (
              <div className="text-xs text-gray-500">Không có tin chưa đọc từ tổ chức.</div>
            )}
          </div>
        </div>

        {/* Khung 3: Khu vực chat */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          {!currentFriend ? (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="shrink-0 border-b border-slate-800 bg-slate-900/70 px-5 py-3 flex items-center gap-3">
                <button
                  type="button"
                  className="text-white text-sm md:text-base font-semibold"
                >
                  Bạn bè
                </button>
                <button
                  type="button"
                  onClick={() => setFriendCenterTab('online')}
                  className={`px-3 py-1 rounded-lg text-xs md:text-sm font-semibold transition ${
                    friendCenterTab === 'online'
                      ? 'bg-slate-700 text-white'
                      : 'text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  Đang làm việc
                </button>
                <button
                  type="button"
                  onClick={() => setFriendCenterTab('all')}
                  className={`px-3 py-1 rounded-lg text-xs md:text-sm font-semibold transition ${
                    friendCenterTab === 'all'
                      ? 'bg-slate-700 text-white'
                      : 'text-gray-300 hover:bg-slate-800/70'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFriendModalTab('search');
                    setIsContactsModalOpen(true);
                  }}
                  className="ml-auto px-3 py-1.5 rounded-lg text-xs md:text-sm font-semibold bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:opacity-90 transition"
                >
                  Thêm bạn
                </button>
              </div>

              <div className="shrink-0 px-5 py-4 border-b border-slate-800 bg-slate-900/40">
                <div className="relative">
                  <input
                    type="text"
                    value={friendCenterSearch}
                    onChange={(e) => setFriendCenterSearch(e.target.value)}
                    placeholder="Tìm kiếm"
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 text-sm text-white placeholder-gray-500"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 scrollbar-overlay">
                <h3 className="text-lg md:text-xl font-bold text-white mb-4 tracking-tight">
                  {friendCenterTab === 'online'
                    ? `Đang làm việc - ${onlineCount}`
                    : `Tất cả - ${viewFriends.length}`}
                </h3>

                <div className="space-y-1.5">
                  {centerFriends.map((f, idx) => (
                    <div
                      key={`center-${String(f.id || 'unknown')}-${idx}`}
                      className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/35 hover:bg-slate-800/50 transition"
                    >
                      <div className="relative">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-base overflow-hidden">
                          {f.avatar && String(f.avatar).startsWith('http') ? (
                            <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            f.avatar
                          )}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#020817] ${
                            f.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'
                          }`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-sm md:text-base leading-6 truncate">{f.name}</div>
                        <div className="text-gray-400 text-sm truncate">
                          {f.status === 'online' ? 'Đang làm việc' : 'Ngoại tuyến'}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedFriendId(f.id)}
                        className="w-10 h-10 rounded-lg text-xl text-gray-300 hover:text-white hover:bg-slate-700/70 transition"
                        title="Nhắn tin"
                      >
                        💬
                      </button>
                      <button
                        type="button"
                        onClick={() => setActionMenuFriendId((prev) => (prev === f.id ? null : f.id))}
                        className="w-10 h-10 rounded-lg text-xl text-gray-300 hover:text-white hover:bg-slate-700/70 transition"
                        title="Thêm tùy chọn"
                      >
                        ⋮
                      </button>

                      {actionMenuFriendId === f.id && (
                        <div className="absolute right-2 top-[calc(100%-2px)] z-20 w-52 rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => handleStartVoiceCall(f.id, 'video')}
                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-800/80 transition"
                          >
                            Bắt đầu cuộc gọi video
                          </button>
                          <button
                            type="button"
                            onClick={() => handleStartVoiceCall(f.id, 'audio')}
                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-white hover:bg-slate-800/80 transition"
                          >
                            Bắt đầu cuộc gọi thoại
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveFriend(f.id)}
                            className="w-full text-left px-3 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-500/10 transition"
                          >
                            Xóa bạn
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {centerFriends.length === 0 && (
                  <div className="text-gray-500 mt-8">
                    Không có kết quả phù hợp.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">{currentFriend.name}</h2>
                  <div className="ml-auto relative w-full max-w-xs">
                    <input
                      type="text"
                      value={chatSearch}
                      onChange={(e) => setChatSearch(e.target.value)}
                      placeholder="Tìm trong đoạn chat..."
                      className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#040f2a] border border-slate-800 text-sm text-white placeholder-gray-500"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
                  </div>
                </div>
              </div>

              {pinnedMessages.length > 0 && (
                <div className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-4 py-2">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-yellow-300">📌</span>
                    <span className="text-xs font-semibold text-gray-300">Tin nhắn đã ghim</span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto scrollbar-overlay pb-1">
                    {pinnedMessages.map((item) => {
                      const messageId = getMessageId(item);
                      const text = getRenderableMessageContent(item);
                      return (
                        <button
                          key={`pin-${messageId}`}
                          type="button"
                          onClick={() => {
                            const target = document.getElementById(`message-${messageId}`);
                            target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }}
                          className="max-w-[280px] text-left px-2.5 py-1.5 rounded-lg bg-[#040f2a] border border-slate-700 text-xs text-gray-200 truncate"
                        >
                          {text || 'Tin nhắn'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2 scrollbar-overlay">
                {loadingMessages ? (
                  <div className="text-center text-gray-400">Đang tải tin nhắn...</div>
                ) : (
                  // Sắp xếp theo thời gian tăng dần: tin cũ ở trên, mới ở dưới
                  [...messages]
                    .sort((a, b) => {
                      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                      return ta - tb;
                    })
                    .map((m) => {
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;
                    const messageId = getMessageId(m);
                    const isPinned = pinnedMessageIds.includes(messageId);

                    const isMine = myId && senderId === myId;

                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || 'Bạn bè';

                    const avatar = isMine
                      ? currentUserAvatar
                      : currentFriend?.avatar || '👤';

                    const renderedContent = getRenderableMessageContent(m);
                    const isMessageEditing = editingMessageId === messageId;
                    const reactionCountMap = getReactionCountMap(messageId);
                    const reactionEntries = Object.entries(reactionCountMap);

                    return (
                      <div
                        key={m._id || m.id}
                        className={`flex items-start mb-1 ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        {!isMine && (
                          <div className="mr-2 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-xs flex-shrink-0">
                            {avatar}
                          </div>
                        )}
                        <GlassCard
                          className={`inline-block max-w-[80%] px-3 py-2 text-sm border border-slate-800 bg-slate-900/70 ${
                            isMine ? 'bg-[#0a1734]' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2 mb-1">
                            <span className="text-xs font-bold text-purple-300 truncate">
                              {displayName}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {formatTime(m.createdAt)}
                            </span>
                            {m.editedAt && !m.isDeleted && !m.isRecalled && (
                              <span className="text-[10px] text-gray-500">(đã sửa)</span>
                            )}
                            {isPinned && <span className="text-[11px]">📌</span>}

                            <div className="relative message-reaction-root">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowEmojiPicker(false);
                                  setActiveMessageMenuId(null);
                                  setActiveReactionPickerId((prev) => (prev === messageId ? null : messageId));
                                }}
                                className="w-6 h-6 rounded-md hover:bg-slate-700/70 text-gray-300 text-xs"
                                title="Biểu cảm"
                              >
                                😊
                              </button>

                              {activeReactionPickerId === messageId && (
                                <div className="absolute right-0 top-7 z-30 p-1.5 rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
                                  <div className="flex gap-1">
                                    {quickEmojis.map((emoji) => (
                                      <button
                                        key={`${messageId}-${emoji}`}
                                        type="button"
                                        onClick={() => handleToggleReaction(messageId, emoji)}
                                        className="w-8 h-8 rounded-md hover:bg-slate-800/80 text-base"
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="relative ml-auto message-menu-root">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowEmojiPicker(false);
                                  setActiveReactionPickerId(null);
                                  setActiveMessageMenuId((prev) => (prev === messageId ? null : messageId));
                                }}
                                className="w-6 h-6 rounded-md hover:bg-slate-700/70 text-gray-300 text-xs"
                                title="Tùy chọn tin nhắn"
                              >
                                ⋯
                              </button>

                              {activeMessageMenuId === messageId && (
                                <div className="absolute right-0 top-7 z-20 w-40 rounded-lg border border-slate-700 bg-slate-900 shadow-2xl overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => handleCopyMessage(m)}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-slate-800"
                                  >
                                    Sao chép
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleTogglePinMessage(m)}
                                    className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-slate-800"
                                  >
                                    {isPinned ? 'Bỏ ghim' : 'Ghim tin nhắn'}
                                  </button>
                                  {isMine && !m.isDeleted && !m.isRecalled && (
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditMessage(m)}
                                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-slate-800"
                                    >
                                      Chỉnh sửa
                                    </button>
                                  )}
                                  {isMine && !m.isDeleted && !m.isRecalled && (
                                    <button
                                      type="button"
                                      onClick={() => handleRecallMessage(messageId)}
                                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-slate-800"
                                    >
                                      Thu hồi
                                    </button>
                                  )}
                                  {isMine && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setConfirmDeleteMessageId(messageId);
                                        setActiveMessageMenuId(null);
                                      }}
                                      className="w-full text-left px-3 py-2 text-xs text-rose-400 hover:bg-rose-500/10"
                                    >
                                      Xóa
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {isMessageEditing ? (
                            <div className="space-y-2">
                              <input
                                type="text"
                                value={editingDraft}
                                onChange={(e) => setEditingDraft(e.target.value)}
                                className="w-full px-2 py-1.5 rounded-lg bg-[#040f2a] border border-slate-700 text-sm text-white"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSaveEditMessage(messageId)}
                                  className="px-2.5 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold"
                                >
                                  Lưu
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditMessage}
                                  className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-semibold"
                                >
                                  Hủy
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`whitespace-pre-wrap break-words ${m.isDeleted || m.isRecalled ? 'text-gray-400 italic' : 'text-white'}`}>
                                {renderedContent}
                              </div>
                              {reactionEntries.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {reactionEntries.map(([emoji, count]) => (
                                    <button
                                      key={`${messageId}-reaction-${emoji}`}
                                      type="button"
                                      onClick={() => handleToggleReaction(messageId, emoji)}
                                      className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-xs text-gray-100"
                                    >
                                      {emoji} {count}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </GlassCard>
                      </div>
                    );
                  })
                )}
                <div ref={messageEndRef} />
              </div>

              <div className="relative">
                <UnifiedChatComposer
                  value={message}
                  onChange={setMessage}
                  onSend={handleSend}
                  placeholder="Nhập tin nhắn..."
                  disabled={!selectedFriendId}
                  sendDisabled={!message.trim()}
                  sendLabel="Gửi"
                  plusItems={composerPlusItems}
                  actionItems={[
                    {
                      key: 'emoji',
                      title: 'Emoji',
                      content: '🙂',
                      className: 'w-8 text-lg',
                      onClick: () => {
                        setActiveReactionPickerId(null);
                        setActiveMessageMenuId(null);
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
                    <div className="fixed bottom-24 right-8 z-50 h-[420px] w-[520px] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl">
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
                            onChange={(event) => setEmojiSearch(event.target.value)}
                            placeholder="Tìm emoji hợp lý nhất"
                            className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                          />
                          <button
                            type="button"
                            onClick={() => handleComposerFeature('Thêm emoji')}
                            className="h-11 rounded-xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"
                          >
                            Thêm emoji
                          </button>
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

        {/* Khung 4: Gợi ý bên phải khi chưa/chưa cần chọn bạn */}
        <aside className="w-80 shrink-0 border-l border-slate-800 bg-slate-900/45 p-4 overflow-y-auto scrollbar-overlay">
          <div className="mb-6">
            <h3 className="text-sm uppercase tracking-wide text-gray-400 font-semibold">
              Bạn bè hoạt động gần nhất
            </h3>
            <div className="mt-3 space-y-2">
              {recentActiveFriends.map((f, idx) => (
                <button
                  type="button"
                  key={`active-${String(f.id || 'unknown')}-${idx}`}
                  onClick={() => setSelectedFriendId(f.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-xl bg-[#030d24] border border-slate-800 hover:bg-slate-800/60 text-left"
                >
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm overflow-hidden">
                      {f.avatar && String(f.avatar).startsWith('http') ? (
                        <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        f.avatar
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#020817] ${
                        f.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{f.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {f.status === 'online' ? 'Đang làm việc' : 'Ngoại tuyến'}
                    </div>
                  </div>
                </button>
              ))}
              {recentActiveFriends.length === 0 && (
                <div className="text-xs text-gray-500">Chưa có dữ liệu hoạt động.</div>
              )}
            </div>
          </div>

        </aside>
      </div>
      <Modal
        isOpen={isContactsModalOpen}
        onClose={() => setIsContactsModalOpen(false)}
        title="Bạn bè và liên hệ"
        size="md"
      >
        <div>
          <div className="mb-4 flex gap-2">
            {[
              { id: 'contacts', label: 'Liên hệ' },
              { id: 'requests', label: `Yêu cầu mới${pendingCount ? ` (${pendingCount})` : ''}` },
              { id: 'search', label: 'Tìm bạn bè' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFriendModalTab(tab.id)}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  friendModalTab === tab.id
                    ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white'
                    : 'bg-[#030d24] border border-slate-800 text-gray-300 hover:bg-slate-800/60'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {friendModalTab === 'contacts' && (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1 scrollbar-overlay">
              {viewFriends.map((f, idx) => (
                <button
                  key={`contact-${String(f.id || 'unknown')}-${idx}`}
                  type="button"
                  onClick={() => {
                    setSelectedFriendId(f.id);
                    setIsContactsModalOpen(false);
                  }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-[#030d24] border border-slate-800 hover:bg-slate-800/60 text-left"
                >
                  <div className="relative">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm overflow-hidden">
                      {f.avatar && String(f.avatar).startsWith('http') ? (
                        <img src={f.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        f.avatar
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#030d24] ${
                        f.status === 'online' ? 'bg-emerald-400' : 'bg-gray-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{f.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {f.status === 'online' ? 'Đang làm việc' : 'Ngoại tuyến'}
                    </div>
                  </div>
                </button>
              ))}
              {viewFriends.length === 0 && (
                <div className="text-sm text-gray-500">Chưa có liên hệ nào.</div>
              )}
            </div>
          )}

          {friendModalTab === 'requests' && (
            <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1 scrollbar-overlay">
              {loadingRequests ? (
                <div className="text-sm text-gray-400">Đang tải yêu cầu kết bạn...</div>
              ) : (
                pendingRequests.map((request, idx) => {
                  const from = request.userId || request.from || request.requester;
                  const actionTargetId = from?._id || from?.id || request.userId || request.requester || request._id || request.id;
                  const requestId = request._id || request.id || actionTargetId;
                  const name = from?.displayName || from?.username || from?.name || 'Người dùng';
                  const avatar = from?.avatar || '👤';
                  return (
                    <div
                      key={`req-${String(requestId || 'unknown')}-${idx}`}
                      className="w-full p-2.5 rounded-xl bg-[#030d24] border border-slate-800"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-sm">
                          {avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-white truncate">{name}</div>
                          <div className="text-[11px] text-gray-400">Yêu cầu kết bạn mới</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleAcceptRequest(actionTargetId)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/90 text-white text-xs font-semibold hover:bg-emerald-500"
                          >
                            Nhận
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(actionTargetId)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-700 text-white text-xs font-semibold hover:bg-slate-600"
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              {!loadingRequests && pendingRequests.length === 0 && (
                <div className="text-sm text-gray-500">Không có yêu cầu kết bạn mới.</div>
              )}
            </div>
          )}

          {friendModalTab === 'search' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="Nhập số điện thoại để tìm bạn"
                  className="flex-1 px-3 py-2 rounded-xl bg-[#040f2a] border border-slate-800 text-sm text-white placeholder-gray-500"
                />
                <GradientButton className="px-3 py-2 text-sm rounded-xl" onClick={handleSearchFriend}>
                  Tìm
                </GradientButton>
              </div>

              {searchResult && (
                <div className="p-3 rounded-xl bg-[#030d24] border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-sm">
                      {searchResult.avatar || '👤'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white truncate">
                        {searchResult.displayName || searchResult.username || 'Người dùng'}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {searchResult.phone || searchResult.email || ''}
                      </div>
                    </div>
                    <div className="shrink-0 flex items-center">
                      {searchResult.relationship?.status === 'accepted' ? (
                        <span className="inline-flex px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-xs whitespace-nowrap">
                          Đã là bạn bè
                        </span>
                      ) : searchResult.relationship?.status === 'pending' ? (
                        <span className="inline-flex px-3 py-1.5 rounded-lg bg-white/10 text-gray-400 text-xs whitespace-nowrap">
                          Đã gửi lời mời
                        </span>
                      ) : (
                        <GradientButton
                          variant="secondary"
                          className="px-3 py-1.5 text-sm rounded-lg whitespace-nowrap"
                          onClick={() =>
                            handleSendFriendRequest(searchResult.userId?.toString?.() || searchResult.userId)
                          }
                        >
                          Thêm bạn
                        </GradientButton>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
      <Modal
        isOpen={confirmDeleteMessageId !== null}
        onClose={() => setConfirmDeleteMessageId(null)}
        title="Xác nhận"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300">Bạn có chắc muốn xóa tin nhắn này?</p>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => setConfirmDeleteMessageId(null)}
              className="px-4 py-2 rounded-lg bg-[#040f2a] border border-slate-800 text-sm text-white hover:bg-slate-800/70"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => handleDeleteMessage(confirmDeleteMessageId)}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Xóa
            </button>
          </div>
        </div>
      </Modal>
      <NotificationModal notice={notificationModal} onClose={() => setNotificationModal(null)} />

      {typeof document !== 'undefined' &&
        orgUnreadHoverTip &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999] w-max max-w-[260px] -translate-y-1/2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-left text-xs text-gray-200 shadow-xl"
            style={{ top: orgUnreadHoverTip.top, left: orgUnreadHoverTip.left }}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Phòng ban
            </div>
            <div className="text-sm font-medium text-white">{orgUnreadHoverTip.deptName || '—'}</div>
            <div className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              Kênh chat
            </div>
            <div className="text-sm font-medium text-white">
              #{orgUnreadHoverTip.channelName || '—'}
            </div>
            {orgUnreadHoverTip.orgName && (
              <div className="mt-2 border-t border-slate-700 pt-2 text-[11px] text-gray-500">
                {orgUnreadHoverTip.orgName}
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

export default FriendChatPage;


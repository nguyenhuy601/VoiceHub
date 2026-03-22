import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { useSocket } from '../../context/SocketContext';

function FriendChatPage() {
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
  const [toast, setToast] = useState(null);
  const { user } = useAuth();
  const navigate = useNavigate();
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

  // Map dữ liệu friends sang view model đơn giản
  const viewFriends = friends.map((f) => {
    const u = f.friendId || f;
    return {
      id: u?._id || u?.id || f.id,
      name: u?.displayName || u?.username || 'Người dùng',
      avatar: u?.avatar || '👤',
      status: String(u?.status || 'offline').toLowerCase(),
    };
  });

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

  const currentFriend = viewFriends.find((f) => f.id === selectedFriendId) || null;
  const compactFriends = viewFriends.slice(0, 8);

  const recentActiveFriends = [...viewFriends]
    .sort((a, b) => {
      const aOnline = a.status === 'online' ? 1 : 0;
      const bOnline = b.status === 'online' ? 1 : 0;
      if (aOnline !== bOnline) return bOnline - aOnline;
      return a.name.localeCompare(b.name, 'vi');
    })
    .slice(0, 6);

  const recentMessagedFriends = viewFriends
    .filter((f) => activityByFriend[f.id])
    .sort((a, b) => activityByFriend[b.id].timestamp - activityByFriend[a.id].timestamp)
    .slice(0, 6);
  const sidebarRecentFriends = recentMessagedFriends.length > 0 ? recentMessagedFriends : compactFriends;
  const pendingCount = pendingRequests.length;
  const onlineCount = viewFriends.filter((f) => f.status === 'online').length;

  const normalizedCenterSearch = friendCenterSearch.trim().toLowerCase();
  const centerFriends = viewFriends.filter((f) => {
    if (friendCenterTab === 'online' && f.status !== 'online') return false;
    if (!normalizedCenterSearch) return true;
    return String(f.name || '').toLowerCase().includes(normalizedCenterSearch);
  });

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
        {/* Khung 2: Danh sách bạn bè rút gọn */}
        <div className="w-64 shrink-0 bg-slate-900/60 p-3.5 border-r border-slate-800 overflow-y-auto h-full scrollbar-overlay relative">
          <div className="mb-4">
            <h2 className="text-base md:text-lg font-bold text-white tracking-tight">Chat bạn bè</h2>
            <p className="text-[11px] md:text-xs text-gray-400 mt-1">Gần đây</p>
          </div>

          <div className="space-y-1.5 pb-3">
            {sidebarRecentFriends.map((f, idx) => (
              <div
                key={`sidebar-${String(f.id || 'unknown')}-${idx}`}
                onClick={() => setSelectedFriendId(f.id)}
                className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer hover:bg-slate-800/60 ${
                  selectedFriendId === f.id ? 'bg-slate-800/80 border border-slate-700' : 'border border-transparent'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm">
                  {f.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-white font-semibold text-sm truncate">{f.name}</div>
                  {activityByFriend[f.id]?.preview ? (
                    <div className="text-[11px] text-gray-500 truncate">{activityByFriend[f.id].preview}</div>
                  ) : (
                    <div className="text-[11px] text-gray-500">
                      {f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {sidebarRecentFriends.length === 0 && (
              <div className="text-xs text-gray-500">Chưa có bạn bè.</div>
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
                  Trực tuyến
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
                    ? `Trực tuyến - ${onlineCount}`
                    : `Tất cả - ${viewFriends.length}`}
                </h3>

                <div className="space-y-1.5">
                  {centerFriends.map((f, idx) => (
                    <div
                      key={`center-${String(f.id || 'unknown')}-${idx}`}
                      className="relative flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-800 bg-slate-900/35 hover:bg-slate-800/50 transition"
                    >
                      <div className="relative">
                        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-base">
                          {f.avatar}
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
                          {f.status === 'online' ? 'Trực tuyến' : 'Ngoại tuyến'}
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
                <h2 className="text-lg font-semibold text-white">{currentFriend.name}</h2>
              </div>
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
                    .map((m, idx) => {
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    // Trong chat bạn bè (DM) chỉ có 2 người:
                    // - Tin của mình: tên mình (so theo userId từ Auth)
                    // - Tin còn lại: tên bạn (currentFriend)
                    const displayName = isMine
                      ? currentUserName
                      : currentFriend?.name || 'Bạn bè';

                    const avatar = isMine
                      ? currentUserAvatar
                      : currentFriend?.avatar || '👤';

                    return (
                      <div
                        key={`msg-${String(m._id || m.id || 'unknown')}-${idx}`}
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
                          <div className="flex items-baseline gap-2 mb-1">
                            <span className="text-xs font-bold text-purple-300 truncate">
                              {displayName}
                            </span>
                            <span className="text-[10px] text-gray-500">
                              {formatTime(m.createdAt)}
                            </span>
                          </div>
                          <div className="text-white whitespace-pre-wrap break-words">
                            {m.content}
                          </div>
                        </GlassCard>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="shrink-0 border-t border-slate-800 bg-slate-900/60 p-3.5 flex gap-2">
                <input
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Nhập tin nhắn..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#040f2a] border border-slate-800 text-sm text-white placeholder-gray-500"
                />
                <GradientButton className="rounded-xl px-4 py-2 text-sm" onClick={handleSend}>Gửi</GradientButton>
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
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm">
                    {f.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-white truncate">{f.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
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
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-sm">
                    {f.avatar}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-white truncate">{f.name}</div>
                    <div className="text-[11px] text-gray-400">
                      {f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
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
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-sm">
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
                  </div>
                  <div className="mt-3">
                    {searchResult.relationship?.status === 'accepted' ? (
                      <span className="inline-flex px-3 py-1.5 rounded-lg bg-white/10 text-gray-300 text-xs">
                        Đã là bạn bè
                      </span>
                    ) : searchResult.relationship?.status === 'pending' ? (
                      <span className="inline-flex px-3 py-1.5 rounded-lg bg-white/10 text-gray-400 text-xs">
                        Đã gửi lời mời
                      </span>
                    ) : (
                      <GradientButton
                        variant="secondary"
                        className="px-3 py-1.5 text-sm rounded-lg"
                        onClick={() =>
                          handleSendFriendRequest(searchResult.userId?.toString?.() || searchResult.userId)
                        }
                      >
                        Thêm bạn
                      </GradientButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default FriendChatPage;


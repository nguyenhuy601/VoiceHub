import { useState, useEffect, useCallback } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Toast } from '../../components/Shared';
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
  const [toast, setToast] = useState(null);
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
      status: u?.status || 'offline',
    };
  });

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
  }, [on, off, currentUserId, selectedFriendId]);

  const currentFriend = viewFriends.find((f) => f.id === selectedFriendId) || null;

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
      <div className="flex-1 flex h-full min-w-0">
        {/* Khung 2: Danh sách bạn bè - thanh trượt riêng, chỉ hiện khi cần */}
        <div className="w-72 shrink-0 bg-slate-900/60 p-4 border-r border-slate-800 overflow-y-auto h-full scrollbar-overlay">
          <h2 className="text-xl font-extrabold text-white mb-4">Chat bạn bè</h2>
          <h3 className="text-sm font-bold text-gray-400 mb-2">Bạn bè</h3>
          <div className="space-y-2">
            {viewFriends.map((f) => (
              <div
                key={f.id}
                onClick={() => setSelectedFriendId(f.id)}
                className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-slate-800/60 ${
                  selectedFriendId === f.id ? 'bg-slate-800/80' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center text-base">
                  {f.avatar}
                </div>
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{f.name}</div>
                  <div className="text-xs text-gray-500">
                    {f.status === 'online' ? 'Đang hoạt động' : 'Ngoại tuyến'}
                  </div>
                </div>
              </div>
            ))}
            {viewFriends.length === 0 && (
              <div className="text-xs text-gray-500">Chưa có bạn bè. Hãy thêm bạn ở trang Liên Hệ.</div>
            )}
          </div>
        </div>

        {/* Khung 3: Khu vực chat - thanh trượt riêng cho danh sách tin nhắn */}
        <div className="flex-1 flex flex-col h-full min-w-0">
          {!currentFriend ? (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              Chọn một người bạn để bắt đầu chat
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
                    .map((m) => {
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
      </div>
      {toast && <Toast message={toast.message} type={toast.type} />}
    </div>
  );
}

export default FriendChatPage;


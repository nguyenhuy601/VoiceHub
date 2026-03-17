import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Toast } from '../../components/Shared';
import friendService from '../../services/friendService';

function FriendsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const sendFriendRequest = async (userId) => {
    if (!userId) return;
    try {
      await friendService.sendRequest(userId);
      showToast('Đã gửi lời mời', 'success');
      // Cập nhật trạng thái kết quả tìm kiếm để nút hiển thị "Đã gửi lời mời"
      setSearchResult((prev) =>
        prev && (prev.userId?.toString?.() === userId.toString() || prev.userId === userId)
          ? { ...prev, relationship: { status: 'pending' } }
          : prev
      );
    } catch (err) {
      const msg = err.response?.data?.message ?? err.message ?? 'Lỗi khi gửi yêu cầu';
      showToast(msg, 'fail');
    }
  };

  // Danh sách bạn bè thực từ API
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(false);

  const loadPendingRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      const resp = await friendService.getPendingRequests();
      const list = Array.isArray(resp?.data) ? resp.data : resp?.data?.data ?? [];
      setPendingRequests(list);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không tải được danh sách yêu cầu', 'fail');
      setPendingRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // Load danh sách bạn bè thật từ API
  const loadFriends = useCallback(async () => {
    setLoadingFriends(true);
    try {
      const resp = await friendService.getFriends();
      const payload = resp?.data || resp;
      const list = payload?.data?.friends || payload?.friends || payload?.data || [];
      setFriends(Array.isArray(list) ? list : []);
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không tải được danh sách bạn bè', 'fail');
      setFriends([]);
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'requests') loadPendingRequests();
  }, [activeTab, loadPendingRequests]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  const formatRequestDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffM < 1) return 'Vừa xong';
    if (diffM < 60) return `${diffM} phút trước`;
    if (diffH < 24) return `${diffH} giờ trước`;
    if (diffD < 7) return `${diffD} ngày trước`;
    return d.toLocaleDateString('vi-VN');
  };

  const handleAcceptRequest = async (requesterId) => {
    const id = requesterId?.toString?.() ?? requesterId;
    if (!id) return;
    try {
      await friendService.acceptRequest(id);
      showToast('Đã chấp nhận lời mời', 'success');
      loadPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không chấp nhận được', 'fail');
    }
  };

  const handleRejectRequest = async (requesterId) => {
    const id = requesterId?.toString?.() ?? requesterId;
    if (!id) return;
    try {
      await friendService.rejectRequest(id);
      showToast('Đã từ chối', 'success');
      loadPendingRequests();
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Không từ chối được', 'fail');
    }
  };

  const suggestions = [
    { name: 'Sophie Turner', avatar: '👩‍🎨', mutualFriends: 9, reason: 'Cùng tổ chức' },
    { name: 'Alex Brown', avatar: '👨‍🔬', mutualFriends: 5, reason: 'Bạn của bạn bè' }
  ];

  // search state
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResult, setSearchResult] = useState(null);


  const getStatusColor = (status) => {
    const colors = {
      online: 'bg-green-500',
      away: 'bg-yellow-500',
      busy: 'bg-red-500',
      offline: 'bg-gray-500'
    };
    return colors[status] || 'bg-gray-500';
  };

  const getStatusLabel = (status) => {
    const labels = {
      online: 'Đang hoạt động',
      away: 'Vắng mặt',
      busy: 'Bận',
      offline: 'Ngoại tuyến'
    };
    return labels[status] || status;
  };

  // Map dữ liệu thô từ API sang view model cho UI
  const viewFriends = friends.map((f) => {
    const u = f.friendId || f.user || f;
    return {
      id: u?._id || u?.id || f.id,
      name: u?.displayName || u?.username || 'Người dùng',
      avatar: u?.avatar || '👤',
      status: u?.status || 'offline',
      role: u?.role || '',
      mutualFriends: f.mutualFriends || 0,
      lastActive: '',
      activity: '',
    };
  });

  const onlineFriends = viewFriends.filter(f => f.status === 'online');
  const allFriends = viewFriends;

  const handleSearch = async () => {
    if (!searchPhone) {
      showToast('Xin hãy nhập số điện thoại', 'fail');
      return;
    }

    try {
      const resp = await friendService.searchByPhone(searchPhone);
      // Sau interceptor, resp có dạng { status, data }
      const user = resp?.data || resp;

      if (user) {
        setSearchResult(user);
      } else {
        showToast('Không tìm thấy người dùng', 'info');
        setSearchResult(null);
      }
    } catch (err) {
      // Nếu backend trả 404 (User profile not found) → coi như không có kết quả, không phải lỗi hệ thống
      if (err.status === 404 || err.response?.status === 404) {
        showToast('Không tìm thấy người dùng', 'info');
      } else {
        showToast(err.response?.data?.message || err.message || 'Lỗi khi tìm kiếm', 'fail');
      }
      setSearchResult(null);
    }
  };

  const clearSearch = () => {
    setSearchResult(null);
    setSearchPhone('');
  };

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage="Bạn Bè" />
      <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-gradient mb-2">Bạn Bè và Liên Hệ</h1>
          <p className="text-gray-400">Kết nối và giao tiếp với đồng nghiệp</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: `Tất cả (${allFriends.length})`, icon: '👥' },
            { id: 'online', label: `Online (${onlineFriends.length})`, icon: '🟢' },
            { id: 'requests', label: `Yêu cầu (${pendingRequests.length})`, icon: '📬' },
            { id: 'suggestions', label: 'Gợi ý', icon: '✨' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'glass hover:bg-white/10 text-gray-400'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* All Friends Tab */}
        {activeTab === 'all' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {loadingFriends ? (
              <div className="text-center py-12 text-gray-400">Đang tải danh sách bạn bè...</div>
            ) : (
              allFriends.map((friend, idx) => (
              <GlassCard key={friend.id || idx} hover className="animate-slideUp group" style={{animationDelay: `${idx * 0.05}s`}}>
                <div className="flex items-start gap-4">
                  <div className="relative">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-3xl">
                      {friend.avatar}
                    </div>
                    <div className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#0a0118] ${getStatusColor(friend.status)} ${
                      friend.status === 'online' ? 'animate-pulse' : ''
                    }`}></div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-white mb-1 group-hover:text-gradient transition-colors">{friend.name}</h3>
                    <p className="text-gray-400 text-sm mb-1">{friend.role}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
                      <span className={friend.status === 'online' ? 'text-green-400' : ''}>{getStatusLabel(friend.status)}</span>
                      {friend.status !== 'offline' && friend.lastActive && (
                        <>
                          <span>•</span>
                          <span>{friend.lastActive}</span>
                        </>
                      )}
                    </div>
                    {friend.activity && (
                      <div className="text-xs glass-strong px-2 py-1 rounded-lg inline-block">
                        💭 {friend.activity}
                      </div>
                    )}
                    <div className="text-xs text-gray-600 mt-2 flex items-center gap-1">
                      <span>👥</span>
                      <span>{friend.mutualFriends} bạn chung</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Link to="/chat" className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-1">
                      💬 Nhắn tin
                    </Link>
                    <button 
                      onClick={() => {
                        showToast(`Đang kết nối với ${friend.name}...`, "info");
                        setTimeout(() => {
                          navigate('/voice/call-' + friend.name.toLowerCase().replace(' ', '-'));
                        }, 500);
                      }}
                      className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold flex items-center gap-1"
                    >
                      📞 Gọi
                    </button>
                  </div>
                </div>
              </GlassCard>
            )))}
          </div>
        )}

        {/* Online Friends Tab */}
        {activeTab === 'online' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlineFriends.map((friend, idx) => (
              <GlassCard key={friend.id || idx} hover glow className="animate-slideUp" style={{animationDelay: `${idx * 0.05}s`}}>
                <div className="text-center">
                  <div className="relative inline-block mb-3">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-4xl">
                      {friend.avatar}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 border-4 border-[#0a0118] animate-pulse flex items-center justify-center">
                      <span className="text-xs">✓</span>
                    </div>
                  </div>
                  <h3 className="font-bold text-white mb-1">{friend.name}</h3>
                  <p className="text-gray-400 text-sm mb-3">{friend.role}</p>
                  {friend.activity && (
                    <div className="text-xs glass-strong px-3 py-1.5 rounded-lg mb-3">
                      {friend.activity}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm">💬</button>
                    <button className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm">📞</button>
                    <button className="flex-1 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm">⋯</button>
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>
        )}

        {/* Friend Requests Tab - dữ liệu từ API */}
        {activeTab === 'requests' && (
          <div className="grid gap-4 max-w-2xl">
            {loadingRequests ? (
              <div className="text-center py-12 text-gray-400">Đang tải...</div>
            ) : (
              <>
                {pendingRequests.map((request) => {
                  const from = request.userId || request.from;
                  const requesterId = from?._id ?? from?.id ?? request.userId;
                  const name = from?.displayName || from?.username || 'Người dùng';
                  const avatar = from?.avatar;
                  return (
                    <GlassCard key={request._id || requesterId} hover className="animate-slideUp">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-3xl overflow-hidden">
                          {avatar ? (
                            <img src={avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            '👤'
                          )}
                        </div>
                        <div className="flex-1">
                          <h3 className="font-bold text-white mb-1">{name}</h3>
                          <div className="text-xs text-gray-500">Gửi yêu cầu {formatRequestDate(request.createdAt)}</div>
                        </div>
                        <div className="flex gap-2">
                          <GradientButton variant="primary" onClick={() => handleAcceptRequest(requesterId)}>
                            Chấp nhận
                          </GradientButton>
                          <button
                            type="button"
                            className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
                            onClick={() => handleRejectRequest(requesterId)}
                          >
                            Từ chối
                          </button>
                        </div>
                      </div>
                    </GlassCard>
                  );
                })}
                {pendingRequests.length === 0 && !loadingRequests && (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-6xl mb-4">📭</div>
                    <p>Không có yêu cầu kết bạn mới</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Suggestions Tab */}
        {activeTab === 'suggestions' && (
          <>
            {/* search input */}
            <div className="mb-4 flex gap-2 items-center max-w-md">
              <input
                type="text"
                placeholder="Nhập số điện thoại để tìm bạn"
                value={searchPhone}
                onChange={(e) => setSearchPhone(e.target.value)}
                className="flex-1 px-4 py-2 rounded-xl glass text-white placeholder-gray-400"
              />
              <button
                onClick={handleSearch}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold"
              >Tìm</button>
              {searchResult && (
                <button onClick={clearSearch} className="text-gray-400 hover:text-white">✕</button>
              )}
            </div>

            {searchResult && (
              <div className="mb-6">
                <h2 className="text-xl font-bold text-white mb-2">Kết quả tìm kiếm</h2>
                <GlassCard hover>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-3xl overflow-hidden">
                      {searchResult.avatar ? (
                        <img src={searchResult.avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        '👤'
                      )}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white mb-1">{searchResult.displayName || searchResult.username || '—'}</h3>
                      <div className="text-xs text-gray-400 mb-1">{searchResult.phone || searchResult.email || '—'}</div>
                      {searchResult.relationship && (
                        <div className="text-xs text-gray-300">Trạng thái: {searchResult.relationship.status}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {searchResult.relationship?.status === 'accepted' ? (
                        <span className="flex-1 px-4 py-2 rounded-xl bg-white/10 text-gray-300 text-center text-sm">Đã là bạn bè</span>
                      ) : searchResult.relationship?.status === 'pending' ? (
                        <span className="flex-1 px-4 py-2 rounded-xl bg-white/10 text-gray-400 text-center text-sm">Đã gửi lời mời</span>
                      ) : (
                        <GradientButton
                          variant="secondary"
                          className="flex-1"
                          onClick={() => sendFriendRequest(searchResult.userId?.toString?.() || searchResult.userId)}
                        >
                          Thêm bạn
                        </GradientButton>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {suggestions.map((suggestion, idx) => (
                <GlassCard key={idx} hover className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
                  <div className="text-center">
                    <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-4xl mx-auto mb-3">
                      {suggestion.avatar}
                    </div>
                    <h3 className="font-bold text-white mb-1">{suggestion.name}</h3>
                    <div className="text-xs glass-strong px-2 py-1 rounded-full inline-block mb-2">
                      {suggestion.reason}
                    </div>
                    <div className="text-sm text-gray-400 mb-4">{suggestion.mutualFriends} bạn chung</div>
                    <div className="flex gap-2">
                      <GradientButton variant="secondary" className="flex-1">Thêm bạn</GradientButton>
                      <button className="glass px-3 py-2 rounded-xl hover:bg-white/10 transition-all">✕</button>
                    </div>
                  </div>
                </GlassCard>
              ))}
            </div>
          </>
        )}
      </div>
      
      {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}

export default FriendsPage;

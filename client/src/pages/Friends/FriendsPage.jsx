import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Toast } from '../../components/Shared';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import friendService from '../../services/friendService';

function FriendsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('all');
  const [toast, setToast] = useState(null);
  const [showAddFriend, setShowAddFriend] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const sendFriendRequest = async (userId) => {
    const id = userId && String(userId).trim();
    if (!id) {
      showToast('Không xác định được người dùng', 'fail');
      return;
    }
    try {
      await friendService.sendRequest(id);
      showToast('Đã gửi lời mời', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Lỗi khi gửi yêu cầu', 'fail');
    }
  };

  const friends = [
    { name: 'Sarah Chen', status: 'online', avatar: '👩‍💼', role: 'Designer', mutualFriends: 12, lastActive: 'Đang hoạt động', activity: 'Đang làm việc trong dự án UI' },
    { name: 'Mike Ross', status: 'online', avatar: '👨‍💻', role: 'Developer', mutualFriends: 8, lastActive: 'Đang hoạt động', activity: 'Code review' },
    { name: 'Emma Wilson', status: 'away', avatar: '👩‍🎨', role: 'Product Manager', mutualFriends: 15, lastActive: '10 phút trước', activity: 'Trong cuộc họp' },
    { name: 'David Kim', status: 'offline', avatar: '👨‍🔬', role: 'Data Scientist', mutualFriends: 6, lastActive: '2 giờ trước', activity: '' },
    { name: 'Lisa Park', status: 'online', avatar: '👩‍💼', role: 'Marketing Lead', mutualFriends: 20, lastActive: 'Đang hoạt động', activity: 'Đang soạn báo cáo' },
    { name: 'Tom Zhang', status: 'busy', avatar: '👨‍💻', role: 'DevOps', mutualFriends: 5, lastActive: 'Đang hoạt động', activity: 'Đừng làm phiền' }
  ];

  const friendRequests = [
    { name: 'Anna Lee', avatar: '👩‍🔬', mutualFriends: 3, requestDate: '2 ngày trước' },
    { name: 'John Smith', avatar: '👨‍💼', mutualFriends: 7, requestDate: '1 tuần trước' }
  ];

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

  const onlineFriends = friends.filter(f => f.status === 'online');
  const allFriends = friends;

  const handleSearch = async () => {
    if (!searchPhone) {
      showToast('Xin hãy nhập số điện thoại', 'fail');
      return;
    }

    try {
      const resp = await friendService.searchByPhone(searchPhone);
      const body = resp?.data !== undefined ? resp.data : resp;
      const user = body?.data !== undefined ? body.data : body;
      if (user && (user._id || user.userId || user.phone)) {
        setSearchResult(user);
      } else {
        showToast('Không tìm thấy người dùng', 'info');
        setSearchResult(null);
      }
    } catch (err) {
      showToast(err.response?.data?.message || 'Lỗi khi tìm kiếm', 'fail');
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
        <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">Bạn Bè và Liên Hệ</h1>
            <p className="text-gray-400">Kết nối và giao tiếp với đồng nghiệp</p>
          </div>
          <GradientButton
            type="button"
            variant="primary"
            className="shrink-0 px-6 py-3 text-base font-semibold"
            onClick={() => setShowAddFriend(true)}
          >
            ➕ Kết bạn
          </GradientButton>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: `Tất cả (${friends.length})`, icon: '👥' },
            { id: 'online', label: `Online (${onlineFriends.length})`, icon: '🟢' },
            { id: 'requests', label: `Yêu cầu (${friendRequests.length})`, icon: '📬' },
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
            {allFriends.map((friend, idx) => (
              <GlassCard key={idx} hover className="animate-slideUp group" style={{animationDelay: `${idx * 0.05}s`}}>
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
            ))}
          </div>
        )}

        {/* Online Friends Tab */}
        {activeTab === 'online' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {onlineFriends.map((friend, idx) => (
              <GlassCard key={idx} hover glow className="animate-slideUp" style={{animationDelay: `${idx * 0.05}s`}}>
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

        {/* Friend Requests Tab */}
        {activeTab === 'requests' && (
          <div className="grid gap-4 max-w-2xl">
            {friendRequests.map((request, idx) => (
              <GlassCard key={idx} hover className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-3xl">
                    {request.avatar}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-white mb-1">{request.name}</h3>
                    <div className="text-sm text-gray-400 mb-1">{request.mutualFriends} bạn chung</div>
                    <div className="text-xs text-gray-500">Gửi yêu cầu {request.requestDate}</div>
                  </div>
                  <div className="flex gap-2">
                    <GradientButton variant="primary">Chấp nhận</GradientButton>
                    <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold">Từ chối</button>
                  </div>
                </div>
              </GlassCard>
            ))}
            {friendRequests.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">📭</div>
                <p>Không có yêu cầu kết bạn mới</p>
              </div>
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
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-3xl">
                      {searchResult.avatar || '👤'}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-white mb-1">{searchResult.displayName || searchResult.username}</h3>
                      <div className="text-xs text-gray-400 mb-1">{searchResult.phone}</div>
                      {searchResult.relationship && (
                        <div className="text-xs text-gray-300">Trạng thái: {searchResult.relationship.status}</div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <GradientButton
                        variant="secondary"
                        className="flex-1"
                        type="button"
                        onClick={() =>
                          sendFriendRequest(searchResult.userId || searchResult._id)
                        }
                      >
                        Thêm bạn
                      </GradientButton>
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
      
      <AddFriendModal isOpen={showAddFriend} onClose={() => setShowAddFriend(false)} />

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

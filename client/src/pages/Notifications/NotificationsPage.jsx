import { useState } from 'react';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, Toast } from '../../components/Shared';

function NotificationsPage() {
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'task', icon: '✅', title: 'Task được gán', message: 'Sarah Chen đã gán bạn vào task "Thiết kế Landing Page"', time: '5 phút trước', read: false, priority: 'high', action: 'Xem Task' },
    { id: 2, type: 'mention', icon: '💬', title: '@mentions trong chat', message: 'Mike Ross đã nhắc đến bạn trong #general', time: '15 phút trước', read: false, priority: 'medium', action: 'Xem Chat' },
    { id: 3, type: 'deadline', icon: '⏰', title: 'Deadline sắp đến', message: 'Task "Review Pull Request" sẽ đến hạn trong 2 giờ', time: '30 phút trước', read: false, priority: 'high', action: 'Cập Nhật' },
    { id: 4, type: 'meeting', icon: '📅', title: 'Meeting sắp diễn ra', message: 'Họp nhóm hàng ngày bắt đầu lúc 10:00 AM', time: '1 giờ trước', read: true, priority: 'medium', action: 'Tham Gia' },
    { id: 5, type: 'file', icon: '📁', title: 'File mới được chia sẻ', message: 'Emma Wilson đã upload "BaoCaoQ4.pdf" vào Documents', time: '2 giờ trước', read: true, priority: 'low', action: 'Xem File' },
    { id: 6, type: 'friend', icon: '👥', title: 'Yêu cầu kết bạn', message: 'Anna Lee đã gửi lời mời kết bạn', time: '3 giờ trước', read: false, priority: 'low', action: 'Xem Profile' },
    { id: 7, type: 'task', icon: '✅', title: 'Task hoàn thành', message: 'David Kim đã hoàn thành task "Setup CI/CD Pipeline"', time: '5 giờ trước', read: true, priority: 'low', action: 'Xem Chi Tiết' },
    { id: 8, type: 'system', icon: '🔔', title: 'Cập nhật hệ thống', message: 'VoiceHub đã được cập nhật lên phiên bản 2.1.0', time: '1 ngày trước', read: true, priority: 'low', action: 'Xem Changelog' }
  ]);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMarkAsRead = (id) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    showToast("Đã đánh dấu đã đọc", "success");
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    showToast("Đã đánh dấu tất cả đã đọc", "success");
  };

  const handleDeleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
    showToast("Đã xóa thông báo", "success");
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : filter === 'unread' 
      ? notifications.filter(n => !n.read)
      : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="p-6">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">Trung Tâm Thông Báo</h1>
            <p className="text-gray-400">Theo dõi tất cả hoạt động và cập nhật quan trọng</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => showToast("Cài đặt thông báo", "info")}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              ⚙️ Cài Đặt Thông Báo
            </button>
            <button 
              onClick={handleMarkAllAsRead}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              ✓ Đánh Dấu Đã Đọc Tất Cả
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
                🔔
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.length}</div>
                <div className="text-xs text-gray-400">Tổng thông báo</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-2xl">
                ⭐
              </div>
              <div>
                <div className="text-2xl font-black text-white">{unreadCount}</div>
                <div className="text-xs text-gray-400">Chưa đọc</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl">
                ✅
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.filter(n => n.type === 'task').length}</div>
                <div className="text-xs text-gray-400">Công việc</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-2xl">
                💬
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.filter(n => n.type === 'mention').length}</div>
                <div className="text-xs text-gray-400">Mentions</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: 'Tất Cả', icon: '📋' },
            { id: 'unread', label: 'Chưa Đọc', icon: '⭐' },
            { id: 'task', label: 'Công Việc', icon: '✅' },
            { id: 'mention', label: 'Mentions', icon: '💬' },
            { id: 'deadline', label: 'Deadline', icon: '⏰' },
            { id: 'meeting', label: 'Meetings', icon: '📅' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'glass hover:bg-white/10 text-gray-400'
              }`}
            >
              <span className="mr-2">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.map((notif, idx) => (
            <GlassCard key={notif.id} hover className={`animate-slideUp ${!notif.read ? 'border-l-4 border-purple-500' : ''}`} style={{animationDelay: `${idx * 0.05}s`}}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                  notif.priority === 'high' ? 'from-red-500 to-orange-500' :
                  notif.priority === 'medium' ? 'from-blue-500 to-cyan-500' :
                  'from-green-500 to-emerald-500'
                } flex items-center justify-center text-2xl flex-shrink-0`}>
                  {notif.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white">{notif.title}</h3>
                    {!notif.read && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-600 text-xs font-bold">MỚI</span>
                    )}
                    {notif.priority === 'high' && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-xs font-bold">QUAN TRỌNG</span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{notif.message}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>🕐 {notif.time}</span>
                    <span>•</span>
                    <span className="capitalize">{notif.type}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => showToast(`Đang mở ${notif.action}...`, "info")}
                    className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold whitespace-nowrap"
                  >
                    {notif.action}
                  </button>
                  {!notif.read && (
                    <button 
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-xs text-gray-400 hover:text-white"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (confirm('Xóa thông báo này?')) {
                        handleDeleteNotification(notif.id);
                      }
                    }}
                    className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-xs text-red-400 hover:text-red-300"
                  >
                    🗑️ Xóa
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {filteredNotifications.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🎉</div>
            <p className="text-xl text-gray-400">Không có thông báo nào!</p>
          </div>
        )}
          </div>
        }
      />

    {/* Toast */}
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </>
  );
}

export default NotificationsPage;

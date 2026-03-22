import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, NotificationBellBadge, Toast } from '../../components/Shared';
import api from '../../services/api';
import { NOTIFICATIONS_REFRESH_EVENT } from '../../services/notificationSync';
import { useSocket } from '../../context/SocketContext';

function NotificationsPage() {
  const navigate = useNavigate();
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
  const { on, off } = useSocket();

  const getRelativeTime = (input) => {
    if (!input) return 'Vừa xong';
    const target = new Date(input).getTime();
    if (!Number.isFinite(target)) return 'Vừa xong';

    const diffMinutes = Math.max(1, Math.floor((Date.now() - target) / 60000));
    if (diffMinutes < 60) return `${diffMinutes} phút trước`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} giờ trước`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ngày trước`;
  };

  const iconByType = {
    task: '✅',
    mention: '💬',
    deadline: '⏰',
    meeting: '📅',
    file: '📁',
    friend: '👥',
    system: '🔔',
  };

  const actionByType = {
    task: 'Xem Task',
    mention: 'Xem Chat',
    deadline: 'Cập Nhật',
    meeting: 'Tham Gia',
    file: 'Xem File',
    friend: 'Thêm bạn',
    system: 'Xem Chi Tiết',
  };

  const toViewNotification = (item) => {
    const id = item?._id || item?.id;
    const rawType = String(item?.type || 'system');
    const type =
      rawType === 'friend_request' || rawType === 'friend_accepted' ? 'friend' : rawType;
    return {
      id,
      type,
      rawType,
      icon: iconByType[type] || '🔔',
      title: item?.title || 'Thông báo',
      message: item?.content || item?.message || '',
      time: getRelativeTime(item?.createdAt),
      read: Boolean(item?.isRead),
      priority: item?.data?.priority || 'low',
      action: actionByType[type] || 'Xem Chi Tiết',
      /** Chuông + badge đỏ giống sidebar (chủ yếu lời mời kết bạn) */
      useBellCard: rawType === 'friend_request' || type === 'friend',
    };
  };

  const loadNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications', { params: { limit: 100 } });
      const payload = response?.data || response;
      const data = payload?.data || payload;
      const list = Array.isArray(data?.notifications) ? data.notifications : [];
      setNotifications(list.map(toViewNotification));
    } catch (error) {
      const msg = error?.response?.data?.message || 'Không tải được thông báo từ máy chủ';
      setToast({ message: msg, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  /** Đồng bộ sau accept/reject kết bạn (cùng tab hoặc sau markFriendNotificationsResolved) */
  useEffect(() => {
    const onRefresh = () => loadNotifications();
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [loadNotifications]);

  useEffect(() => {
    if (!on || !off) return;

    const upsertNotification = (raw) => {
      const item = toViewNotification(raw);
      setNotifications((prev) => {
        if (!item?.id) return prev;
        const exists = prev.some((n) => n.id === item.id);
        if (exists) {
          return prev.map((n) => (n.id === item.id ? { ...n, ...item } : n));
        }
        return [item, ...prev];
      });
    };

    const handleNotificationNew = (payload) => {
      if (payload?.notification) {
        upsertNotification(payload.notification);
      }
    };

    const handleNotificationBulk = (payload) => {
      const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
      list.forEach((item) => upsertNotification(item));
    };

    const handleRead = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.map((n) => (String(n.id) === String(targetId) ? { ...n, read: true } : n)));
    };

    const handleReadAll = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const handleReadMany = (payload) => {
      const ids = new Set((payload?.notificationIds || []).map(String));
      if (ids.size === 0) return;
      setNotifications((prev) =>
        prev.map((n) => (ids.has(String(n.id)) ? { ...n, read: true } : n))
      );
    };

    const handleDeleted = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.filter((n) => String(n.id) !== String(targetId)));
    };

    const handleDeletedReadAll = () => {
      setNotifications((prev) => prev.filter((n) => !n.read));
    };

    on('notification:new', handleNotificationNew);
    on('notification:bulk_new', handleNotificationBulk);
    on('notification:read', handleRead);
    on('notification:read_all', handleReadAll);
    on('notification:deleted', handleDeleted);
    on('notification:deleted_read_all', handleDeletedReadAll);

    return () => {
      off('notification:new', handleNotificationNew);
      off('notification:bulk_new', handleNotificationBulk);
      off('notification:read', handleRead);
      off('notification:read_many', handleReadMany);
      off('notification:read_all', handleReadAll);
      off('notification:deleted', handleDeleted);
      off('notification:deleted_read_all', handleDeletedReadAll);
    };
  }, [on, off]);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      showToast('Đã đánh dấu đã đọc', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Không thể cập nhật trạng thái thông báo', 'error');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await api.patch('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      showToast('Đã đánh dấu tất cả đã đọc', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Không thể đánh dấu tất cả thông báo', 'error');
    }
  };

  const handleDeleteNotification = async (id) => {
    if (!id) return;
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      showToast('Đã xóa thông báo', 'success');
    } catch (error) {
      showToast(error?.response?.data?.message || 'Không thể xóa thông báo', 'error');
    }
  };

  const handleOpenNotification = (notif) => {
    if (!notif) return;

    // Mark as read immediately when user opens a notification target
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    switch (notif.type) {
      case 'mention':
        navigate('/chat/organization');
        showToast('Đang mở chat tổ chức', 'info');
        break;
      case 'friend':
        navigate('/chat/friends?tab=requests');
        showToast('Đang mở lời mời kết bạn', 'info');
        break;
      case 'meeting':
        navigate('/calendar');
        showToast('Đang mở lịch họp', 'info');
        break;
      case 'system':
        navigate('/settings');
        showToast('Đang mở cài đặt hệ thống', 'info');
        break;
      case 'task':
      case 'deadline':
        // Tasks page is intentionally locked, route to dashboard context instead.
        navigate('/dashboard');
        showToast('Trang công việc đang khóa, đã chuyển về dashboard', 'info');
        break;
      case 'file':
        // Documents page is intentionally locked, route to dashboard context instead.
        navigate('/dashboard');
        showToast('Trang tài liệu đang khóa, đã chuyển về dashboard', 'info');
        break;
      default:
        navigate('/dashboard');
        showToast('Đang mở chi tiết thông báo', 'info');
    }
  };

  const filteredNotifications =
    filter === 'all'
      ? notifications
      : filter === 'unread'
        ? notifications.filter((n) => !n.read)
        : filter === 'friend'
          ? notifications.filter((n) => n.type === 'friend')
          : notifications.filter((n) => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="p-5 lg:p-6 bg-[#020817] text-slate-100 min-h-full">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold text-white mb-1">Trung Tâm Thông Báo</h1>
            <p className="text-sm text-gray-400">Theo dõi tất cả hoạt động và cập nhật quan trọng</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => navigate('/settings')}
              className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-xl hover:bg-slate-800/70 transition-all font-semibold text-sm"
            >
              ⚙️ Cài Đặt Thông Báo
            </button>
            <button 
              onClick={handleMarkAllAsRead}
              className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-xl hover:bg-slate-800/70 transition-all font-semibold text-sm"
            >
              ✓ Đánh Dấu Đã Đọc Tất Cả
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <GlassCard hover className="border border-slate-800 bg-slate-900/60">
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
          <GlassCard hover className="border border-slate-800 bg-slate-900/60">
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
          <GlassCard hover className="border border-slate-800 bg-slate-900/60">
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
          <GlassCard hover className="border border-slate-800 bg-slate-900/60">
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
            { id: 'meeting', label: 'Meetings', icon: '📅' },
            { id: 'friend', label: 'Kết bạn', icon: '🔔' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70 text-gray-400'
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
            <GlassCard key={notif.id} hover className={`animate-slideUp border border-slate-800 bg-slate-900/60 ${!notif.read ? 'border-l-4 border-purple-500' : ''}`} style={{animationDelay: `${idx * 0.05}s`}}>
              <div className="flex items-start gap-4">
                {notif.useBellCard && notif.type === 'friend' ? (
                  <div className="flex-shrink-0 pt-0.5">
                    <NotificationBellBadge
                      count={notif.read ? 0 : 1}
                      sizeClass="h-12 w-12"
                      textSizeClass="text-2xl"
                    />
                  </div>
                ) : (
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                  notif.priority === 'high' ? 'from-red-500 to-orange-500' :
                  notif.priority === 'medium' ? 'from-blue-500 to-cyan-500' :
                  'from-green-500 to-emerald-500'
                } flex items-center justify-center text-2xl flex-shrink-0`}>
                  {notif.icon}
                </div>
                )}
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
                  {notif.useBellCard && notif.type === 'friend' ? (
                    <GradientButton
                      variant="friend"
                      className="!px-5 !py-2.5 !rounded-xl text-sm font-bold whitespace-nowrap shadow-lg"
                      onClick={() => handleOpenNotification(notif)}
                    >
                      Thêm bạn
                    </GradientButton>
                  ) : (
                  <button 
                    onClick={() => handleOpenNotification(notif)}
                    className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-sm font-semibold whitespace-nowrap"
                  >
                    {notif.action}
                  </button>
                  )}
                  {!notif.read && (
                    <button 
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-xs text-gray-400 hover:text-white"
                    >
                      Đánh dấu đã đọc
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (window.confirm('Xóa thông báo này?')) {
                        handleDeleteNotification(notif.id);
                      }
                    }}
                    className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all text-xs text-red-400 hover:text-red-300"
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

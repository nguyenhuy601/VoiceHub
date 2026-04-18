import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import friendService from '../../services/friendService';
import Avatar from '../ui/Avatar';
import NotificationBellBadge from '../Shared/NotificationBellBadge';
import { getUserDisplayName } from '../../utils/helpers';
import { removeToken } from '../../utils/tokenStorage';
import ProfileModal from '../Profile/ProfileModal';

const NavigationSidebar = () => {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateUser } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [togglingInvisible, setTogglingInvisible] = useState(false);
  /** Mặc định thu gọn; hover vào vạch trái để mở full */
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  /** Badge chuông: lời mời kết bạn chờ + thông báo chưa đọc */
  const [bellBadgeCount, setBellBadgeCount] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadBellBadge = async () => {
      try {
        const [frRes, ntRes] = await Promise.allSettled([
          friendService.getPendingRequests(),
          api.get('/notifications', { params: { limit: 1 } }),
        ]);
        let pending = 0;
        if (frRes.status === 'fulfilled') {
          const r = frRes.value;
          const list = Array.isArray(r?.data?.data)
            ? r.data.data
            : Array.isArray(r?.data)
              ? r.data
              : [];
          pending = list.length;
        }
        let unread = 0;
        if (ntRes.status === 'fulfilled') {
          const d = ntRes.value?.data?.data ?? ntRes.value?.data;
          unread = Number(d?.unreadCount) || 0;
        }
        if (!cancelled) setBellBadgeCount(pending + unread);
      } catch {
        if (!cancelled) setBellBadgeCount(0);
      }
    };
    loadBellBadge();
    const t = setInterval(loadBellBadge, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const currentTime = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const displayName = getUserDisplayName(user);
  const isInvisible = Boolean(user?.isInvisible);
  const isOnline = !isInvisible && String(user?.status || '').toLowerCase() === 'online';

  const handleToggleInvisible = async () => {
    if (togglingInvisible) return;
    const nextInvisible = !isInvisible;

    try {
      setTogglingInvisible(true);
      await api.patch('/users/me', { isInvisible: nextInvisible });
      updateUser({ isInvisible: nextInvisible });
      setProfileOpen(false);
    } catch (error) {
      console.error('Toggle invisible mode failed:', error);
      window.alert(error?.response?.data?.message || 'Không thể cập nhật chế độ vô hình');
    } finally {
      setTogglingInvisible(false);
    }
  };

  const getGreeting = () => {
    const hour = time.getHours();
    const userName = displayName || 'Bạn';
    if (hour >= 5 && hour < 11) return `Chào buổi Sáng, ${userName}!`;
    if (hour >= 11 && hour < 13) return `Chào buổi Trưa, ${userName}!`;
    if (hour >= 13 && hour < 17) return `Chào buổi Chiều, ${userName}!`;
    if (hour >= 17 && hour < 22) return `Chào buổi Tối, ${userName}!`;
    return `Khuya rồi, ${userName}!`;
  };

  const handleLogout = async () => {
    if (!window.confirm('Bạn có chắc muốn đăng xuất?')) return;

    // Gọi API logout nhưng giới hạn thời gian chờ để không bị cảm giác chậm
    try {
      await Promise.race([
        logout(), // cần token còn trong storage/header để backend xử lý đúng
        new Promise((resolve) => setTimeout(resolve, 1500)), // timeout nhẹ 1.5s
      ]);
    } catch (e) {
      console.error('Logout background error:', e);
    } finally {
      // Sau khi gọi (hoặc timeout) mới xoá token và điều hướng
      try {
        removeToken();
      } catch (e) {
        // ignore storage errors
      }
      navigate('/login');
    }
  };

  const navItems = [
    { icon: '📊', label: 'Bảng Điều Khiển', tooltip: 'Bảng điều khiển', path: '/dashboard', badge: '5' },
    { icon: '💬', label: 'Chat bạn bè', tooltip: 'Tin nhắn', path: '/chat/friends', badge: null },
    { icon: '🎤', label: 'Không Gian', tooltip: 'Không gian', path: '/voice', badge: null },
    { icon: '🏢', label: 'Tổ Chức', tooltip: 'Tổ chức', path: '/organizations', badge: null },
    { icon: '📋', label: 'Công Việc', tooltip: 'Task', path: '/tasks', badge: null },
    { icon: '🔔', label: 'Thông Báo', tooltip: 'Thông báo', path: '/notifications', badge: null, bellBadge: true },
    { icon: '📅', label: 'Lịch', tooltip: 'Lịch', path: '/calendar', badge: null },
  ];

  const isActivePath = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  /* Tooltip kiểu bong bóng: lưu thẳng toạ độ để không bị nhảy khi component re-render (vd: đồng hồ cập nhật mỗi 1s) */
  const [tooltip, setTooltip] = useState({ show: false, label: '', x: 0, y: 0 });

  const Tooltip = ({ label, children, className = '' }) => {
    const handleEnter = (e) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltip({
        show: true,
        label,
        x: rect.right + 12,
        y: rect.top + rect.height / 2,
      });
    };

    const handleLeave = () => {
      setTooltip((p) => ({ ...p, show: false }));
    };

    return (
      <div className={className} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {children}
      </div>
    );
  };

  const tooltipPortal =
    tooltip.show &&
    createPortal(
      <div
        className="fixed z-[9999] px-3 py-2 rounded-lg bg-gray-700 border border-white/10 shadow-xl text-white text-sm font-medium whitespace-nowrap pointer-events-none"
        style={{
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translateY(-50%)',
        }}
        role="tooltip"
      >
        <span className="relative z-10">{tooltip.label}</span>
        {/* Mũi nhọn trỏ vào icon (bong bóng) */}
        <span
          className="absolute right-full top-1/2 -translate-y-1/2 w-0 h-0 border-[6px] border-solid border-transparent border-r-gray-700"
          aria-hidden
        />
      </div>,
      document.body
    );

  return (
    <>
      {/* Mặc định thu ~8px; hover để mở full — overflow-x-visible để tooltip không bị cắt */}
      <div
        className={`relative h-screen shrink-0 overflow-hidden border-r border-white/10 transition-[width] duration-300 ease-out flex flex-col ${
          sidebarExpanded ? 'w-14 sm:w-16 md:w-[68px]' : 'w-2'
        }`}
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
        title={sidebarExpanded ? undefined : 'Đưa chuột vào để mở menu'}
      >
        <div className="flex h-full w-14 sm:w-16 md:w-[68px] min-w-[56px] shrink-0 glass-strong flex-col overflow-y-hidden overflow-x-visible">
        {/* Một khối cuộn duy nhất: từ icon WebHub (VoiceHub) tới nút Đăng xuất — thanh trượt chạy suốt chiều cao */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-visible scrollbar-overlay flex flex-col items-center py-3 gap-1">
          {/* Logo WebHub (không cần bong bóng tooltip) */}
          <Link
            to="/dashboard"
            className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl sm:text-2xl shrink-0"
          >
            🚀
          </Link>

          {/* Giờ */}
          <div className="text-[10px] text-white/50 font-mono py-1">{currentTime}</div>
          <div className="h-px w-8 bg-white/10 my-1" />

          {/* Danh sách nav - chỉ icon, tooltip bên phải khi hover */}
          <nav className="w-full flex flex-col items-center gap-1 py-1">
            {navItems.map((item, idx) => (
              <Tooltip key={idx} label={item.tooltip ?? item.label}>
                <Link
                  to={item.path}
                  className={`relative flex items-center justify-center shrink-0 transition-all duration-200 rounded-xl ${
                    item.bellBadge
                      ? isActivePath(item.path)
                        ? 'ring-2 ring-purple-500/80 ring-offset-2 ring-offset-transparent'
                        : ''
                      : `w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 ${
                          isActivePath(item.path)
                            ? 'bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg'
                            : 'hover:bg-white/10'
                        } text-xl sm:text-2xl`
                  }`}
                >
                  {item.bellBadge ? (
                    <NotificationBellBadge
                      count={bellBadgeCount}
                      className={
                        isActivePath(item.path)
                          ? 'ring-2 ring-white/30 shadow-lg'
                          : 'opacity-95 hover:opacity-100'
                      }
                    />
                  ) : (
                    <>
                      <span>{item.icon}</span>
                      {item.badge != null && item.badge !== '' && (
                        <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                          {item.badge}
                        </span>
                      )}
                    </>
                  )}
                </Link>
              </Tooltip>
            ))}
          </nav>

          {/* Theme - chỉ icon */}
          <Tooltip label={isDarkMode ? 'Chế độ Sáng' : 'Chế độ Tối'}>
            <button
              type="button"
              onClick={toggleTheme}
              className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl hover:bg-white/10 flex items-center justify-center text-lg sm:text-xl shrink-0"
            >
              {isDarkMode ? '🌙' : '☀️'}
            </button>
          </Tooltip>

          {/* Avatar xuống cuối (vị trí cũ của đăng xuất) */}
          <div className="mt-auto pt-2 relative w-full flex justify-center">
            <button
              type="button"
              onClick={() => setProfileOpen((p) => !p)}
              className="w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl hover:bg-white/10 flex items-center justify-center shrink-0"
              title={displayName || user?.email || 'Tài khoản'}
            >
              <Avatar user={user} size="sm" online={isOnline} className="shrink-0" />
            </button>
          </div>
        </div>
        </div>
      </div>

      <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
      {tooltipPortal}

      {/* Dropdown hồ sơ dạng thẻ lớn (render qua portal để không bị cắt) */}
      {profileOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onClick={() => setProfileOpen(false)} />
            <div className="fixed left-20 bottom-6 z-[999] w-[320px] rounded-2xl bg-gray-900/95 border border-white/10 shadow-2xl animate-slideUp overflow-hidden">
              {/* Header avatar + status */}
              <div className="relative bg-gradient-to-br from-purple-700/80 to-pink-600/60 px-4 pt-6 pb-4">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Avatar user={user} size="lg" online />
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-gray-900 ${
                        isOnline ? 'bg-emerald-400' : 'bg-gray-500'
                      }`}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-white truncate text-sm">{displayName}</div>
                    <div className="text-xs text-white/70 truncate">
                      {user?.username || user?.email || ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* Body actions */}
              <div className="bg-gray-900/95 px-4 py-3 space-y-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileModalOpen(true);
                    setProfileOpen(false);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-white transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>✏️</span>
                    <span>Sửa hồ sơ</span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleToggleInvisible}
                  disabled={togglingInvisible}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gray-200 transition-colors disabled:opacity-60"
                >
                  <span className="flex items-center gap-2">
                    <span>👁️‍🗨️</span>
                    <span>Chế độ vô hình</span>
                  </span>
                  <span className="text-xs text-yellow-400">
                    {togglingInvisible ? 'Đang lưu...' : isInvisible ? 'Đang bật' : 'Đang tắt'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-red-600/20 text-sm text-red-400 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>🚪</span>
                    <span>Đăng xuất</span>
                  </span>
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </>
  );
};

export default NavigationSidebar;

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import Avatar from '../ui/Avatar';
import { getUserDisplayName } from '../../utils/helpers';
import ProfileModal from '../Profile/ProfileModal';

const NavigationSidebar = () => {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTime = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const displayName = getUserDisplayName(user);

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
        localStorage.removeItem('token');
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
    { icon: '🔔', label: 'Thông Báo', tooltip: 'Thông báo', path: '/notifications', badge: '8' },
    { icon: '📅', label: 'Lịch', tooltip: 'Lịch', path: '/calendar', badge: null },
    { icon: '⚙️', label: 'Cài Đặt', tooltip: 'Cài đặt', path: '/settings', badge: null },
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
      {/* overflow-x-visible để tooltip bong bóng bên phải icon không bị cắt */}
      <div className="w-14 sm:w-16 md:w-[68px] shrink-0 glass-strong border-r border-white/10 h-screen overflow-y-hidden overflow-x-visible flex flex-col flex-shrink-0">
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
                  className={`relative w-10 h-10 sm:w-11 sm:h-11 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-xl sm:text-2xl shrink-0 transition-all duration-200 ${
                    isActivePath(item.path)
                      ? 'bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg'
                      : 'hover:bg-white/10'
                  }`}
                >
                  {item.icon}
                  {item.badge && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full flex items-center justify-center text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
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
              <Avatar user={user} size="sm" online className="shrink-0" />
            </button>
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
                    <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-400 border-2 border-gray-900" />
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
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 text-sm text-gray-200 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>👁️‍🗨️</span>
                    <span>Chế độ vô hình</span>
                  </span>
                  <span className="text-xs text-yellow-400">Beta</span>
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

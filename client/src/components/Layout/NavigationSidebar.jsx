import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const NavigationSidebar = () => {
  const [time, setTime] = useState(new Date());
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentTime = time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const getGreeting = () => {
    const hour = time.getHours();
    const userName = user?.name || "Bạn";
    
    if (hour >= 5 && hour < 11) return `Chào buổi Sáng, ${userName}!`;
    if (hour >= 11 && hour < 13) return `Chào buổi Trưa, ${userName}!`;
    if (hour >= 13 && hour < 17) return `Chào buổi Chiều, ${userName}!`;
    if (hour >= 17 && hour < 22) return `Chào buổi Tối, ${userName}!`;
    return `Khuya rồi, ${userName}!`;
  };

  const handleLogout = async () => {
    if (window.confirm('Bạn có chắc muốn đăng xuất?')) {
      await logout();
      navigate('/login');
    }
  };

  const navItems = [
    { icon: "🏠", label: "Trang Chủ", path: "/", badge: null },
    { icon: "📊", label: "Bảng Điều Khiển", path: "/dashboard", badge: "5" },
    { icon: "💬", label: "Tin Nhắn", path: "/chat", badge: "12" },
    { icon: "🎤", label: "Không Gian", path: "/voice/room1", badge: null },
    { icon: "✅", label: "Công Việc", path: "/tasks", badge: "3" },
    { icon: "🏢", label: "Tổ Chức", path: "/organizations", badge: null },
    { icon: "👥", label: "Liên Hệ", path: "/friends", badge: "2" },
    { icon: "📁", label: "Tài Liệu", path: "/documents", badge: null },
    { icon: "🔔", label: "Thông Báo", path: "/notifications", badge: "8" },
    { icon: "📅", label: "Lịch", path: "/calendar", badge: null },
    { icon: "📈", label: "Phân Tích", path: "/analytics", badge: null },
    { icon: "⚙️", label: "Cài Đặt", path: "/settings", badge: null },
  ];

  const isActivePath = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-20 hover:w-64 glass-strong flex flex-col items-center hover:items-start py-6 space-y-3 border-r border-white/10 overflow-visible transition-all duration-300 group/sidebar px-3">
      {/* Logo */}
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl animate-glow mb-2 relative cursor-pointer group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 transition-all duration-300">
        🚀
        <span className="hidden group-hover/sidebar:inline-block text-base font-bold text-white whitespace-nowrap">VoiceHub</span>
      </div>
      
      {/* Time Display */}
      <div className="text-center mb-2">
        <div className="text-xs text-gray-400 font-bold">
          {time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}
        </div>
      </div>

      <div className="h-px w-10 bg-white/10 my-2"></div>

      {/* Navigation Items with Expandable Labels */}
      <div className="flex flex-col space-y-3 flex-1 w-full items-center group-hover/sidebar:items-start overflow-y-auto overflow-x-visible scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {navItems.map((item, idx) => (
          <Link 
            key={idx}
            to={item.path}
            className={`relative w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-all duration-300 group/item ${
              isActivePath(item.path)
                ? 'bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg scale-110' 
                : 'hover:bg-white/10 hover:scale-110'
            } group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3`}
          >
            {item.icon}
            <span className="hidden group-hover/sidebar:inline-block text-sm font-semibold text-white whitespace-nowrap">{item.label}</span>
            {item.badge && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-xs font-bold text-white group-hover/sidebar:relative group-hover/sidebar:top-0 group-hover/sidebar:right-0 group-hover/sidebar:ml-auto">
                {item.badge}
              </div>
            )}
          </Link>
        ))}
      </div>

      {/* Greeting Area - Always visible */}
      <div className="w-full flex justify-center mb-2">
        <div className="glass-strong rounded-xl p-2 border border-purple-500/30 transition-all group-hover/sidebar:w-full group-hover/sidebar:p-3">
          <div className="text-center">
            <div className="text-2xl group-hover/sidebar:mb-1">👋</div>
            <div className={`text-xs font-semibold leading-tight hidden group-hover/sidebar:block ${isDarkMode ? 'text-white/90' : 'text-gray-900'}`}>{getGreeting()}</div>
          </div>
        </div>
      </div>
      
      <div className="h-px w-10 bg-white/10 my-2"></div>
      
      {/* Theme Toggle with Expandable Label */}
      <button 
        onClick={toggleTheme}
        className="w-12 h-12 rounded-xl hover:bg-white/10 flex items-center justify-center text-xl transition-all duration-300 relative group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3"
      >
        {isDarkMode ? '🌙' : '☀️'}
        <span className="hidden group-hover/sidebar:inline-block text-sm font-semibold text-white whitespace-nowrap">
          {isDarkMode ? "Chế độ Sáng" : "Chế độ Tối"}
        </span>
      </button>

      {/* Logout Button */}
      <button 
        onClick={handleLogout}
        className="w-12 h-12 rounded-xl hover:bg-red-500/20 flex items-center justify-center text-xl transition-all duration-300 relative group-hover/sidebar:w-full group-hover/sidebar:justify-start group-hover/sidebar:gap-3 group-hover/sidebar:px-3 text-red-400 hover:text-red-300"
        title="Đăng xuất"
      >
        🚪
        <span className="hidden group-hover/sidebar:inline-block text-sm font-semibold whitespace-nowrap">
          Đăng Xuất
        </span>
      </button>
      
      {/* Time Display */}
      <div className="text-xs text-white/50 font-mono hidden group-hover/sidebar:block">
        {currentTime}
      </div>
    </div>
  );
};

export default NavigationSidebar;

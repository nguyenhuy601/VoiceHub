import {
  Building2,
  CheckSquare,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Phone,
  Users,
  X,
  ChevronDown,
  LogOut,
  User as UserIcon,
} from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ProfileModal from '../Profile/ProfileModal';

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Bảng điều khiển' },
  { to: '/organizations', icon: Building2, label: 'Tổ chức' },
  // Chat được tách thành 2 trang riêng: bạn bè & doanh nghiệp
  { to: '/chat/friends', icon: MessageSquare, label: 'Chat bạn bè' },
  { to: '/voice', icon: Phone, label: 'Cuộc gọi' },
  { to: '/tasks', icon: CheckSquare, label: 'Công việc' },
  { to: '/documents', icon: FileText, label: 'Tài liệu' },
  { to: '/friends', icon: Users, label: 'Bạn bè' },
];

const Sidebar = ({ onClose }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [openProfile, setOpenProfile] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  const displayName = user?.fullName || user?.name || user?.displayName || user?.email?.split('@')[0] || 'Người dùng';
  const initials = (displayName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleGoProfile = () => {
    setIsProfileModalOpen(true);
    setOpenProfile(false);
  };

  return (
    <>
    <aside className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col h-screen relative">
      {/* User header (thay cho logo VoiceHub) */}
      <div className="p-4 border-b border-dark-700 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOpenProfile((prev) => !prev)}
          className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-dark-700 transition-colors w-full text-left"
        >
          <div className="relative">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover border border-primary-500"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-sm font-bold text-white">
                {initials}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-dark-800" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{displayName}</p>
            <p className="text-xs text-gray-400 truncate">
              {user?.email || 'Đang hoạt động'}
            </p>
          </div>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${openProfile ? 'rotate-180' : ''}`} />
        </button>

        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden ml-2 p-1 hover:bg-dark-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Profile dropdown */}
      {openProfile && (
        <div className="absolute top-20 left-3 right-3 z-20 animate-slideUp">
          <div className="glass-strong rounded-2xl p-4 shadow-xl border border-white/5 bg-gradient-to-b from-dark-700/95 to-dark-800/95">
            <div className="flex items-center gap-3 mb-4">
              {user?.avatar ? (
                <img
                  src={user.avatar}
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover border border-primary-500"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-base font-bold text-white">
                  {initials}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{displayName}</p>
                <p className="text-xs text-gray-400 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <button
                type="button"
                onClick={handleGoProfile}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-dark-700 hover:bg-dark-600 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <UserIcon className="w-4 h-4 text-gray-300" />
                  <span>Sửa hồ sơ</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin mt-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-400 hover:bg-dark-700 hover:text-white'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-dark-700">
        <p className="text-xs text-gray-500 text-center">
          VoiceHub Dashboard
        </p>
      </div>
    </aside>

    <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)} />
    </>
  );
};

export default Sidebar;

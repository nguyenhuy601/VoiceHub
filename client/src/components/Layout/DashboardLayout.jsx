import { Bell, LogOut, Menu, Settings, User } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Avatar from '../ui/Avatar';
import Sidebar from './Sidebar';

const DashboardLayout = ({ children }) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="h-screen flex bg-dark-900">
      {/* Sidebar - Desktop */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Sidebar - Mobile */}
      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <Sidebar onClose={() => setSidebarOpen(false)} />
          </div>
        </>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="bg-dark-800 border-b border-dark-700 px-4 py-3 flex items-center justify-between">
          {/* Left: Logo + User (bên dưới logo) */}
          <div className="flex items-center gap-3 min-w-[220px]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-dark-700 rounded-lg transition-colors"
              aria-label="Mở menu"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex flex-col leading-tight">
              <Link to="/dashboard" className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-lg animate-glow">
                  🚀
                </div>
                <span className="font-black text-lg text-gradient whitespace-nowrap">VoiceHub</span>
              </Link>

              <div className="mt-1 flex items-center gap-2 text-sm text-gray-300">
                <Avatar user={user} size="sm" online />
                <span className="font-semibold truncate max-w-[150px]">
                  {user?.fullName || user?.name || user?.displayName || user?.email?.split('@')[0] || 'Người dùng'}
                </span>
              </div>
            </div>
          </div>

          {/* Center: Search */}
          <div className="flex-1 max-w-2xl mx-4">
            <input
              type="search"
              placeholder="Tìm kiếm..."
              className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 transition-all"
            />
          </div>

          {/* Right: User Menu */}
          <div className="flex items-center gap-3">
            <button className="p-2 hover:bg-dark-700 rounded-lg transition-colors relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>

            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-2 hover:bg-dark-700 rounded-lg transition-colors"
              >
                <Avatar user={user} size="sm" />
                <span className="hidden md:block font-medium">{user?.name}</span>
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-56 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-20">
                    <div className="p-3 border-b border-dark-700">
                      <p className="font-medium">{user?.name}</p>
                      <p className="text-sm text-gray-400">{user?.email}</p>
                    </div>
                    <div className="p-2">
                      <button
                        onClick={() => {
                          navigate('/profile');
                          setDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-700 rounded-lg transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Hồ sơ cá nhân
                      </button>
                      <button
                        onClick={() => {
                          navigate('/settings');
                          setDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-dark-700 rounded-lg transition-colors"
                      >
                        <Settings className="w-4 h-4" />
                        Cài đặt
                      </button>
                      <hr className="my-2 border-dark-700" />
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-red-600/20 text-red-500 rounded-lg transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Đăng xuất
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto scrollbar-thin">
          {children}
        </main>
      </div>
    </div>
  );
};

export default DashboardLayout;

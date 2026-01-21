import {
    Building2,
    CheckSquare,
    FileText,
    Home,
    MessageSquare,
    Phone,
    Users,
    X,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', icon: Home, label: 'Trang chủ' },
  { to: '/organizations', icon: Building2, label: 'Tổ chức' },
  { to: '/chat', icon: MessageSquare, label: 'Tin nhắn' },
  { to: '/voice', icon: Phone, label: 'Cuộc gọi' },
  { to: '/tasks', icon: CheckSquare, label: 'Công việc' },
  { to: '/documents', icon: FileText, label: 'Tài liệu' },
  { to: '/friends', icon: Users, label: 'Bạn bè' },
];

const Sidebar = ({ onClose }) => {
  return (
    <aside className="w-64 bg-dark-800 border-r border-dark-700 flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-dark-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="font-bold text-lg">Voice Chat</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-dark-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
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
          Voice Chat Enterprise v1.0
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;

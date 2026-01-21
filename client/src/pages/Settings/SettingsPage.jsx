import { useState } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton, Toast } from '../../components/Shared';

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [toast, setToast] = useState(null);
  const [userRole, setUserRole] = useState('admin'); // 'admin', 'manager', 'user'

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Tabs dành cho Admin
  const adminTabs = [
    { id: 'general', label: 'Tổng Quan', icon: '⚙️' },
    { id: 'roles', label: 'Vai Trò & Quyền', icon: '🔐' },
    { id: 'security', label: 'Bảo Mật', icon: '🛡️' },
    { id: 'integrations', label: 'Tích Hợp', icon: '🔗' },
    { id: 'billing', label: 'Thanh Toán', icon: '💳' },
    { id: 'audit', label: 'Nhật Ký', icon: '📜' }
  ];

  // Tabs dành cho User (Nhân viên/Quản lý)
  const userTabs = [
    { id: 'profile', label: 'Hồ Sơ Cá Nhân', icon: '👤' },
    { id: 'notifications', label: 'Thông Báo', icon: '🔔' },
    { id: 'privacy', label: 'Quyền Riêng Tư', icon: '🔒' },
    { id: 'appearance', label: 'Giao Diện', icon: '🎨' }
  ];

  const currentTabs = userRole === 'admin' ? adminTabs : userTabs;

  return (
    <>
      <div className="min-h-screen flex">
        <NavigationSidebar currentPage="Cài Đặt" />
        <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
        {/* Role Switcher for demo */}
        <div className="mb-6 glass-strong p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Chế độ cài đặt</h2>
              <p className="text-sm text-gray-400">Demo: Chọn vai trò để xem cài đặt tương ứng</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setUserRole('admin')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'admin'
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                👑 Quản Trị Viên
              </button>
              <button 
                onClick={() => setUserRole('manager')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'manager'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                👔 Trưởng Phòng
              </button>
              <button 
                onClick={() => setUserRole('user')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'user'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                👷 Nhân Viên
              </button>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-black text-gradient mb-2">
          {userRole === 'admin' ? 'Cài Đặt Tổ Chức' : 'Cài Đặt Cá Nhân'}
        </h1>
        <p className="text-gray-400 mb-8">
          {userRole === 'admin' 
            ? 'Quản lý cấu hình và chính sách toàn tổ chức' 
            : 'Tùy chỉnh trải nghiệm cá nhân của bạn'}
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-gradient">
          {currentTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
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

        {/* Admin Tabs Content */}
        {userRole === 'admin' && (
        <>
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Thông Tin Tổ Chức</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Tên Tổ Chức</label>
                  <input type="text" defaultValue="VoiceHub Tech" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Mô Tả</label>
                  <textarea className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" rows="3" defaultValue="Công ty công nghệ hàng đầu chuyên về giải pháp truyền thông"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Website</label>
                    <input type="url" defaultValue="https://voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Email Liên Hệ</label>
                    <input type="email" defaultValue="contact@voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("Đã lưu thông tin tổ chức!", "success")}
                >
                  💾 Lưu Thay Đổi
                </GradientButton>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Quota & Giới Hạn</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Số lượng thành viên</span>
                    <span className="text-sm font-bold text-white">45 / 100</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600" style={{width: '45%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Dung lượng lưu trữ</span>
                    <span className="text-sm font-bold text-white">45.8 GB / 100 GB</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{width: '45.8%'}}></div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="max-w-4xl">
            <GlassCard className="mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Quản Lý Vai Trò (RBAC)</h3>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("Mở modal tạo vai trò...", "info")}
                >
                  ➕ Tạo Vai Trò Mới
                </GradientButton>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'Quản Trị Viên', members: 3, permissions: 'Toàn quyền', color: 'from-red-500 to-orange-500' },
                  { name: 'Trưởng Phòng', members: 4, permissions: 'Quản lý phòng ban', color: 'from-purple-600 to-pink-600' },
                  { name: 'Trưởng Nhóm', members: 8, permissions: 'Quản lý nhóm', color: 'from-blue-500 to-cyan-500' },
                  { name: 'Nhân Viên', members: 30, permissions: 'Cơ bản', color: 'from-green-500 to-emerald-500' }
                ].map((role, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-2xl`}>
                        {['👑', '👔', '👨‍💼', '👷'][idx]}
                      </div>
                      <div>
                        <div className="font-bold text-white">{role.name}</div>
                        <div className="text-sm text-gray-400">{role.members} thành viên • {role.permissions}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm">Sửa</button>
                      <button className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm text-red-400">Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Chính Sách Bảo Mật</h3>
              <div className="space-y-4">
                {[
                  { label: 'Bắt buộc 2FA cho tất cả thành viên', checked: true },
                  { label: 'Yêu cầu mật khẩu mạnh (8+ ký tự, chữ hoa, số, ký tự đặc biệt)', checked: true },
                  { label: 'Tự động đăng xuất sau 30 phút không hoạt động', checked: false },
                  { label: 'Chặn đăng nhập từ IP lạ', checked: false },
                  { label: 'Gửi email thông báo khi đăng nhập thiết bị mới', checked: true }
                ].map((setting, idx) => (
                  <label key={idx} className="flex items-center justify-between p-4 glass-strong rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                    <span className="text-white">{setting.label}</span>
                    <input type="checkbox" defaultChecked={setting.checked} className="w-5 h-5 rounded" />
                  </label>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">API Keys</h3>
              <p className="text-gray-400 mb-4">Quản lý API keys cho tích hợp bên ngoài</p>
              <div className="space-y-3 mb-4">
                {[
                  { name: 'Production API Key', created: '15/12/2025', lastUsed: '2 giờ trước' },
                  { name: 'Development API Key', created: '10/01/2026', lastUsed: '1 ngày trước' }
                ].map((key, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">{key.name}</div>
                      <div className="text-sm text-gray-400">Tạo: {key.created} • Sử dụng: {key.lastUsed}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm">Copy</button>
                      <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm text-red-400">Xóa</button>
                    </div>
                  </div>
                ))}
              </div>
              <GradientButton variant="secondary">🔑 Tạo API Key Mới</GradientButton>
            </GlassCard>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="max-w-4xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-6">Tích Hợp Bên Ngoài</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Slack', icon: '💬', status: 'Đã kết nối', color: 'from-purple-600 to-pink-600' },
                  { name: 'Google Drive', icon: '📁', status: 'Chưa kết nối', color: 'from-blue-500 to-cyan-500' },
                  { name: 'GitHub', icon: '🐙', status: 'Đã kết nối', color: 'from-green-500 to-emerald-500' },
                  { name: 'Jira', icon: '📊', status: 'Chưa kết nối', color: 'from-orange-500 to-yellow-500' }
                ].map((integration, idx) => (
                  <GlassCard key={idx} hover>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-3xl mb-3`}>
                      {integration.icon}
                    </div>
                    <h4 className="font-bold text-white mb-1">{integration.name}</h4>
                    <p className="text-sm text-gray-400 mb-3">{integration.status}</p>
                    <button className={`w-full py-2 rounded-lg transition-all text-sm font-semibold ${
                      integration.status === 'Đã kết nối' 
                        ? 'glass hover:bg-white/10' 
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }`}>
                      {integration.status === 'Đã kết nối' ? 'Ngắt Kết Nối' : 'Kết Nối'}
                    </button>
                  </GlassCard>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="max-w-4xl">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Nhật Ký Hoạt Động (Audit Log)</h3>
                <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold">
                  📥 Xuất Log
                </button>
              </div>
              <div className="space-y-2">
                {[
                  { user: 'Admin', action: 'Tạo vai trò "Trưởng Nhóm Mới"', time: '5 phút trước', type: 'create' },
                  { user: 'Sarah Chen', action: 'Cập nhật thông tin tổ chức', time: '1 giờ trước', type: 'update' },
                  { user: 'Mike Ross', action: 'Mời thành viên mới: anna@voicehub.com', time: '3 giờ trước', type: 'invite' },
                  { user: 'Admin', action: 'Bật 2FA bắt buộc', time: '1 ngày trước', type: 'security' },
                  { user: 'Emma Wilson', action: 'Xóa API key "Test Key"', time: '2 ngày trước', type: 'delete' }
                ].map((log, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                      log.type === 'create' ? 'bg-green-500/20' :
                      log.type === 'update' ? 'bg-blue-500/20' :
                      log.type === 'delete' ? 'bg-red-500/20' :
                      log.type === 'security' ? 'bg-orange-500/20' :
                      'bg-purple-500/20'
                    }`}>
                      {log.type === 'create' ? '➕' :
                       log.type === 'update' ? '✏️' :
                       log.type === 'delete' ? '🗑️' :
                       log.type === 'security' ? '🔒' : '📧'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">
                        <span className="text-purple-400">{log.user}</span> {log.action}
                      </div>
                      <div className="text-xs text-gray-500">🕐 {log.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}

        {/* User/Manager Tabs Content */}
        {(userRole === 'user' || userRole === 'manager') && (
        <>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Thông Tin Cá Nhân</h3>
              <div className="flex items-center gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-5xl">
                  👤
                </div>
                <GradientButton variant="secondary">📷 Thay Đổi Avatar</GradientButton>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Họ và Tên</label>
                  <input type="text" defaultValue="Nguyễn Văn Danh" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Email</label>
                    <input type="email" defaultValue="danh@voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Số điện thoại</label>
                    <input type="tel" defaultValue="+84 123 456 789" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Chức vụ</label>
                  <input type="text" defaultValue={userRole === 'manager' ? 'Trưởng Phòng' : 'Nhân Viên'} className="w-full px-4 py-3 rounded-xl glass border border-white/20 bg-white/5 text-gray-400" disabled />
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("Đã cập nhật thông tin!", "success")}
                >
                  💾 Lưu Thay Đổi
                </GradientButton>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-3xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Cài Đặt Thông Báo</h3>
              <div className="space-y-4">
                {[
                  { label: 'Thông báo tin nhắn mới', checked: true },
                  { label: 'Thông báo khi được mention', checked: true },
                  { label: 'Thông báo công việc mới', checked: true },
                  { label: 'Thông báo deadline sắp đến', checked: true },
                  { label: 'Thông báo qua email', checked: false },
                  { label: 'Thông báo push trên mobile', checked: true }
                ].map((setting, idx) => (
                  <label key={idx} className="flex items-center justify-between p-4 glass-strong rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                    <span className="text-white">{setting.label}</span>
                    <input type="checkbox" defaultChecked={setting.checked} className="w-5 h-5 rounded" />
                  </label>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Quyền Riêng Tư</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Hiển thị trạng thái online</label>
                  <select className="w-full px-4 py-3 rounded-xl glass border border-white/20 text-white">
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                    <option>Không ai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Ai có thể nhắn tin cho tôi</label>
                  <select className="w-full px-4 py-3 rounded-xl glass border border-white/20 text-white">
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                  </select>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="max-w-3xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Giao Diện</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Chủ đề</label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { name: 'Tối', icon: '🌙', active: true },
                      { name: 'Sáng', icon: '☀️', active: false }
                    ].map((theme, idx) => (
                      <div key={idx} className={`p-6 rounded-xl cursor-pointer transition-all ${
                        theme.active ? 'bg-gradient-to-br from-purple-600 to-pink-600' : 'glass hover:bg-white/10'
                      }`}>
                        <div className="text-4xl mb-2">{theme.icon}</div>
                        <div className="font-bold text-white">{theme.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}
      </div>
    </div>

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



export default SettingsPage;
import { useState } from 'react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { GlassCard, GradientButton } from '../../components/Shared';

function ProfilePage() {
  const [activeTab, setActiveTab] = useState('profile');

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage="Hồ Sơ" />
      <div className="flex-1 p-6 overflow-y-auto overflow-x-visible scrollbar-gradient">
        <h1 className="text-4xl font-black text-gradient mb-8">Hồ Sơ & Cài Đặt</h1>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'profile', label: 'Hồ Sơ', icon: '👤' },
            { id: 'account', label: 'Tài Khoản', icon: '⚙️' },
            { id: 'privacy', label: 'Bảo Mật', icon: '🔒' },
            { id: 'notifications', label: 'Thông Báo', icon: '🔔' }
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

        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl">
            <GlassCard className="mb-6">
              <div className="flex items-start gap-6 mb-6">
                <div className="relative group">
                  <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-6xl">
                    😊
                  </div>
                  <button className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-semibold">
                    Thay đổi
                  </button>
                </div>
                <div className="flex-1">
                  <h2 className="text-3xl font-bold text-white mb-2">Nguyễn Văn A</h2>
                  <p className="text-gray-400 mb-3">demo@voicehub.com</p>
                  <div className="flex gap-2">
                    <span className="px-3 py-1 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-xs font-bold">Pro Member</span>
                    <span className="px-3 py-1 rounded-full glass text-xs font-bold">Đã xác minh</span>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Tên hiển thị</label>
                  <input type="text" defaultValue="Nguyễn Văn A" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Tiểu sử</label>
                  <textarea className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" rows="4" placeholder="Giới thiệu về bản thân...">Full-stack developer tại VoiceHub, đam mê công nghệ và thiết kế sản phẩm.</textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Chức vụ</label>
                    <input type="text" defaultValue="Senior Developer" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Phòng ban</label>
                    <select className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white">
                      <option>Kỹ Thuật</option>
                      <option>Thiết Kế</option>
                      <option>Marketing</option>
                      <option>Sản Phẩm</option>
                    </select>
                  </div>
                </div>
                <GradientButton variant="primary">💾 Lưu Thay Đổi</GradientButton>
              </div>
            </GlassCard>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <GlassCard hover>
                <div className="text-center">
                  <div className="text-3xl font-black text-gradient mb-1">245</div>
                  <div className="text-sm text-gray-400">Bạn bè</div>
                </div>
              </GlassCard>
              <GlassCard hover>
                <div className="text-center">
                  <div className="text-3xl font-black text-gradient mb-1">1,234</div>
                  <div className="text-sm text-gray-400">Tin nhắn</div>
                </div>
              </GlassCard>
              <GlassCard hover>
                <div className="text-center">
                  <div className="text-3xl font-black text-gradient mb-1">89</div>
                  <div className="text-sm text-gray-400">Dự án</div>
                </div>
              </GlassCard>
            </div>
          </div>
        )}

        {/* Account Tab */}
        {activeTab === 'account' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Thông Tin Tài Khoản</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Email</label>
                  <input type="email" defaultValue="demo@voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Số điện thoại</label>
                  <input type="tel" defaultValue="+84 912 345 678" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <GradientButton variant="secondary">Cập nhật</GradientButton>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Đổi Mật Khẩu</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Mật khẩu hiện tại</label>
                  <input type="password" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Mật khẩu mới</label>
                  <input type="password" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Xác nhận mật khẩu mới</label>
                  <input type="password" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <GradientButton variant="primary">🔒 Đổi Mật Khẩu</GradientButton>
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
                {[
                  { label: 'Cho phép mọi người tìm thấy tôi qua email', checked: true },
                  { label: 'Hiển thị trạng thái hoạt động', checked: true },
                  { label: 'Cho phép tin nhắn từ người lạ', checked: false },
                  { label: 'Chia sẻ dữ liệu với đối tác', checked: false }
                ].map((setting, idx) => (
                  <label key={idx} className="flex items-center justify-between p-4 glass-strong rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                    <span className="text-white">{setting.label}</span>
                    <input type="checkbox" defaultChecked={setting.checked} className="w-5 h-5 rounded" />
                  </label>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Xác Thực Hai Yếu Tố (2FA)</h3>
              <p className="text-gray-400 mb-4">Tăng cường bảo mật tài khoản với xác thực hai yếu tố</p>
              <GradientButton variant="success">🔐 Bật 2FA</GradientButton>
            </GlassCard>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Cài Đặt Thông Báo</h3>
              <div className="space-y-4">
                {[
                  { category: 'Tin nhắn', options: ['Email', 'Push', 'SMS'] },
                  { category: 'Công việc', options: ['Email', 'Push'] },
                  { category: 'Cuộc họp', options: ['Email', 'Push', 'SMS'] },
                  { category: 'Cập nhật hệ thống', options: ['Email'] }
                ].map((item, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl">
                    <div className="font-bold text-white mb-3">{item.category}</div>
                    <div className="flex gap-4">
                      {item.options.map((opt, i) => (
                        <label key={i} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" defaultChecked className="w-4 h-4 rounded" />
                          <span className="text-sm text-gray-400">{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;

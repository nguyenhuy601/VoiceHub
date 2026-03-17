import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { GradientButton } from '../../components/Shared';
import { getUserDisplayName, getInitials, getAvatarColor } from '../../utils/helpers';
import toast from 'react-hot-toast';

const inputClass =
  'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 outline-none text-white placeholder-gray-500 transition-all';

function ProfileModal({ isOpen, onClose }) {
  const { user: authUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', phone: '' });
  const [activeProfileTab, setActiveProfileTab] = useState('main'); // 'main' | 'organization' | 'account' | 'security' | 'notifications'

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/users/me');
      const data = res?.data ?? res;
      setProfile(data);
      setForm({
        displayName: data?.displayName ?? data?.username ?? '',
        bio: data?.bio ?? '',
        phone: data?.phone ?? '',
      });
    } catch (err) {
      toast.error(err?.message || 'Không tải được hồ sơ');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchProfile();
    }
  }, [isOpen, fetchProfile]);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const res = await api.patch('/users/me', {
        displayName: form.displayName?.trim() || undefined,
        bio: form.bio?.trim() || undefined,
        phone: form.phone?.trim() || undefined,
      });
      const updated = res?.data ?? res;
      setProfile(updated);
      toast.success('Đã lưu thay đổi');
      if (onClose) onClose();
    } catch (err) {
      toast.error(err?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const displayName = profile?.displayName || profile?.username || getUserDisplayName(authUser);
  const email = profile?.email || authUser?.email;
  const initials = getInitials(displayName || email || 'U');
  const avatarColor = getAvatarColor(displayName || email);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Vui lòng chọn một file hình ảnh hợp lệ');
      return;
    }

    try {
      setAvatarUploading(true);
      const formData = new FormData();
      formData.append('avatar', file);

      const res = await api.post('/users/avatar', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      const data = res?.data || res;
      const avatarUrl = data?.avatarUrl || data?.data?.avatarUrl;

      if (!avatarUrl) {
        toast.error('Không nhận được đường dẫn avatar mới từ server');
        return;
      }

      // Cập nhật profile và auth user hiển thị
      setProfile((prev) => (prev ? { ...prev, avatar: avatarUrl } : prev));
      toast.success('Đã cập nhật ảnh đại diện');
    } catch (error) {
      toast.error(error?.message || 'Lỗi khi tải lên avatar');
    } finally {
      setAvatarUploading(false);
      // reset value để có thể chọn lại cùng một file
      event.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-5xl max-h-[80vh] flex flex-col rounded-2xl bg-[#111827]/95 border border-white/10 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/40">
          <div>
            <h2 className="text-xl font-bold text-white">Chỉnh sửa hồ sơ</h2>
            <p className="text-xs text-gray-400">
              Tùy chỉnh cách người khác nhìn thấy bạn trong hệ thống.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tabs: Hồ sơ chính / Hồ sơ tổ chức / Cài đặt khác (sidebar trong modal) */}
        <div className="px-6 pt-3 flex gap-2 border-b border-white/10 bg-black/30">
          {[
            { id: 'main', label: 'Hồ sơ chính' },
            { id: 'organization', label: 'Hồ sơ theo tổ chức' },
            { id: 'account', label: 'Tài khoản' },
            { id: 'security', label: 'Bảo mật' },
            { id: 'notifications', label: 'Thông báo' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveProfileTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold rounded-t-xl border-b-2 transition-colors ${
                activeProfileTab === tab.id
                  ? 'text-white border-purple-500'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Nội dung modal */}
        <div className="flex-1 flex flex-col md:flex-row gap-6 px-6 py-5 overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {/* Cột trái: form / cài đặt theo section */}
          <div className="flex-1 space-y-5">
            {activeProfileTab === 'main' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Tên hiển thị
                  </label>
                  <input
                    type="text"
                    value={form.displayName}
                    onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                    className={inputClass}
                    placeholder="Tên hiển thị"
                    maxLength={100}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Tiểu sử
                  </label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    className={`${inputClass} resize-y min-h-[100px]`}
                    placeholder="Giới thiệu ngắn gọn về bạn..."
                    rows={4}
                    maxLength={500}
                  />
                  <p className="text-xs text-gray-500 mt-1 text-right">{form.bio.length}/500</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    placeholder="+84 ..."
                  />
                </div>
              </>
            )}

            {activeProfileTab === 'organization' && (
              <>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-gray-300">
                  <p className="font-semibold mb-2">Hồ sơ theo tổ chức</p>
                  <p className="text-gray-400">
                    Tính năng này cho phép bạn hiển thị hồ sơ khác nhau cho từng tổ chức (tương tự
                    hồ sơ theo máy chủ trên Discord). Hiện tại phần này mới chỉ là giao diện mẫu,
                    backend chưa được kết nối.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Chọn tổ chức
                  </label>
                  <select className={inputClass} defaultValue="">
                    <option value="" disabled>
                      Chọn tổ chức (demo)
                    </option>
                    <option value="org-1">Tổ chức A</option>
                    <option value="org-2">Tổ chức B</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Biệt danh trong tổ chức
                  </label>
                  <input
                    type="text"
                    className={inputClass}
                    placeholder="Nhập biệt danh (demo UI)"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Đây là giao diện mẫu. Cần triển khai API tổ chức để lưu cấu hình riêng cho từng
                    tổ chức.
                  </p>
                </div>
              </>
            )}

            {activeProfileTab === 'account' && (
              <>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email || ''}
                    readOnly
                    className={`${inputClass} opacity-80 cursor-not-allowed`}
                  />
                  <p className="text-xs text-gray-500 mt-1">Email không thể thay đổi tại đây.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 text-gray-400 uppercase tracking-wide">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    placeholder="+84 ..."
                  />
                </div>
                <div className="mt-4 p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300">
                  <p className="font-semibold mb-1">Đổi mật khẩu</p>
                  <p className="text-gray-400">
                    Chức năng đổi mật khẩu sẽ được cấu hình tại mục bảo mật/đăng nhập an toàn.
                  </p>
                </div>
              </>
            )}

            {activeProfileTab === 'security' && (
              <>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-sm font-semibold text-white">Quyền riêng tư</p>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-300">
                      Hiển thị trạng thái online
                    </label>
                    <select className={inputClass}>
                      <option>Mọi người</option>
                      <option>Chỉ đồng nghiệp</option>
                      <option>Không ai</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-300">
                      Ai có thể nhắn tin cho tôi
                    </label>
                    <select className={inputClass}>
                      <option>Mọi người</option>
                      <option>Chỉ đồng nghiệp</option>
                    </select>
                  </div>
                </div>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-sm font-semibold text-white">Xác thực hai yếu tố (2FA)</p>
                  <p className="text-xs text-gray-400">
                    Tăng cường bảo mật tài khoản với mã xác thực khi đăng nhập trên thiết bị mới.
                  </p>
                  <GradientButton variant="success">🔐 Bật 2FA (demo)</GradientButton>
                </div>
              </>
            )}

            {activeProfileTab === 'notifications' && (
              <>
                <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <p className="text-sm font-semibold text-white">Cài đặt thông báo</p>
                  {[
                    { label: 'Thông báo tin nhắn mới', checked: true },
                    { label: 'Thông báo khi được mention', checked: true },
                    { label: 'Thông báo công việc mới', checked: true },
                    { label: 'Thông báo deadline sắp đến', checked: true },
                    { label: 'Thông báo qua email', checked: false },
                    { label: 'Thông báo push trên mobile', checked: true },
                  ].map((setting, idx) => (
                    <label
                      key={idx}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/30 hover:bg-black/40 cursor-pointer transition-colors"
                    >
                      <span className="text-xs text-gray-200">{setting.label}</span>
                      <input
                        type="checkbox"
                        defaultChecked={setting.checked}
                        className="w-4 h-4 rounded border-white/30 text-purple-500 focus:ring-purple-500/50"
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Cột phải: xem trước */}
          <div className="w-full md:w-80">
            <div className="mb-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Xem trước
            </div>
            <div className="rounded-2xl bg-gradient-to-b from-purple-900/80 via-slate-900 to-black border border-white/10 p-5 shadow-lg space-y-4">
              <div className="flex items-center gap-4">
                <div className="relative group cursor-pointer">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white ${avatarColor}`}
                  >
                    {profile?.avatar ? (
                      <img
                        src={profile.avatar}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-slate-900 bg-green-500" />
                  <label
                    className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-[10px] text-white font-medium text-center whitespace-pre-line transition-opacity cursor-pointer"
                  >
                    {avatarUploading ? 'Đang tải...' : 'Thay đổi\navatar'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAvatarChange}
                    />
                  </label>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-white truncate">
                    {form.displayName || displayName || 'Tên hiển thị'}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {email || 'email@example.com'}
                  </div>
                </div>
              </div>
              <div className="h-24 rounded-xl bg-black/40 border border-white/5 p-3 text-xs text-gray-300 overflow-hidden">
                {form.bio?.trim()
                  ? form.bio
                  : 'Thêm tiểu sử để mọi người biết thêm về bạn. Đây là khu vực hiển thị mô tả ngắn trên hồ sơ.'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer buttons */}
        <div className="px-6 py-4 border-t border-white/10 bg-black/40 flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
            onClick={onClose}
          >
            Hủy
          </button>
          {activeProfileTab === 'organization' ? (
            <GradientButton type="button" variant="secondary" disabled>
              Coming soon
            </GradientButton>
          ) : (
            <GradientButton type="button" variant="primary" disabled={saving} onClick={handleSaveProfile}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </GradientButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileModal;


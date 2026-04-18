import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { GradientButton, NotificationModal } from '../../components/Shared';
import { getUserDisplayName, getInitials, getAvatarColor, formatBirthDateSafe } from '../../utils/helpers';

function ProfileModal({ isOpen, onClose }) {
  const { user: authUser } = useAuth();
  const { isDarkMode } = useTheme();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [form, setForm] = useState({ displayName: '', bio: '', phone: '', status: 'online', isInvisible: false });
  const [activeProfileTab, setActiveProfileTab] = useState('main');
  const [notice, setNotice] = useState(null);

  const inputClass =
    'w-full rounded-xl border px-4 py-3 outline-none transition-all ' +
    (isDarkMode
      ? 'border-white/20 bg-white/5 text-white placeholder:text-gray-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
      : 'border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25');

  const labelClass = isDarkMode
    ? 'mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-400'
    : 'mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-600';

  const panelClass = isDarkMode
    ? 'space-y-3 rounded-xl border border-white/10 bg-white/5 p-4'
    : 'space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm';

  const infoBoxClass = isDarkMode
    ? 'rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-gray-300'
    : 'rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 shadow-sm';

  const headingClass = isDarkMode ? 'text-white' : 'text-slate-900';
  const mutedClass = isDarkMode ? 'text-gray-400' : 'text-slate-600';
  const subheadingClass = isDarkMode ? 'text-gray-300' : 'text-slate-700';

  const optionClass = isDarkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-800';

  const rowHoverClass = isDarkMode
    ? 'flex cursor-pointer items-center justify-between rounded-xl bg-black/30 px-3 py-2 transition-colors hover:bg-black/40'
    : 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2 transition-colors hover:bg-slate-50';

  const overlayClass = isDarkMode ? 'bg-black/70' : 'bg-slate-900/45';
  const shellClass = isDarkMode
    ? 'max-h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-[#111827]/95 shadow-2xl'
    : 'max-h-[80vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl';
  const headerClass = isDarkMode
    ? 'flex items-center justify-between border-b border-white/10 bg-black/40 px-6 py-4'
    : 'flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4';
  const tabsBarClass = isDarkMode
    ? 'flex gap-2 border-b border-white/10 bg-black/30 px-6 pt-3'
    : 'flex gap-2 border-b border-slate-200 bg-white px-6 pt-3';
  const tabActive = isDarkMode ? 'border-cyan-400 text-white' : 'border-cyan-600 text-slate-900';
  const tabInactive = isDarkMode
    ? 'border-transparent text-gray-400 hover:text-white'
    : 'border-transparent text-slate-500 hover:text-slate-800';
  const bodyScrollClass = isDarkMode
    ? 'scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 md:flex-row'
    : 'flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5 md:flex-row';
  const footerClass = isDarkMode
    ? 'flex justify-end gap-3 border-t border-white/10 bg-black/40 px-6 py-4'
    : 'flex justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4';
  const ghostFooterBtn = isDarkMode
    ? 'rounded-xl px-4 py-2 text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white'
    : 'rounded-xl px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-200/60 hover:text-slate-900';
  const previewCardClass = isDarkMode
    ? 'space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-purple-900/80 via-slate-900 to-black p-5 shadow-lg'
    : 'space-y-4 rounded-2xl border border-slate-200 bg-gradient-to-b from-cyan-50 via-white to-slate-50 p-5 shadow-md';
  const previewBioClass = isDarkMode
    ? 'h-24 overflow-hidden rounded-xl border border-white/5 bg-black/40 p-3 text-xs text-gray-300'
    : 'h-24 overflow-hidden rounded-xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-600';
  const avatarRing = isDarkMode ? 'border-slate-900' : 'border-white';
  const avatarOverlay = isDarkMode
    ? 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-black/50 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100'
    : 'absolute inset-0 flex cursor-pointer flex-col items-center justify-center rounded-full bg-slate-900/45 text-center text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100';

  const showNotice = (message, type = 'success') => {
    setNotice({
      type,
      title: type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo',
      message,
    });
  };

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
        status: data?.status ?? 'online',
        isInvisible: data?.isInvisible ?? false,
      });
    } catch (err) {
      showNotice(err?.message || 'Không tải được hồ sơ', 'fail');
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
        status: form.status,
        isInvisible: form.isInvisible,
      });
      const updated = res?.data ?? res;
      setProfile(updated);
      showNotice('Đã lưu thay đổi', 'success');
      if (onClose) onClose();
    } catch (err) {
      showNotice(err?.message || 'Lưu thất bại', 'fail');
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
      showNotice('Vui lòng chọn một file hình ảnh hợp lệ', 'fail');
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
        showNotice('Không nhận được đường dẫn avatar mới từ server', 'fail');
        return;
      }

      setProfile((prev) => (prev ? { ...prev, avatar: avatarUrl } : prev));
      showNotice('Đã cập nhật ảnh đại diện', 'success');
    } catch (error) {
      showNotice(error?.message || 'Lỗi khi tải lên avatar', 'fail');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${overlayClass}`}>
      <div className={`flex flex-col ${shellClass}`}>
        <div className={headerClass}>
          <div>
            <h2 className={`text-xl font-bold ${headingClass}`}>Chỉnh sửa hồ sơ</h2>
            <p className={`text-xs ${mutedClass}`}>Tùy chỉnh cách người khác nhìn thấy bạn trong hệ thống.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={
              isDarkMode
                ? 'flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-gray-300 transition-colors hover:bg-white/20 hover:text-white'
                : 'flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900'
            }
          >
            ✕
          </button>
        </div>

        <div className={tabsBarClass}>
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
              className={`rounded-t-xl border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                activeProfileTab === tab.id ? tabActive : tabInactive
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={bodyScrollClass}>
          <div className="min-w-0 flex-1 space-y-5">
            {activeProfileTab === 'main' && (
              <>
                <div>
                  <label className={labelClass}>Tên hiển thị</label>
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
                  <label className={labelClass}>Tiểu sử</label>
                  <textarea
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                    className={`${inputClass} min-h-[100px] resize-y`}
                    placeholder="Giới thiệu ngắn gọn về bạn..."
                    rows={4}
                    maxLength={500}
                  />
                  <p className={`mt-1 text-right text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    {form.bio.length}/500
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Số điện thoại</label>
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
                <div className={infoBoxClass}>
                  <p className={`mb-2 font-semibold ${headingClass}`}>Hồ sơ theo tổ chức</p>
                  <p className={mutedClass}>
                    Tính năng này cho phép bạn hiển thị hồ sơ khác nhau cho từng tổ chức (tương tự hồ sơ theo
                    máy chủ trên Discord). Hiện tại phần này mới chỉ là giao diện mẫu, backend chưa được kết nối.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Chọn tổ chức</label>
                  <select
                    className={inputClass}
                    defaultValue=""
                    style={{ colorScheme: isDarkMode ? 'dark' : 'light' }}
                  >
                    <option className={optionClass} value="" disabled>
                      Chọn tổ chức (demo)
                    </option>
                    <option className={optionClass} value="org-1">
                      Tổ chức A
                    </option>
                    <option className={optionClass} value="org-2">
                      Tổ chức B
                    </option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Biệt danh trong tổ chức</label>
                  <input type="text" className={`${inputClass} cursor-not-allowed opacity-70`} placeholder="Nhập biệt danh (demo UI)" disabled />
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    Đây là giao diện mẫu. Cần triển khai API tổ chức để lưu cấu hình riêng cho từng tổ chức.
                  </p>
                </div>
              </>
            )}

            {activeProfileTab === 'account' && (
              <>
                <div>
                  <label className={labelClass}>Email</label>
                  <input type="email" value={email || ''} readOnly className={`${inputClass} cursor-not-allowed opacity-80`} />
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>Email không thể thay đổi tại đây.</p>
                </div>
                <div>
                  <label className={labelClass}>Ngày sinh</label>
                  <p className={`${inputClass} cursor-default py-2.5 opacity-90`}>{formatBirthDateSafe(profile?.dateOfBirth)}</p>
                  <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                    Tài khoản cũ có thể chưa có ngày sinh — hiển thị &quot;Chưa cập nhật&quot;.
                  </p>
                </div>
                <div>
                  <label className={labelClass}>Số điện thoại</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                    className={inputClass}
                    placeholder="+84 ..."
                  />
                </div>
                <div className={infoBoxClass}>
                  <p className={`mb-1 font-semibold ${headingClass}`}>Đổi mật khẩu</p>
                  <p className={mutedClass}>Chức năng đổi mật khẩu sẽ được cấu hình tại mục bảo mật/đăng nhập an toàn.</p>
                </div>
              </>
            )}

            {activeProfileTab === 'security' && (
              <>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>Trạng thái & Quyền riêng tư</p>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>Trạng thái hiện tại</label>
                    <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className={inputClass}>
                      <option className={optionClass} value="online">
                        🟢 Trực tuyến
                      </option>
                      <option className={optionClass} value="away">
                        🟡 Vắng mặt
                      </option>
                      <option className={optionClass} value="busy">
                        🔴 Đang bận
                      </option>
                      <option className={optionClass} value="offline">
                        ⚪ Ngoại tuyến
                      </option>
                    </select>
                  </div>
                  <div>
                    <label
                      className={
                        isDarkMode
                          ? 'flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 bg-white/5 p-3 transition-colors hover:bg-white/10'
                          : 'flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50'
                      }
                    >
                      <input
                        type="checkbox"
                        checked={form.isInvisible}
                        onChange={(e) => setForm((f) => ({ ...f, isInvisible: e.target.checked }))}
                        className="h-4 w-4 rounded"
                      />
                      <div>
                        <p className={`text-xs font-semibold ${subheadingClass}`}>👻 Chế độ vô hình</p>
                        <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                          Người khác sẽ không thấy bạn ngoại tuyến
                        </p>
                      </div>
                    </label>
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>Hiển thị trạng thái online</label>
                    <select className={inputClass}>
                      <option className={optionClass}>Mọi người</option>
                      <option className={optionClass}>Chỉ đồng nghiệp</option>
                      <option className={optionClass}>Không ai</option>
                    </select>
                  </div>
                  <div>
                    <label className={`mb-1 block text-xs font-semibold ${subheadingClass}`}>Ai có thể nhắn tin cho tôi</label>
                    <select className={inputClass}>
                      <option className={optionClass}>Mọi người</option>
                      <option className={optionClass}>Chỉ đồng nghiệp</option>
                    </select>
                  </div>
                </div>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>Xác thực hai yếu tố (2FA)</p>
                  <p className={`text-xs ${mutedClass}`}>
                    Tăng cường bảo mật tài khoản với mã xác thực khi đăng nhập trên thiết bị mới.
                  </p>
                  <GradientButton variant="success">🔐 Bật 2FA (demo)</GradientButton>
                </div>
              </>
            )}

            {activeProfileTab === 'notifications' && (
              <>
                <div className={panelClass}>
                  <p className={`text-sm font-semibold ${headingClass}`}>Cài đặt thông báo</p>
                  {[
                    { label: 'Thông báo tin nhắn mới', checked: true },
                    { label: 'Thông báo khi được mention', checked: true },
                    { label: 'Thông báo công việc mới', checked: true },
                    { label: 'Thông báo deadline sắp đến', checked: true },
                    { label: 'Thông báo qua email', checked: false },
                    { label: 'Thông báo push trên mobile', checked: true },
                  ].map((setting, idx) => (
                    <label key={idx} className={rowHoverClass}>
                      <span className={`text-xs ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>{setting.label}</span>
                      <input
                        type="checkbox"
                        defaultChecked={setting.checked}
                        className="h-4 w-4 rounded border-slate-400 text-cyan-600 focus:ring-cyan-500/50"
                      />
                    </label>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="w-full md:w-80">
            <div className={`mb-3 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>Xem trước</div>
            <div className={previewCardClass}>
              <div className="flex items-center gap-4">
                <div className="group relative cursor-pointer">
                  <div className={`flex h-16 w-16 items-center justify-center rounded-full text-2xl font-bold text-white ${avatarColor}`}>
                    {profile?.avatar ? <img src={profile.avatar} alt="" className="h-full w-full rounded-full object-cover" /> : initials}
                  </div>
                  <span className={`absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 ${avatarRing} bg-green-500`} />
                  <label className={avatarOverlay}>
                    {avatarUploading ? 'Đang tải...' : 'Thay đổi\navatar'}
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  </label>
                </div>
                <div className="min-w-0">
                  <div className={`truncate font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                    {form.displayName || displayName || 'Tên hiển thị'}
                  </div>
                  <div className={`truncate text-xs ${mutedClass}`}>{email || 'email@example.com'}</div>
                </div>
              </div>
              <div className={previewBioClass}>
                {form.bio?.trim()
                  ? form.bio
                  : 'Thêm tiểu sử để mọi người biết thêm về bạn. Đây là khu vực hiển thị mô tả ngắn trên hồ sơ.'}
              </div>
            </div>
          </div>
        </div>

        <div className={footerClass}>
          <button type="button" className={ghostFooterBtn} onClick={onClose}>
            Hủy
          </button>
          {activeProfileTab === 'organization' ? (
            <GradientButton type="button" variant="secondary" disabled>
              Coming soon
            </GradientButton>
          ) : (
            <GradientButton type="button" variant="primary" disabled={saving || loading} onClick={handleSaveProfile}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </GradientButton>
          )}
        </div>
      </div>
      <NotificationModal notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}

export default ProfileModal;

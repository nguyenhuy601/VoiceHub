import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, GlassCard, GradientButton, Toast } from '../Shared';
import { useAuth } from '../../context/AuthContext';
import { organizationAPI } from '../../services/api/organizationAPI';
import roleAPI from '../../services/api/roleAPI';

const unwrap = (payload) => payload?.data ?? payload;

const ADMIN_TABS = [
  { id: 'general', label: 'Tổng quan', icon: '⚙️' },
  { id: 'roles', label: 'Vai trò & quyền', icon: '🔐' },
  { id: 'security', label: 'Bảo mật', icon: '🛡️' },
  { id: 'integrations', label: 'Tích hợp', icon: '🔗' },
  { id: 'billing', label: 'Thanh toán', icon: '💳' },
  { id: 'audit', label: 'Nhật ký', icon: '📜' },
];

const MEMBER_TABS = [
  { id: 'profile', label: 'Hồ sơ cá nhân', icon: '👤' },
  { id: 'notifications', label: 'Thông báo', icon: '🔔' },
  { id: 'privacy', label: 'Quyền riêng tư', icon: '🔒' },
  { id: 'appearance', label: 'Giao diện', icon: '🎨' },
];

const storageKey = (orgId, key) => `orgSettings:${orgId}:${key}`;

/**
 * Owner / Admin: toàn bộ tab quản trị (giống chế độ Quản trị viên trên trang Cài đặt).
 * Member: chỉ Hồ sơ / Thông báo / Quyền riêng tư / Giao diện (giống hình 2).
 */
function OrganizationSettingsModal({
  isOpen,
  onClose,
  organization,
  onOrganizationUpdated,
  onOrganizationDeleted,
}) {
  const { user, updateUser } = useAuth();
  const orgId = organization?._id || organization?.id;
  const myRole = String(organization?.myRole || 'member').toLowerCase();

  const isFullAccess = useMemo(
    () => myRole === 'owner' || myRole === 'admin',
    [myRole]
  );

  const [activeTab, setActiveTab] = useState('general');
  const [toast, setToast] = useState(null);
  const [loadingOrg, setLoadingOrg] = useState(false);

  const [organizationForm, setOrganizationForm] = useState({
    name: '',
    description: '',
    website: '',
    contactEmail: '',
  });

  const [userProfileForm, setUserProfileForm] = useState({
    fullName: '',
    phone: '',
  });

  const [apiKeys, setApiKeys] = useState([]);
  const [integrations, setIntegrations] = useState([
    { id: 'slack', name: 'Slack', icon: '💬', connected: false, color: 'from-purple-600 to-pink-600' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', connected: false, color: 'from-blue-500 to-cyan-500' },
  ]);
  const [securitySettings, setSecuritySettings] = useState([
    { id: '2fa', label: 'Bắt buộc 2FA cho tất cả thành viên', checked: false },
    { id: 'strong-password', label: 'Yêu cầu mật khẩu mạnh', checked: false },
  ]);
  const [notificationSettings, setNotificationSettings] = useState([
    { id: 'new-message', label: 'Thông báo tin nhắn mới trong tổ chức', checked: true },
    { id: 'mention', label: 'Thông báo khi được @mention', checked: true },
    { id: 'email', label: 'Thông báo qua email', checked: false },
  ]);
  const [privacySettings, setPrivacySettings] = useState({
    onlineStatus: 'Mọi người',
    directMessagePermission: 'Mọi người',
  });
  const [themeMode, setThemeMode] = useState('dark');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [roles, setRoles] = useState([]);
  const [roleLoading, setRoleLoading] = useState(false);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleDraft, setRoleDraft] = useState({
    name: '',
    permissions: '',
    members: 0,
    color: 'from-purple-600 to-pink-600',
    icon: '🧩',
  });

  /** Tên tổ chức từ API — dùng để so khớp khi xóa (không phụ thuộc chỉnh sửa form chưa lưu). */
  const [serverOrgName, setServerOrgName] = useState('');
  const [deleteOrgModalOpen, setDeleteOrgModalOpen] = useState(false);
  const [deleteOrgNameInput, setDeleteOrgNameInput] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);

  const expectedOrgNameForDelete = useMemo(() => {
    const fromServer = serverOrgName?.trim();
    if (fromServer) return fromServer;
    return String(organization?.name || '').trim();
  }, [serverOrgName, organization?.name]);

  const deleteNameMatches =
    expectedOrgNameForDelete.length > 0 &&
    deleteOrgNameInput.trim() === expectedOrgNameForDelete;

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
  };

  const loadOrgFromApi = useCallback(async () => {
    if (!orgId) return;
    setLoadingOrg(true);
    try {
      const payload = await organizationAPI.getOrganization(orgId);
      const data = unwrap(payload);
      const o = data?.data ?? data;
      const n = o?.name || organization?.name || '';
      setServerOrgName(n);
      setOrganizationForm({
        name: n,
        description: o?.description || '',
        website: o?.website || '',
        contactEmail: o?.contactEmail || '',
      });
    } catch {
      setOrganizationForm((prev) => ({
        ...prev,
        name: organization?.name || prev.name,
      }));
      setServerOrgName(organization?.name || '');
    } finally {
      setLoadingOrg(false);
    }
  }, [orgId, organization?.name]);

  const loadRoles = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    try {
      setRoleLoading(true);
      const response = await roleAPI.getRolesByOrganization(orgId);
      const raw = response?.data ?? response;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      setRoles(
        list.map((r) => ({
          ...r,
          id: r.id || r._id,
        }))
      );
    } catch {
      /* giữ mặc định */
    } finally {
      setRoleLoading(false);
    }
  }, [orgId, isFullAccess]);

  useEffect(() => {
    if (!isOpen) {
      setDeleteOrgModalOpen(false);
      setDeleteOrgNameInput('');
      setDeletingOrg(false);
      return;
    }
    if (!orgId) return;
    const first = isFullAccess ? 'general' : 'profile';
    setActiveTab(first);
    loadOrgFromApi();
    loadRoles();

    try {
      const raw = localStorage.getItem(storageKey(orgId, 'memberPrefs'));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.notificationSettings) setNotificationSettings(parsed.notificationSettings);
        if (parsed.privacySettings) setPrivacySettings(parsed.privacySettings);
        if (parsed.themeMode) setThemeMode(parsed.themeMode);
      }
    } catch {
      /* ignore */
    }
  }, [isOpen, orgId, isFullAccess, loadOrgFromApi, loadRoles]);

  useEffect(() => {
    if (!user) return;
    setUserProfileForm({
      fullName: user?.displayName || user?.fullName || user?.name || '',
      phone: user?.phone || '',
    });
  }, [user, isOpen]);

  const persistMemberPrefs = () => {
    if (!orgId) return;
    try {
      localStorage.setItem(
        storageKey(orgId, 'memberPrefs'),
        JSON.stringify({
          notificationSettings,
          privacySettings,
          themeMode,
        })
      );
    } catch {
      /* ignore */
    }
  };

  const openDeleteOrgModal = () => {
    setDeleteOrgNameInput('');
    setDeleteOrgModalOpen(true);
  };

  const closeDeleteOrgModal = () => {
    if (deletingOrg) return;
    setDeleteOrgModalOpen(false);
    setDeleteOrgNameInput('');
  };

  const handleConfirmDeleteOrganization = async () => {
    if (!orgId || !deleteNameMatches) return;
    setDeletingOrg(true);
    try {
      await organizationAPI.deleteOrganization(orgId);
      showToast('Đã xóa tổ chức', 'success');
      setDeleteOrgModalOpen(false);
      setDeleteOrgNameInput('');
      onOrganizationUpdated?.();
      onOrganizationDeleted?.(orgId);
      onClose();
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.response?.data?.error ||
        e?.message ||
        'Không thể xóa tổ chức';
      showToast(typeof msg === 'string' ? msg : 'Không thể xóa tổ chức', 'error');
    } finally {
      setDeletingOrg(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!orgId || !organizationForm.name?.trim()) {
      showToast('Vui lòng nhập tên tổ chức', 'error');
      return;
    }
    try {
      const trimmedName = organizationForm.name.trim();
      await organizationAPI.updateOrganization(orgId, {
        name: trimmedName,
        description: organizationForm.description,
      });
      setServerOrgName(trimmedName);
      showToast('Đã lưu thông tin tổ chức', 'success');
      onOrganizationUpdated?.();
    } catch {
      showToast('Không thể cập nhật tổ chức', 'error');
    }
  };

  const handleSaveUserProfile = () => {
    updateUser({ displayName: userProfileForm.fullName, phone: userProfileForm.phone });
    persistMemberPrefs();
    showToast('Đã cập nhật hồ sơ', 'success');
  };

  const handleToggleNotification = (id) => {
    setNotificationSettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  };

  const handleToggleSecurity = (id) => {
    setSecuritySettings((prev) =>
      prev.map((s) => (s.id === id ? { ...s, checked: !s.checked } : s))
    );
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === 'string' ? reader.result : '');
      showToast('Đã cập nhật avatar', 'success');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const openCreateRole = () => {
    setEditingRoleId(null);
    setRoleDraft({
      name: '',
      permissions: '',
      members: 0,
      color: 'from-purple-600 to-pink-600',
      icon: '🧩',
    });
    setRoleEditorOpen(true);
  };

  const openEditRole = (role) => {
    setEditingRoleId(role.id || role._id);
    setRoleDraft({
      name: role.name,
      permissions: role.permissions,
      members: role.members,
      color: role.color || 'from-purple-600 to-pink-600',
      icon: role.icon || '🧩',
    });
    setRoleEditorOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleDraft.name?.trim()) {
      showToast('Nhập tên vai trò', 'error');
      return;
    }
    try {
      setRoleLoading(true);
      if (editingRoleId) {
        await roleAPI.updateRole(editingRoleId, { ...roleDraft, organizationId: orgId });
        showToast('Đã cập nhật vai trò', 'success');
      } else {
        await roleAPI.createRole({ ...roleDraft, organizationId: orgId });
        showToast('Đã tạo vai trò', 'success');
      }
      setRoleEditorOpen(false);
      await loadRoles();
    } catch (e) {
      showToast(e?.message || 'Không lưu được vai trò', 'error');
    } finally {
      setRoleLoading(false);
    }
  };

  const handleDeleteRole = async (roleId) => {
    if (!window.confirm('Xóa vai trò này?')) return;
    try {
      setRoleLoading(true);
      await roleAPI.deleteRole(roleId);
      showToast('Đã xóa vai trò', 'success');
      await loadRoles();
    } catch (e) {
      showToast(e?.message || 'Lỗi xóa vai trò', 'error');
    } finally {
      setRoleLoading(false);
    }
  };

  const tabs = isFullAccess ? ADMIN_TABS : MEMBER_TABS;

  if (!isOpen || !organization) return null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Cài đặt tổ chức" size="xl">
        <div className="space-y-4 text-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <p className="text-sm font-semibold text-white">{organization.name}</p>
              <p className="text-xs text-gray-400">
                Vai trò của bạn:{' '}
                <span className="text-cyan-300">
                  {myRole === 'owner'
                    ? 'Chủ sở hữu'
                    : myRole === 'admin'
                      ? 'Quản trị viên'
                      : 'Thành viên'}
                </span>
                {!isFullAccess && ' — chỉ xem các mục cá nhân trong tổ chức'}
              </p>
            </div>
          </div>

          {loadingOrg && isFullAccess && (
            <p className="text-sm text-gray-400">Đang tải thông tin tổ chức…</p>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-gradient">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                    : 'border border-slate-800 bg-[#040f2a] text-gray-400 hover:bg-slate-800/70'
                }`}
              >
                <span className="mr-1">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* ——— Admin ——— */}
          {isFullAccess && activeTab === 'general' && (
            <div className="max-w-3xl space-y-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-4 text-xl font-bold text-white">Thông tin tổ chức</h3>
                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Tên tổ chức</label>
                    <input
                      value={organizationForm.name}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, name: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm text-gray-300">Mô tả</label>
                    <textarea
                      rows={3}
                      value={organizationForm.description}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                  <GradientButton variant="primary" onClick={handleSaveOrganization}>
                    Lưu thay đổi
                  </GradientButton>
                </div>
              </GlassCard>
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h3 className="mb-2 text-lg font-bold text-white">Quota & giới hạn</h3>
                <p className="text-sm text-gray-400">
                  Theo gói đăng ký — chi tiết sẽ đồng bộ khi backend billing sẵn sàng.
                </p>
              </GlassCard>
              {myRole === 'owner' && (
                <GlassCard className="border border-red-900/40 bg-red-950/20">
                  <h3 className="mb-2 text-lg font-bold text-red-300">Vùng nguy hiểm</h3>
                  <p className="mb-3 text-sm text-gray-400">
                    Xóa tổ chức sẽ vô hiệu hóa tổ chức này. Nếu bạn là chủ sở hữu duy nhất và không thể rời
                    tổ chức, hãy xóa tổ chức hoặc chuyển quyền sở hữu trước.
                  </p>
                  <button
                    type="button"
                    onClick={openDeleteOrgModal}
                    className="rounded-xl border border-red-500/60 bg-red-950/40 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-950/60"
                  >
                    Xóa tổ chức vĩnh viễn
                  </button>
                </GlassCard>
              )}
            </div>
          )}

          {isFullAccess && activeTab === 'roles' && (
            <div className="max-w-4xl">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold text-white">Quản lý vai trò (RBAC)</h3>
                  <GradientButton variant="primary" onClick={openCreateRole} disabled={roleLoading}>
                    + Tạo vai trò
                  </GradientButton>
                </div>
                {roleEditorOpen && (
                  <div className="mb-4 rounded-xl border border-slate-700 bg-[#040f2a] p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <input
                        value={roleDraft.name}
                        onChange={(e) => setRoleDraft((p) => ({ ...p, name: e.target.value }))}
                        placeholder="Tên vai trò"
                        className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-white"
                      />
                      <input
                        value={roleDraft.permissions}
                        onChange={(e) => setRoleDraft((p) => ({ ...p, permissions: e.target.value }))}
                        placeholder="Mô tả quyền"
                        className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-white"
                      />
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-gray-300"
                        onClick={() => setRoleEditorOpen(false)}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        className="rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 text-sm font-semibold text-white"
                        onClick={handleSaveRole}
                        disabled={roleLoading}
                      >
                        Lưu
                      </button>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  {roles.map((role) => (
                    <div
                      key={role.id || role._id}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4"
                    >
                      <div>
                        <div className="font-bold text-white">{role.name}</div>
                        <div className="text-sm text-gray-400">{role.permissions}</div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-800 px-3 py-2 text-sm hover:bg-slate-800/70"
                          onClick={() => openEditRole(role)}
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-slate-800 px-3 py-2 text-sm text-red-400 hover:bg-slate-800/70"
                          onClick={() => handleDeleteRole(role.id || role._id)}
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                  {roles.length === 0 && (
                    <p className="text-sm text-gray-500">Chưa có vai trò tùy chỉnh hoặc API chưa trả dữ liệu.</p>
                  )}
                </div>
              </GlassCard>
            </div>
          )}

          {isFullAccess && activeTab === 'security' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Chính sách bảo mật</h3>
              <div className="space-y-2">
                {securitySettings.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4"
                  >
                    <span>{s.label}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => handleToggleSecurity(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                ))}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'integrations' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Tích hợp</h3>
              <div className="grid grid-cols-2 gap-3">
                {integrations.map((i) => (
                  <div key={i.id} className="rounded-xl border border-slate-800 bg-[#040f2a] p-4">
                    <div className="text-2xl">{i.icon}</div>
                    <div className="font-semibold text-white">{i.name}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'billing' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-2 text-xl font-bold text-white">Thanh toán</h3>
              <p className="text-sm text-gray-400">Quản lý gói cước và hóa đơn — bản demo.</p>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'audit' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-2 text-xl font-bold text-white">Nhật ký hoạt động</h3>
              <p className="text-sm text-gray-400">Nhật ký audit sẽ hiển thị khi backend cung cấp API.</p>
            </GlassCard>
          )}

          {/* ——— Member ——— */}
          {!isFullAccess && activeTab === 'profile' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Thông tin trong tổ chức</h3>
              <div className="mb-4 flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-4xl">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    '👤'
                  )}
                </div>
                <label className="inline-flex cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                  <span className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white">
                    Đổi avatar
                  </span>
                </label>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Họ và tên</label>
                  <input
                    value={userProfileForm.fullName}
                    onChange={(e) =>
                      setUserProfileForm((p) => ({ ...p, fullName: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Email</label>
                  <input
                    value={user?.email || ''}
                    disabled
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a]/60 px-4 py-3 text-gray-400"
                  />
                </div>
                <GradientButton variant="primary" onClick={handleSaveUserProfile}>
                  Lưu thay đổi
                </GradientButton>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'notifications' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Thông báo (tổ chức)</h3>
              <div className="space-y-2">
                {notificationSettings.map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-4"
                  >
                    <span>{s.label}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => handleToggleNotification(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="mt-3 text-sm text-indigo-400 hover:underline"
                onClick={() => {
                  persistMemberPrefs();
                  showToast('Đã lưu cài đặt thông báo', 'success');
                }}
              >
                Lưu cài đặt thông báo
              </button>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'privacy' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Quyền riêng tư</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Hiển thị trạng thái online</label>
                  <select
                    value={privacySettings.onlineStatus}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({ ...p, onlineStatus: e.target.value }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  >
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                    <option>Không ai</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">Ai có thể nhắn tin cho tôi</label>
                  <select
                    value={privacySettings.directMessagePermission}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({
                        ...p,
                        directMessagePermission: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-3 text-white"
                  >
                    <option>Mọi người</option>
                    <option>Chỉ đồng nghiệp</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="text-sm text-indigo-400 hover:underline"
                  onClick={() => {
                    persistMemberPrefs();
                    showToast('Đã lưu quyền riêng tư', 'success');
                  }}
                >
                  Lưu
                </button>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'appearance' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h3 className="mb-4 text-xl font-bold text-white">Giao diện</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'dark', name: 'Tối', icon: '🌙' },
                  { id: 'light', name: 'Sáng', icon: '☀️' },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      setThemeMode(t.id);
                      persistMemberPrefs();
                      showToast(`Đã chọn giao diện ${t.name.toLowerCase()}`, 'success');
                    }}
                    className={`rounded-xl p-6 text-left transition-all ${
                      themeMode === t.id
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                        : 'border border-slate-800 bg-[#040f2a] hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="mb-2 text-4xl">{t.icon}</div>
                    <div className="font-bold text-white">{t.name}</div>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={deleteOrgModalOpen}
        onClose={closeDeleteOrgModal}
        title="Xóa tổ chức vĩnh viễn?"
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-4 text-slate-100">
          <p className="text-sm text-gray-300">
            Hành động này vô hiệu hóa tổ chức và không thể hoàn tác từ giao diện này.
          </p>
          <div className="rounded-xl border border-white/10 bg-[#040f2a] px-3 py-2 text-sm">
            <span className="text-gray-400">Tên tổ chức: </span>
            <span className="font-semibold text-white">{expectedOrgNameForDelete || '—'}</span>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-400">
              Nhập tên tổ chức để xác nhận.
            </label>
            <input
              type="text"
              value={deleteOrgNameInput}
              onChange={(e) => setDeleteOrgNameInput(e.target.value)}
              placeholder="Nhập tên tổ chức"
              autoComplete="off"
              disabled={deletingOrg}
              className="w-full rounded-xl border border-slate-700 bg-[#040f2a] px-4 py-3 text-white outline-none placeholder:text-gray-500 focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDeleteOrgModal}
              disabled={deletingOrg}
              className="rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-gray-200 hover:bg-white/5 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteOrganization}
              disabled={!deleteNameMatches || deletingOrg || !expectedOrgNameForDelete}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:bg-gray-600 disabled:text-gray-300"
            >
              {deletingOrg ? 'Đang xóa…' : 'Xóa tổ chức'}
            </button>
          </div>
        </div>
      </Modal>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </>
  );
}

export default OrganizationSettingsModal;

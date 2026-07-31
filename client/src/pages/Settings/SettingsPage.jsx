import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import userService from '../../services/userService';
import authService from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { mergeAuthUserFromProfile, unwrapApiData } from '../../utils/helpers';
import { getJwtEmail } from '../../utils/tokenStorage';
import UserAvatar from '../../components/Shared/UserAvatar';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import SettingsFigmaLayout from '../../components/Settings/SettingsFigmaLayout';
import useUiRole from '../../hooks/useUiRole';
import { settingsTabsForRole } from '../../config/roleMeta';
import SettingsRbacMatrix from '../../components/Settings/SettingsRbacMatrix';
import SettingsActiveSessions from '../../components/Settings/SettingsActiveSessions';
import SettingsApiKeysPanel from '../../components/Settings/SettingsApiKeysPanel';
import CapabilityProfilePanel from '../../components/Settings/CapabilityProfilePanel';
import { FIGMA_SETTINGS_CARD, FIGMA_SETTINGS_INPUT } from '../../components/Settings/figmaSettingsClasses';
import { hasBackendCapability } from '../../config/backendCapabilities';

const isValidMongoObjectId = (s) =>
  typeof s === 'string' && /^[a-fA-F0-9]{24}$/.test(s);

const SECURITY_LABEL_KEYS = {
  '2fa': 'sec2fa',
  'strong-password': 'secStrongPwd',
  'auto-logout': 'secAutoLogout',
  'block-unknown-ip': 'secBlockIp',
  'new-device-email': 'secNewDevice',
};

const NOTIF_LABEL_KEYS = {
  'new-message': 'notifNewMsg',
  mention: 'notifMention',
  'new-task': 'notifNewTask',
  deadline: 'notifDeadline',
  email: 'notifEmail',
  'mobile-push': 'notifPush',
};

const SHOW_ROLE_DEBUG_SWITCHER =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_UI_ROLE_DEBUG === 'true';

function SettingsPage() {
  const { t, locale } = useAppStrings();
  const { user, updateUser } = useAuth();
  const { isDarkMode, toggleTheme, fontScale, setFontScale } = useTheme();
  const [activeTab, setActiveTab] = useState('general');
  const { role: uiRole, meta: uiRoleMeta } = useUiRole();
  const figmaSettingsTabs = useMemo(
    () =>
      settingsTabsForRole(uiRole).map((tab) => ({
        ...tab,
        label: t(`settingsPage.figmaTab${tab.id.charAt(0).toUpperCase()}${tab.id.slice(1)}`),
      })),
    [uiRole, t]
  );
  const [figmaTab, setFigmaTab] = useState('profile');
  const [sessions, setSessions] = useState([]);
  useEffect(() => {
    setSessions([
      {
        id: '1',
        device: 'Chrome · Windows',
        location: 'TP.HCM, VN',
        lastSeen: t('settingsPage.sessionActive'),
        ip: '203.162.xx.xx',
        current: true,
      },
      {
        id: '2',
        device: 'Safari · iPhone',
        location: 'Ha Noi, VN',
        lastSeen: t('settingsPage.timeHourAgo', { n: 2 }),
        ip: '113.160.xx.xx',
        current: false,
      },
    ]);
  }, [t]);

  const [apiKeyDeleteConfirm, setApiKeyDeleteConfirm] = useState(null);
  const [roleDeleteConfirm, setRoleDeleteConfirm] = useState(null);
  const [userRole, setUserRole] = useState('admin'); // 'admin', 'manager', 'user'
  const [organizationForm, setOrganizationForm] = useState({
    name: 'VoiceHub Tech',
    description: 'Leading technology company focused on communication solutions.',
    website: 'https://voicehub.com',
    contactEmail: 'contact@voicehub.com',
  });
  const [userProfileForm, setUserProfileForm] = useState({
    fullName: '',
    phone: '',
    email: '',
  });
  const [apiKeys, setApiKeys] = useState([
    { id: 'k1', name: 'Production API Key', created: '15/12/2025', lastUsed: '2h ago', value: 'vh_prod_xxxxxxxxxxxx' },
    { id: 'k2', name: 'Development API Key', created: '10/01/2026', lastUsed: '1d ago', value: 'vh_dev_xxxxxxxxxxxx' },
  ]);
  const [integrations, setIntegrations] = useState([
    { id: 'slack', name: 'Slack', icon: '💬', connected: true, color: 'from-cyan-600 to-teal-600' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', connected: false, color: 'from-blue-500 to-cyan-500' },
    { id: 'github', name: 'GitHub', icon: '🐙', connected: true, color: 'from-green-500 to-emerald-500' },
    { id: 'jira', name: 'Jira', icon: '📊', connected: false, color: 'from-orange-500 to-yellow-500' },
  ]);
  const [securitySettings, setSecuritySettings] = useState([
    { id: '2fa', checked: true },
    { id: 'strong-password', checked: true },
    { id: 'auto-logout', checked: false },
    { id: 'block-unknown-ip', checked: false },
    { id: 'new-device-email', checked: true },
  ]);
  const [notificationSettings, setNotificationSettings] = useState([
    { id: 'new-message', checked: true },
    { id: 'mention', checked: true },
    { id: 'new-task', checked: true },
    { id: 'deadline', checked: true },
    { id: 'email', checked: false },
    { id: 'mobile-push', checked: true },
  ]);
  const [privacySettings, setPrivacySettings] = useState({
    onlineStatus: 'everyone',
    directMessagePermission: 'everyone',
  });
  const [avatarUrl, setAvatarUrl] = useState('');
  const [roles, setRoles] = useState([
    { id: 'r1', name: 'Administrator', members: 3, permissions: 'Full access', color: 'from-red-500 to-orange-500', icon: '👑' },
    { id: 'r2', name: 'Department lead', members: 4, permissions: 'Manage department', color: 'from-cyan-600 to-teal-600', icon: '👔' },
    { id: 'r3', name: 'Team lead', members: 8, permissions: 'Manage team', color: 'from-blue-500 to-cyan-500', icon: '👨‍💼' },
    { id: 'r4', name: 'Member', members: 30, permissions: 'Basic', color: 'from-green-500 to-emerald-500', icon: '👷' },
  ]);
  const [roleEditorOpen, setRoleEditorOpen] = useState(false);
  const [editingRoleId, setEditingRoleId] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  /** Mongo ObjectId tổ chức đầu tiên — dùng cho roles API (không dùng placeholder kiểu org_123). */
  const [roleContextOrganizationId, setRoleContextOrganizationId] = useState(null);
  const [roleDraft, setRoleDraft] = useState({
    name: '',
    permissions: '',
    members: 0,
    color: 'from-cyan-600 to-teal-600',
    icon: '🧩'
  });

  /* ----- LOAD ROLES ON MOUNT ----- */
  useEffect(() => {
    fetchRoles();
  }, []);

  useEffect(() => {
    const orgData = localStorage.getItem('settings:organization');
    const userProfileData = localStorage.getItem('settings:userProfile');
    const apiKeyData = localStorage.getItem('settings:apiKeys');
    const integrationData = localStorage.getItem('settings:integrations');
    const securityData = localStorage.getItem('settings:security');
    const notificationData = localStorage.getItem('settings:notifications');
    const privacyData = localStorage.getItem('settings:privacy');
    const avatarData = localStorage.getItem('settings:avatar');

    if (orgData) setOrganizationForm(JSON.parse(orgData));
    if (userProfileData) {
      try {
        const parsed = JSON.parse(userProfileData);
        setUserProfileForm((prev) => ({
          ...prev,
          fullName:
            typeof parsed?.fullName === 'string' && parsed.fullName.trim()
              ? parsed.fullName.trim()
              : prev.fullName,
          phone:
            typeof parsed?.phone === 'string' && parsed.phone.trim()
              ? parsed.phone.trim()
              : prev.phone,
          email:
            typeof parsed?.email === 'string' && parsed.email.trim()
              ? parsed.email.trim()
              : prev.email || getJwtEmail(),
        }));
      } catch {
        /* ignore */
      }
    }
    if (apiKeyData) setApiKeys(JSON.parse(apiKeyData));
    if (integrationData) setIntegrations(JSON.parse(integrationData));
    if (securityData) {
      try {
        const parsed = JSON.parse(securityData);
        if (Array.isArray(parsed)) {
          setSecuritySettings(parsed.map((x) => ({ id: x.id, checked: Boolean(x.checked) })));
        }
      } catch {
        /* ignore */
      }
    }
    if (notificationData) {
      try {
        const parsed = JSON.parse(notificationData);
        if (Array.isArray(parsed)) {
          setNotificationSettings(parsed.map((x) => ({ id: x.id, checked: Boolean(x.checked) })));
        }
      } catch {
        /* ignore */
      }
    }
    if (privacyData) {
      try {
        const p = JSON.parse(privacyData);
        const mapPrivacy = (v, keys) => {
          if (keys.includes(v)) return v;
          if (v === 'M\u1ecdi ng\u01b0\u1eddi' || v === 'everyone') return 'everyone';
          if (v === 'Ch\u1ec9 \u0111\u1ed3ng nghi\u1ec7p' || v === 'colleagues') return 'colleagues';
          if (v === 'Kh\u00f4ng ai' || v === 'nobody') return 'nobody';
          return 'everyone';
        };
        setPrivacySettings({
          onlineStatus: mapPrivacy(p.onlineStatus, ['everyone', 'colleagues', 'nobody']),
          directMessagePermission: mapPrivacy(p.directMessagePermission, ['everyone', 'colleagues']),
        });
      } catch {
        /* ignore */
      }
    }
    if (avatarData) setAvatarUrl(avatarData);
  }, []);

  const fetchRoles = async () => {
    try {
      setRoleLoading(true);
      const orgPayload = await organizationAPI.getOrganizations();
      const orgListRaw = orgPayload?.data ?? orgPayload;
      const orgs = Array.isArray(orgListRaw) ? orgListRaw : [];
      const first = orgs[0];
      const oid = first?._id ?? first?.id;
      const idStr = oid != null ? String(oid) : '';
      if (!isValidMongoObjectId(idStr)) {
        setRoleContextOrganizationId(null);
        return;
      }
      setRoleContextOrganizationId(idStr);
      const response = await roleAPI.getRolesByOrganization(idStr);
      const raw = response?.data ?? response;
      const data = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
      if (data.length > 0) setRoles(data);
    } catch (err) {
      if (import.meta.env.DEV) console.warn('Settings: roles fetch skipped', err?.message);
    } finally {
      setRoleLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    setUserProfileForm((prev) => ({
      ...prev,
      fullName:
        user?.displayName || user?.fullName || user?.name || prev.fullName || t('settingsPage.userFallback'),
      phone: user?.phone || user?.phoneNumber || user?.mobile || prev.phone || '',
      email: user?.email || prev.email || getJwtEmail() || '',
    }));
  }, [user, t]);

  /** Bootstrap BFF không gửi phone — tải đầy đủ từ GET /users/me */
  useEffect(() => {
    const userId = user?.id || user?.userId || user?._id;
    if (!userId) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await userService.getMe();
        const data = unwrapApiData(res);
        if (cancelled || !data || typeof data !== 'object') return;
        const phoneValue = String(data.phone || data.phoneNumber || data.mobile || '').trim();
        setUserProfileForm((prev) => ({
          ...prev,
          fullName: data.displayName || data.fullName || data.name || prev.fullName,
          phone:
            phoneValue ||
            prev.phone ||
            user?.phone ||
            user?.phoneNumber ||
            user?.mobile ||
            '',
          email: data.email || prev.email || user?.email || getJwtEmail() || '',
        }));
        updateUser(
          mergeAuthUserFromProfile(user, {
            ...data,
            ...(phoneValue ? { phone: phoneValue } : {}),
          })
        );
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn('Settings: profile fetch skipped', err?.message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.userId, user?._id, updateUser]);

  useEffect(() => {
    localStorage.setItem('settings:apiKeys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  useEffect(() => {
    localStorage.setItem('settings:integrations', JSON.stringify(integrations));
  }, [integrations]);

  useEffect(() => {
    localStorage.setItem('settings:security', JSON.stringify(securitySettings));
  }, [securitySettings]);

  useEffect(() => {
    localStorage.setItem('settings:notifications', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  useEffect(() => {
    localStorage.setItem('settings:privacy', JSON.stringify(privacySettings));
  }, [privacySettings]);

  useEffect(() => {
    if (!avatarUrl) return;
    localStorage.setItem('settings:avatar', avatarUrl);
  }, [avatarUrl]);

  useEffect(() => {
    const nextTab = userRole === 'admin' ? 'general' : 'profile';
    setActiveTab(nextTab);
  }, [userRole]);

  const handleSaveOrganization = () => {
    localStorage.setItem('settings:organization', JSON.stringify(organizationForm));
    toast.success(t('settingsPage.toastSaveOrg'));
  };

  const handleSaveUserProfile = async () => {
    const nextEmail = String(userProfileForm.email || '').trim().toLowerCase();
    const currentEmail = String(user?.email || '').trim().toLowerCase();
    const payload = {
      displayName: String(userProfileForm.fullName || '').trim(),
      phone: String(userProfileForm.phone || '').trim(),
    };
    try {
      if (nextEmail && nextEmail !== currentEmail) {
        await authService.requestEmailChange(nextEmail);
      }
      const res = await userService.updateProfile(payload);
      const saved = unwrapApiData(res) || res?.data || res;
      updateUser(mergeAuthUserFromProfile(user, { ...payload, ...saved }));
      setUserProfileForm((prev) => ({
        ...prev,
        fullName: payload.displayName || prev.fullName,
        phone: saved?.phone || payload.phone || prev.phone,
      }));
      localStorage.setItem('settings:userProfile', JSON.stringify(userProfileForm));
      if (nextEmail && nextEmail !== currentEmail) {
        toast.success(t('settingsPage.toastEmailChangeRequested'));
      } else {
        toast.success(t('settingsPage.toastSaveProfile'));
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('errors.generic') }));
    }
  };

  const handleCopyApiKey = async (keyValue) => {
    try {
      await navigator.clipboard.writeText(keyValue);
      toast.success(t('settingsPage.toastCopyKey'));
    } catch (error) {
      toast.error(t('settingsPage.toastCopyFail'));
    }
  };

  const requestDeleteApiKey = (keyId) => {
    setApiKeyDeleteConfirm(keyId);
  };

  const confirmDeleteApiKey = () => {
    if (!apiKeyDeleteConfirm) return;
    setApiKeys((prev) => prev.filter((item) => item.id !== apiKeyDeleteConfirm));
    toast.success(t('settingsPage.toastDeleteKey'));
  };

  const handleRevokeSession = (sessionId) => {
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    toast.success(t('settingsPage.toastRevokeSession'));
  };

  const handleRevokeAllOtherSessions = () => {
    setSessions((prev) => prev.filter((s) => s.current));
    toast.success(t('settingsPage.toastRevokeAllSessions'));
  };

  const handleCreateApiKey = () => {
    const id = `k${Date.now()}`;
    const keyValue = `vh_${id}_${Math.random().toString(36).slice(2, 10)}`;
    setApiKeys((prev) => [
      {
        id,
        name: t('settingsPage.apiKeyGeneratedName', { n: prev.length + 1 }),
        created: new Date().toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN'),
        lastUsed: t('settingsPage.apiKeyNeverUsed'),
        value: keyValue,
      },
      ...prev,
    ]);
    toast.success(t('settingsPage.toastCreateKey'));
  };

  const handleToggleIntegration = (integrationId) => {
    setIntegrations((prev) => prev.map((item) => (
      item.id === integrationId ? { ...item, connected: !item.connected } : item
    )));
  };

  const handleToggleSecuritySetting = (settingId) => {
    setSecuritySettings((prev) => prev.map((item) => (
      item.id === settingId ? { ...item, checked: !item.checked } : item
    )));
  };

  const handleToggleNotificationSetting = (settingId) => {
    setNotificationSettings((prev) => prev.map((item) => (
      item.id === settingId ? { ...item, checked: !item.checked } : item
    )));
  };

  const handleAvatarChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      setAvatarUrl(result);
      toast.success(t('settingsPage.toastAvatar'));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleExportAuditLog = () => {
    const content = [
      t('settingsPage.auditExportHeader'),
      t('settingsPage.auditExportedAt', { iso: new Date().toISOString() }),
      '---',
      t('settingsPage.auditLog1'),
      t('settingsPage.auditLog2'),
      t('settingsPage.auditLog3'),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voicehub-audit-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('settingsPage.toastExportAudit'));
  };

  const handleExportInvoice = () => {
    const content = [
      t('settingsPage.invoiceExportHeader'),
      t('settingsPage.invoiceGeneratedAt', { iso: new Date().toISOString() }),
      t('settingsPage.invoicePlanLine'),
      t('settingsPage.invoiceMembersLine'),
      t('settingsPage.invoiceStorageLine'),
      t('settingsPage.invoiceMonthlyFeeLine'),
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voicehub-invoice-${Date.now()}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(t('settingsPage.toastExportInvoice'));
  };

  const handleContactBilling = () => {
    window.location.href = `mailto:billing@voicehub.com?subject=${encodeURIComponent(t('settingsPage.billingMailSubject'))}`;
  };

  const adminTabs = useMemo(
    () => [
      { id: 'general', label: t('settingsPage.tabGeneral'), icon: '⚙️' },
      { id: 'roles', label: t('settingsPage.tabRoles'), icon: '🔐' },
      { id: 'security', label: t('settingsPage.tabSecurity'), icon: '🛡️' },
      ...(hasBackendCapability('integrations') ? [{ id: 'integrations', label: t('settingsPage.tabIntegrations'), icon: '🔗' }] : []),
      ...(hasBackendCapability('billingInvoices') ? [{ id: 'billing', label: t('settingsPage.tabBilling'), icon: '💳' }] : []),
      ...(hasBackendCapability('auditLogs') ? [{ id: 'audit', label: t('settingsPage.tabAudit'), icon: '📜' }] : []),
    ],
    [t]
  );

  const userTabs = useMemo(
    () => [
      { id: 'profile', label: t('settingsPage.tabProfile'), icon: '👤' },
      { id: 'notifications', label: t('settingsPage.tabNotifications'), icon: '🔔' },
      { id: 'privacy', label: t('settingsPage.tabPrivacy'), icon: '🔒' },
      { id: 'appearance', label: t('settingsPage.tabAppearance'), icon: '🎨' },
    ],
    [t]
  );

  const currentTabs = userRole === 'admin' ? adminTabs : userTabs;

  const openCreateRoleEditor = () => {
    setEditingRoleId(null);
    setRoleDraft({
      name: '',
      permissions: '',
      members: 0,
      color: 'from-cyan-600 to-teal-600',
      icon: '🧩'
    });
    setRoleEditorOpen(true);
  };

  const openEditRoleEditor = (role) => {
    setEditingRoleId(role.id);
    setRoleDraft({
      name: role.name,
      permissions: role.permissions,
      members: role.members,
      color: role.color,
      icon: role.icon
    });
    setRoleEditorOpen(true);
  };

  const handleSaveRole = async () => {
    if (!roleDraft.name.trim() || !roleDraft.permissions.trim()) {
      toast.error(t('settingsPage.toastRoleFill'));
      return;
    }

    try {
      setRoleLoading(true);
      if (editingRoleId) {
        // Update existing role
        if (!roleContextOrganizationId) {
          toast.error(t('settingsPage.toastRoleNoOrg'));
          return;
        }
        await roleAPI.updateRole(editingRoleId, {
          name: roleDraft.name.trim(),
          permissions: roleDraft.permissions.trim(),
          color: roleDraft.color,
          icon: roleDraft.icon,
          serverId: roleContextOrganizationId,
          organizationId: roleContextOrganizationId
        });
        setRoles((prev) => prev.map((role) => (
          role.id === editingRoleId
            ? { ...role, ...roleDraft, members: Number(roleDraft.members) || 0 }
            : role
        )));
        toast.success(t('settingsPage.toastRoleUpdated'));
      } else {
        if (!roleContextOrganizationId) {
          toast.error(t('settingsPage.toastRoleNoOrg'));
          return;
        }
        const response = await roleAPI.createRole({
          name: roleDraft.name.trim(),
          permissions: roleDraft.permissions.trim(),
          serverId: roleContextOrganizationId,
          organizationId: roleContextOrganizationId,
          color: roleDraft.color,
          icon: roleDraft.icon
        });
        const wrapped = response?.data ?? response;
        const newRole = wrapped?.data ?? wrapped;
        setRoles((prev) => [
          ...prev,
          {
            id: newRole?._id || newRole?.id || `r${Date.now()}`,
            name: roleDraft.name,
            permissions: roleDraft.permissions,
            members: 0,
            color: roleDraft.color,
            icon: roleDraft.icon
          }
        ]);
        toast.success(t('settingsPage.toastRoleCreated'));
      }
      setRoleEditorOpen(false);
    } catch (error) {
      console.error('Error saving role:', error);
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('settingsPage.toastRoleErr') }));
    } finally {
      setRoleLoading(false);
    }
  };

  const requestDeleteRole = (roleId) => {
    setRoleDeleteConfirm(roleId);
  };

  const confirmDeleteRole = async () => {
    const roleId = roleDeleteConfirm;
    if (!roleId || !roleContextOrganizationId) return;
    try {
      setRoleLoading(true);
      await roleAPI.deleteRole(roleId, roleContextOrganizationId);
      setRoles((prev) => prev.filter((role) => role.id !== roleId));
      toast.success(t('settingsPage.toastRoleDeleted'));
    } catch (error) {
      console.error('Error deleting role:', error);
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('settingsPage.toastRoleDeleteErr') }));
    } finally {
      setRoleLoading(false);
    }
  };

  const auditEntries = useMemo(() => [], []);

  const suiteSettingsBody = (
    <SettingsFigmaLayout
      activeTab={figmaTab}
      onTabChange={setFigmaTab}
      userRoleLabel={uiRoleMeta.label}
      tabs={figmaSettingsTabs}
    >
      {figmaTab === 'profile' && (
        <div className="max-w-xl space-y-6">
          <div>
            <h2 className="mb-1 font-display text-xl font-bold text-foreground">{t('settingsPage.profileTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('settingsPage.pageSubtitleUser')}</p>
          </div>
          <div className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
            <div className="flex items-center gap-5">
              <UserAvatar
                avatar={avatarUrl || null}
                userId={user?.id || user?._id}
                name={userProfileForm.fullName || user?.displayName || user?.name}
                size="2xl"
              />
              <label className="inline-flex cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
                <span className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  {t('settingsPage.changeAvatar')}
                </span>
              </label>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">{t('settingsPage.fullName')}</label>
              <input
                type="text"
                value={userProfileForm.fullName}
                onChange={(e) => setUserProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
                className={FIGMA_SETTINGS_INPUT}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('settingsPage.email')}</label>
                <input
                  type="email"
                  value={userProfileForm.email}
                  onChange={(e) => setUserProfileForm((prev) => ({ ...prev, email: e.target.value }))}
                  className={FIGMA_SETTINGS_INPUT}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-foreground">{t('settingsPage.phone')}</label>
                <input
                  type="tel"
                  value={userProfileForm.phone}
                  onChange={(e) => setUserProfileForm((prev) => ({ ...prev, phone: e.target.value }))}
                  className={FIGMA_SETTINGS_INPUT}
                />
              </div>
            </div>
            <GradientButton variant="primary" onClick={handleSaveUserProfile}>
              {t('settingsPage.saveChanges')}
            </GradientButton>
          </div>
        </div>
      )}

      {figmaTab === 'capability' && <CapabilityProfilePanel />}

      {figmaTab === 'security' && (
        <div className="max-w-xl space-y-5">
          <div>
            <h2 className="mb-1 font-display text-xl font-bold text-foreground">{t('settingsPage.tabSecurity')}</h2>
            <p className="text-sm text-muted-foreground">{t('settingsPage.securityPolicyTitle')}</p>
          </div>
          <div className={`${FIGMA_SETTINGS_CARD} space-y-3`}>
            {securitySettings.map((setting) => (
              <label key={setting.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3">
                <span className="text-sm text-foreground">
                  {t(`settingsPage.${SECURITY_LABEL_KEYS[setting.id]}`)}
                </span>
                <input
                  type="checkbox"
                  checked={setting.checked}
                  onChange={() => handleToggleSecuritySetting(setting.id)}
                  className="h-5 w-5 rounded"
                />
              </label>
            ))}
          </div>
          <SettingsActiveSessions
            sessions={sessions}
            onRevokeSession={handleRevokeSession}
            onRevokeAllOthers={handleRevokeAllOtherSessions}
          />
        </div>
      )}

      {figmaTab === 'notifications' && (
        <div className="max-w-xl space-y-5">
          <h2 className="font-display text-xl font-bold text-foreground">{t('settingsPage.notifSettingsTitle')}</h2>
          <div className={`${FIGMA_SETTINGS_CARD} space-y-3`}>
            {notificationSettings.map((setting) => (
              <label key={setting.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-border bg-background p-3">
                <span className="text-sm text-foreground">{t(`settingsPage.${NOTIF_LABEL_KEYS[setting.id]}`)}</span>
                <input
                  type="checkbox"
                  checked={setting.checked}
                  onChange={() => handleToggleNotificationSetting(setting.id)}
                  className="h-5 w-5 rounded"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {figmaTab === 'api' && (
        <SettingsApiKeysPanel
          apiKeys={apiKeys}
          onCreate={handleCreateApiKey}
          onCopy={handleCopyApiKey}
          onDelete={requestDeleteApiKey}
          title={t('settingsPage.apiKeysTitle')}
          description={t('settingsPage.apiKeysDesc')}
          createLabel={t('settingsPage.createApiKey')}
        />
      )}

      {figmaTab === 'organization' && (
        <div className="max-w-xl space-y-5">
          <div>
            <h2 className="mb-1 font-display text-xl font-bold text-foreground">{t('settingsPage.orgInfoTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('settingsPage.pageSubtitleOrg')}</p>
          </div>
          <div className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">{t('settingsPage.orgName')}</label>
              <input
                type="text"
                value={organizationForm.name}
                onChange={(e) => setOrganizationForm((prev) => ({ ...prev, name: e.target.value }))}
                className={FIGMA_SETTINGS_INPUT}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-foreground">{t('settingsPage.orgDesc')}</label>
              <textarea
                className={`${FIGMA_SETTINGS_INPUT} h-auto min-h-[80px] py-2`}
                rows={3}
                value={organizationForm.description}
                onChange={(e) => setOrganizationForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
            <GradientButton variant="primary" onClick={handleSaveOrganization}>
              {t('settingsPage.saveChanges')}
            </GradientButton>
          </div>
        </div>
      )}

      {figmaTab === 'rbac' && <SettingsRbacMatrix />}

      {figmaTab === 'appearance' && (
        <div className="max-w-xl space-y-5">
          <h2 className="font-display text-xl font-bold text-foreground">{t('settingsPage.appearanceTitle')}</h2>
          <div className={`${FIGMA_SETTINGS_CARD} space-y-4`}>
            <label className="block text-sm font-medium text-foreground">{t('settingsPage.themeLabel')}</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'dark', name: t('settingsPage.themeDark'), icon: '🌙' },
                { id: 'light', name: t('settingsPage.themeLight'), icon: '☀️' },
              ].map((theme) => {
                const selected = theme.id === 'dark' ? isDarkMode : !isDarkMode;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => {
                      if (theme.id === 'dark' && !isDarkMode) toggleTheme();
                      if (theme.id === 'light' && isDarkMode) toggleTheme();
                      toast.success(t('settingsPage.toastTheme', { name: theme.name }));
                    }}
                    className={`rounded-xl border-2 p-4 text-left transition ${
                      selected ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted'
                    }`}
                  >
                    <div className="mb-2 text-3xl">{theme.icon}</div>
                    <div className="font-semibold text-foreground">{theme.name}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </SettingsFigmaLayout>
  );

  return (
    <>
      <div className={`${FIGMA_PAGE_SHELL} h-full overflow-hidden`}>{suiteSettingsBody}</div>
      <ConfirmDialog
        isOpen={apiKeyDeleteConfirm != null}
        onClose={() => setApiKeyDeleteConfirm(null)}
        onConfirm={confirmDeleteApiKey}
        title={t('settingsPage.confirmDeleteApiKeyTitle')}
        message={t('settingsPage.confirmDeleteApiKeyMsg')}
        confirmText={t('settingsPage.confirmOk')}
        cancelText={t('settingsPage.cancel')}
      />
      <ConfirmDialog
        isOpen={roleDeleteConfirm != null}
        onClose={() => setRoleDeleteConfirm(null)}
        onConfirm={confirmDeleteRole}
        title={t('settingsPage.confirmDeleteRoleTitle')}
        message={t('settingsPage.confirmDeleteRoleMsg')}
        confirmText={t('settingsPage.confirmOk')}
        cancelText={t('settingsPage.cancel')}
      />
    </>
  );
}



export default SettingsPage;

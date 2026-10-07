import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Bell,
  Building2,
  CreditCard,
  FileText,
  Lock,
  Palette,
  Settings,
  Shield,
  User,
} from 'lucide-react';
import { ConfirmDialog, Modal, GlassCard, GradientButton } from '../Shared';
import {
  FIGMA_PAGE_CARD,
  FIGMA_PAGE_HEADER,
  FIGMA_PAGE_SUBTITLE,
  FIGMA_PAGE_TITLE,
  FIGMA_TAB_ACTIVE,
  FIGMA_TAB_INACTIVE,
} from '../Layout/figmaPageClasses';
import OrganizationSettingsFigmaLayout from './OrganizationSettingsFigmaLayout';
import { useAuth } from '../../context/AuthContext';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { fetchOrganizationDetail } from '../../hooks/useOrganizationDetail';
import { queryKeys } from '../../lib/queryKeys';
import { STALE_TIME_ORG_DETAIL_MS } from '../../lib/queryClient';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import OrganizationRbacSettings from './OrganizationRbacSettings';
import {
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminListSkeleton, AdminLoadErrorState } from '../adminUsers/adminPanelStates';
import { hasBackendCapability } from '../../config/backendCapabilities';
import {
  enrichMembershipsWithProfiles,
  enrichUserIdsWithProfiles,
} from '../../features/search/enrichOrgMembers';

const ADMIN_TAB_ICONS = {
  general: Settings,
  structure: Building2,
  roles: Shield,
  security: Lock,
  integrations: FileText,
  billing: CreditCard,
  audit: FileText,
};

const MEMBER_TAB_ICONS = {
  profile: User,
  notifications: Bell,
  privacy: Lock,
  appearance: Palette,
};

function buildAdminTabs(t) {
  return [
    { id: 'general', label: t('organizationSettings.tabGeneral'), icon: '⚙️' },
    { id: 'structure', label: t('organizationSettings.tabStructure'), icon: '🏢' },
    { id: 'roles', label: t('organizationSettings.tabRoles'), icon: '🔐' },
    { id: 'security', label: t('organizationSettings.tabSecurity'), icon: '🛡️' },
    ...(hasBackendCapability('integrations')
      ? [{ id: 'integrations', label: t('organizationSettings.tabIntegrations'), icon: '🔗' }]
      : []),
    ...(hasBackendCapability('billingInvoices')
      ? [{ id: 'billing', label: t('organizationSettings.tabBilling'), icon: '💳' }]
      : []),
    ...(hasBackendCapability('auditLogs')
      ? [{ id: 'audit', label: t('organizationSettings.tabAudit'), icon: '📜' }]
      : []),
  ];
}

function buildMemberTabs(t) {
  return [
    { id: 'profile', label: t('organizationSettings.tabProfile'), icon: '👤' },
    { id: 'notifications', label: t('organizationSettings.tabNotifications'), icon: '🔔' },
    { id: 'privacy', label: t('organizationSettings.tabPrivacy'), icon: '🔒' },
    { id: 'appearance', label: t('organizationSettings.tabAppearance'), icon: '🎨' },
  ];
}

const SECURITY_SETTING_DEFS = [
  { id: '2fa', labelKey: 'security2fa', checked: false },
  { id: 'strong-password', labelKey: 'securityStrongPassword', checked: false },
];

const NOTIFICATION_SETTING_DEFS = [
  { id: 'new-message', labelKey: 'notifNewMessage', checked: true },
  { id: 'mention', labelKey: 'notifMention', checked: true },
  { id: 'email', labelKey: 'notifEmail', checked: false },
];

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePrivacyValue(value) {
  const v = String(value || '').trim();
  if (v === 'everyone' || v === 'colleagues' || v === 'nobody') return v;

  // Backward-compat: map legacy Vietnamese privacy labels -> canonical enum values.
  const norm = stripDiacritics(v).toLowerCase();
  if (norm === 'everyone' || norm === 'moi nguoi') return 'everyone';
  if (norm === 'colleagues only' || norm === 'chi dong nghiep') return 'colleagues';
  if (norm === 'nobody' || norm === 'khong ai') return 'nobody';

  return 'everyone';
}

const ORG_NAME_MAX_LENGTH = 120;
const DESCRIPTION_MAX_LENGTH = 1000;
const UNIT_NAME_MAX_LENGTH = 120;
const STRUCTURE_SELECT_CLASS = adminInputClass('mt-1');
const STRUCTURE_INLINE_INPUT_CLASS = adminInputClass('py-2');

function RenameUnitCard({ title, value, onChange, placeholder, busy, disabled, onSave, saveLabel, leading = null }) {
  return (
    <div className="rounded-xl border border-border bg-muted p-3">
      <div className="mb-2 text-sm font-semibold text-foreground">{title}</div>
      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
        {leading}
        <input
          value={value}
          maxLength={UNIT_NAME_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={title}
          className={STRUCTURE_INLINE_INPUT_CLASS}
        />
        <button
          type="button"
          onClick={onSave}
          disabled={disabled || !String(value || '').trim()}
          aria-busy={busy}
          className={adminPrimaryBtnClass('shrink-0 py-2')}
        >
          <AdminBusySpinner busy={busy} />
          {saveLabel}
        </button>
      </div>
    </div>
  );
}

function ChannelPermBadge({ label, on, t }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
        on ? 'bg-success-bg text-success' : 'bg-muted text-muted-foreground'
      }`}
    >
      {label}: {on ? t('organizationSettings.permYes') : t('organizationSettings.permNo')}
    </span>
  );
}

const storageKey = (orgId, key) => `orgSettings:${orgId}:${key}`;

const unwrap = (payload) => payload?.data ?? payload;

/**
 * Owner / Admin: toàn bộ mục quản trị. Member: chỉ Hồ sơ / Thông báo / …
 * Full màn hình: sidebar trái (mục) + vùng nội dung phải.
 */
function OrganizationSettingsPanel({
  organization,
  onBack,
  onOrganizationUpdated,
  onOrganizationDeleted,
  initialTab = null,
  suiteLayout = false,
  /** Nhúng trong CompanyAdminConsole — chỉ render nội dung tab */
  hideChrome = false,
  /** Khóa một tab (structure | roles | …) */
  lockTab = null,
  /** Single-company: ẩn UI chọn chi nhánh */
  hideBranchUi = false,
}) {
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuth();
  const orgId = organization?._id || organization?.id;
  const myRole = String(organization?.myRole || 'member').toLowerCase();

  const isOrgOwnerOrAdmin = useMemo(
    () => myRole === 'owner' || myRole === 'admin',
    [myRole]
  );
  const isFullAccess = isOrgOwnerOrAdmin;
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canCreateTeam = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.TEAM_CREATE);

  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('general');

  const selectTab = useCallback(
    (tabId) => {
      setActiveTab(tabId);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId && tabId !== 'general') next.set('tab', tabId);
          else next.delete('tab');
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
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

  const [integrations] = useState([
    { id: 'slack', name: 'Slack', icon: '💬', connected: false, color: 'from-purple-600 to-pink-600' },
    { id: 'gdrive', name: 'Google Drive', icon: '📁', connected: false, color: 'from-blue-500 to-cyan-500' },
  ]);
  const [securitySettings, setSecuritySettings] = useState(() =>
    SECURITY_SETTING_DEFS.map((s) => ({ id: s.id, checked: s.checked }))
  );
  const [notificationSettings, setNotificationSettings] = useState(() =>
    NOTIFICATION_SETTING_DEFS.map((s) => ({ id: s.id, checked: s.checked }))
  );
  const [privacySettings, setPrivacySettings] = useState({
    onlineStatus: 'everyone',
    directMessagePermission: 'everyone',
  });
  const [themeMode, setThemeMode] = useState('dark');
  const [avatarUrl, setAvatarUrl] = useState('');
  /** Tên tổ chức từ API — dùng để so khớp khi xóa (không phụ thuộc chỉnh sửa form chưa lưu). */
  const [serverOrgName, setServerOrgName] = useState('');
  const [deleteOrgModalOpen, setDeleteOrgModalOpen] = useState(false);
  const [deleteOrgNameInput, setDeleteOrgNameInput] = useState('');
  const [deletingOrg, setDeletingOrg] = useState(false);

  const [structureLoading, setStructureLoading] = useState(false);
  const [structureBranches, setStructureBranches] = useState([]);
  const [manageBranchId, setManageBranchId] = useState('');
  const [manageDivisionId, setManageDivisionId] = useState('');
  const [manageDepartmentId, setManageDepartmentId] = useState('');
  const [manageTeamId, setManageTeamId] = useState('');
  const [createDivisionName, setCreateDivisionName] = useState('');
  const [createDivisionBranchId, setCreateDivisionBranchId] = useState('');
  const [createDivisionModalOpen, setCreateDivisionModalOpen] = useState(false);
  const [createDepartmentName, setCreateDepartmentName] = useState('');
  const [createDepartmentBranchId, setCreateDepartmentBranchId] = useState('');
  const [createDepartmentDivisionId, setCreateDepartmentDivisionId] = useState('');
  const [createDepartmentModalOpen, setCreateDepartmentModalOpen] = useState(false);
  const [createTeamName, setCreateTeamName] = useState('');
  const [createTeamBranchId, setCreateTeamBranchId] = useState('');
  const [createTeamDivisionId, setCreateTeamDivisionId] = useState('');
  const [createTeamDepartmentId, setCreateTeamDepartmentId] = useState('');
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [createChannelName, setCreateChannelName] = useState('');
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelLevel, setCreateChannelLevel] = useState('team');
  const [createChannelBranchId, setCreateChannelBranchId] = useState('');
  const [createChannelDivisionId, setCreateChannelDivisionId] = useState('');
  const [createChannelDepartmentId, setCreateChannelDepartmentId] = useState('');
  const [createChannelTeamId, setCreateChannelTeamId] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [renameDivisionName, setRenameDivisionName] = useState('');
  const [renameDepartmentName, setRenameDepartmentName] = useState('');
  const [renameTeamName, setRenameTeamName] = useState('');
  const [renameChannelId, setRenameChannelId] = useState('');
  const [renameChannelName, setRenameChannelName] = useState('');
  const [orgMembers, setOrgMembers] = useState([]);
  const [accessRows, setAccessRows] = useState([]);
  const [accessUserId, setAccessUserId] = useState('');
  const [accessCanRead, setAccessCanRead] = useState(true);
  const [accessCanWrite, setAccessCanWrite] = useState(false);
  const [accessCanVoice, setAccessCanVoice] = useState(false);
  const [structureLoadError, setStructureLoadError] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);
  const [creatingKey, setCreatingKey] = useState('');
  const [renamingKey, setRenamingKey] = useState('');
  const [grantingAccess, setGrantingAccess] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const expectedOrgNameForDelete = useMemo(() => {
    const fromServer = serverOrgName?.trim();
    if (fromServer) return fromServer;
    return String(organization?.name || '').trim();
  }, [serverOrgName, organization?.name]);

  const orgNameMissing = !String(organizationForm.name || '').trim();
  const deleteNameMatches =
    expectedOrgNameForDelete.length > 0 &&
    deleteOrgNameInput.trim() === expectedOrgNameForDelete;

  const loadOrgFromApi = useCallback(async () => {
    if (!orgId) return;
    setLoadingOrg(true);
    try {
      const o = await queryClient.fetchQuery({
        queryKey: queryKeys.org.detail(String(orgId)),
        queryFn: () => fetchOrganizationDetail(orgId),
        staleTime: STALE_TIME_ORG_DETAIL_MS,
      });
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
  }, [orgId, organization?.name, queryClient]);

  const loadStructure = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    setStructureLoading(true);
    setStructureLoadError('');
    try {
      const payload = await organizationAPI.getStructure(orgId);
      const raw = unwrap(payload);
      const branches = Array.isArray(raw?.branches) ? raw.branches : Array.isArray(raw) ? raw : [];
      setStructureBranches(branches);
      const firstBranchId = branches[0]?._id ? String(branches[0]._id) : '';
      const firstDivisionId = branches[0]?.divisions?.[0]?._id
        ? String(branches[0].divisions[0]._id)
        : '';
      const firstDepartmentId = branches[0]?.divisions?.[0]?.departments?.[0]?._id
        ? String(branches[0].divisions[0].departments[0]._id)
        : '';
      const firstTeamId = branches[0]?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id
        ? String(branches[0].divisions[0].departments[0].teams[0]._id)
        : '';
      setManageBranchId((prev) => prev || firstBranchId);
      setManageDivisionId((prev) => prev || firstDivisionId);
      setManageDepartmentId((prev) => prev || firstDepartmentId);
      setManageTeamId((prev) => prev || firstTeamId);
    } catch (e) {
      setStructureBranches([]);
      setStructureLoadError(
        resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.structureLoadFail') })
      );
    } finally {
      setStructureLoading(false);
    }
  }, [orgId, isFullAccess, t]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadStructure();
  }, [orgId, isFullAccess, activeTab, loadStructure]);

  useEffect(() => {
    if (!orgId) return;
    const first = lockTab || (isFullAccess ? 'general' : 'profile');
    const allowed = (isFullAccess ? buildAdminTabs(t) : buildMemberTabs(t)).map((tab) => tab.id);
    const urlTab = lockTab || searchParams.get('tab') || initialTab;
    const nextTab = urlTab && allowed.includes(urlTab) ? urlTab : first;
    setActiveTab(nextTab);
    loadOrgFromApi();

    try {
      const raw = localStorage.getItem(storageKey(orgId, 'memberPrefs'));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.notificationSettings) setNotificationSettings(parsed.notificationSettings);
        if (parsed.privacySettings) {
          setPrivacySettings({
            onlineStatus: normalizePrivacyValue(parsed.privacySettings.onlineStatus),
            directMessagePermission: normalizePrivacyValue(
              parsed.privacySettings.directMessagePermission
            ),
          });
        }
        if (parsed.themeMode) setThemeMode(parsed.themeMode);
      }
    } catch {
      /* ignore */
    }
  }, [orgId, isFullAccess, initialTab, lockTab, searchParams, loadOrgFromApi, t]);

  useEffect(() => {
    if (!user) return;
    setUserProfileForm({
      fullName: user?.displayName || user?.fullName || user?.name || '',
      phone: user?.phone || '',
    });
  }, [user, orgId]);

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
      toast.success(t('organizationSettings.orgDeleted'));
      setDeleteOrgModalOpen(false);
      setDeleteOrgNameInput('');
      onOrganizationDeleted?.(orgId);
    } catch (e) {
      toast.error(resolveApiErrorMessage(e, { t, fallback: t('organizationSettings.orgDeleteFail') }));
    } finally {
      setDeletingOrg(false);
    }
  };

  const handleSaveOrganization = async () => {
    if (!orgId || !organizationForm.name?.trim()) {
      toast.error(t('organizationSettings.orgNameRequired'));
      return;
    }
    try {
      const trimmedName = organizationForm.name.trim();
      await organizationAPI.updateOrganization(orgId, {
        name: trimmedName,
        description: organizationForm.description,
      });
      setServerOrgName(trimmedName);
      toast.success(t('organizationSettings.orgSaved'));
      onOrganizationUpdated?.();
    } catch {
      toast.error(t('organizationSettings.orgUpdateFail'));
    }
  };

  const handleSaveUserProfile = () => {
    updateUser({ displayName: userProfileForm.fullName, phone: userProfileForm.phone });
    persistMemberPrefs();
    toast.success(t('organizationSettings.profileUpdated'));
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
      toast.success(t('organizationSettings.avatarUpdated'));
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const manageBranch = useMemo(
    () => structureBranches.find((b) => String(b._id) === String(manageBranchId)) || null,
    [structureBranches, manageBranchId]
  );
  const manageDivisions = Array.isArray(manageBranch?.divisions) ? manageBranch.divisions : [];
  const manageDivision =
    manageDivisions.find((d) => String(d._id) === String(manageDivisionId)) || null;
  const manageDepartments = Array.isArray(manageDivision?.departments) ? manageDivision.departments : [];
  const manageDepartment =
    manageDepartments.find((d) => String(d._id) === String(manageDepartmentId)) || null;
  const manageTeams = Array.isArray(manageDepartment?.teams) ? manageDepartment.teams : [];
  const manageTeam = manageTeams.find((t) => String(t._id) === String(manageTeamId)) || null;
  const manageDivisionChannels = Array.isArray(manageDivision?.channels) ? manageDivision.channels : [];
  const manageDepartmentChannels = Array.isArray(manageDepartment?.channels) ? manageDepartment.channels : [];
  const manageTeamChannels = Array.isArray(manageTeam?.channels) ? manageTeam.channels : [];
  const manageChannels = [
    ...manageDivisionChannels.map((ch) => ({ ...ch, __scope: 'division' })),
    ...manageDepartmentChannels.map((ch) => ({ ...ch, __scope: 'department' })),
    ...manageTeamChannels.map((ch) => ({ ...ch, __scope: 'team' })),
  ];

  const resolveBranchById = (branchId) =>
    structureBranches.find((b) => String(b._id) === String(branchId)) || null;
  const resolveDivisionById = (branchId, divisionId) =>
    (resolveBranchById(branchId)?.divisions || []).find(
      (d) => String(d._id) === String(divisionId)
    ) || null;
  const resolveDepartmentById = (branchId, divisionId, departmentId) =>
    (resolveDivisionById(branchId, divisionId)?.departments || []).find(
      (d) => String(d._id) === String(departmentId)
    ) || null;
  const createDepartmentBranch = resolveBranchById(createDepartmentBranchId);
  const createDepartmentDivisions = Array.isArray(createDepartmentBranch?.divisions)
    ? createDepartmentBranch.divisions
    : [];
  const createTeamBranch = resolveBranchById(createTeamBranchId);
  const createTeamDivisions = Array.isArray(createTeamBranch?.divisions) ? createTeamBranch.divisions : [];
  const createTeamDivision =
    createTeamDivisions.find((d) => String(d._id) === String(createTeamDivisionId)) || null;
  const createTeamDepartments = Array.isArray(createTeamDivision?.departments)
    ? createTeamDivision.departments
    : [];
  const createChannelBranch = resolveBranchById(createChannelBranchId);
  const createChannelDivisions = Array.isArray(createChannelBranch?.divisions)
    ? createChannelBranch.divisions
    : [];
  const createChannelDivision =
    createChannelDivisions.find((d) => String(d._id) === String(createChannelDivisionId)) || null;
  const createChannelDepartments = Array.isArray(createChannelDivision?.departments)
    ? createChannelDivision.departments
    : [];
  const createChannelDepartment =
    createChannelDepartments.find((d) => String(d._id) === String(createChannelDepartmentId)) || null;
  const createChannelTeams = Array.isArray(createChannelDepartment?.teams)
    ? createChannelDepartment.teams
    : [];

  const openCreateDivisionModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    if (!fallbackBranchId) {
      toast.error(t('organizationSettings.noBranchForDivision'));
      return;
    }
    setCreateDivisionBranchId(fallbackBranchId);
    setCreateDivisionName('');
    setCreateDivisionModalOpen(true);
  };

  const handleCreateDivision = async () => {
    if (!orgId || !createDivisionBranchId || !createDivisionName.trim()) return;
    try {
      await organizationAPI.createDivision(orgId, createDivisionBranchId, {
        name: createDivisionName.trim(),
      });
      setCreateDivisionName('');
      setCreateDivisionModalOpen(false);
      await loadStructure();
      toast.success(t('organizationSettings.divisionCreated'));
    } catch {
      toast.error(t('organizationSettings.divisionCreateFail'));
    }
  };

  const openCreateDepartmentModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId) {
      toast.error(t('organizationSettings.needBranchDivisionForDept'));
      return;
    }
    setCreateDepartmentBranchId(fallbackBranchId);
    setCreateDepartmentDivisionId(fallbackDivisionId);
    setCreateDepartmentName('');
    setCreateDepartmentModalOpen(true);
  };

  const handleCreateDepartment = async () => {
    if (!orgId || !createDepartmentDivisionId || !createDepartmentName.trim()) return;
    try {
      await organizationAPI.createDepartmentByDivision(orgId, createDepartmentDivisionId, {
        name: createDepartmentName.trim(),
      });
      setCreateDepartmentName('');
      setCreateDepartmentModalOpen(false);
      await loadStructure();
      toast.success(t('organizationSettings.departmentCreated'));
    } catch {
      toast.error(t('organizationSettings.departmentCreateFail'));
    }
  };

  const openCreateTeamModal = () => {
    if (!canCreateTeam) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    const division = resolveDivisionById(fallbackBranchId, fallbackDivisionId);
    const fallbackDepartmentId =
      manageDepartmentId ||
      (division?.departments?.[0]?._id ? String(division.departments[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId || !fallbackDepartmentId) {
      toast.error(t('organizationSettings.needFullStructureForTeam'));
      return;
    }
    setCreateTeamBranchId(fallbackBranchId);
    setCreateTeamDivisionId(fallbackDivisionId);
    setCreateTeamDepartmentId(fallbackDepartmentId);
    setCreateTeamName('');
    setCreateTeamModalOpen(true);
  };

  const handleCreateTeam = async () => {
    if (!canCreateTeam) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    if (!orgId || !createTeamDepartmentId || !createTeamName.trim()) return;
    try {
      await organizationAPI.createTeamByDepartment(orgId, createTeamDepartmentId, {
        name: createTeamName.trim(),
      });
      setCreateTeamName('');
      setCreateTeamModalOpen(false);
      await loadStructure();
      toast.success(t('organizationSettings.teamCreated'));
    } catch {
      toast.error(t('organizationSettings.teamCreateFail'));
    }
  };

  const openCreateChannelModal = () => {
    const fallbackBranchId =
      manageBranchId || (structureBranches[0]?._id ? String(structureBranches[0]._id) : '');
    const branch = resolveBranchById(fallbackBranchId);
    const fallbackDivisionId =
      manageDivisionId || (branch?.divisions?.[0]?._id ? String(branch.divisions[0]._id) : '');
    const division = resolveDivisionById(fallbackBranchId, fallbackDivisionId);
    const fallbackDepartmentId =
      manageDepartmentId ||
      (division?.departments?.[0]?._id ? String(division.departments[0]._id) : '');
    const department = resolveDepartmentById(
      fallbackBranchId,
      fallbackDivisionId,
      fallbackDepartmentId
    );
    const fallbackTeamId =
      manageTeamId || (department?.teams?.[0]?._id ? String(department.teams[0]._id) : '');
    if (!fallbackBranchId || !fallbackDivisionId) {
      toast.error(t('organizationSettings.needBranchDivisionForChannel'));
      return;
    }
    setCreateChannelLevel('team');
    setCreateChannelBranchId(fallbackBranchId);
    setCreateChannelDivisionId(fallbackDivisionId);
    setCreateChannelDepartmentId(fallbackDepartmentId);
    setCreateChannelTeamId(fallbackTeamId);
    setCreateChannelType('chat');
    setCreateChannelName('');
    setCreateChannelModalOpen(true);
  };

  const handleCreateChannel = async () => {
    if (!orgId || !createChannelName.trim()) return;
    if (createChannelLevel === 'division' && !createChannelDivisionId) {
      toast.error(t('organizationSettings.selectDivision'));
      return;
    }
    if (createChannelLevel === 'department' && !createChannelDepartmentId) {
      toast.error(t('organizationSettings.selectDepartment'));
      return;
    }
    if (createChannelLevel === 'team' && !createChannelTeamId) {
      toast.error(t('organizationSettings.selectTeam'));
      return;
    }
    try {
      await organizationAPI.createChannelByScope(orgId, {
        level: createChannelLevel,
        branchId: createChannelBranchId || null,
        divisionId: createChannelDivisionId || null,
        departmentId: createChannelDepartmentId || null,
        teamId: createChannelTeamId || null,
        name: createChannelName.trim(),
        type: createChannelType,
      });
      setCreateChannelName('');
      setCreateChannelModalOpen(false);
      await loadStructure();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('vh:org-structure-changed', { detail: { orgId } })
        );
      }
      toast.success(t('organizationSettings.channelCreated'));
    } catch {
      toast.error(t('organizationSettings.channelCreateFail'));
    }
  };
  const handleRenameDivision = async () => {
    if (!orgId || !manageDivisionId || !renameDivisionName.trim()) return;
    try {
      await organizationAPI.updateDivision(orgId, manageDivisionId, { name: renameDivisionName.trim() });
      await loadStructure();
      toast.success(t('organizationSettings.divisionRenamed'));
    } catch {
      toast.error(t('organizationSettings.divisionRenameFail'));
    }
  };
  const handleRenameDepartment = async () => {
    if (!orgId || !manageDepartmentId || !renameDepartmentName.trim()) return;
    try {
      await organizationAPI.updateDepartment(orgId, manageDepartmentId, {
        name: renameDepartmentName.trim(),
      });
      await loadStructure();
      toast.success(t('organizationSettings.departmentRenamed'));
    } catch {
      toast.error(t('organizationSettings.departmentRenameFail'));
    }
  };
  const handleRenameTeam = async () => {
    if (!orgId || !manageTeamId || !renameTeamName.trim()) return;
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, manageTeamId, { name: renameTeamName.trim() });
      await loadStructure();
      toast.success(t('organizationSettings.teamRenamed'));
    } catch {
      toast.error(t('organizationSettings.teamRenameFail'));
    }
  };
  const handleRenameChannel = async () => {
    if (!orgId || !renameChannelId || !renameChannelName.trim()) return;
    try {
      await organizationAPI.updateChannelByScope(orgId, renameChannelId, {
        name: renameChannelName.trim(),
      });
      await loadStructure();
      toast.success(t('organizationSettings.channelRenamed'));
    } catch {
      toast.error(t('organizationSettings.channelRenameFail'));
    }
  };

  const loadOrgMembers = useCallback(async () => {
    if (!orgId || !isFullAccess) return;
    try {
      const payload = await organizationAPI.getMembers(orgId);
      const raw = unwrap(payload);
      const rows = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      const enriched = await enrichMembershipsWithProfiles(rows, {
        fallback: t('organizations.memberFallbackShort'),
        limit: 120,
      });
      setOrgMembers(enriched);
    } catch {
      setOrgMembers([]);
    }
  }, [orgId, isFullAccess, t]);

  const loadChannelAccessRows = useCallback(async () => {
    if (!orgId || !renameChannelId) {
      setAccessRows([]);
      return;
    }
    try {
      const payload = await organizationAPI.listChannelAccess(orgId, renameChannelId);
      const raw = unwrap(payload);
      const data = raw?.data ?? raw;
      const accesses = Array.isArray(data?.accesses) ? data.accesses : [];
      const profileById = await enrichUserIdsWithProfiles(
        accesses.map((row) => row?.user),
        { fallback: t('organizations.memberFallbackShort') }
      );
      setAccessRows(
        accesses.map((row) => {
          const uid = String(row?.user || '');
          const profile = profileById[uid];
          return {
            ...row,
            userId: uid,
            displayName: profile?.displayName || uid.slice(-6) || '—',
          };
        })
      );
    } catch {
      setAccessRows([]);
    }
  }, [orgId, renameChannelId, t]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadOrgMembers();
  }, [orgId, isFullAccess, activeTab, loadOrgMembers]);

  useEffect(() => {
    if (!orgId || !isFullAccess || activeTab !== 'structure') return;
    loadChannelAccessRows();
  }, [orgId, isFullAccess, activeTab, loadChannelAccessRows]);

  const handleGrantChannelAccess = async () => {
    if (!orgId || !renameChannelId || !accessUserId) return;
    try {
      await organizationAPI.grantChannelAccess(orgId, renameChannelId, {
        userId: accessUserId,
        permissions: {
          canRead: accessCanRead,
          canWrite: accessCanWrite,
          canVoice: accessCanVoice,
        },
      });
      await loadChannelAccessRows();
      toast.success(t('organizationSettings.channelAccessGranted'));
    } catch {
      toast.error(t('organizationSettings.channelAccessGrantFail'));
    }
  };

  const handleRevokeChannelAccess = async (userId) => {
    if (!orgId || !renameChannelId || !userId) return;
    try {
      await organizationAPI.revokeChannelAccess(orgId, renameChannelId, { userId });
      await loadChannelAccessRows();
      toast.success(t('organizationSettings.channelAccessRevoked'));
    } catch {
      toast.error(t('organizationSettings.channelAccessRevokeFail'));
    }
  };

  const runWithBusy = async (setBusy, busyValue, idleValue, action) => {
    setBusy(busyValue);
    try {
      await action();
    } finally {
      setBusy(idleValue);
    }
  };
  const saveOrganizationWithBusy = () => runWithBusy(setSavingOrg, true, false, handleSaveOrganization);
  const createWithBusy = (key, action) => runWithBusy(setCreatingKey, key, '', action);
  const renameWithBusy = (key, action) => runWithBusy(setRenamingKey, key, '', action);
  const grantAccessWithBusy = () => runWithBusy(setGrantingAccess, true, false, handleGrantChannelAccess);

  const tabs = isFullAccess ? buildAdminTabs(t) : buildMemberTabs(t);
  const tabIconMap = isFullAccess ? ADMIN_TAB_ICONS : MEMBER_TAB_ICONS;
  const figmaTabs = useMemo(
    () => tabs.map((tab) => ({ ...tab, Icon: tabIconMap[tab.id] })),
    [tabs, tabIconMap]
  );
  const roleLabel =
    myRole === 'owner'
      ? t('organizationSettings.roleOwner')
      : myRole === 'admin'
        ? t('organizationSettings.roleAdmin')
        : myRole === 'hr'
          ? t('organizationSettings.roleHr')
          : t('organizationSettings.roleMember');
  const roleHint = !isFullAccess ? t('organizationSettings.roleHintMember') : '';

  const gc = suiteLayout ? FIGMA_PAGE_CARD : 'border border-border bg-slate-900/60';
  const rootShell = suiteLayout
    ? 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-contain bg-background text-foreground'
    : 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-contain bg-background text-slate-100';
  const pageHeader = suiteLayout
    ? `shrink-0 border-b border-border bg-surface px-4 py-4 md:px-8 ${FIGMA_PAGE_HEADER}`
    : 'shrink-0 border-b border-white/[0.08] px-4 py-4 md:px-8';
  const backLinkCls = suiteLayout
    ? 'mb-3 text-sm text-primary hover:text-primary/80 hover:underline'
    : 'mb-3 text-sm text-cyan-400/90 hover:text-cyan-300 hover:underline';
  const asideShell = suiteLayout
    ? 'scrollbar-org-settings hidden w-56 shrink-0 overflow-y-auto border-b border-border bg-muted/30 py-4 overscroll-y-contain md:block md:border-b-0 md:border-r lg:w-64'
    : 'scrollbar-org-settings hidden w-56 shrink-0 overflow-y-auto border-b border-white/[0.08] bg-[#06080d] py-4 overscroll-y-contain md:block md:border-b-0 md:border-r lg:w-64';
  const tabActiveCls = suiteLayout
    ? `${FIGMA_TAB_ACTIVE} flex w-full items-center gap-3 text-left`
    : 'flex w-full items-center gap-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2.5 text-left text-sm font-semibold text-white shadow-lg';
  const tabInactiveCls = suiteLayout
    ? `flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${FIGMA_TAB_INACTIVE}`
    : 'flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm font-semibold text-muted-foreground transition-all hover:border-white/10 hover:bg-white/[0.04] hover:text-white';
  const mobileTabBar = suiteLayout
    ? 'shrink-0 border-b border-border bg-muted/30 px-2 py-2 md:hidden'
    : 'shrink-0 border-b border-white/[0.08] bg-[#080a10] px-2 py-2 md:hidden';

  if (!organization) return null;

  const tabPanels = (
    <>
              {loadingOrg && isFullAccess && (
                <p className="mb-4 text-sm text-muted-foreground">{t('organizationSettings.loadingOrgInfo')}</p>
              )}

          {/* ——— Admin ——— */}
          {isFullAccess && activeTab === 'general' && (
            <div className="mx-auto max-w-4xl space-y-4">
              <GlassCard className={gc}>
                <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.orgInfoTitle')}</h3>
                <div className="space-y-3">
                  <div>
                    <label htmlFor="org-settings-name" className={adminLabelClass()}>
                      {t('organizationSettings.orgNameLabel')}
                    </label>
                    <input
                      id="org-settings-name"
                      value={organizationForm.name}
                      maxLength={ORG_NAME_MAX_LENGTH}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, name: e.target.value }))
                      }
                      aria-invalid={orgNameMissing || undefined}
                      aria-describedby={orgNameMissing ? 'org-settings-name-error' : undefined}
                      className={adminInputClass(orgNameMissing ? 'border-destructive' : '')}
                    />
                    {orgNameMissing ? (
                      <p id="org-settings-name-error" className="mt-1 text-xs text-destructive">
                        {t('organizationSettings.orgNameRequired')}
                      </p>
                    ) : null}
                  </div>
                  <div>
                    <label htmlFor="org-settings-description" className={adminLabelClass()}>
                      {t('organizationSettings.descriptionLabel')}
                    </label>
                    <textarea
                      id="org-settings-description"
                      rows={3}
                      maxLength={DESCRIPTION_MAX_LENGTH}
                      value={organizationForm.description}
                      onChange={(e) =>
                        setOrganizationForm((p) => ({ ...p, description: e.target.value }))
                      }
                      className={adminInputClass()}
                    />
                  </div>
                  <button
                    type="button"
                    className={adminPrimaryBtnClass()}
                    onClick={saveOrganizationWithBusy}
                    disabled={savingOrg || orgNameMissing}
                    aria-busy={savingOrg}
                  >
                    <AdminBusySpinner busy={savingOrg} />
                    {t('organizationSettings.saveChanges')}
                  </button>
                </div>
              </GlassCard>
              <GlassCard className={gc}>
                <h3 className="mb-2 text-lg font-bold text-foreground">{t('organizationSettings.quotaTitle')}</h3>
                <p className="text-sm text-muted-foreground">
                  {t('organizationSettings.quotaHint')}
                </p>
              </GlassCard>
              {myRole === 'owner' && (
                <GlassCard className="border border-destructive bg-card">
                  <h3 className="mb-2 text-lg font-bold text-destructive">{t('organizationSettings.dangerZoneTitle')}</h3>
                  <p className="mb-3 text-sm text-muted-foreground">
                    {t('organizationSettings.dangerZoneDesc')}
                  </p>
                  <button type="button" onClick={openDeleteOrgModal} className={adminDangerBtnClass()}>
                    {t('organizationSettings.deleteOrgPermanent')}
                  </button>
                </GlassCard>
              )}
            </div>
          )}

          {isFullAccess && activeTab === 'structure' && (
            <div className="mx-auto max-w-6xl space-y-4">
              <GlassCard className={gc}>
                <h3 className="mb-3 text-xl font-bold text-foreground">{t('organizationSettings.structureAdminTitle')}</h3>
                {structureLoading ? (
                  <AdminListSkeleton rows={3} />
                ) : structureLoadError ? (
                  <AdminLoadErrorState message={structureLoadError} onRetry={loadStructure} />
                ) : (
                  <div className="space-y-4">
                    <div className="grid gap-2 md:grid-cols-2">
                      {!hideBranchUi ? (
                      <label className={adminLabelClass()}>{t('organizationSettings.branchLabel')}
                        <select value={manageBranchId} onChange={(e) => {
                          const nextBranchId = e.target.value;
                          const nextBranch = structureBranches.find((b) => String(b._id) === String(nextBranchId)) || null;
                          const nextDivisionId = nextBranch?.divisions?.[0]?._id ? String(nextBranch.divisions[0]._id) : '';
                          const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id ? String(nextBranch.divisions[0].departments[0]._id) : '';
                          const nextTeamId = nextBranch?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id ? String(nextBranch.divisions[0].departments[0].teams[0]._id) : '';
                          setManageBranchId(nextBranchId); setManageDivisionId(nextDivisionId); setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className={STRUCTURE_SELECT_CLASS}>
                          {structureBranches.map((branch) => <option key={branch._id} value={branch._id}>{branch.name}</option>)}
                        </select>
                      </label>
                      ) : null}
                      <label className={adminLabelClass()}>{t('organizationSettings.divisionLabel')}
                        <select value={manageDivisionId} onChange={(e) => {
                          const nextDivisionId = e.target.value;
                          const nextDivision = manageDivisions.find((d) => String(d._id) === String(nextDivisionId)) || null;
                          const nextDepartmentId = nextDivision?.departments?.[0]?._id ? String(nextDivision.departments[0]._id) : '';
                          const nextTeamId = nextDivision?.departments?.[0]?.teams?.[0]?._id ? String(nextDivision.departments[0].teams[0]._id) : '';
                          setManageDivisionId(nextDivisionId); setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className={STRUCTURE_SELECT_CLASS}>
                          {manageDivisions.map((division) => <option key={division._id} value={division._id}>{division.name}</option>)}
                        </select>
                        {!manageDivisions.length ? <span className="mt-1 block text-xs text-muted-foreground">{t('organizationSettings.structureSelectEmpty')}</span> : null}
                      </label>
                      <label className={adminLabelClass()}>{t('organizationSettings.departmentLabel')}
                        <select value={manageDepartmentId} onChange={(e) => {
                          const nextDepartmentId = e.target.value;
                          const nextDepartment = manageDepartments.find((d) => String(d._id) === String(nextDepartmentId)) || null;
                          const nextTeamId = nextDepartment?.teams?.[0]?._id ? String(nextDepartment.teams[0]._id) : '';
                          setManageDepartmentId(nextDepartmentId); setManageTeamId(nextTeamId);
                        }} className={STRUCTURE_SELECT_CLASS}>
                          {manageDepartments.map((department) => <option key={department._id} value={department._id}>{department.name}</option>)}
                        </select>
                        {!manageDepartments.length ? <span className="mt-1 block text-xs text-muted-foreground">{t('organizationSettings.structureSelectEmpty')}</span> : null}
                      </label>
                      <label className={adminLabelClass()}>{t('organizationSettings.teamLabel')}
                        <select value={manageTeamId} onChange={(e) => setManageTeamId(e.target.value)} className={STRUCTURE_SELECT_CLASS}>
                          {manageTeams.map((team) => <option key={team._id} value={team._id}>{team.name}</option>)}
                        </select>
                        {!manageTeams.length ? <span className="mt-1 block text-xs text-muted-foreground">{t('organizationSettings.structureSelectEmpty')}</span> : null}
                      </label>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <div className="rounded-xl border border-border bg-muted p-3">
                        <button
                          type="button"
                          onClick={openCreateDivisionModal}
                          className={adminPrimaryBtnClass()}
                        >
                          {t('organizationSettings.createDivisionBtn')}
                        </button>
                      </div>
                      <div className="rounded-xl border border-border bg-muted p-3">
                        <button
                          type="button"
                          onClick={openCreateDepartmentModal}
                          className={adminPrimaryBtnClass()}
                        >
                          {t('organizationSettings.createDepartmentBtn')}
                        </button>
                      </div>
                      {canCreateTeam ? (
                      <div className="rounded-xl border border-border bg-muted p-3">
                        <button
                          type="button"
                          onClick={openCreateTeamModal}
                          className={adminPrimaryBtnClass()}
                        >
                          {t('organizationSettings.openCreateTeamForm')}
                        </button>
                      </div>
                      ) : null}
                      <div className="rounded-xl border border-border bg-muted p-3">
                        <button
                          type="button"
                          onClick={openCreateChannelModal}
                          className={adminPrimaryBtnClass()}
                        >
                          {t('organizationSettings.openCreateChannelForm')}
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-2 md:grid-cols-2">
                      <RenameUnitCard
                        title={t('organizationSettings.renameDivisionTitle')}
                        value={renameDivisionName}
                        onChange={setRenameDivisionName}
                        placeholder={manageDivision?.name || t('organizationSettings.newNamePh')}
                        busy={renamingKey === 'division'}
                        disabled={Boolean(renamingKey)}
                        onSave={() => renameWithBusy('division', handleRenameDivision)}
                        saveLabel={t('common.save')}
                      />
                      <RenameUnitCard
                        title={t('organizationSettings.renameDepartmentTitle')}
                        value={renameDepartmentName}
                        onChange={setRenameDepartmentName}
                        placeholder={manageDepartment?.name || t('organizationSettings.newNamePh')}
                        busy={renamingKey === 'department'}
                        disabled={Boolean(renamingKey)}
                        onSave={() => renameWithBusy('department', handleRenameDepartment)}
                        saveLabel={t('common.save')}
                      />
                      <RenameUnitCard
                        title={t('organizationSettings.renameTeamTitle')}
                        value={renameTeamName}
                        onChange={setRenameTeamName}
                        placeholder={manageTeam?.name || t('organizationSettings.newNamePh')}
                        busy={renamingKey === 'team'}
                        disabled={Boolean(renamingKey)}
                        onSave={() => renameWithBusy('team', handleRenameTeam)}
                        saveLabel={t('common.save')}
                      />
                      <RenameUnitCard
                        title={t('organizationSettings.renameChannelTitle')}
                        value={renameChannelName}
                        onChange={setRenameChannelName}
                        placeholder={t('organizationSettings.newNamePh')}
                        busy={renamingKey === 'channel'}
                        disabled={Boolean(renamingKey) || !renameChannelId}
                        onSave={() => renameWithBusy('channel', handleRenameChannel)}
                        saveLabel={t('common.save')}
                        leading={
                          <select
                            value={renameChannelId}
                            aria-label={t('organizationSettings.selectChannel')}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const ch = manageChannels.find((c) => String(c._id) === String(nextId));
                              setRenameChannelId(nextId);
                              setRenameChannelName(ch?.name || '');
                            }}
                            className={STRUCTURE_INLINE_INPUT_CLASS}
                          >
                            <option value="">{t('organizationSettings.selectChannel')}</option>
                            {manageChannels.map((channel) => (
                              <option key={`${channel._id}-${channel.__scope || 'team'}`} value={channel._id}>
                                [{channel.__scope === 'division' ? t('organizationSettings.scopeDivision') : channel.__scope === 'department' ? t('organizationSettings.scopeDepartment') : t('organizationSettings.scopeTeam')}] {channel.name}
                              </option>
                            ))}
                          </select>
                        }
                      />
                    </div>

                    <div className="rounded-xl border border-border bg-muted p-3">
                      <div className="mb-2 text-sm font-semibold text-foreground">{t('organizationSettings.channelAclTitle')}</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        <select
                          value={accessUserId}
                          aria-label={t('organizationSettings.selectMember')}
                          onChange={(e) => setAccessUserId(e.target.value)}
                          className={STRUCTURE_INLINE_INPUT_CLASS}
                        >
                          <option value="">{t('organizationSettings.selectMember')}</option>
                          {orgMembers.map((member) => {
                            const uid = String(member.userId || '');
                            if (!uid) return null;
                            const label = member.email
                              ? `${member.displayName} (${member.email})`
                              : member.displayName;
                            return (
                              <option key={uid} value={uid}>
                                {label}
                              </option>
                            );
                          })}
                        </select>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <label className="flex items-center gap-1">
                            <input type="checkbox" className="accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={accessCanRead} onChange={(e) => setAccessCanRead(e.target.checked)} />
                            {t('organizationSettings.permRead')}
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" className="accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={accessCanWrite} onChange={(e) => setAccessCanWrite(e.target.checked)} />
                            {t('organizationSettings.permWrite')}
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="checkbox" className="accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" checked={accessCanVoice} onChange={(e) => setAccessCanVoice(e.target.checked)} />
                            {t('organizationSettings.permVoice')}
                          </label>
                        </div>
                      </div>
                      <div className="mt-2 flex justify-end">
                        <button
                          type="button"
                          onClick={grantAccessWithBusy}
                          disabled={grantingAccess || !renameChannelId || !accessUserId}
                          aria-busy={grantingAccess}
                          className={adminPrimaryBtnClass()}
                        >
                          <AdminBusySpinner busy={grantingAccess} />
                          {t('organizationSettings.grantAccess')}
                        </button>
                      </div>
                      {!accessRows.length ? (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {renameChannelId
                            ? t('organizationSettings.channelAccessEmpty')
                            : t('organizationSettings.channelAccessPickChannel')}
                        </p>
                      ) : null}
                      <ul className="mt-3 space-y-1">
                        {accessRows.map((row) => {
                          const rowUserId = row.userId || String(row.user || '');
                          const displayName = row.displayName || String(row.user);
                          return (
                            <li
                              key={`${rowUserId}-${row.channel || 'c'}`}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground"
                            >
                              <span className="font-medium">{displayName}</span>
                              <span className="flex flex-wrap items-center gap-1">
                                <ChannelPermBadge label={t('organizationSettings.permRead')} on={row.permissions?.canRead} t={t} />
                                <ChannelPermBadge label={t('organizationSettings.permWrite')} on={row.permissions?.canWrite} t={t} />
                                <ChannelPermBadge label={t('organizationSettings.permVoice')} on={row.permissions?.canVoice} t={t} />
                              </span>
                              <button
                                type="button"
                                onClick={() => setRevokeTarget({ userId: rowUserId, displayName })}
                                className="rounded px-1 font-semibold text-destructive transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                              >
                                {t('organizationSettings.revoke')}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>
          )}

          {isFullAccess && activeTab === 'roles' && (
            <div className="min-w-0 p-1 sm:p-2">
              <OrganizationRbacSettings orgId={orgId} />
            </div>
          )}

          {isFullAccess && activeTab === 'security' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.securityPolicyTitle')}</h3>
              <p className="mb-3 text-sm text-muted-foreground" role="note">
                {t('organizationSettings.securityNotWired')}
              </p>
              <div className="space-y-2">
                {securitySettings.map((s) => {
                  const def = SECURITY_SETTING_DEFS.find((d) => d.id === s.id);
                  return (
                  <label
                    key={s.id}
                    className="flex cursor-not-allowed items-center justify-between rounded-xl border border-border bg-muted p-4 opacity-70"
                  >
                    <span>{def ? t(`organizationSettings.${def.labelKey}`) : s.id}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      disabled
                      aria-disabled="true"
                      onChange={() => handleToggleSecurity(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'integrations' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.integrationsTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {integrations.map((i) => (
                  <div key={i.id} className="rounded-xl border border-border bg-muted p-4">
                    <div className="text-2xl">{i.icon}</div>
                    <div className="font-semibold text-foreground">{i.name}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'billing' && (
            <GlassCard className={gc}>
              <h3 className="mb-2 text-xl font-bold text-foreground">{t('organizationSettings.billingTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('organizationSettings.billingDemo')}</p>
            </GlassCard>
          )}

          {isFullAccess && activeTab === 'audit' && (
            <GlassCard className={gc}>
              <h3 className="mb-2 text-xl font-bold text-foreground">{t('organizationSettings.auditTitle')}</h3>
              <p className="text-sm text-muted-foreground">{t('organizationSettings.auditDemo')}</p>
            </GlassCard>
          )}

          {/* ——— Member ——— */}
          {!isFullAccess && activeTab === 'profile' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.profileInOrgTitle')}</h3>
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
                    {t('organizationSettings.changeAvatar')}
                  </span>
                </label>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">{t('organizationSettings.fullNameLabel')}</label>
                  <input
                    value={userProfileForm.fullName}
                    onChange={(e) =>
                      setUserProfileForm((p) => ({ ...p, fullName: e.target.value }))
                    }
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">{t('organizationSettings.emailLabel')}</label>
                  <input
                    value={user?.email || ''}
                    disabled
                    className="w-full rounded-xl border border-border bg-muted/60 px-4 py-3 text-muted-foreground"
                  />
                </div>
                <GradientButton variant="primary" onClick={handleSaveUserProfile}>
                  {t('organizationSettings.saveChanges')}
                </GradientButton>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'notifications' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.notificationsOrgTitle')}</h3>
              <div className="space-y-2">
                {notificationSettings.map((s) => {
                  const def = NOTIFICATION_SETTING_DEFS.find((d) => d.id === s.id);
                  return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center justify-between rounded-xl border border-border bg-muted p-4"
                  >
                    <span>{def ? t(`organizationSettings.${def.labelKey}`) : s.id}</span>
                    <input
                      type="checkbox"
                      checked={s.checked}
                      onChange={() => handleToggleNotification(s.id)}
                      className="h-5 w-5 rounded"
                    />
                  </label>
                  );
                })}
              </div>
              <button
                type="button"
                className="mt-3 text-sm text-indigo-400 hover:underline"
                onClick={() => {
                  persistMemberPrefs();
                  toast.success(t('organizationSettings.notificationsSaved'));
                }}
              >
                {t('organizationSettings.saveNotifications')}
              </button>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'privacy' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.privacyTitle')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm text-gray-300">{t('organizationSettings.onlineStatusLabel')}</label>
                  <select
                    value={privacySettings.onlineStatus}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({ ...p, onlineStatus: e.target.value }))
                    }
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                  >
                    <option value="everyone">{t('organizationSettings.privacyEveryone')}</option>
                    <option value="colleagues">{t('organizationSettings.privacyColleagues')}</option>
                    <option value="nobody">{t('organizationSettings.privacyNobody')}</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm text-gray-300">{t('organizationSettings.dmPermissionLabel')}</label>
                  <select
                    value={privacySettings.directMessagePermission}
                    onChange={(e) =>
                      setPrivacySettings((p) => ({
                        ...p,
                        directMessagePermission: e.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-foreground"
                  >
                    <option value="everyone">{t('organizationSettings.privacyEveryone')}</option>
                    <option value="colleagues">{t('organizationSettings.privacyColleagues')}</option>
                  </select>
                </div>
                <button
                  type="button"
                  className="text-sm text-indigo-400 hover:underline"
                  onClick={() => {
                    persistMemberPrefs();
                    toast.success(t('organizationSettings.privacySaved'));
                  }}
                >
                  {t('common.save')}
                </button>
              </div>
            </GlassCard>
          )}

          {!isFullAccess && activeTab === 'appearance' && (
            <GlassCard className={gc}>
              <h3 className="mb-4 text-xl font-bold text-foreground">{t('organizationSettings.appearanceTitle')}</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'dark', labelKey: 'themeDark', icon: '🌙' },
                  { id: 'light', labelKey: 'themeLight', icon: '☀️' },
                ].map((themeItem) => (
                  <button
                    key={themeItem.id}
                    type="button"
                    onClick={() => {
                      setThemeMode(themeItem.id);
                      persistMemberPrefs();
                      toast.success(
                        t('organizationSettings.themeSelected', {
                          name: t(`organizationSettings.${themeItem.labelKey}`),
                        })
                      );
                    }}
                    className={`rounded-xl p-6 text-left transition-all ${
                      themeMode === themeItem.id
                        ? 'bg-gradient-to-br from-purple-600 to-pink-600'
                        : 'border border-border bg-muted hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="mb-2 text-4xl">{themeItem.icon}</div>
                    <div className="font-bold text-foreground">{t(`organizationSettings.${themeItem.labelKey}`)}</div>
                  </button>
                ))}
              </div>
            </GlassCard>
          )}
    </>
  );

  return (
    <>
      {hideChrome ? (
        <div className="min-w-0">{tabPanels}</div>
      ) : suiteLayout ? (
        <OrganizationSettingsFigmaLayout
          organizationName={organization.name}
          roleLabel={roleLabel}
          roleHint={roleHint}
          onBack={onBack}
          tabs={figmaTabs}
          activeTab={activeTab}
          onTabChange={selectTab}
        >
          {tabPanels}
        </OrganizationSettingsFigmaLayout>
      ) : (
        <div className={rootShell}>
          <header className={pageHeader}>
            <button type="button" onClick={onBack} className={backLinkCls}>
              ← {t('organizationSettings.backOrgs')}
            </button>
            <h1 className="text-xl font-bold text-white md:text-2xl">{t('organizationSettings.settingsTitle')}</h1>
            <p className="mt-1 text-sm font-semibold text-white/90">{organization.name}</p>
            <p className="text-xs text-muted-foreground">
              {t('organizationSettings.yourRole')} <span className="text-cyan-300">{roleLabel}</span>
              {roleHint ? ` — ${roleHint}` : ''}
            </p>
          </header>

          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <aside className={asideShell}>
              <nav className="flex flex-col gap-1 px-3">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    className={activeTab === tab.id ? tabActiveCls : tabInactiveCls}
                  >
                    <span className="text-lg leading-none">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className={mobileTabBar}>
                <div className="scrollbar-org-settings flex gap-1 overflow-x-auto pb-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      className={`whitespace-nowrap px-3 py-2 text-xs font-semibold ${
                        activeTab === tab.id
                          ? 'rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                          : 'rounded-lg border border-border bg-muted text-muted-foreground'
                      }`}
                    >
                      <span className="mr-0.5">{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="scrollbar-org-settings min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 md:px-10 md:py-8">
                {tabPanels}
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={createDivisionModalOpen}
        onClose={() => setCreateDivisionModalOpen(false)}
        title={t('organizationSettings.createDivisionTitle')}
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-foreground">
          <label className={adminLabelClass()}>
            {t('organizationSettings.branchLabel')}
            <select
              value={createDivisionBranchId}
              onChange={(e) => setCreateDivisionBranchId(e.target.value)}
              className={STRUCTURE_SELECT_CLASS}
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.divisionNameLabel')}
            <input
              value={createDivisionName}
              onChange={(e) => setCreateDivisionName(e.target.value)}
              maxLength={UNIT_NAME_MAX_LENGTH}
              placeholder={t('organizationSettings.divisionNamePh')}
              className={STRUCTURE_SELECT_CLASS}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDivisionModalOpen(false)}
              className={adminSecondaryBtnClass()}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => createWithBusy('division', handleCreateDivision)}
              disabled={Boolean(creatingKey) || !createDivisionName.trim()}
              aria-busy={creatingKey === 'division'}
              className={adminPrimaryBtnClass()}
            >
              <AdminBusySpinner busy={creatingKey === 'division'} />
              {t('common.create')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createDepartmentModalOpen}
        onClose={() => setCreateDepartmentModalOpen(false)}
        title={t('organizationSettings.createDepartmentTitle')}
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-foreground">
          <label className={adminLabelClass()}>
            {t('organizationSettings.branchLabel')}
            <select
              value={createDepartmentBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                setCreateDepartmentBranchId(nextBranchId);
                setCreateDepartmentDivisionId(nextDivisionId);
              }}
              className={STRUCTURE_SELECT_CLASS}
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.divisionLabel')}
            <select
              value={createDepartmentDivisionId}
              onChange={(e) => setCreateDepartmentDivisionId(e.target.value)}
              className={STRUCTURE_SELECT_CLASS}
            >
              {createDepartmentDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.departmentNameLabel')}
            <input
              value={createDepartmentName}
              onChange={(e) => setCreateDepartmentName(e.target.value)}
              maxLength={UNIT_NAME_MAX_LENGTH}
              placeholder={t('organizationSettings.departmentNamePh')}
              className={STRUCTURE_SELECT_CLASS}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDepartmentModalOpen(false)}
              className={adminSecondaryBtnClass()}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => createWithBusy('department', handleCreateDepartment)}
              disabled={Boolean(creatingKey) || !createDepartmentName.trim()}
              aria-busy={creatingKey === 'department'}
              className={adminPrimaryBtnClass()}
            >
              <AdminBusySpinner busy={creatingKey === 'department'} />
              {t('common.create')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createTeamModalOpen}
        onClose={() => setCreateTeamModalOpen(false)}
        title={t('organizationSettings.createTeamTitle')}
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-foreground">
          <label className={adminLabelClass()}>
            {t('organizationSettings.branchLabel')}
            <select
              value={createTeamBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0]._id)
                  : '';
                setCreateTeamBranchId(nextBranchId);
                setCreateTeamDivisionId(nextDivisionId);
                setCreateTeamDepartmentId(nextDepartmentId);
              }}
              className={STRUCTURE_SELECT_CLASS}
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.divisionLabel')}
            <select
              value={createTeamDivisionId}
              onChange={(e) => {
                const nextDivisionId = e.target.value;
                const nextDivision = createTeamDivisions.find(
                  (d) => String(d._id) === String(nextDivisionId)
                );
                const nextDepartmentId = nextDivision?.departments?.[0]?._id
                  ? String(nextDivision.departments[0]._id)
                  : '';
                setCreateTeamDivisionId(nextDivisionId);
                setCreateTeamDepartmentId(nextDepartmentId);
              }}
              className={STRUCTURE_SELECT_CLASS}
            >
              {createTeamDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.departmentLabel')}
            <select
              value={createTeamDepartmentId}
              onChange={(e) => setCreateTeamDepartmentId(e.target.value)}
              className={STRUCTURE_SELECT_CLASS}
            >
              {createTeamDepartments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.teamNameLabel')}
            <input
              value={createTeamName}
              onChange={(e) => setCreateTeamName(e.target.value)}
              maxLength={UNIT_NAME_MAX_LENGTH}
              placeholder={t('organizationSettings.teamNamePh')}
              className={STRUCTURE_SELECT_CLASS}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateTeamModalOpen(false)}
              className={adminSecondaryBtnClass()}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => createWithBusy('team', handleCreateTeam)}
              disabled={Boolean(creatingKey) || !createTeamName.trim()}
              aria-busy={creatingKey === 'team'}
              className={adminPrimaryBtnClass()}
            >
              <AdminBusySpinner busy={creatingKey === 'team'} />
              {t('common.create')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        title={t('organizationSettings.createChannelTitle')}
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-3 text-foreground">
          <div className="grid grid-cols-2 gap-2">
            <label className={adminLabelClass()}>
              {t('organizationSettings.channelTypeLabel')}
              <select
                value={createChannelType}
                onChange={(e) => setCreateChannelType(e.target.value)}
                className={STRUCTURE_SELECT_CLASS}
              >
                <option value="chat">{t('organizationSettings.channelTypeChat')}</option>
                <option value="voice">{t('organizationSettings.channelTypeVoice')}</option>
              </select>
            </label>
            <label className={adminLabelClass()}>
              {t('organizationSettings.channelLevelLabel')}
              <select
                value={createChannelLevel}
                onChange={(e) => setCreateChannelLevel(e.target.value)}
                className={STRUCTURE_SELECT_CLASS}
              >
                <option value="division">{t('organizationSettings.levelDivision')}</option>
                <option value="department">{t('organizationSettings.levelDepartment')}</option>
                <option value="team">{t('organizationSettings.levelTeam')}</option>
              </select>
            </label>
          </div>

          <label className={adminLabelClass()}>
            {t('organizationSettings.branchLabel')}
            <select
              value={createChannelBranchId}
              onChange={(e) => {
                const nextBranchId = e.target.value;
                const nextBranch = resolveBranchById(nextBranchId);
                const nextDivisionId = nextBranch?.divisions?.[0]?._id
                  ? String(nextBranch.divisions[0]._id)
                  : '';
                const nextDepartmentId = nextBranch?.divisions?.[0]?.departments?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0]._id)
                  : '';
                const nextTeamId = nextBranch?.divisions?.[0]?.departments?.[0]?.teams?.[0]?._id
                  ? String(nextBranch.divisions[0].departments[0].teams[0]._id)
                  : '';
                setCreateChannelBranchId(nextBranchId);
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className={STRUCTURE_SELECT_CLASS}
            >
              {structureBranches.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.divisionLabel')}
            <select
              value={createChannelDivisionId}
              onChange={(e) => {
                const nextDivisionId = e.target.value;
                const nextDivision = createChannelDivisions.find(
                  (d) => String(d._id) === String(nextDivisionId)
                );
                const nextDepartmentId = nextDivision?.departments?.[0]?._id
                  ? String(nextDivision.departments[0]._id)
                  : '';
                const nextTeamId = nextDivision?.departments?.[0]?.teams?.[0]?._id
                  ? String(nextDivision.departments[0].teams[0]._id)
                  : '';
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className={STRUCTURE_SELECT_CLASS}
            >
              {createChannelDivisions.map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.departmentLabel')}
            <select
              value={createChannelDepartmentId}
              onChange={(e) => {
                const nextDepartmentId = e.target.value;
                const nextDepartment = createChannelDepartments.find(
                  (d) => String(d._id) === String(nextDepartmentId)
                );
                const nextTeamId = nextDepartment?.teams?.[0]?._id
                  ? String(nextDepartment.teams[0]._id)
                  : '';
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              disabled={createChannelLevel === 'division'}
              className={adminInputClass('mt-1 disabled:opacity-50')}
            >
              {createChannelDepartments.map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.teamLabel')}
            <select
              value={createChannelTeamId}
              onChange={(e) => setCreateChannelTeamId(e.target.value)}
              disabled={createChannelLevel !== 'team'}
              className={adminInputClass('mt-1 disabled:opacity-50')}
            >
              {createChannelTeams.map((team) => (
                <option key={team._id} value={team._id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
          <label className={adminLabelClass()}>
            {t('organizationSettings.channelNameLabel')}
            <input
              value={createChannelName}
              onChange={(e) => setCreateChannelName(e.target.value)}
              maxLength={UNIT_NAME_MAX_LENGTH}
              placeholder={t('organizationSettings.channelNamePh')}
              className={STRUCTURE_SELECT_CLASS}
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className={adminSecondaryBtnClass()}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={() => createWithBusy('channel', handleCreateChannel)}
              disabled={Boolean(creatingKey) || !createChannelName.trim()}
              aria-busy={creatingKey === 'channel'}
              className={adminPrimaryBtnClass()}
            >
              <AdminBusySpinner busy={creatingKey === 'channel'} />
              {t('common.create')}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={deleteOrgModalOpen}
        onClose={closeDeleteOrgModal}
        title={t('organizationSettings.deleteOrgModalTitle')}
        size="sm"
        layerClassName="z-[250]"
      >
        <div className="space-y-4 text-foreground">
          <p className="text-sm text-muted-foreground">
            {t('organizationSettings.deleteOrgWarning')}
          </p>
          <div className="rounded-xl border border-border bg-muted px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t('organizationSettings.orgNameConfirm')} </span>
            <span className="font-semibold text-foreground">{expectedOrgNameForDelete || '—'}</span>
          </div>
          <div>
            <label htmlFor="org-settings-delete-confirm" className={adminLabelClass()}>
              {t('organizationSettings.typeOrgNameConfirm')}
            </label>
            <input
              id="org-settings-delete-confirm"
              type="text"
              maxLength={ORG_NAME_MAX_LENGTH}
              autoFocus
              value={deleteOrgNameInput}
              onChange={(e) => setDeleteOrgNameInput(e.target.value)}
              placeholder={t('organizationSettings.typeOrgNamePh')}
              autoComplete="off"
              disabled={deletingOrg}
              className={adminInputClass('disabled:opacity-50')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeDeleteOrgModal}
              disabled={deletingOrg}
              className={adminSecondaryBtnClass()}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleConfirmDeleteOrganization}
              disabled={!deleteNameMatches || deletingOrg || !expectedOrgNameForDelete}
              aria-busy={deletingOrg}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground transition-colors duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none motion-reduce:active:scale-100"
            >
              <AdminBusySpinner busy={deletingOrg} />
              {deletingOrg ? t('organizationSettings.deleting') : t('organizationSettings.deleteOrgBtn')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => handleRevokeChannelAccess(revokeTarget?.userId)}
        title={t('organizationSettings.revokeConfirmTitle')}
        message={t('organizationSettings.revokeConfirmMessage', {
          name: revokeTarget?.displayName || '—',
          channel: renameChannelName || '—',
        })}
        confirmText={t('organizationSettings.revoke')}
        cancelText={t('common.cancel')}
        variant="danger"
        layerClassName="z-[260]"
      />
    </>
  );
}

export default OrganizationSettingsPanel;

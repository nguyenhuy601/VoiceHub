import { Navigate, useLocation } from 'react-router-dom';
import {
  findAdminNavItem,
  flattenAdminNavItems,
  normalizeAdminPath,
  resolveAdminDomainFromPath,
  resolveAdminLegacyRedirect,
} from '../../config/adminDomainsConfig';
import { useCompanyAdminContext } from './CompanyAdminLayout';
import CompanyAdminSettingsPage from './CompanyAdminSettingsPage';
import AdminModulePlaceholderPage from './AdminModulePlaceholderPage';
import UsersListPanel from '../../features/adminUsers/UsersListPanel';
import UserCreatePanel from '../../features/adminUsers/UserCreatePanel';
import UserEditPanel from '../../features/adminUsers/UserEditPanel';
import UserDeletePanel from '../../features/adminUsers/UserDeletePanel';
import UserImportPanel from '../../features/adminUsers/UserImportPanel';
import UserExcelImportPanel from '../../features/adminUsers/UserExcelImportPanel';
import UserImportHubPanel from '../../features/adminUsers/UserImportHubPanel';
import UserAssignOrgPanel from '../../features/adminUsers/UserAssignOrgPanel';
import AccountsListPanel from '../../features/adminAccounts/AccountsListPanel';
import AccountDetailPanel from '../../features/adminAccounts/AccountDetailPanel';
import AccountLockPanel from '../../features/adminAccounts/AccountLockPanel';
import AccountResetPasswordPanel from '../../features/adminAccounts/AccountResetPasswordPanel';
import AccountForcePasswordPanel from '../../features/adminAccounts/AccountForcePasswordPanel';
import AccountSetPasswordPanel from '../../features/adminAccounts/AccountSetPasswordPanel';
import AccountActivatePanel from '../../features/adminAccounts/AccountActivatePanel';
import AccountRevokeSessionsPanel from '../../features/adminAccounts/AccountRevokeSessionsPanel';
import AccountResendVerificationPanel from '../../features/adminAccounts/AccountResendVerificationPanel';
import AccountLoginHistoryPanel from '../../features/adminAccounts/AccountLoginHistoryPanel';
import AccountPasswordHubPanel from '../../features/adminAccounts/AccountPasswordHubPanel';
import AccountAccessHubPanel from '../../features/adminAccounts/AccountAccessHubPanel';
import AccountVerificationHubPanel from '../../features/adminAccounts/AccountVerificationHubPanel';
import PeopleOpsHubPanel from '../../features/adminUsers/PeopleOpsHubPanel';
import RolesListPanel from '../../features/adminRbac/RolesListPanel';
import RolesHierarchyPanel from '../../features/adminRbac/RolesHierarchyPanel';
import RoleCreatePanel from '../../features/adminRbac/RoleCreatePanel';
import RoleEditPanel from '../../features/adminRbac/RoleEditPanel';
import RoleDeletePanel from '../../features/adminRbac/RoleDeletePanel';
import RolePermissionsPanel from '../../features/adminRbac/RolePermissionsPanel';
import RoleAssignPanel from '../../features/adminRbac/RoleAssignPanel';
import RoleRevokePanel from '../../features/adminRbac/RoleRevokePanel';
import RolesMatrixPanel from '../../features/adminRbac/RolesMatrixPanel';
import MasterDataEnablePanel from '../../features/adminRbac/MasterDataEnablePanel';
import RbacTaxonomyHubPanel from '../../features/adminRbac/RbacTaxonomyHubPanel';
import RbacOrgRoleDirectoryPanel from '../../features/adminRbac/RbacOrgRoleDirectoryPanel';
import RbacOrgRoleLookupPanel from '../../features/adminRbac/RbacOrgRoleLookupPanel';
import RbacProjectRoleBoardPanel from '../../features/adminRbac/RbacProjectRoleBoardPanel';
import OrgRoleListPanel from '../../features/adminRbac/OrgRoleListPanel';
import OrgRoleCreatePanel from '../../features/adminRbac/OrgRoleCreatePanel';
import OrgRoleEditPanel from '../../features/adminRbac/OrgRoleEditPanel';
import OrgRoleDeletePanel from '../../features/adminRbac/OrgRoleDeletePanel';
import OrgRoleAssignPanel from '../../features/adminRbac/OrgRoleAssignPanel';
import ProjectRoleListPanel from '../../features/adminRbac/ProjectRoleListPanel';
import ProjectRoleCreatePanel from '../../features/adminRbac/ProjectRoleCreatePanel';
import ProjectRoleEditPanel from '../../features/adminRbac/ProjectRoleEditPanel';
import ProjectRoleDeletePanel from '../../features/adminRbac/ProjectRoleDeletePanel';
import VoiceRoomsListPanel from '../../features/adminVoice/VoiceRoomsListPanel';
import VoiceManageRoomsPanel from '../../features/adminVoice/VoiceManageRoomsPanel';
import MeetingsListPanel from '../../features/adminVoice/MeetingsListPanel';
import MeetingHistoryPanel from '../../features/adminVoice/MeetingHistoryPanel';
import MeetingEndPanel from '../../features/adminVoice/MeetingEndPanel';
import MeetingModeratePanel from '../../features/adminVoice/MeetingModeratePanel';
import {
  MeetingRecordingPanel,
  MeetingTranscriptPanel,
  MeetingAiSummaryPanel,
} from '../../features/adminVoice/MeetingArtifactPanels';
import PosManageHubPanel from '../../features/adminRbac/PosManageHubPanel';
import OrgRoleManageHubPanel from '../../features/adminRbac/OrgRoleManageHubPanel';
import ProjectRoleManageHubPanel from '../../features/adminRbac/ProjectRoleManageHubPanel';
import PermPackManageHubPanel from '../../features/adminRbac/PermPackManageHubPanel';
import MeetingOpsHubPanel from '../../features/adminVoice/MeetingOpsHubPanel';
import ChannelsListPanel from '../../features/adminChannels/ChannelsListPanel';
import ChannelManageHubPanel from '../../features/adminChannels/ChannelManageHubPanel';
import FilesListPanel from '../../features/adminFiles/FilesListPanel';
import FileOpsHubPanel from '../../features/adminFiles/FileOpsHubPanel';
import NotificationConfigHubPanel from '../../features/adminNotifications/NotificationConfigHubPanel';
import ChatConfigHubPanel from '../../features/adminChat/ChatConfigHubPanel';
import SystemConfigHubPanel from '../../features/adminSystemConfig/SystemConfigHubPanel';
import SecuritySettingsHubPanel from '../../features/adminSecurity/SecuritySettingsHubPanel';
import SecuritySessionsHubPanel from '../../features/adminSecurity/SecuritySessionsHubPanel';
import TasksProjectsBoardsPanel from '../../features/adminTasks/TasksProjectsBoardsPanel';
import TasksProjectSettingsPanel from '../../features/adminTasks/TasksProjectSettingsPanel';
import TasksProjectTeamPanel from '../../features/adminTasks/TasksProjectTeamPanel';
import TasksDelegationPanel from '../../features/adminTasks/TasksDelegationPanel';
import TasksBriefsPanel from '../../features/adminTasks/TasksBriefsPanel';
import TasksManagePanel from '../../features/adminTasks/TasksManagePanel';
import TasksStatusPriorityPanel from '../../features/adminTasks/TasksStatusPriorityPanel';
import TasksExportPanel from '../../features/adminTasks/TasksExportPanel';
import TasksComingSoonPanel from '../../features/adminTasks/TasksComingSoonPanel';
import TasksProjectVisibilityPolicyPanel from '../../features/adminTasks/TasksProjectVisibilityPolicyPanel';
import DepartmentCapacityPanel from '../../features/adminTasks/DepartmentCapacityPanel';
import ResourcePlannerPanel from '../../features/adminTasks/ResourcePlannerPanel';
import UtilizationPanel from '../../features/adminTasks/UtilizationPanel';
import ApprovalPoliciesPanel from '../../features/adminTasks/ApprovalPoliciesPanel';
import DirectorProjectHealthPanel from '../../features/adminTasks/DirectorProjectHealthPanel';
import RetentionPolicyPanel from '../../features/adminTasks/RetentionPolicyPanel';
import BackupOpsPanel, { SecurityWaveCStubPanel } from '../../features/adminTasks/BackupOpsPanel';
import AuditLogListPanel from '../../features/adminAudit/AuditLogListPanel';
import TasksTransferInfoPanel from '../../features/adminTasks/TasksTransferInfoPanel';
import TasksSprintsPanel from '../../features/adminTasks/TasksSprintsPanel';
import TasksWorkflowPanel from '../../features/adminTasks/TasksWorkflowPanel';
import TasksTransferPanel from '../../features/adminTasks/TasksTransferPanel';
import {
  DeptListPanel,
  DeptCreatePanel,
  DeptEditPanel,
  DeptDisablePanel,
  DeptParentPanel,
  DeptHeadPanel,
  DeptMembersPanel,
  DeptOrgRolesPanel,
  DeptTransferPanel,
  TeamListPanel,
  TeamCreatePanel,
  TeamEditPanel,
  TeamArchivePanel,
  TeamMembersPanel,
  TeamLeaderPanel,
  TeamDeptPanel,
  BranchListPanel,
  BranchCreatePanel,
  BranchEditPanel,
  BranchDisablePanel,
  BranchDeptPanel,
  DivisionListPanel,
  DivisionCreatePanel,
  DivisionEditPanel,
  DivisionDisablePanel,
  DivisionDeptPanel,
  PosListPanel,
  PosCreatePanel,
  PosEditPanel,
  PosDisablePanel,
  PosAssignPanel,
  OrgLevelsPanel,
  OrgUnitTreePanel,
  DeptManageHubPanel,
  TeamManageHubPanel,
  DivisionManageHubPanel,
  BranchManageHubPanel,
} from '../../features/adminOrgStructure';

const USER_PANELS = {
  people: UsersListPanel,
  'users-create': UserCreatePanel,
  'users-edit': UserEditPanel,
  'users-delete': UserDeletePanel,
  'users-import': UserImportPanel,
  'users-import-excel': UserExcelImportPanel,
  'users-import-hub': UserImportHubPanel,
  'users-people-ops': PeopleOpsHubPanel,
  'users-assign-org': UserAssignOrgPanel,
};

const ACCOUNT_PANELS = {
  'accounts-list': AccountsListPanel,
  'accounts-password-hub': AccountPasswordHubPanel,
  'accounts-access-hub': AccountAccessHubPanel,
  'accounts-verification-hub': AccountVerificationHubPanel,
  'accounts-detail': AccountDetailPanel,
  'accounts-lock': AccountLockPanel,
  'accounts-reset-password': AccountResetPasswordPanel,
  'accounts-force-password': AccountForcePasswordPanel,
  'accounts-set-password': AccountSetPasswordPanel,
  'accounts-activate': AccountActivatePanel,
  'accounts-revoke-sessions': AccountRevokeSessionsPanel,
  'accounts-resend-verification': AccountResendVerificationPanel,
  'accounts-login-history': AccountLoginHistoryPanel,
};

const RBAC_PANELS = {
  'rbac-taxonomy': RbacTaxonomyHubPanel,
  'rbac-master-data': MasterDataEnablePanel,
  'rbac-pos-list': PosListPanel,
  'rbac-pos-create': PosCreatePanel,
  'rbac-pos-edit': PosEditPanel,
  'rbac-pos-disable': PosDisablePanel,
  'rbac-pos-assign': PosAssignPanel,
  'rbac-org-role-list': OrgRoleListPanel,
  'rbac-org-role-create': OrgRoleCreatePanel,
  'rbac-org-role-edit': OrgRoleEditPanel,
  'rbac-org-role-delete': OrgRoleDeletePanel,
  'rbac-org-role-assign': OrgRoleAssignPanel,
  'rbac-org-role-directory': RbacOrgRoleDirectoryPanel,
  'rbac-org-role-lookup': RbacOrgRoleLookupPanel,
  'rbac-project-role-list': ProjectRoleListPanel,
  'rbac-project-role-create': ProjectRoleCreatePanel,
  'rbac-project-role-edit': ProjectRoleEditPanel,
  'rbac-project-role-delete': ProjectRoleDeletePanel,
  'rbac-project-role-board': RbacProjectRoleBoardPanel,
  'rbac-list': RolesListPanel,
  'rbac-hierarchy': RolesHierarchyPanel,
  'rbac-create': RoleCreatePanel,
  'rbac-edit': RoleEditPanel,
  'rbac-delete': RoleDeletePanel,
  'rbac-permissions': RolePermissionsPanel,
  'rbac-assign': RoleAssignPanel,
  'rbac-revoke': RoleRevokePanel,
  'rbac-matrix': RolesMatrixPanel,
  'rbac-pos-manage': PosManageHubPanel,
  'rbac-org-role-manage': OrgRoleManageHubPanel,
  'rbac-project-role-manage': ProjectRoleManageHubPanel,
  'rbac-perm-pack-manage': PermPackManageHubPanel,
};

const VOICE_PANELS = {
  'voice-rooms': VoiceRoomsListPanel,
  'voice-manage-rooms': VoiceManageRoomsPanel,
  'voice-meetings': MeetingsListPanel,
  'voice-end-meeting': MeetingEndPanel,
  'voice-moderate': MeetingModeratePanel,
  'voice-recording': MeetingRecordingPanel,
  'voice-transcript': MeetingTranscriptPanel,
  'voice-ai-summary': MeetingAiSummaryPanel,
  'voice-history': MeetingHistoryPanel,
  'voice-meeting-ops': MeetingOpsHubPanel,
};

const CLUSTER3_PANELS = {
  'channels-list': ChannelsListPanel,
  'channels-manage': ChannelManageHubPanel,
  'files-list': FilesListPanel,
  'files-ops': FileOpsHubPanel,
  'notifications-config': NotificationConfigHubPanel,
  'chat-config': ChatConfigHubPanel,
  'system-config-hub': SystemConfigHubPanel,
  'security-settings-hub': SecuritySettingsHubPanel,
  'security-sessions-hub': SecuritySessionsHubPanel,
};

const ORG_PANELS = {
  // Huy: Domain Cơ cấu tổ chức — map implementation → panel
  'org-levels': OrgLevelsPanel,
  'org-unit-tree': OrgUnitTreePanel,
  'org-dept-list': DeptListPanel,
  'org-dept-create': DeptCreatePanel,
  'org-dept-edit': DeptEditPanel,
  'org-dept-disable': DeptDisablePanel,
  'org-dept-parent': DeptParentPanel,
  'org-dept-head': DeptHeadPanel,
  'org-dept-members': DeptMembersPanel,
  'org-dept-org-roles': DeptOrgRolesPanel,
  'org-dept-transfer': DeptTransferPanel,
  'org-team-list': TeamListPanel,
  'org-team-create': TeamCreatePanel,
  'org-team-edit': TeamEditPanel,
  'org-team-archive': TeamArchivePanel,
  'org-team-members': TeamMembersPanel,
  'org-team-leader': TeamLeaderPanel,
  'org-team-dept': TeamDeptPanel,
  'org-branch-list': BranchListPanel,
  'org-branch-create': BranchCreatePanel,
  'org-branch-edit': BranchEditPanel,
  'org-branch-disable': BranchDisablePanel,
  'org-branch-dept': BranchDeptPanel,
  'org-division-list': DivisionListPanel,
  'org-division-create': DivisionCreatePanel,
  'org-division-edit': DivisionEditPanel,
  'org-division-disable': DivisionDisablePanel,
  'org-division-dept': DivisionDeptPanel,
  'org-dept-manage': DeptManageHubPanel,
  'org-team-manage': TeamManageHubPanel,
  'org-division-manage': DivisionManageHubPanel,
  'org-branch-manage': BranchManageHubPanel,
};

const TASK_PANELS = {
  'tasks-boards': TasksProjectsBoardsPanel,
  'tasks-project-settings': TasksProjectSettingsPanel,
  'tasks-project-team': TasksProjectTeamPanel,
  'tasks-delegation': TasksDelegationPanel,
  'tasks-briefs': TasksBriefsPanel,
  'tasks-manage': TasksManagePanel,
  'tasks-status-priority': TasksStatusPriorityPanel,
  'tasks-export': TasksExportPanel,
  'tasks-coming-soon': TasksComingSoonPanel,
  'tasks-project-visibility-policy': TasksProjectVisibilityPolicyPanel,
  'tasks-department-capacity': DepartmentCapacityPanel,
  'tasks-resource-planner': ResourcePlannerPanel,
  'tasks-utilization': UtilizationPanel,
  'tasks-approval-policies': ApprovalPoliciesPanel,
  'tasks-transfer-info': TasksTransferInfoPanel,
  'tasks-sprints': TasksSprintsPanel,
  'tasks-workflow': TasksWorkflowPanel,
  'tasks-transfer': TasksTransferPanel,
  'director-project-health': DirectorProjectHealthPanel,
  'governance-retention': RetentionPolicyPanel,
  'backup-ops': BackupOpsPanel,
  'security-wave-c': SecurityWaveCStubPanel,
  'audit-log': AuditLogListPanel,
};

export default function AdminDomainPage() {
  const location = useLocation();
  const { orgId } = useCompanyAdminContext();
  const currentPath = String(location.pathname || '').replace(/\/+$/, '') || '/app/admin';

  const legacy = resolveAdminLegacyRedirect(location.pathname, location.search);
  if (legacy) {
    const search = legacy.search || location.search || '';
    return <Navigate to={`${legacy.pathname}${search}${location.hash || ''}`} replace />;
  }

  const normalizedPath = normalizeAdminPath(location.pathname);
  if (normalizedPath !== currentPath) {
    return (
      <Navigate to={`${normalizedPath}${location.search}${location.hash}`} replace />
    );
  }
  const match = findAdminNavItem(location.pathname);

  if (!match) {
    const domain = resolveAdminDomainFromPath(location.pathname);
    if (domain) {
      const first = flattenAdminNavItems(domain)[0];
      if (first) return <Navigate to={first.path} replace />;
    }
    return <Navigate to="/app/admin" replace />;
  }

  const impl = match.item.implementation;

  if (impl?.startsWith('settings-')) return <CompanyAdminSettingsPage />;

  const OrgPanel = ORG_PANELS[impl];
  if (OrgPanel) {
    return <OrgPanel orgId={orgId} />;
  }

  const TaskPanel = TASK_PANELS[impl];
  if (TaskPanel) {
    return <TaskPanel orgId={orgId} />;
  }

  const VoicePanel = VOICE_PANELS[impl];
  if (VoicePanel) {
    return <VoicePanel orgId={orgId} />;
  }

  const Cluster3Panel = CLUSTER3_PANELS[impl];
  if (Cluster3Panel) {
    return <Cluster3Panel orgId={orgId} />;
  }

  const RbacPanel = RBAC_PANELS[impl];
  if (RbacPanel) {
    return <RbacPanel orgId={orgId} />;
  }

  const AccountPanel = ACCOUNT_PANELS[impl];
  if (AccountPanel) {
    return <AccountPanel orgId={orgId} />;
  }

  const Panel = USER_PANELS[impl];
  if (Panel) {
    return <Panel orgId={orgId} />;
  }

  return <AdminModulePlaceholderPage />;
}

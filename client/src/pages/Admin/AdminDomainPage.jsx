import { Navigate, useLocation } from 'react-router-dom';
import {
  findAdminNavItem,
  flattenAdminNavItems,
  resolveAdminDomainFromPath,
} from '../../config/adminDomainsConfig';
import { useCompanyAdminContext } from './CompanyAdminLayout';
import CompanyAdminSettingsPage from './CompanyAdminSettingsPage';
import AdminModulePlaceholderPage from './AdminModulePlaceholderPage';
import UsersListPanel from '../../features/adminUsers/UsersListPanel';
import UserCreatePanel from '../../features/adminUsers/UserCreatePanel';
import UserEditPanel from '../../features/adminUsers/UserEditPanel';
import UserDeletePanel from '../../features/adminUsers/UserDeletePanel';
import UserLockPanel from '../../features/adminUsers/UserLockPanel';
import UserResetPasswordPanel from '../../features/adminUsers/UserResetPasswordPanel';
import UserForcePasswordPanel from '../../features/adminUsers/UserForcePasswordPanel';
import UserImportPanel from '../../features/adminUsers/UserImportPanel';
import UserAssignOrgPanel from '../../features/adminUsers/UserAssignOrgPanel';
import UserLoginHistoryPanel from '../../features/adminUsers/UserLoginHistoryPanel';
import RolesListPanel from '../../features/adminRbac/RolesListPanel';
import RolesHierarchyPanel from '../../features/adminRbac/RolesHierarchyPanel';
import RoleCreatePanel from '../../features/adminRbac/RoleCreatePanel';
import RoleEditPanel from '../../features/adminRbac/RoleEditPanel';
import RoleDeletePanel from '../../features/adminRbac/RoleDeletePanel';
import RolePermissionsPanel from '../../features/adminRbac/RolePermissionsPanel';
import RoleAssignPanel from '../../features/adminRbac/RoleAssignPanel';
import RoleRevokePanel from '../../features/adminRbac/RoleRevokePanel';
import RolesMatrixPanel from '../../features/adminRbac/RolesMatrixPanel';
import VoiceRoomsListPanel from '../../features/adminVoice/VoiceRoomsListPanel';
import VoiceManageRoomsPanel from '../../features/adminVoice/VoiceManageRoomsPanel';
import MeetingsListPanel from '../../features/adminVoice/MeetingsListPanel';
import MeetingEndPanel from '../../features/adminVoice/MeetingEndPanel';
import MeetingModeratePanel from '../../features/adminVoice/MeetingModeratePanel';
import {
  MeetingRecordingPanel,
  MeetingTranscriptPanel,
  MeetingAiSummaryPanel,
} from '../../features/adminVoice/MeetingArtifactPanels';
import MeetingHistoryPanel from '../../features/adminVoice/MeetingHistoryPanel';
import {
  DeptListPanel,
  DeptCreatePanel,
  DeptEditPanel,
  DeptDisablePanel,
  DeptParentPanel,
  DeptHeadPanel,
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
} from '../../features/adminOrgStructure';

const USER_PANELS = {
  people: UsersListPanel,
  'users-create': UserCreatePanel,
  'users-edit': UserEditPanel,
  'users-delete': UserDeletePanel,
  'users-lock': UserLockPanel,
  'users-reset-password': UserResetPasswordPanel,
  'users-force-password': UserForcePasswordPanel,
  'users-import': UserImportPanel,
  'users-assign-org': UserAssignOrgPanel,
  'users-login-history': UserLoginHistoryPanel,
};

const RBAC_PANELS = {
  'rbac-list': RolesListPanel,
  'rbac-hierarchy': RolesHierarchyPanel,
  'rbac-create': RoleCreatePanel,
  'rbac-edit': RoleEditPanel,
  'rbac-delete': RoleDeletePanel,
  'rbac-permissions': RolePermissionsPanel,
  'rbac-assign': RoleAssignPanel,
  'rbac-revoke': RoleRevokePanel,
  'rbac-matrix': RolesMatrixPanel,
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
  'org-pos-list': PosListPanel,
  'org-pos-create': PosCreatePanel,
  'org-pos-edit': PosEditPanel,
  'org-pos-disable': PosDisablePanel,
  'org-pos-assign': PosAssignPanel,
};

export default function AdminDomainPage() {
  const location = useLocation();
  const { orgId } = useCompanyAdminContext();
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

  const VoicePanel = VOICE_PANELS[impl];
  if (VoicePanel) {
    return <VoicePanel orgId={orgId} />;
  }

  const RbacPanel = RBAC_PANELS[impl];
  if (RbacPanel) {
    return <RbacPanel orgId={orgId} />;
  }

  const Panel = USER_PANELS[impl];
  if (Panel) {
    return <Panel orgId={orgId} />;
  }

  return <AdminModulePlaceholderPage />;
}

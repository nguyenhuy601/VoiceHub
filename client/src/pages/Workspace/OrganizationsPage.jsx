import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAppStrings } from '../../locales/appStrings';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { ConfirmDialog, Modal } from '../../components/Shared';
import OrganizationMemberSidebar from '../../components/Organization/OrganizationMemberSidebar';
import OrganizationVoiceChannelSidebar from '../../components/Organization/OrganizationVoiceChannelSidebar';
import OrganizationMainPanel from '../../components/Organization/OrganizationMainPanel';
import OrganizationChannelRoleSettingsModal from '../../components/Organization/OrganizationChannelRoleSettingsModal';
import OrganizationScopeRoleSettingsModal from '../../components/Organization/OrganizationScopeRoleSettingsModal';
import ForwardChannelModal from '../../components/Organization/ForwardChannelModal';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { PageSearchBar } from '../../features/search';
import {
  applyProfileToBusinessCard,
  looksLikeEmail,
  normalizeBusinessCardFields,
} from '../../features/search/businessCardDisplay';
import { enrichMembershipsWithProfiles } from '../../features/search/enrichOrgMembers';
import { useAuth } from '../../context/AuthContext';
import { getResolvedBearerToken } from '../../utils/tokenStorage';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import friendService from '../../services/friendService';
import userService from '../../services/userService';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { projectAPI } from '../../services/api/projectAPI';
import CreateTaskBoardModal from '../../components/Organization/CreateTaskBoardModal';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { isOrgMemberAccessIncomplete } from '../../utils/orgMemberAccessGate';
import {
  buildOrgFilesFromOverview,
  fetchOrganizationDocumentsOverview,
} from '../../hooks/queries/useOrganizationDocumentsOverview';
import { useOrgChannelMessages } from '../../hooks/queries/useOrgChannelMessages';
import { useOrganizationsMy } from '../../hooks/queries/useOrganizationsMy';
import { useFriendsList } from '../../hooks/queries/useFriendsList';
import { queryKeys } from '../../lib/queryKeys';
import { appShellBg } from '../../theme/shellTheme';
import { displayDepartmentName } from '../../utils/orgEntityDisplay';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

import {
  divisionChannelsFromStructure,
  mergeChannelsById,
  filterWorkspaceStructureByScope,
  isProtectedDefaultChannel,
  channelsForDepartment,
} from '../../utils/orgChannelScope';
import { isOrgMembershipStructureAdmin } from '../../components/Organization/roleRbacUtils';
import {
  normalizeOrgChatMessage,
  normalizeOrgChatMessages,
} from '../../utils/normalizeOrgChatMessage';
import { enrichOrgChatMessagesWithProfiles } from '../../utils/enrichOrgChatMessages';
import {
  findOrgBySlug,
  mergeOrganizationsList,
  orgRecordId,
  organizationsListSame,
  workspacePayloadFromOrg,
} from '../../utils/orgListUtils';
import {
  buildCollaborateDocumentsPath,
  buildCollaborateOrgNotificationsPath,
  buildCollaborateTasksPath,
  buildCommunicateChannelsPath,
  orgQueryFromSearch,
  departmentQueryFromSearch,
  teamQueryFromSearch,
  boardQueryFromSearch,
  projectQueryFromSearch,
  channelQueryFromSearch,
} from '../../utils/suitePathUtils';
import {
  preferDefaultTextChannelId as preferDeptTextChannelId,
  resolveDeptChatChannelId,
  resolveDeptVoiceChannelId,
  resolveDeptAnnouncementChannelId,
  findDeptChannelByType,
} from '../../utils/departmentChannelUtils';
import WorkspacesOrgPickerView from '../../components/Workspace/WorkspacesOrgPickerView';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';
import OrganizationTeamGrid from '../../components/Workspace/OrganizationTeamGrid';
import OrganizationDepartmentGrid from '../../components/Workspace/OrganizationDepartmentGrid';
import WorkspaceSlugFigmaShell from '../../components/Workspace/WorkspaceSlugFigmaShell';

const unwrapData = (payload) => payload?.data ?? payload;

/** Khi đổi phòng ban: không tự nhảy vào kênh voice — ưu tiên kênh chat hoặc để trống. */

const DEMO_ORGANIZATIONS = [
  {
    _id: 'demo-org-vh',
    id: 'demo-org-vh',
    name: 'VoiceHub Demo',
    slug: 'voicehub-demo',
    role: 'admin',
  },
];

function preferDefaultTextChannelId(
  channelList,
  preferredTeamId = '',
  permissionMatrix = null,
  preferredDepartmentId = '',
  deptOnly = false
) {
  return preferDeptTextChannelId(channelList, {
    preferredTeamId,
    preferredDepartmentId,
    permissionMatrix,
    deptOnly,
  });
}

function orgPickerMemberIsOnline(member = {}) {
  if (member.online === true || member.isOnline === true) return true;
  const status = String(
    member.status ||
      member.presence ||
      member.onlineStatus ||
      member.user?.status ||
      member.user?.presence ||
      ''
  ).toLowerCase();
  return ['online', 'active', 'available'].includes(status);
}

function collectOrgPickerStructureMetrics(branches = [], members = [], locale = 'vi') {
  const departments = [];
  const teams = [];
  const channels = [];
  (Array.isArray(branches) ? branches : []).forEach((branch) => {
    (branch?.divisions || []).forEach((division) => {
      (division?.channels || []).forEach((channel) => channels.push(channel));
      (division?.departments || []).forEach((department) => {
        departments.push(department);
        (department?.channels || []).forEach((channel) => channels.push(channel));
        (department?.teams || []).forEach((team) => {
          teams.push(team);
          (team?.channels || []).forEach((channel) => channels.push(channel));
        });
      });
    });
  });

  const chipSource = teams.length ? teams : departments;
  const colorPalette = ['#2563EB', '#8B5CF6', '#10B981', '#F59E0B'];
  const safeMembers = Array.isArray(members) ? members : [];
  return {
    membersCount: safeMembers.length,
    totalMembers: safeMembers.length,
    onlineNow: safeMembers.filter(orgPickerMemberIsOnline).length,
    teamCount: teams.length,
    teamsCount: teams.length,
    totalTeams: teams.length,
    channelCount: channels.length,
    teams: chipSource.slice(0, 4).map((item, index) => ({
      name: displayDepartmentName(item?.name || `Team ${index + 1}`, locale),
      color: colorPalette[index % colorPalette.length],
    })),
  };
}

function membersFromPayload(payload) {
  const body = unwrapData(payload);
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.members)) return body.members;
  if (Array.isArray(body)) return body;
  return [];
}

function OrganizationsPage({
  landingDemo = false,
  suiteMode = null,
  workspaceTab: workspaceTabProp = null,
  suiteLayout = false,
} = {}) {
  const { t, locale } = useAppStrings();
  const { user, loading: authLoading, isAuthenticated, accessToken } = useAuth();
  const { setActiveWorkspace, lastWorkspaceSlug, setLastWorkspaceSlug, lastOrganizationId, singleOrgMode } =
    useWorkspace();
  const { isDarkMode } = useTheme();
  const { on, off, onlineUsers, connected: socketConnected, joinRoom, leaveRoom } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const location = useLocation();
  const queryClient = useQueryClient();
  const [isLgViewport, setIsLgViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = (e) => setIsLgViewport(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const orgsQuery = useOrganizationsMy({ enabled: !landingDemo });
  const friendsQuery = useFriendsList({ enabled: !landingDemo });
  /** Org từ by-slug chưa có trong GET /organizations/my — giữ tạm tối đa 1 bản ghi. */
  const [slugPendingOrg, setSlugPendingOrg] = useState(null);
  const organizationsStableRef = useRef([]);
  const organizations = useMemo(() => {
    if (landingDemo) return DEMO_ORGANIZATIONS;
    const fromQuery = Array.isArray(orgsQuery.data) ? orgsQuery.data : [];
    const merged = mergeOrganizationsList(fromQuery, slugPendingOrg ? [slugPendingOrg] : []);
    if (organizationsListSame(organizationsStableRef.current, merged)) {
      return organizationsStableRef.current;
    }
    organizationsStableRef.current = merged;
    return merged;
  }, [landingDemo, orgsQuery.data, slugPendingOrg]);
  const organizationIdsKey = useMemo(
    () => organizations.map((o) => orgRecordId(o)).filter(Boolean).sort().join(','),
    [organizations]
  );
  const organizationsLoaded =
    landingDemo || orgsQuery.isFetched || orgsQuery.isSuccess || orgsQuery.isError;
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [workspaceSearchOpen, setWorkspaceSearchOpen] = useState(false);
  const [departments, setDepartments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [departmentWorkspaceActive, setDepartmentWorkspaceActive] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [workspaceStructure, setWorkspaceStructure] = useState([]);
  const [channelPermissionMatrix, setChannelPermissionMatrix] = useState({});
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [channelSettingsChannel, setChannelSettingsChannel] = useState(null);
  const [scopeSettingsOpen, setScopeSettingsOpen] = useState(false);
  const [scopeSettingsType, setScopeSettingsType] = useState('department');
  const [scopeSettingsTarget, setScopeSettingsTarget] = useState(null);
  const [membershipScope, setMembershipScope] = useState({
    branchId: null,
    divisionId: null,
    departmentId: null,
    teamId: null,
    canSeeAllStructure: false,
    structureMode: 'none',
    scopedDivisionIds: [],
    scopedDepartmentIds: [],
    scopedTeamIds: [],
  });
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState(null);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedDivisionId, setSelectedDivisionId] = useState('');
  const [orgProjects, setOrgProjects] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [voiceRoomMessages, setVoiceRoomMessages] = useState([]);
  const [voiceMessageInput, setVoiceMessageInput] = useState('');
  const [voiceChatDismissed, setVoiceChatDismissed] = useState(false);
  const senderProfileCacheRef = useRef(new Map());
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  /** Tiến trình upload file/ảnh lên kênh (0–100), null khi không upload */
  const [channelUploadProgress, setChannelUploadProgress] = useState(null);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteOrgId, setInviteOrgId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteFriends, setInviteFriends] = useState([]);
  const [loadingInviteFriends, setLoadingInviteFriends] = useState(false);
  const [invitingIds, setInvitingIds] = useState([]);
  const [quickInviteInput, setQuickInviteInput] = useState('');
  const [joiningQuickInvite, setJoiningQuickInvite] = useState(false);
  const [orgPickerEnrichmentById, setOrgPickerEnrichmentById] = useState({});
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [generatingInviteLink, setGeneratingInviteLink] = useState(false);
  const [inviteBranchId, setInviteBranchId] = useState('');
  const [inviteDivisionId, setInviteDivisionId] = useState('');
  const [inviteStructureBranches, setInviteStructureBranches] = useState([]);
  const [inviteContextLabel, setInviteContextLabel] = useState('');
  const [pendingInvitations, setPendingInvitations] = useState([]);
  /** Đơn gia nhập đang chờ duyệt (hiển thị bubble sidebar). */
  const [pendingJoinApplications, setPendingJoinApplications] = useState([]);
  /** Đơn cần duyệt (owner/admin) — Trang chủ tổ chức. */
  const [joinApplicationsToReview, setJoinApplicationsToReview] = useState([]);
  const [loadingJoinApplicationsToReview, setLoadingJoinApplicationsToReview] = useState(false);
  const [respondingJoinReviewKeys, setRespondingJoinReviewKeys] = useState([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [respondingInvitationIds, setRespondingInvitationIds] = useState([]);
  const [chatContacts, setChatContacts] = useState([]);
  const [loadingChatContacts, setLoadingChatContacts] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [createWorkspaceStep, setCreateWorkspaceStep] = useState(1);
  const [createOrgName, setCreateOrgName] = useState('');
  const [createWorkspaceSlug, setCreateWorkspaceSlug] = useState('');
  const [createWorkspaceType, setCreateWorkspaceType] = useState('company');
  const [createWorkspaceTeamSize, setCreateWorkspaceTeamSize] = useState('1-10');
  const [createWorkspaceIndustry, setCreateWorkspaceIndustry] = useState('');
  const [createBranchCount, setCreateBranchCount] = useState(1);
  const [createDivisionPerBranch, setCreateDivisionPerBranch] = useState(1);
  const [createDepartmentPerDivision, setCreateDepartmentPerDivision] = useState(2);
  const [createTeamPerDepartment, setCreateTeamPerDepartment] = useState(2);
  const [createBranchCountInput, setCreateBranchCountInput] = useState('1');
  const [createDivisionPerBranchInput, setCreateDivisionPerBranchInput] = useState('1');
  const [createDepartmentPerDivisionInput, setCreateDepartmentPerDivisionInput] = useState('2');
  const [createTeamPerDepartmentInput, setCreateTeamPerDepartmentInput] = useState('2');
  const [createBranchNames, setCreateBranchNames] = useState(['']);
  const [createDivisionNames, setCreateDivisionNames] = useState([['']]);
  const [createDepartmentNames, setCreateDepartmentNames] = useState([[['']]]); // [b][d][dept]
  const [createTeamNames, setCreateTeamNames] = useState([[[['']]]]); // [b][d][dept][team]

  useEffect(() => {
    const branchCount = Math.max(1, Number(createBranchCount) || 1);
    const divisionsPerBranch = Math.max(1, Number(createDivisionPerBranch) || 1);
    const departmentsPerDivision = Math.max(1, Number(createDepartmentPerDivision) || 1);
    const teamsPerDepartment = Math.max(1, Number(createTeamPerDepartment) || 1);

    setCreateBranchNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) => {
        const val = prev?.[bIdx];
        const fallback = bIdx === 0 ? t('organizations.branchFallbackHq') : t('organizations.branchFallbackN', { n: bIdx + 1 });
        return val != null && String(val).trim() ? String(val) : fallback;
      })
    );

    setCreateDivisionNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) => {
          const val = prev?.[bIdx]?.[dIdx];
          const fallback = dIdx === 0 ? t('organizations.divisionTechFallback') : t('organizations.divisionFallbackN', { n: dIdx + 1 });
          return val != null && String(val).trim() ? String(val) : fallback;
        })
      )
    );

    setCreateDepartmentNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) =>
          Array.from({ length: departmentsPerDivision }, (_, depIdx) => {
            const val = prev?.[bIdx]?.[dIdx]?.[depIdx];
            const fallback = t('organizations.deptFallbackN', { n: depIdx + 1 });
            return val != null && String(val).trim() ? String(val) : fallback;
          })
        )
      )
    );

    setCreateTeamNames((prev) =>
      Array.from({ length: branchCount }, (_, bIdx) =>
        Array.from({ length: divisionsPerBranch }, (_, dIdx) =>
          Array.from({ length: departmentsPerDivision }, (_, depIdx) =>
            Array.from({ length: teamsPerDepartment }, (_, tIdx) => {
              const val = prev?.[bIdx]?.[dIdx]?.[depIdx]?.[tIdx];
              const fallback = `Team ${depIdx + 1}.${tIdx + 1}`;
              return val != null && String(val).trim() ? String(val) : fallback;
            })
          )
        )
      )
    );
  }, [createBranchCount, createDivisionPerBranch, createDepartmentPerDivision, createTeamPerDepartment]);
  const [createDeptModalOpen, setCreateDeptModalOpen] = useState(false);
  const [createDeptName, setCreateDeptName] = useState('');
  const [createDeptDivisionId, setCreateDeptDivisionId] = useState('');
  const [createDivisionModalOpen, setCreateDivisionModalOpen] = useState(false);
  const [createDivisionName, setCreateDivisionName] = useState('');
  const [createDivisionBranchId, setCreateDivisionBranchId] = useState('');
  const [createTeamModalOpen, setCreateTeamModalOpen] = useState(false);
  const [creatingProjectBoard, setCreatingProjectBoard] = useState(false);
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelName, setCreateChannelName] = useState('');
  const [createChannelBranchId, setCreateChannelBranchId] = useState('');
  const [createChannelDivisionId, setCreateChannelDivisionId] = useState('');
  const [createChannelDepartmentId, setCreateChannelDepartmentId] = useState('');
  const [createChannelTeamId, setCreateChannelTeamId] = useState('');
  const [createChannelLevel, setCreateChannelLevel] = useState('team');
  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [renameTargetType, setRenameTargetType] = useState('');
  const [renameTargetId, setRenameTargetId] = useState('');
  const [renameTargetName, setRenameTargetName] = useState('');
  const [deleteChannelMsgConfirmId, setDeleteChannelMsgConfirmId] = useState(null);
  const [leaveOrgModalOpen, setLeaveOrgModalOpen] = useState(false);
  const [leaveOrgPendingId, setLeaveOrgPendingId] = useState(null);
  const [leaveOrgPendingName, setLeaveOrgPendingName] = useState('');
  const [leavingOrg, setLeavingOrg] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwardTargetsLoading, setForwardTargetsLoading] = useState(false);
  const [memberListRefreshKey, setMemberListRefreshKey] = useState(0);
  const [workspaceTasks, setWorkspaceTasks] = useState([]);
  const [loadingWorkspaceTasks, setLoadingWorkspaceTasks] = useState(false);
  const [workspaceDocFiles, setWorkspaceDocFiles] = useState([]);
  const [loadingWorkspaceDocuments, setLoadingWorkspaceDocuments] = useState(false);
  const [workspaceDocumentsError, setWorkspaceDocumentsError] = useState('');
  const [orgMembers, setOrgMembers] = useState([]);
  const initialTab = useMemo(() => {
    if (suiteMode === 'communicate') return 'chat';
    if (workspaceTabProp) return workspaceTabProp;
    return 'chat';
  }, [suiteMode, workspaceTabProp]);
  const [workspaceTabView, setWorkspaceTabView] = useState(initialTab);
  const previousVoiceChannelIdRef = useRef('');
  const workspaceDeepLinkRef = useRef('');
  const hasInviteQuery = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('orgId') || params.get('inviteOrgId') || params.get('inviteToken'));
  }, [location.search]);
  const shouldRedirectEmptyOrganizations =
    !landingDemo &&
    organizationsLoaded &&
    organizations.length === 0 &&
    !createOrgModalOpen &&
    !location.state?.openCreateWorkspace &&
    !hasInviteQuery;
  useEffect(() => {
    if (suiteMode === 'communicate') {
      setWorkspaceTabView('chat');
      return;
    }
    if (workspaceTabProp) setWorkspaceTabView(workspaceTabProp);
  }, [suiteMode, workspaceTabProp]);

  const orgIdFromQuery = useMemo(
    () => orgQueryFromSearch(location.search),
    [location.search]
  );
  const departmentIdFromQuery = useMemo(
    () => departmentQueryFromSearch(location.search),
    [location.search]
  );
  const teamIdFromQuery = useMemo(
    () => teamQueryFromSearch(location.search),
    [location.search]
  );
  const boardIdFromQuery = useMemo(
    () => boardQueryFromSearch(location.search),
    [location.search]
  );
  const projectIdFromQuery = useMemo(
    () => projectQueryFromSearch(location.search),
    [location.search]
  );
  const channelIdFromQuery = useMemo(
    () => channelQueryFromSearch(location.search),
    [location.search]
  );

  const orgPickerRouteActive = useMemo(
    () =>
      suiteLayout &&
      !landingDemo &&
      !workspaceTabProp &&
      !orgIdFromQuery &&
      ((suiteMode === 'collaborate' && location.pathname === '/app/collaborate/workspaces') ||
        (suiteMode === 'communicate' && location.pathname === '/app/communicate/channels')),
    [suiteLayout, landingDemo, workspaceTabProp, orgIdFromQuery, suiteMode, location.pathname]
  );

  const showOrgPicker = orgPickerRouteActive && !singleOrgMode && !readSingleOrgModeFlag();

  const showTeamHub = useMemo(
    () =>
      suiteLayout &&
      (suiteMode === 'collaborate' || suiteMode === 'communicate') &&
      selectedOrganizationId &&
      !selectedTeamId &&
      !departmentWorkspaceActive &&
      !landingDemo,
    [
      suiteLayout,
      suiteMode,
      selectedOrganizationId,
      selectedTeamId,
      departmentWorkspaceActive,
      landingDemo,
    ]
  );

  /** Route «Dự án» — landing project org-level, không dept/team hub. */
  const isProjectsRoute = useMemo(
    () =>
      workspaceTabProp === 'tasks' ||
      (suiteMode === 'collaborate' &&
        String(location.pathname || '').startsWith('/app/collaborate/tasks')),
    [workspaceTabProp, suiteMode, location.pathname]
  );

  const hasOpenProjectBoard = Boolean(
    String(boardIdFromQuery || '').trim() || String(projectIdFromQuery || '').trim()
  );

  const showProjectsLanding = Boolean(
    showTeamHub && isProjectsRoute && !hasOpenProjectBoard
  );

  useEffect(() => {
    if (!orgPickerRouteActive) return;
    setSelectedOrganizationId((prev) => (prev === '' ? prev : ''));
    setSelectedTeamId((prev) => (prev === '' ? prev : ''));
    setSelectedDepartmentId((prev) => (prev === '' ? prev : ''));
    setDepartmentWorkspaceActive(false);
    setSelectedDivisionId((prev) => (prev === '' ? prev : ''));
    setSelectedBranchId((prev) => (prev === '' ? prev : ''));
    setSelectedChannelId((prev) => (prev === '' ? prev : ''));
    setWorkspaceSearchOpen(false);
  }, [orgPickerRouteActive]);

  const notify = (message, type = 'success') => {
    if (type === 'fail') toast.error(message);
    else if (type === 'info') toast(message, { icon: 'ℹ️' });
    else toast.success(message);
  };
  const notifySuccess = (message) => notify(message, 'success');
  const notifyError = (message) => notify(message, 'fail');
  const inviteJoinSuccessText = (data) => {
    const ctx = data?.inviteContext || {};
    const parts = [ctx?.branchName, ctx?.divisionName].filter(Boolean);
    if (!parts.length) return t('organizations.joinedFromInvite');
    return `${t('organizations.joinedFromInvite')} (${parts.join(' / ')})`;
  };

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org._id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId]
  );

  useEffect(() => {
    if (landingDemo || !suiteLayout || !showOrgPicker || !organizations.length) {
      setOrgPickerEnrichmentById((prev) => (Object.keys(prev).length ? {} : prev));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        organizations.map(async (org) => {
          const orgId = orgRecordId(org);
          if (!orgId) return null;
          try {
            const [shellPayload, memberPayload] = await Promise.all([
              organizationAPI.getOrgShell(orgId).catch(() => null),
              organizationAPI.getMembers(orgId).catch(() => null),
            ]);
            const shell = unwrapData(shellPayload);
            const branches =
              shell?.structureSummary?.branches ||
              shell?.data?.structureSummary?.branches ||
              shell?.branches ||
              [];
            const members = membersFromPayload(memberPayload);
            return [
              orgId,
              collectOrgPickerStructureMetrics(branches, members, locale),
            ];
          } catch {
            return [orgId, {}];
          }
        })
      );
      if (cancelled) return;
      setOrgPickerEnrichmentById(
        Object.fromEntries(entries.filter(Boolean))
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [landingDemo, suiteLayout, showOrgPicker, organizationIdsKey, organizations, locale]);

  const enrichedOrganizationsForPicker = useMemo(
    () =>
      organizations.map((org) => {
        const orgId = orgRecordId(org);
        const enrichment = orgPickerEnrichmentById[orgId] || {};
        return {
          ...org,
          ...enrichment,
          teams: enrichment.teams || org.teams,
        };
      }),
    [organizations, orgPickerEnrichmentById]
  );

  const handleWorkspaceTabChange = useCallback(
    (tab) => {
      const next = String(tab || 'chat').trim().toLowerCase();
      if (!selectedOrganizationId || landingDemo) return;
      const orgId = String(selectedOrganizationId);
      if (next === 'chat') {
        navigate(`${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(orgId)}`);
        return;
      }
      if (next === 'tasks') {
        navigate(
          buildCollaborateTasksPath(orgId, {
            departmentId: selectedDepartmentId && !selectedTeamId ? selectedDepartmentId : '',
          })
        );
        return;
      }
      if (next === 'documents') {
        navigate(buildCollaborateDocumentsPath(orgId));
        return;
      }
      if (next === 'notifications') {
        navigate(buildCollaborateOrgNotificationsPath(orgId));
      }
    },
    [selectedOrganizationId, landingDemo, navigate, selectedDepartmentId, selectedTeamId]
  );

  const openWorkspaceNotifications = useCallback(() => {
    if (!selectedOrganizationId) return;
    handleWorkspaceTabChange('notifications');
  }, [selectedOrganizationId, handleWorkspaceTabChange]);

  const handleOpenDocumentInWorkspace = useCallback(
    (file) => {
      if (file?.roomId) {
        setSelectedChannelId(String(file.roomId));
      }
      if (!selectedOrganizationId) return;
      const params = new URLSearchParams({ organizationId: String(selectedOrganizationId) });
      if (file?.roomId) params.set('channelId', String(file.roomId));
      if (file?.source === 'message' && file?.id) params.set('messageId', String(file.id));
      navigate(`${buildCollaborateDocumentsPath()}?${params.toString()}`);
    },
    [selectedOrganizationId, navigate]
  );

  useEffect(() => {
    setWorkspaceSearchOpen(false);
  }, [selectedOrganizationId]);

  useEffect(() => {
    setWorkspaceSearchOpen(false);
  }, [location.pathname]);
  const selectedDepartment = useMemo(
    () => departments.find((department) => department._id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );
  const selectedTeam = useMemo(
    () => teams.find((team) => String(team._id) === String(selectedTeamId)) || null,
    [teams, selectedTeamId]
  );

  const selectedChannel = useMemo(
    () => channels.find((ch) => String(ch._id) === String(selectedChannelId)) || null,
    [channels, selectedChannelId]
  );
  const selectedChannelType = String(selectedChannel?.type || '').toLowerCase();

  const shellActiveTab = useMemo(() => {
    const deptMode = Boolean(departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId);
    if (deptMode) {
      const tab = String(workspaceTabView || 'announcement').toLowerCase();
      if (['announcement', 'tasks', 'members', 'documents', 'calendar', 'meetings'].includes(tab)) {
        return tab;
      }
      if (tab === 'chat' || tab === 'voice') return 'announcement';
      return 'announcement';
    }
    if (suiteMode === 'communicate') {
      return selectedChannelType === 'voice' ? 'voice' : 'chat';
    }
    if (workspaceTabView === 'documents') return 'documents';
    if (workspaceTabView === 'tasks') return 'tasks';
    return 'chat';
  }, [
    suiteMode,
    selectedChannelType,
    workspaceTabView,
    departmentWorkspaceActive,
    selectedDepartmentId,
    selectedTeamId,
  ]);

  const shellSelectedTeam = useMemo(() => {
    if (!selectedTeam) return null;
    const name = displayDepartmentName(selectedTeam.name || '', locale) || selectedTeam.name || '';
    const initial = String(name).trim().charAt(0).toUpperCase() || 'T';
    return {
      id: selectedTeam._id || selectedTeam.id,
      name,
      initial,
      color: '#2563EB',
    };
  }, [selectedTeam, locale]);

  const shellSelectedDepartment = useMemo(() => {
    if (!departmentWorkspaceActive || !selectedDepartment) return null;
    const name =
      displayDepartmentName(selectedDepartment.name || '', locale) ||
      selectedDepartment.name ||
      '';
    const id = String(selectedDepartment._id || selectedDepartment.id || '');
    const colorSeed = id.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    const palette = ['#475569', '#1D4ED8', '#7C3AED', '#059669', '#D97706'];
    return {
      id,
      name,
      color: palette[colorSeed % palette.length],
    };
  }, [departmentWorkspaceActive, selectedDepartment, locale]);

  const voiceFileInputRef = useRef(null);
  const voiceImageInputRef = useRef(null);
  const voiceComposerHelpersRef = useRef({});
  const registerVoiceComposerHelpers = useCallback((helpers) => {
    voiceComposerHelpersRef.current = helpers || {};
  }, []);
  const canWriteInVoiceChannel = Boolean(
    channelPermissionMatrix?.[String(selectedChannelId || '')]?.canWrite
  );
  const selectedBranch = useMemo(
    () => workspaceStructure.find((branch) => String(branch._id) === String(selectedBranchId)) || null,
    [workspaceStructure, selectedBranchId]
  );
  const selectedDivision = useMemo(
    () =>
      (selectedBranch?.divisions || []).find(
        (division) => String(division._id) === String(selectedDivisionId)
      ) || null,
    [selectedBranch, selectedDivisionId]
  );
  const inviteOrganization = useMemo(
    () => organizations.find((org) => org._id === inviteOrgId) || null,
    [organizations, inviteOrgId]
  );
  const isInviteLinkBeta = window.location.protocol !== 'https:';
  const filteredInviteFriends = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return inviteFriends;
    return inviteFriends.filter((friend) => {
      const text = `${friend.name} ${friend.username}`.toLowerCase();
      return text.includes(q);
    });
  }, [inviteFriends, inviteSearch]);

  const activeWorkspaceSyncKey = useMemo(
    () => `${selectedOrganizationId}|${organizationIdsKey}`,
    [selectedOrganizationId, organizationIdsKey]
  );
  const lastWorkspacePushRef = useRef('');

  useEffect(() => {
    if (!selectedOrganizationId) {
      lastWorkspacePushRef.current = '';
      return;
    }
    const current = organizations.find(
      (item) => orgRecordId(item) === String(selectedOrganizationId)
    );
    if (!current) return;
    const pushKey = orgRecordId(current);
    if (lastWorkspacePushRef.current === pushKey) return;
    lastWorkspacePushRef.current = pushKey;
    setActiveWorkspace(workspacePayloadFromOrg(current));
  }, [activeWorkspaceSyncKey, setActiveWorkspace]);

  /** Số đơn gia nhập chờ duyệt theo từng tổ chức (badge trên avatar). */
  const joinReviewCountByOrgId = useMemo(() => {
    const m = {};
    for (const app of joinApplicationsToReview) {
      const id = String(app.organizationId);
      m[id] = (m[id] || 0) + 1;
    }
    return m;
  }, [joinApplicationsToReview]);

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return String(forwardSourceMessage.content || '').slice(0, 500);
  }, [forwardSourceMessage]);

  const extractInvitePayloadFromInput = (raw) => {
    if (!raw) return '';
    const input = raw.trim();
    if (!input) return { orgId: '', token: '' };

    try {
      const url = new URL(input);
      return {
        orgId: url.searchParams.get('orgId') || url.searchParams.get('inviteOrgId') || '',
        token: url.searchParams.get('inviteToken') || '',
      };
    } catch (error) {
      // Fallback: cho phép dán query string rút gọn + decode URL-encoded values
      const tokenRaw = (input.includes('inviteToken=') && input.split('inviteToken=')[1]?.split('&')[0]) || '';
      const token = tokenRaw ? decodeURIComponent(tokenRaw) : '';
      const orgIdRaw = (input.includes('orgId=') && input.split('orgId=')[1]?.split('&')[0]) ||
        (input.includes('inviteOrgId=') && input.split('inviteOrgId=')[1]?.split('&')[0]) || '';
      const orgId = orgIdRaw ? decodeURIComponent(orgIdRaw) : '';
      return { orgId, token };
    }
  };

  const toWorkspaceSlug = (value) =>
    String(value || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

  const loadOrganizations = async () => {
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.organizations.my() });
      await queryClient.refetchQueries({ queryKey: queryKeys.organizations.my() });
    } catch (error) {
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.loadOrgsFail') }));
    }
  };

  const loadPendingInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const payload = await organizationAPI.getMyInvitations();
      const list = unwrapData(payload);
      setPendingInvitations(Array.isArray(list) ? list : []);
    } catch (error) {
      setPendingInvitations([]);
      notifyError(t('organizations.loadInvitesFail'));
    } finally {
      setLoadingInvitations(false);
    }
  };

  const loadPendingJoinApplications = async () => {
    setPendingJoinApplications([]);
  };

  const loadJoinApplicationsToReview = async () => {
    setJoinApplicationsToReview([]);
    setLoadingJoinApplicationsToReview(false);
  };

  const handleApproveJoinApplication = async () => {};

  const handleRejectJoinApplication = async () => {};

  const loadChatContacts = async (organizationIdArg = selectedOrganizationId) => {
    setLoadingChatContacts(true);
    try {
      const [friendPayload, memberPayload] = await Promise.all([
        friendService.getFriends(),
        organizationIdArg ? organizationAPI.getMembers(organizationIdArg) : Promise.resolve(null),
      ]);
      const friendData = unwrapData(friendPayload);
      const rawFriendList = Array.isArray(friendData?.friends)
        ? friendData.friends
        : Array.isArray(friendData)
          ? friendData
          : [];
      const friendContacts = rawFriendList
        .map((item) => item.friendId || item)
        .filter(Boolean)
        .map((item) => ({
          id: item._id || item.id,
          name: item.displayName || item.name || item.username || t('organizations.userFallback'),
          username: item.username || '',
          role: item.role || '',
          phone: item.phone || item.phoneNumber || item.mobile || '',
          email: item.email || '',
          avatar: item.avatar || null,
          category: 'friend',
        }))
        .filter((item) => !!item.id);
      const memberData = unwrapData(memberPayload);
      const rawMemberList = Array.isArray(memberData?.data)
        ? memberData.data
        : Array.isArray(memberData)
          ? memberData
          : [];
      setOrgMembers(rawMemberList);
      const memberContacts = rawMemberList
        .map((item) => item?.user || item)
        .filter(Boolean)
        .map((item) => ({
          id: item._id || item.id || item.userId,
          name:
            item.displayName ||
            item.fullName ||
            item.username ||
            item.email ||
            t('organizations.userFallback'),
          username: item.username || '',
          role: item.role || item.memberRole || '',
          phone: item.phone || item.phoneNumber || item.mobile || '',
          email: item.email || '',
          avatar: item.avatar || null,
          category: 'work',
        }))
        .filter((item) => !!item.id);
      const merged = new Map();
      [...memberContacts, ...friendContacts].forEach((item) => {
        const key = String(item.id);
        if (!merged.has(key)) merged.set(key, item);
      });
      setChatContacts(Array.from(merged.values()));
    } catch (error) {
      setChatContacts([]);
    } finally {
      setLoadingChatContacts(false);
    }
  };

  const buildStructureBlueprint = () => {
    const branchCount = Math.max(1, Number(createBranchCount) || 1);
    const divisionsPerBranch = Math.max(1, Number(createDivisionPerBranch) || 1);
    const departmentsPerDivision = Math.max(1, Number(createDepartmentPerDivision) || 1);
    const teamsPerDepartment = Math.max(1, Number(createTeamPerDepartment) || 1);
    const safeBranchNames = Array.isArray(createBranchNames) ? createBranchNames : [];
    const safeDivisionNames = Array.isArray(createDivisionNames) ? createDivisionNames : [];
    const safeDepartmentNames = Array.isArray(createDepartmentNames) ? createDepartmentNames : [];
    const safeTeamNames = Array.isArray(createTeamNames) ? createTeamNames : [];
    return {
      branches: Array.from({ length: branchCount }, (_, bIdx) => ({
        name:
          safeBranchNames[bIdx] != null && String(safeBranchNames[bIdx]).trim()
            ? String(safeBranchNames[bIdx]).trim()
            : bIdx === 0
              ? t('organizations.branchFallbackHq')
              : t('organizations.branchFallbackN', { n: bIdx + 1 }),
        location: '',
        divisions: Array.from({ length: divisionsPerBranch }, (_, dIdx) => ({
          name:
            safeDivisionNames[bIdx]?.[dIdx] != null && String(safeDivisionNames[bIdx]?.[dIdx]).trim()
              ? String(safeDivisionNames[bIdx]?.[dIdx]).trim()
              : dIdx === 0
                ? t('organizations.divisionTechFallback')
                : t('organizations.divisionFallbackN', { n: dIdx + 1 }),
          departments: Array.from({ length: departmentsPerDivision }, (_, depIdx) => ({
            name:
              safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx] != null &&
              String(safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx]).trim()
                ? String(safeDepartmentNames[bIdx]?.[dIdx]?.[depIdx]).trim()
                : t('organizations.deptFallbackN', { n: depIdx + 1 }),
            teams: Array.from({ length: teamsPerDepartment }, (_, tIdx) => ({
              name:
                safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx] != null &&
                String(safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx]).trim()
                  ? String(safeTeamNames[bIdx]?.[dIdx]?.[depIdx]?.[tIdx]).trim()
                  : `Team ${depIdx + 1}.${tIdx + 1}`,
            })),
          })),
        })),
      })),
    };
  };

  const findBranchAndDivisionForDepartment = useMemo(() => {
    // Memoized to avoid rebuilding maps on every render; depends on workspaceStructure.
    if (!Array.isArray(workspaceStructure) || workspaceStructure.length === 0) return null;
    const departmentIdToBranchAndDivision = new Map();

    for (const branch of workspaceStructure) {
      const branchId = branch?._id ? String(branch._id) : '';
      for (const division of branch?.divisions || []) {
        const divisionId = division?._id ? String(division._id) : '';
        for (const department of division?.departments || []) {
          const deptId = department?._id ? String(department._id) : '';
          if (deptId) departmentIdToBranchAndDivision.set(deptId, { branchId, divisionId });
        }
      }
    }

    return departmentIdToBranchAndDivision;
  }, [workspaceStructure]);

  const reloadOrgShell = useCallback(
    (orgId) => {
      const id = orgId != null && orgId !== '' ? String(orgId) : '';
      if (!id) return Promise.resolve();
      return queryClient.invalidateQueries({ queryKey: queryKeys.org.shell(id) });
    },
    [queryClient]
  );

  const lastShellAppliedRef = useRef('');

  const applyOrgShell = useCallback((shell) => {
    if (!shell || typeof shell !== 'object') return;

    const struct = shell.structureSummary || {};
    const branches = Array.isArray(struct?.branches) ? struct.branches : [];
    setWorkspaceStructure(branches);

    const depList = [];
    const teamList = [];
    const seenDeptIds = new Set();
    const seenTeamIds = new Set();
    const departmentIdToBranchAndDivision = new Map();
    for (const branch of branches) {
      const branchId = branch?._id ? String(branch._id) : '';
      for (const division of branch?.divisions || []) {
        const divisionId = division?._id ? String(division._id) : '';
        for (const department of division?.departments || []) {
          if (department?.isSynthetic) continue;
          const deptId = department?._id ? String(department._id) : '';
          if (!deptId || seenDeptIds.has(deptId)) continue;
          seenDeptIds.add(deptId);
          depList.push(department);
          departmentIdToBranchAndDivision.set(deptId, { branchId, divisionId });
          for (const team of department?.teams || []) {
            if (team?.isSynthetic) continue;
            const teamId = team?._id ? String(team._id) : '';
            if (!teamId || seenTeamIds.has(teamId)) continue;
            seenTeamIds.add(teamId);
            teamList.push(team);
          }
        }
      }
    }
    setDepartments(depList);
    setTeams(teamList);
    setSelectedBranchId((prev) => (prev ? prev : branches?.[0]?._id ? String(branches[0]._id) : ''));

    const access = shell.access || {};
    const scope = access.scope || {};
    setChannelPermissionMatrix(access.permissionsByChannelId || {});
    const scopedDivs = Array.isArray(scope.scopedDivisionIds)
      ? scope.scopedDivisionIds.map(String)
      : [];
    const scopedDepts = Array.isArray(scope.scopedDepartmentIds)
      ? scope.scopedDepartmentIds.map(String)
      : [];
    const scopedTeams = Array.isArray(scope.scopedTeamIds)
      ? scope.scopedTeamIds.map(String)
      : [];
    setMembershipScope({
      branchId: scope.branchId || null,
      divisionId: scope.divisionId || null,
      departmentId: scope.departmentId || null,
      teamId: scope.teamId || null,
      canSeeAllStructure: Boolean(scope.canSeeAllStructure),
      structureMode: String(scope.structureMode || 'none'),
      scopedDivisionIds: scopedDivs,
      scopedDepartmentIds: scopedDepts,
      scopedTeamIds: scopedTeams,
    });
    if (scope.branchId) setSelectedBranchId(String(scope.branchId));
    const pickDivisionId =
      scope.divisionId || (scopedDivs.length === 1 ? scopedDivs[0] : '') || '';
    const pickDepartmentId =
      scope.departmentId || (scopedDepts.length === 1 ? scopedDepts[0] : '') || '';
    if (pickDepartmentId && !pickDivisionId) {
      const loc = departmentIdToBranchAndDivision.get(String(pickDepartmentId));
      if (loc?.branchId) setSelectedBranchId(String(loc.branchId));
      if (loc?.divisionId) setSelectedDivisionId(String(loc.divisionId));
    }
    if (pickDivisionId) setSelectedDivisionId(String(pickDivisionId));
    const shouldHoldForTeamHub =
      suiteLayout &&
      (suiteMode === 'communicate' || suiteMode === 'collaborate') &&
      !workspaceTabProp;
    // F5 / deep-link: URL có departmentId mà không có teamId → giữ workspace phòng, không auto nhảy team.
    const preferDepartmentWorkspace =
      suiteLayout && Boolean(departmentIdFromQuery) && !teamIdFromQuery;
    const preferTeamFromQuery =
      suiteLayout && Boolean(teamIdFromQuery);
    setSelectedDepartmentId((prev) => {
      if (preferDepartmentWorkspace || preferTeamFromQuery) {
        const fromQuery = departmentIdFromQuery
          ? String(departmentIdFromQuery)
          : '';
        if (fromQuery && depList.some((d) => String(d._id) === fromQuery)) return fromQuery;
      }
      if (shouldHoldForTeamHub) {
        if (prev && depList.some((d) => String(d._id) === String(prev))) return prev;
        return '';
      }
      if (pickDepartmentId) return String(pickDepartmentId);
      return prev;
    });
    if (preferDepartmentWorkspace) {
      setDepartmentWorkspaceActive(true);
    } else if (preferTeamFromQuery) {
      setDepartmentWorkspaceActive(false);
    }
    const scopedTeamId = scope.teamId
      ? String(scope.teamId)
      : scopedTeams.length === 1
        ? String(scopedTeams[0])
        : '';
    setSelectedTeamId((prev) => {
      if (preferDepartmentWorkspace) return '';
      if (preferTeamFromQuery) {
        const qTeam = String(teamIdFromQuery);
        if (teamList.some((team) => String(team?._id || team?.id || '') === qTeam)) return qTeam;
      }
      const prevStillVisible =
        prev && teamList.some((team) => String(team?._id || team?.id || '') === String(prev));
      if (prevStillVisible) return prev;
      if (shouldHoldForTeamHub) return '';
      return scopedTeamId;
    });

    const taskScope = shell.taskWorkspaceScope;
    const shellMyRole = String(shell?.organization?.myRole || '').trim();
    if (taskScope && typeof taskScope === 'object') {
      const enriched =
        taskScope.membershipRole || !shellMyRole
          ? taskScope
          : { ...taskScope, membershipRole: shellMyRole };
      setTaskWorkspaceScope(enriched);
    } else {
      setTaskWorkspaceScope(null);
    }

    if (shellMyRole && shell?.organization?.id) {
      const oid = String(shell.organization.id);
      queryClient.setQueryData(queryKeys.organizations.my(), (prev) => {
        if (!Array.isArray(prev)) return prev;
        let changed = false;
        const next = prev.map((org) => {
          const id = String(org?._id || org?.id || '');
          if (id !== oid) return org;
          if (String(org?.myRole || org?.role || '') === shellMyRole) return org;
          changed = true;
          return { ...org, myRole: shellMyRole, role: org?.role || shellMyRole };
        });
        return changed ? next : prev;
      });
    }

    const orgUnread = Number(shell?.badges?.notificationsUnreadOrg);
    if (Number.isFinite(orgUnread) && shell?.organization?.id) {
      const oid = String(shell.organization.id);
      queryClient.setQueryData(
        queryKeys.notifications.badge('organization', oid),
        { unreadCount: Math.max(0, orgUnread) },
        { updatedAt: Date.now() }
      );
    }
  }, [
    queryClient,
    suiteLayout,
    suiteMode,
    workspaceTabProp,
    departmentIdFromQuery,
    teamIdFromQuery,
  ]);

  const { data: orgShellData, isError: orgShellError, error: orgShellQueryError } = useOrgShell(selectedOrganizationId, {
    enabled: !landingDemo && !authLoading,
  });

  const memberAccessIncomplete = useMemo(() => {
    if (landingDemo || !selectedOrganizationId || !orgShellData || orgShellError) return false;
    if (orgShellData?.access?.memberReady === false) return true;
    if (orgShellData?.access?.memberReady === true) return false;
    return isOrgMemberAccessIncomplete(
      orgShellData?.organization?.myRole,
      orgShellData?.access?.scope
    );
  }, [landingDemo, selectedOrganizationId, orgShellData, orgShellError]);

  const hasAuthToken = Boolean(getResolvedBearerToken());

  const notificationsFetchEnabled =
    !landingDemo &&
    !authLoading &&
    isAuthenticated &&
    hasAuthToken &&
    Boolean(selectedOrganizationId) &&
    workspaceTabView === 'notifications' &&
    Boolean(orgShellData) &&
    !orgShellError;

  const orgChannelMessagesQuery = useOrgChannelMessages(
    selectedChannelId,
    selectedOrganizationId,
    {
      enabled:
        !landingDemo &&
        Boolean(selectedChannelId) &&
        selectedChannel?.type !== 'voice',
    }
  );

  const orgChannelMessagesErrorNotifiedRef = useRef(false);

  useEffect(() => {
    if (landingDemo || !orgChannelMessagesQuery.isError) {
      orgChannelMessagesErrorNotifiedRef.current = false;
      return;
    }
    if (orgChannelMessagesErrorNotifiedRef.current) return;
    orgChannelMessagesErrorNotifiedRef.current = true;
    notifyError(
      resolveApiErrorMessage(orgChannelMessagesQuery.error, {
        t,
        fallback: t('organizations.loadMessagesFail'),
      })
    );
  }, [landingDemo, orgChannelMessagesQuery.isError, orgChannelMessagesQuery.error, t]);

  const orgShellErrorNotifiedRef = useRef(false);

  useEffect(() => {
    if (landingDemo || !orgShellError) {
      orgShellErrorNotifiedRef.current = false;
      return;
    }
    if (orgShellErrorNotifiedRef.current) return;
    orgShellErrorNotifiedRef.current = true;
    notifyError(
      resolveApiErrorMessage(orgShellQueryError, {
        t,
        fallback: t('organizations.loadChannelsFail'),
      })
    );
  }, [landingDemo, orgShellError, orgShellQueryError, t]);

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId) {
      lastShellAppliedRef.current = '';
      setTaskWorkspaceScope(null);
      return;
    }
    if (orgShellError) {
      lastShellAppliedRef.current = '';
      setWorkspaceStructure([]);
      setSelectedBranchId('');
      setSelectedDivisionId('');
      setTaskWorkspaceScope({
        visibility: 'self',
        canCreateTask: false,
        canUseAiTask: false,
        assignableUserIds: [],
      });
      return;
    }
    if (!orgShellData) return;
    const fingerprint = [
      selectedOrganizationId,
      orgShellData?.organization?.id,
      orgShellData?.version,
      orgShellData?.structureSummary?.branches?.length,
      Object.keys(orgShellData?.access?.permissionsByChannelId || {}).length,
    ].join(':');
    if (lastShellAppliedRef.current === fingerprint) return;
    lastShellAppliedRef.current = fingerprint;
    applyOrgShell(orgShellData);
  }, [
    landingDemo,
    selectedOrganizationId,
    orgShellData,
    orgShellError,
    applyOrgShell,
  ]);

  useEffect(() => {
    if (!showTeamHub) return;
    setSelectedChannelId('');
    setWorkspaceSearchOpen(false);
  }, [
    showTeamHub,
  ]);

  useEffect(() => {
    if (!showTeamHub || !selectedOrganizationId) {
      setOrgProjects(null);
      return;
    }
    let cancelled = false;
    projectAPI
      .list({
        organizationId: selectedOrganizationId,
      })
      .then((res) => {
        if (cancelled) return;
        const raw = res?.data?.projects ?? res?.projects ?? res?.data ?? res ?? [];
        setOrgProjects(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {
        if (!cancelled) setOrgProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [showTeamHub, selectedOrganizationId]);

  const handleSelectBranch = (branchId) => {
    setSelectedBranchId(branchId);
    const branch = workspaceStructure.find((b) => String(b._id) === String(branchId));
    const division = branch?.divisions?.[0];
    const divisionId = division?._id ? String(division._id) : '';
    setSelectedDivisionId(divisionId);

    const firstDept = division?.departments?.[0];
    const deptId = firstDept?._id ? String(firstDept._id) : '';
    setSelectedDepartmentId(deptId);
  };

  const handleSelectDivision = (divisionId) => {
    // Find branch that owns this division.
    const hitBranch = workspaceStructure.find((b) =>
      (b?.divisions || []).some((d) => String(d._id) === String(divisionId))
    );
    const branchId = hitBranch?._id ? String(hitBranch._id) : '';
    setSelectedBranchId(branchId);
    setSelectedDivisionId(divisionId);

    const division = hitBranch?.divisions?.find((d) => String(d._id) === String(divisionId));
    const scopedInDivision = (membershipScope?.scopedDepartmentIds || [])
      .map(String)
      .filter((deptId) => {
        const dept = departments.find((d) => String(d._id) === deptId);
        return dept && String(dept.division || '') === String(divisionId);
      });
    const preferredDeptId =
      membershipScope?.departmentId &&
      scopedInDivision.includes(String(membershipScope.departmentId))
        ? String(membershipScope.departmentId)
        : scopedInDivision.length === 1
          ? scopedInDivision[0]
          : membershipScope?.departmentId &&
              departments.some(
                (d) =>
                  String(d._id) === String(membershipScope.departmentId) &&
                  String(d.division || '') === String(divisionId)
              )
            ? String(membershipScope.departmentId)
            : '';
    const deptId =
      preferredDeptId ||
      (division?.departments?.[0]?._id ? String(division.departments[0]._id) : '');
    setSelectedDepartmentId(deptId);
    if (membershipScope?.teamId) {
      const team = teams.find((t) => String(t._id) === String(membershipScope.teamId));
      if (team && String(team.department || '') === deptId) {
        setSelectedTeamId(String(membershipScope.teamId));
      }
    }
  };

  const isOrgStructureAdmin =
    Boolean(membershipScope?.canSeeAllStructure) ||
    isOrgMembershipStructureAdmin(selectedOrganization?.myRole);

  /** Chỉ owner/admin được gán vai trò vào từng kênh (khớp API role-access). */
  const canManageChannelRoleAccess = ['owner', 'admin'].includes(
    String(selectedOrganization?.myRole || '').toLowerCase()
  );
  const canManageWorkspaceStructure =
    isOrgMembershipStructureAdmin(selectedOrganization?.myRole) ||
    Boolean(membershipScope?.canSeeAllStructure);

  /** Tạo dự án / task board — khớp BE createBoard (taskWorkspaceScope.canCreateTask). */
  const canCreateProject = Boolean(taskWorkspaceScope?.canCreateTask);

  const canSelectTeam = useCallback(
    (teamId) => {
      if (isOrgStructureAdmin) return true;
      const id = String(teamId);
      if (membershipScope?.scopedTeamIds?.includes(id)) return true;
      return Object.entries(channelPermissionMatrix || {}).some(([channelId, perm]) => {
        const ch = channels.find((c) => String(c._id) === String(channelId));
        if (!ch || String(ch.team || '') !== id) return false;
        return Boolean(perm?.canSee || perm?.canRead);
      });
    },
    [isOrgStructureAdmin, membershipScope?.scopedTeamIds, channels, channelPermissionMatrix]
  );

  const resolveTeamContext = useCallback(
    (teamId, rawTeam = {}) => {
      const id = String(teamId || rawTeam?._id || rawTeam?.id || '');
      const context = {
        branchId: rawTeam?.branchId ? String(rawTeam.branchId) : '',
        divisionId: rawTeam?.divisionId ? String(rawTeam.divisionId) : '',
        departmentId: rawTeam?.departmentId || rawTeam?.department
          ? String(rawTeam.departmentId || rawTeam.department)
          : '',
      };

      if (!id && context.departmentId) return context;
      if (context.branchId && context.divisionId && context.departmentId) return context;

      for (const branch of workspaceStructure || []) {
        const branchId = String(branch?._id || branch?.id || '');
        for (const division of branch?.divisions || []) {
          const divisionId = String(division?._id || division?.id || '');
          for (const department of division?.departments || []) {
            const departmentId = String(department?._id || department?.id || '');
            if (id && departmentId === id) {
              return { branchId, divisionId, departmentId };
            }
            for (const team of department?.teams || []) {
              const nestedTeamId = String(team?._id || team?.id || '');
              if (id && nestedTeamId === id) {
                return {
                  branchId,
                  divisionId,
                  departmentId: String(team?.department || departmentId),
                };
              }
            }
          }
        }
      }

      if (!context.departmentId) {
        const flatTeam = teams.find((team) => String(team?._id || team?.id || '') === id);
        if (flatTeam?.department) context.departmentId = String(flatTeam.department);
      }

      return context;
    },
    [teams, workspaceStructure]
  );

  const canSelectDepartment = useCallback(
    (deptId) => {
      if (isOrgStructureAdmin) return true;
      const id = String(deptId);
      if (membershipScope?.scopedDepartmentIds?.includes(id)) return true;
      if (
        teams.some(
          (team) => String(team.department) === id && canSelectTeam(String(team._id))
        )
      ) {
        return true;
      }
      return Object.entries(channelPermissionMatrix || {}).some(([channelId, perm]) => {
        const ch = channels.find((c) => String(c._id) === String(channelId));
        if (!ch || String(ch.department || '') !== id || ch.team) return false;
        return Boolean(perm?.canSee || perm?.canRead);
      });
    },
    [
      isOrgStructureAdmin,
      membershipScope?.scopedDepartmentIds,
      teams,
      canSelectTeam,
      channels,
      channelPermissionMatrix,
    ]
  );

  const hubDepartments = useMemo(
    () => departments.filter((department) => canSelectDepartment(department._id || department.id)),
    [departments, canSelectDepartment]
  );

  const memberDepartmentIds = useMemo(() => {
    const fromScope = Array.isArray(membershipScope?.scopedDepartmentIds)
      ? membershipScope.scopedDepartmentIds.map(String).filter(Boolean)
      : [];
    if (fromScope.length) return fromScope;
    return hubDepartments.map((d) => String(d._id || d.id || '')).filter(Boolean);
  }, [membershipScope?.scopedDepartmentIds, hubDepartments]);

  const memberDepartmentChannelIds = useMemo(() => {
    const ids = new Set();
    for (const deptId of memberDepartmentIds) {
      for (const ch of channelsForDepartment(channels, deptId)) {
        const id = String(ch._id || ch.id || '').trim();
        if (id) ids.add(id);
      }
      // Kênh announcement/chat trong phòng (kể cả khi type khác) — theo department field
      for (const ch of channels || []) {
        if (String(ch.department || '') !== String(deptId)) continue;
        if (String(ch.team || '')) continue;
        const id = String(ch._id || ch.id || '').trim();
        if (id) ids.add(id);
      }
    }
    return Array.from(ids);
  }, [memberDepartmentIds, channels]);

  const activeProjectsCount = useMemo(() => {
    const list = Array.isArray(orgProjects) ? orgProjects : [];
    return list.filter((p) => {
      const st = String(p?.status || '').toLowerCase();
      return p?.isActive !== false && st !== 'closed' && st !== 'archived';
    }).length;
  }, [orgProjects]);

  const orgHubNeedsDepartmentStep = hubDepartments.length > 0;
  /** Chỉ «Không gian công ty» — phòng ban; không gộp dự án. */
  const showDepartmentHub = Boolean(
    showTeamHub && !isProjectsRoute && !selectedDepartmentId && orgHubNeedsDepartmentStep
  );

  const handleSelectTeam = (teamId) => {
    if (!canSelectTeam(teamId)) return;
    const context = resolveTeamContext(teamId);
    if (context.branchId) setSelectedBranchId(context.branchId);
    if (context.divisionId) setSelectedDivisionId(context.divisionId);
    if (context.departmentId) setSelectedDepartmentId(context.departmentId);
    setSelectedTeamId(String(teamId));
  };

  const handleSelectOrgProject = (project) => {
    const boardId = String(project?.defaultBoardId || project?.boards?.[0]?._id || '').trim();
    const projectId = String(project?._id || project?.projectId || '').trim();
    setSelectedTeamId('');
    setDepartmentWorkspaceActive(false);
    setSelectedDepartmentId('');
    setWorkspaceTabView('tasks');
    setSelectedChannelId('');
    navigate(
      buildCollaborateTasksPath(selectedOrganizationId, {
        projectId,
        ...(boardId ? { boardId } : {}),
      })
    );
  };

  // Deep-link projectId không có boardId → resolve default board (project-first URL).
  useEffect(() => {
    const pid = String(projectIdFromQuery || '').trim();
    const bid = String(boardIdFromQuery || '').trim();
    const orgId = String(selectedOrganizationId || '').trim();
    if (!pid || bid || !orgId || !isProjectsRoute) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await projectAPI.listBoards(pid, orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        const boards = Array.isArray(data) ? data : data?.items || [];
        const main = boards.find((b) => b && b.isActive !== false) || boards[0];
        const nextBoardId = String(main?._id || '').trim();
        if (!cancelled && nextBoardId) {
          navigate(
            buildCollaborateTasksPath(orgId, { projectId: pid, boardId: nextBoardId }),
            { replace: true }
          );
        }
      } catch {
        /* ignore — hub empty until user picks */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    projectIdFromQuery,
    boardIdFromQuery,
    selectedOrganizationId,
    isProjectsRoute,
    navigate,
  ]);

  // Vào route Dự án: bỏ context phòng/team — project là org-level.
  useEffect(() => {
    if (!isProjectsRoute) return;
    setSelectedTeamId('');
    setDepartmentWorkspaceActive(false);
    setSelectedDepartmentId('');
    setSelectedChannelId('');
    setWorkspaceTabView('tasks');
  }, [isProjectsRoute]);

  const handleShellTabChange = useCallback(
    (tab) => {
      const next = String(tab || 'chat').trim().toLowerCase();
      if (!selectedOrganizationId || landingDemo) return;
      const orgId = String(selectedOrganizationId);
      const deptMode = Boolean(departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId);

      if (deptMode) {
        if (next === 'voice') {
          setWorkspaceTabView('chat');
          const chId = resolveDeptVoiceChannelId(
            channels,
            selectedDepartmentId,
            channelPermissionMatrix
          );
          if (chId) setSelectedChannelId(chId);
          navigate(
            buildCommunicateChannelsPath(orgId, {
              departmentId: selectedDepartmentId,
              channelId: chId || '',
            })
          );
          return;
        }
        if (next === 'tasks') {
          setWorkspaceTabView('tasks');
          setSelectedChannelId('');
          navigate(
            buildCollaborateTasksPath(orgId, {
              departmentId: selectedDepartmentId,
              boardId: boardIdFromQuery || '',
            })
          );
          return;
        }
        if (next === 'members' || next === 'calendar' || next === 'meetings' || next === 'documents') {
          setWorkspaceTabView(next);
          setSelectedChannelId('');
          if (next === 'documents') navigate(buildCollaborateDocumentsPath(orgId));
          return;
        }
        // announcement / chat
        setWorkspaceTabView('announcement');
        const chId = resolveDeptAnnouncementChannelId(
          channels,
          selectedDepartmentId,
          channelPermissionMatrix
        );
        if (chId) setSelectedChannelId(chId);
        navigate(
          buildCommunicateChannelsPath(orgId, {
            departmentId: selectedDepartmentId,
            channelId: chId || '',
          })
        );
        return;
      }

      if (next === 'voice') {
        let voiceChId = '';
        if (selectedTeamId) {
          const voiceCh = (Array.isArray(channels) ? channels : []).find(
            (ch) =>
              String(ch.type || '').toLowerCase() === 'voice' &&
              String(ch.team || '') === String(selectedTeamId)
          );
          voiceChId = voiceCh?._id ? String(voiceCh._id) : '';
        } else if (selectedDepartmentId) {
          voiceChId = resolveDeptVoiceChannelId(
            channels,
            selectedDepartmentId,
            channelPermissionMatrix
          );
        } else {
          const voiceCh = (Array.isArray(channels) ? channels : []).find(
            (ch) => String(ch.type || '').toLowerCase() === 'voice'
          );
          voiceChId = voiceCh?._id ? String(voiceCh._id) : '';
        }
        if (voiceChId) setSelectedChannelId(voiceChId);
        setWorkspaceTabView('chat');
        navigate(
          buildCommunicateChannelsPath(orgId, {
            departmentId: selectedDepartmentId && !selectedTeamId ? selectedDepartmentId : '',
            channelId: voiceChId,
          })
        );
        return;
      }
      if (next === 'tasks') {
        setWorkspaceTabView('tasks');
        navigate(
          buildCollaborateTasksPath(orgId, {
            departmentId: selectedDepartmentId && !selectedTeamId ? selectedDepartmentId : '',
          })
        );
        return;
      }
      if (next === 'documents') {
        setWorkspaceTabView('documents');
        navigate(buildCollaborateDocumentsPath(orgId));
        return;
      }
      const textCh = preferDefaultTextChannelId(channels, {
        preferredTeamId: selectedTeamId,
        preferredDepartmentId: selectedDepartmentId,
        permissionMatrix: channelPermissionMatrix,
        deptOnly: Boolean(selectedDepartmentId && !selectedTeamId),
      });
      if (textCh) setSelectedChannelId(String(textCh));
      setWorkspaceTabView('chat');
      navigate(
        buildCommunicateChannelsPath(orgId, {
          departmentId: selectedDepartmentId && !selectedTeamId ? selectedDepartmentId : '',
          channelId: textCh || '',
        })
      );
    },
    [
      selectedOrganizationId,
      landingDemo,
      channels,
      selectedTeamId,
      selectedDepartmentId,
      channelPermissionMatrix,
      navigate,
      departmentWorkspaceActive,
      boardIdFromQuery,
    ]
  );

  const handleTeamModuleClick = useCallback(
    (teamId, module, rawTeam = {}) => {
      if (!teamId || !canSelectTeam(teamId)) return;
      const teamIdString = String(teamId);
      const context = resolveTeamContext(teamIdString, rawTeam);
      if (context.branchId) setSelectedBranchId(context.branchId);
      if (context.divisionId) setSelectedDivisionId(context.divisionId);
      if (context.departmentId) setSelectedDepartmentId(context.departmentId);
      setSelectedTeamId(teamIdString);
      setDepartmentWorkspaceActive(false);

      const mod = String(module || 'chat').toLowerCase();
      if (mod === 'tasks') {
        setWorkspaceTabView('tasks');
        setSelectedChannelId('');
        if (selectedOrganizationId) {
          navigate(
            buildCollaborateTasksPath(String(selectedOrganizationId), {
              departmentId: context.departmentId || '',
              teamId: teamIdString,
            })
          );
        }
        return;
      }
      if (mod === 'documents') {
        setWorkspaceTabView('documents');
        setSelectedChannelId('');
        if (selectedOrganizationId) navigate(buildCollaborateDocumentsPath(String(selectedOrganizationId)));
        return;
      }
      if (mod === 'voice') {
        const voiceCh = (Array.isArray(channels) ? channels : []).find(
          (ch) =>
            String(ch.type || '').toLowerCase() === 'voice' &&
            String(ch.team || '') === teamIdString
        );
        if (voiceCh?._id) setSelectedChannelId(String(voiceCh._id));
        setWorkspaceTabView('chat');
        if (selectedOrganizationId) {
          navigate(`${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(String(selectedOrganizationId))}`);
        }
        return;
      }
      const textCh = preferDefaultTextChannelId(
        channels,
        teamIdString,
        channelPermissionMatrix,
        context.departmentId
      );
      if (textCh) setSelectedChannelId(String(textCh));
      setWorkspaceTabView('chat');
      if (selectedOrganizationId) {
        navigate(`${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(String(selectedOrganizationId))}`);
      }
    },
    [selectedOrganizationId, navigate, canSelectTeam, resolveTeamContext, channels, channelPermissionMatrix]
  );

  const handleSelectDepartment = (deptId, options = {}) => {
    const { workspace = false } = options;
    if (!canSelectDepartment(deptId)) return;
    setDepartmentWorkspaceActive(Boolean(workspace));
    setSelectedDepartmentId(deptId);
    if (!findBranchAndDivisionForDepartment) return;
    const hit = findBranchAndDivisionForDepartment.get(String(deptId));
    if (!hit) return;
    setSelectedBranchId(hit.branchId);
    setSelectedDivisionId(hit.divisionId);
  };

  const handleBackFromDepartmentHub = useCallback(() => {
    setSelectedDepartmentId('');
    setDepartmentWorkspaceActive(false);
  }, []);

  const handleBackFromDepartmentWorkspace = useCallback(() => {
    setDepartmentWorkspaceActive(false);
    setSelectedChannelId('');
    setSelectedDepartmentId('');
    setWorkspaceTabView('announcement');
  }, []);

  const handleDepartmentModuleClick = useCallback(
    async (departmentId, module) => {
      if (!canSelectDepartment(departmentId)) return;
      const deptId = String(departmentId);
      setSelectedTeamId('');
      handleSelectDepartment(deptId, { workspace: true });

      const mod = String(module || 'announcement').toLowerCase();
      const orgId = selectedOrganizationId ? String(selectedOrganizationId) : '';

      if (mod === 'tasks') {
        setWorkspaceTabView('tasks');
        setSelectedChannelId('');
        if (orgId) {
          navigate(
            buildCollaborateTasksPath(orgId, {
              departmentId: deptId,
            })
          );
        }
        return;
      }

      if (mod === 'members' || mod === 'calendar' || mod === 'meetings') {
        setWorkspaceTabView(mod);
        setSelectedChannelId('');
        return;
      }
      if (mod === 'documents') {
        setWorkspaceTabView('documents');
        setSelectedChannelId('');
        if (orgId) navigate(buildCollaborateDocumentsPath(orgId));
        return;
      }

      if (mod === 'voice') {
        setWorkspaceTabView('chat');
        let voiceId = resolveDeptVoiceChannelId(channels, deptId, channelPermissionMatrix);
        if (!voiceId) {
          const existing = findDeptChannelByType(channels, deptId, 'voice');
          voiceId = existing?._id ? String(existing._id) : '';
        }
        if (voiceId) setSelectedChannelId(voiceId);
        if (orgId) {
          navigate(
            buildCommunicateChannelsPath(orgId, {
              departmentId: deptId,
              channelId: voiceId || '',
            })
          );
        }
        return;
      }

      // announcement / chat (default) — kênh text phòng ban
      setWorkspaceTabView('announcement');
      let channelId = '';

      const ensureDeptAnnouncement = async () => {
        if (!orgId) return '';
        const existing = findDeptChannelByType(channels, deptId, 'announcement');
        if (existing?._id) return String(existing._id);
        let id = resolveDeptAnnouncementChannelId(channels, deptId, channelPermissionMatrix);
        if (id) return id;
        try {
          await organizationAPI.createChannelByScope(orgId, {
            level: 'department',
            departmentId: deptId,
            type: 'announcement',
            name: 'announcements',
          });
          await reloadOrgShell(orgId);
          const payload = await organizationAPI.getChannels(orgId, deptId);
          const list = unwrapData(payload);
          const merged = mergeChannelsById(
            Array.isArray(list) ? list : [],
            channels
          );
          setChannels(merged);
          const after = findDeptChannelByType(merged, deptId, 'announcement');
          if (after?._id) return String(after._id);
          id = resolveDeptAnnouncementChannelId(merged, deptId, channelPermissionMatrix);
        } catch (error) {
          notifyError(
            resolveApiErrorMessage(error, {
              t,
              fallback: t('organizations.loadChannelsFail'),
            })
          );
        }
        return id;
      };

      channelId = await ensureDeptAnnouncement();
      if (channelId) setSelectedChannelId(channelId);
      if (orgId) {
        navigate(
          buildCommunicateChannelsPath(orgId, {
            departmentId: deptId,
            channelId: channelId || '',
          })
        );
      }
    },
    [
      canSelectDepartment,
      handleSelectDepartment,
      selectedOrganizationId,
      channels,
      channelPermissionMatrix,
      navigate,
      reloadOrgShell,
      t,
    ]
  );

  /** Task trên project card → mở Project Hub; module khác bỏ qua (project không thuộc phòng). */
  const handleProjectModuleClick = useCallback(
    async (project, module) => {
      const mod = String(module || 'chat').toLowerCase();
      if (mod === 'tasks' || mod === 'project') {
        handleSelectOrgProject(project);
      }
    },
    [handleSelectOrgProject]
  );

  const handleHubCardModuleClick = useCallback(
    (id, module, raw = {}, meta = {}) => {
      if (meta?.isProject || raw?.defaultBoardId || raw?.projectId) {
        handleProjectModuleClick(raw, module);
        return;
      }
      handleTeamModuleClick(id, module, raw);
    },
    [handleProjectModuleClick, handleTeamModuleClick]
  );

  const handleSelectChannel = (channelId) => {
    const id = String(channelId || '').trim();
    if (!id) return;
    const matrix = channelPermissionMatrix || {};
    const matrixReady = Object.keys(matrix).length > 0;
    const perm = matrix[id];
    // Chỉ chặn khi matrix đã có entry và explicit deny — tránh click «chết» khi matrix trống/thiếu key.
    if (matrixReady && perm && !(perm.canSee || perm.canRead)) {
      return;
    }
    setSelectedChannelId(id);
    // Đang ở tab Task/Docs thì phải chuyển sang Chat — nếu không UI không đổi, tưởng bấm hỏng.
    setWorkspaceTabView('chat');
    if (!selectedOrganizationId || landingDemo) return;
    navigate(
      buildCommunicateChannelsPath(String(selectedOrganizationId), {
        departmentId: selectedDepartmentId && !selectedTeamId ? selectedDepartmentId : '',
        channelId: id,
      })
    );
  };

  const handleOpenChannelSettings = (channel) => {
    if (!channel?._id) return;
    setChannelSettingsChannel(channel);
    setChannelSettingsOpen(true);
  };

  const handleDeleteWorkspaceChannel = async (channel) => {
    if (!channel?._id || !selectedOrganizationId) return;
    if (isProtectedDefaultChannel(channel)) {
      notifyError(t('organizations.deleteChannelProtected'));
      throw new Error('protected');
    }
    await organizationAPI.deleteChannelByScope(selectedOrganizationId, String(channel._id));
    notifySuccess(t('organizations.deleteChannelOk'));
    const deletedId = String(channel._id);
    if (String(selectedChannelId) === deletedId) {
      setSelectedChannelId('');
    }
    setChannelSettingsOpen(false);
    setChannelSettingsChannel(null);
    await reloadOrgShell(selectedOrganizationId);
    if (selectedDepartmentId) {
      await loadChannels(
        selectedOrganizationId,
        selectedDepartmentId,
        departmentWorkspaceActive ? '' : selectedTeamId
      );
    }
  };

  const handleOpenDivisionSettings = (division) => {
    if (!division?._id) return;
    setScopeSettingsType('division');
    setScopeSettingsTarget(division);
    setScopeSettingsOpen(true);
  };

  const handleOpenDepartmentSettings = (department) => {
    if (!department?._id) return;
    setScopeSettingsType('department');
    setScopeSettingsTarget(department);
    setScopeSettingsOpen(true);
  };

  const handleOpenTeamSettings = (team) => {
    if (!team?._id) return;
    setScopeSettingsType('team');
    setScopeSettingsTarget(team);
    setScopeSettingsOpen(true);
  };

  const loadDepartments = async (orgId) => {
    if (!orgId) return;
    setLoadingDepartments(true);
    try {
      const payload = await organizationAPI.getDepartments(orgId);
      const list = unwrapData(payload);
      const raw = Array.isArray(list) ? list : [];
      const seen = new Set();
      const normalized = raw.filter((department) => {
        if (department?.isSynthetic) return false;
        const id = String(department?._id || department?.id || '').trim();
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setDepartments(normalized);
      setTeams([]);
      setSelectedTeamId('');
      setSelectedDepartmentId((prev) => {
        if (prev && normalized.some((item) => item._id === prev)) return prev;
        return normalized[0]?._id || '';
      });
    } catch (error) {
      setDepartments([]);
      setTeams([]);
      setSelectedTeamId('');
      setSelectedDepartmentId('');
      notifyError(t('organizations.loadDeptFail'));
    } finally {
      setLoadingDepartments(false);
    }
  };

  const loadChannels = async (orgId, deptId, teamIdHint = '', divisionIdHint = '') => {
    if (!orgId || !deptId) {
      setChannels([]);
      setSelectedChannelId('');
      return;
    }

    setLoadingChannels(true);
    try {
      const payload = await organizationAPI.getChannels(orgId, deptId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      const divisionId = divisionIdHint || selectedDivisionId || '';
      const divisionExtras = divisionChannelsFromStructure(workspaceStructure, divisionId);
      const merged = mergeChannelsById(normalized, divisionExtras);
      const deptOnlyPick = Boolean(departmentWorkspaceActive && deptId && !teamIdHint);
      setChannels(merged);
      setSelectedChannelId((prev) => {
        const prevChannel = merged.find((item) => String(item._id) === String(prev));
        if (prevChannel) {
          const isDeptOnly =
            !String(prevChannel.team || '') &&
            String(prevChannel.department || '') === String(deptId);
          const teamOk = teamIdHint && String(prevChannel.team || '') === String(teamIdHint);
          const scopeOk = deptOnlyPick ? isDeptOnly : teamIdHint ? teamOk || isDeptOnly : true;
          const readable = Boolean(channelPermissionMatrix?.[String(prev)]?.canRead);
          const matrixReady = Object.keys(channelPermissionMatrix || {}).length > 0;
          if (scopeOk && (!matrixReady || readable)) return prev;
        }
        return preferDefaultTextChannelId(
          merged,
          teamIdHint,
          channelPermissionMatrix,
          deptId,
          deptOnlyPick
        );
      });
    } catch (error) {
      setChannels([]);
      setSelectedChannelId('');
      notifyError(t('organizations.loadChannelsFail'));
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadTeams = async (orgId, deptId, options = {}) => {
    const { autoSelect = true } = options;
    if (!orgId || !deptId) {
      setTeams([]);
      setSelectedTeamId('');
      return '';
    }
    try {
      const payload = await organizationAPI.getTeamsByDepartment(orgId, deptId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setTeams(normalized);
      if (!autoSelect) {
        setSelectedTeamId((prev) =>
          prev && normalized.some((item) => String(item._id) === String(prev)) ? prev : ''
        );
        return '';
      }
      let nextTeamId = '';
      setSelectedTeamId((prev) => {
        if (prev && normalized.some((item) => String(item._id) === String(prev))) {
          nextTeamId = String(prev);
          return prev;
        }
        nextTeamId = normalized[0]?._id ? String(normalized[0]._id) : '';
        return nextTeamId;
      });
      return nextTeamId || (normalized[0]?._id ? String(normalized[0]._id) : '');
    } catch {
      setTeams([]);
      setSelectedTeamId('');
      return '';
    }
  };

  const currentUserId = user?.userId || user?._id || user?.id;

  const assignedTasksCount = useMemo(() => {
    const uid = String(currentUserId || '').trim();
    if (!uid) return 0;
    const done = new Set(['done', 'completed', 'cancelled', 'canceled', 'closed']);
    return (workspaceTasks || []).filter((task) => {
      const assignee = String(
        task?.assigneeId || task?.assignee?._id || task?.assignee || ''
      ).trim();
      if (assignee !== uid) return false;
      const st = String(task?.status || '').toLowerCase();
      return !done.has(st);
    }).length;
  }, [workspaceTasks, currentUserId]);

  const fetchSenderProfile = useCallback(async (uid) => {
    const res = await userService.getProfile(uid);
    const body = unwrapData(res);
    const p = body?.data ?? body;
    const profile = p?.data ?? p;
    return {
      _id: String(uid),
      displayName:
        profile?.displayName ||
        profile?.fullName ||
        profile?.username ||
        profile?.email?.split?.('@')?.[0] ||
        '',
      username: profile?.username || '',
      avatar: profile?.avatar || null,
      fullName: profile?.fullName || profile?.displayName || '',
    };
  }, []);

  const enrichChannelMessages = useCallback(
    async (list) => {
      const normalized = normalizeOrgChatMessages(list);
      return enrichOrgChatMessagesWithProfiles(normalized, {
        chatContacts,
        currentUser: user,
        currentUserId,
        profileCache: senderProfileCacheRef.current,
        fetchProfile: fetchSenderProfile,
      });
    },
    [chatContacts, user, currentUserId, fetchSenderProfile]
  );

  const loadVoiceRoomMessages = async (channelId) => {
    if (!channelId) {
      setVoiceRoomMessages([]);
      return;
    }
    try {
      const payload = await api.get('/messages', {
        params: {
          roomId: channelId,
          limit: 50,
          fields: 'summary',
          ...(selectedOrganizationId ? { organizationId: selectedOrganizationId } : {}),
        },
        skipPermissionDeniedToast: true,
      });
      const data = unwrapData(payload);
      const list = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      setVoiceRoomMessages(await enrichChannelMessages(list));
    } catch {
      setVoiceRoomMessages([]);
    }
  };

  const loadWorkspaceTasks = async (organizationId) => {
    if (!organizationId) {
      setWorkspaceTasks([]);
      return;
    }
    setLoadingWorkspaceTasks(true);
    try {
      const payload = await taskAPI.getTasks({ organizationId });
      const body = payload?.data ?? payload;
      const inner = body?.data ?? body;
      const list = Array.isArray(inner?.tasks) ? inner.tasks : Array.isArray(inner) ? inner : [];
      setWorkspaceTasks(list);
    } catch {
      setWorkspaceTasks([]);
    } finally {
      setLoadingWorkspaceTasks(false);
    }
  };

  /** Cùng pattern taskAPI.getTasks — gọi trực tiếp khi có orgId + JWT (không React Query enabled). */
  const loadWorkspaceDocuments = useCallback(
    async (organizationId) => {
      const orgId = String(organizationId || '').trim();
      if (!orgId) {
        setWorkspaceDocFiles([]);
        setWorkspaceDocumentsError('');
        return;
      }
      if (!getResolvedBearerToken()) {
        setWorkspaceDocFiles([]);
        setWorkspaceDocumentsError(t('documents.orgLoadError'));
        setLoadingWorkspaceDocuments(false);
        return;
      }
      setLoadingWorkspaceDocuments(true);
      setWorkspaceDocumentsError('');
      try {
        const overview = await fetchOrganizationDocumentsOverview(orgId);
        const channelFiles = buildOrgFilesFromOverview(overview, t, locale);

        // File đính kèm trên dự án user tham gia (song song, tối đa vài dự án gần nhất)
        let projectFiles = [];
        try {
          const listRes = await projectAPI.list({ organizationId: orgId });
          const projects = listRes?.data?.projects ?? listRes?.projects ?? listRes?.data ?? listRes ?? [];
          const active = (Array.isArray(projects) ? projects : [])
            .filter((p) => {
              const st = String(p?.status || '').toLowerCase();
              return p?.isActive !== false && st !== 'closed' && st !== 'archived';
            })
            .slice(0, 12);
          const fileBatches = await Promise.all(
            active.map(async (p) => {
              const projectId = String(p?.projectId || p?._id || '').trim();
              if (!projectId) return [];
              try {
                const res = await projectAPI.getFiles(projectId);
                const rows = res?.data?.data ?? res?.data ?? res ?? [];
                return (Array.isArray(rows) ? rows : []).map((f, idx) => ({
                  id: `proj-${projectId}-${f.documentId || f.url || idx}`,
                  source: 'project',
                  name: String(f.name || t('documents.orgUntitledFile')),
                  size: '-',
                  sizeBytes: 0,
                  typeLabel: '📄',
                  category: 'library',
                  categoryLabel: '',
                  channelName: String(p.title || p.name || t('workspace.activeProjects')),
                  departmentId: '',
                  projectId,
                  roomId: '',
                  url: String(f.url || '').trim(),
                  messageType: 'file',
                  modified: '',
                  owner: t('documents.orgMemberFallback'),
                  raw: f,
                }));
              } catch {
                return [];
              }
            })
          );
          projectFiles = fileBatches.flat();
        } catch {
          projectFiles = [];
        }

        const byId = new Map();
        for (const f of [...channelFiles, ...projectFiles]) {
          if (f?.id && !byId.has(f.id)) byId.set(f.id, f);
        }
        setWorkspaceDocFiles(Array.from(byId.values()));
      } catch (err) {
        setWorkspaceDocFiles([]);
        setWorkspaceDocumentsError(resolveApiErrorMessage(err, t('documents.orgLoadError')));
      } finally {
        setLoadingWorkspaceDocuments(false);
      }
    },
    [t, locale]
  );

  const handleMoveWorkspaceTask = async (task, nextStatus) => {
    if (!task?._id || !selectedOrganizationId) return;
    const taskId = String(task._id);
    const previousStatus = String(task.status || 'todo');
    setWorkspaceTasks((prev) =>
      prev.map((t) => (String(t._id) === taskId ? { ...t, status: nextStatus } : t))
    );
    try {
      await taskAPI.updateTask(
        taskId,
        { status: nextStatus },
        { organizationId: selectedOrganizationId }
      );
    } catch {
      setWorkspaceTasks((prev) =>
        prev.map((t) => (String(t._id) === taskId ? { ...t, status: previousStatus } : t))
      );
      notifyError(t('tasks.toastMoveFail'));
    }
  };

  const handleCreateWorkspaceTask = async (taskData) => {
    if (!selectedOrganizationId) return;
    const optimisticId = `tmp-${Date.now()}`;
    const optimisticTask = {
      _id: optimisticId,
      title: String(taskData?.title || '').trim(),
      description: String(taskData?.description || '').trim(),
      status: 'todo',
      priority: taskData?.priority || 'medium',
      departmentId: taskData?.departmentId || '',
      organizationId: selectedOrganizationId,
      assigneeId: taskData?.assigneeId || '',
      dueDate: taskData?.dueDate || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      __optimistic: true,
    };
    setWorkspaceTasks((prev) => [optimisticTask, ...prev]);
    try {
      const payload = {
        ...taskData,
        organizationId: selectedOrganizationId,
        serverId: selectedOrganizationId,
      };
      const created = await taskAPI.createTask(payload);
      const body = created?.data ?? created;
      const task = body?.data ?? body;
      if (task && (task._id || task.id)) {
        setWorkspaceTasks((prev) =>
          prev.map((item) => (String(item._id || item.id) === optimisticId ? task : item))
        );
      }
      // Luôn sync lại từ server để đảm bảo board dùng dữ liệu thật (owner/assignee/status chuẩn).
      await loadWorkspaceTasks(selectedOrganizationId);
      notifySuccess(t('tasks.toastCreated') || 'Task created');
    } catch (error) {
      setWorkspaceTasks((prev) =>
        prev.filter((item) => String(item._id || item.id) !== optimisticId)
      );
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('tasks.toastCreateFail') }));
      throw error;
    }
  };

  const handleCreateOrganization = async () => {
    setCreateOrgName('');
    setCreateWorkspaceSlug('');
    setCreateWorkspaceType('company');
    setCreateWorkspaceTeamSize('1-10');
    setCreateWorkspaceIndustry('');
    setCreateBranchCount(1);
    setCreateDivisionPerBranch(1);
    setCreateDepartmentPerDivision(2);
    setCreateTeamPerDepartment(2);
    setCreateBranchCountInput('1');
    setCreateDivisionPerBranchInput('1');
    setCreateDepartmentPerDivisionInput('2');
    setCreateTeamPerDepartmentInput('2');
    setCreateBranchNames(['']);
    setCreateDivisionNames([['']]);
    setCreateDepartmentNames([[['']]]);
    setCreateTeamNames([[[['']]]]);
    setCreateWorkspaceStep(1);
    setCreatingWorkspace(false);
    setCreateOrgModalOpen(true);
  };

  const handleSubmitCreateOrganization = async () => {
    const normalizedName = String(createOrgName || '').trim();
    const normalizedSlug = toWorkspaceSlug(createWorkspaceSlug || createOrgName);
    if (!normalizedName) {
      notifyError(t('organizations.orgNameRequired'));
      return;
    }
    if (!normalizedSlug || normalizedSlug.length < 3) {
      notifyError(t('organizations.workspaceSlugMin'));
      return;
    }

    setCreatingWorkspace(true);
    try {
      const response = await organizationAPI.createWorkspace({
        name: normalizedName,
        slug: normalizedSlug,
        type: createWorkspaceType,
        teamSize: createWorkspaceTeamSize,
        industry: String(createWorkspaceIndustry || '').trim(),
        structureBlueprint: buildStructureBlueprint(),
      });
      const payload = unwrapData(response);
      const created = payload?.data ?? payload;
      notifySuccess(t('organizations.orgCreated'));
      if (String(created?.provisioning?.structure?.status || '').toLowerCase() !== 'ready') {
        notifySuccess(t('organizations.workspaceInitializing'));
      }
      setCreateOrgModalOpen(false);
      setCreateWorkspaceStep(1);
      await loadOrganizations();
      const createdId = orgRecordId(created);
      if (created) setActiveWorkspace(workspacePayloadFromOrg(created));
      if (createdId) {
        const target =
          suiteMode === 'communicate'
            ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(createdId)}`
            : `/app/collaborate/workspaces?organizationId=${encodeURIComponent(createdId)}`;
        navigate(target);
      }
    } catch (error) {
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.orgCreateFail') }));
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const updateStructureCountDraft = (rawValue, min, max, setInput, setValue) => {
    if (rawValue === '') {
      setInput('');
      return;
    }
    if (!/^\d+$/.test(rawValue)) return;
    const parsed = Number(rawValue);
    const clamped = Math.min(max, Math.max(min, parsed));
    setInput(String(clamped));
    setValue(clamped);
  };

  const commitStructureCountDraft = (inputValue, fallbackValue, min, max, setInput, setValue) => {
    const parsed = Number(inputValue);
    const next = Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallbackValue;
    setInput(String(next));
    setValue(next);
  };

  const adjustStructureCount = (currentValue, delta, min, max, setInput, setValue) => {
    const next = Math.min(max, Math.max(min, Number(currentValue || min) + delta));
    setInput(String(next));
    setValue(next);
  };

  const handleJoinQuickInvite = async () => {
    const { orgId, token } = extractInvitePayloadFromInput(quickInviteInput);
    if (!orgId || !token) {
      notifyError(t('organizations.inviteLinkInvalid'));
      return;
    }

    setJoiningQuickInvite(true);
    try {
      const res = await organizationAPI.joinByInviteLink(orgId, token);
      const body = res?.data ?? res;
      const data = body?.data ?? body;
      if (data?.requiresJoinApplication) {
        if (data?.requiresAnswers) {
          const qs = new URLSearchParams();
          if (data.organizationName) qs.set('name', data.organizationName);
          const q = qs.toString();
          navigate(`/app/collaborate/join/${encodeURIComponent(orgId)}${q ? `?${q}` : ''}`);
        } else {
          notifySuccess(body?.message || t('organizations.applicationPending'));
        }
        setQuickInviteInput('');
        return;
      }
      notifySuccess(inviteJoinSuccessText(data));
      setQuickInviteInput('');
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      notifyError(t('organizations.joinInviteFail'));
    } finally {
      setJoiningQuickInvite(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!canManageWorkspaceStructure) {
      notifyError(t('taskBoard.createBoardDenied'));
      return;
    }
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!selectedDivisionId) {
      notifyError(t('organizations.selectDivisionBeforeDept'));
      return;
    }
    setCreateDeptName('');
    setCreateDeptDivisionId(String(selectedDivisionId));
    setCreateDeptModalOpen(true);
  };

  const handleCreateDivision = async () => {
    if (!canManageWorkspaceStructure) {
      notifyError(t('taskBoard.createBoardDenied'));
      return;
    }
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!selectedBranchId) {
      notifyError(t('organizations.selectBranchBeforeDivision'));
      return;
    }
    setCreateDivisionName('');
    setCreateDivisionBranchId(String(selectedBranchId));
    setCreateDivisionModalOpen(true);
  };

  const handleSubmitCreateDivision = async () => {
    if (!createDivisionName?.trim()) {
      notifyError(t('organizations.divisionNameRequired'));
      return;
    }
    if (!createDivisionBranchId) {
      notifyError(t('organizations.selectBranchRequired'));
      return;
    }
    try {
      await organizationAPI.createDivision(selectedOrganizationId, createDivisionBranchId, {
        name: createDivisionName.trim(),
      });
      notifySuccess(t('organizationSettings.divisionCreated'));
      setCreateDivisionModalOpen(false);
      await reloadOrgShell(selectedOrganizationId);
    } catch {
      notifyError(t('organizationSettings.divisionCreateFail'));
    }
  };

  const handleSubmitCreateDepartment = async () => {
    if (!createDeptName?.trim()) {
      notifyError(t('organizations.deptNameRequired'));
      return;
    }
    if (!createDeptDivisionId) {
      notifyError(t('organizations.selectDivisionRequired'));
      return;
    }

    try {
      await organizationAPI.createDepartmentByDivision(selectedOrganizationId, createDeptDivisionId, {
        name: createDeptName.trim(),
      });
      notifySuccess(t('organizations.deptCreated'));
      setCreateDeptModalOpen(false);
      await reloadOrgShell(selectedOrganizationId);
    } catch (error) {
      notifyError(t('organizations.deptCreateFail'));
    }
  };

  /** Hub «Tạo dự án» — prop tên onCreateTeam (legacy); quyền = canCreateProject. */
  const handleCreateTeam = async () => {
    if (!canCreateProject) {
      notifyError(t('taskBoard.createBoardDenied'));
      return;
    }
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    setCreateTeamModalOpen(true);
  };

  const handleSubmitCreateProject = async (payload) => {
    if (!canCreateProject) {
      notifyError(t('taskBoard.createBoardDenied'));
      return;
    }
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }
    if (!String(payload?.title || '').trim()) {
      notifyError(t('adminTasks.createNeedTitle'));
      return;
    }
    setCreatingProjectBoard(true);
    try {
      const res = await projectAPI.create({
        organizationId: String(selectedOrganizationId),
        scopeType: 'organization',
        scopeId: String(selectedOrganizationId),
        title: payload.title,
        description: payload.description,
        projectCode: payload.projectCode,
        scopeLabel: payload.scopeLabel || 'ORG',
        dueDate: payload.dueDate,
        background: payload.background,
        visibility: payload.visibility,
        delegationTemplateId: payload.delegationTemplateId,
        members: payload.members,
      });
      const created = unwrapTaskApiPayload(res);
      const boardId = String(created?.defaultBoardId || created?.board?._id || '').trim();
      const projectId = String(created?._id || created?.projectId || '').trim();
      notifySuccess(t('adminTasks.createSuccess'));
      setCreateTeamModalOpen(false);
      setSelectedTeamId('');
      setWorkspaceTabView('tasks');
      setSelectedChannelId('');
      navigate(
        buildCollaborateTasksPath(selectedOrganizationId, {
          boardId,
          projectId,
        })
      );
      projectAPI
        .list({ organizationId: selectedOrganizationId })
        .then((listRes) => {
          const raw = listRes?.data?.projects ?? listRes?.projects ?? listRes?.data ?? listRes ?? [];
          setOrgProjects(Array.isArray(raw) ? raw : []);
        })
        .catch(() => {});
      await reloadOrgShell(selectedOrganizationId);
    } catch (error) {
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.createFail') }));
    } finally {
      setCreatingProjectBoard(false);
    }
  };

  const handleOpenWorkspace = (orgId) => {
    if (!orgId) return;
    const selected = organizations.find((item) => String(item._id) === String(orgId));
    setSelectedOrganizationId(orgId);
    setSelectedTeamId('');
    setSelectedDepartmentId('');
    setSelectedDivisionId('');
    setSelectedBranchId('');
    setSelectedChannelId('');
    if (selected) {
      setActiveWorkspace(workspacePayloadFromOrg(selected));
      if (selected.slug) setLastWorkspaceSlug(selected.slug);
      const target =
        suiteMode === 'communicate'
          ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(orgId)}`
          : `/app/collaborate/workspaces?organizationId=${encodeURIComponent(orgId)}`;
      navigate(target);
    }
  };

  const handleEnterOrgFromPicker = useCallback(
    (org) => {
      const id = orgRecordId(org);
      if (!id) return;
      setSelectedOrganizationId(id);
      setSelectedTeamId('');
      setSelectedDepartmentId('');
      setSelectedDivisionId('');
      setSelectedBranchId('');
      setSelectedChannelId('');
      setActiveWorkspace(workspacePayloadFromOrg(org));
      if (org.slug) setLastWorkspaceSlug(org.slug);
      const target =
        suiteMode === 'communicate'
          ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(id)}`
          : `/app/collaborate/workspaces?organizationId=${encodeURIComponent(id)}`;
      navigate(target);
    },
    [navigate, setActiveWorkspace, setLastWorkspaceSlug, suiteMode]
  );

  const handleEditOrganization = (orgId) => {
    if (!orgId) return;
    navigate(`/app/collaborate/organizations/${encodeURIComponent(orgId)}/settings`);
  };

  const handleOpenOrganizationSettingsModal = (orgCandidate = null) => {
    const target =
      orgCandidate ||
      organizations.find((o) => String(o._id) === String(selectedOrganizationId)) ||
      selectedOrganization;
    if (!target) return;
    const orgId = target?._id || target?.id;
    if (!orgId) return;
    navigate(`/app/collaborate/organizations/${encodeURIComponent(orgId)}/settings`);
  };

  const handleLeaveOrganization = (orgId) => {
    if (!orgId) return;
    const name =
      organizations.find((o) => String(o._id) === String(orgId))?.name || t('organizations.orgFallback');
    setLeaveOrgPendingId(orgId);
    setLeaveOrgPendingName(name);
    setLeaveOrgModalOpen(true);
  };

  const closeLeaveOrgModal = () => {
    if (leavingOrg) return;
    setLeaveOrgModalOpen(false);
    setLeaveOrgPendingId(null);
    setLeaveOrgPendingName('');
  };

  const confirmLeaveOrganization = async () => {
    const orgId = leaveOrgPendingId;
    if (!orgId) return;
    setLeavingOrg(true);
    try {
      await organizationAPI.leaveOrganization(orgId);
      notifySuccess(t('organizations.leftOrg'));
      setLeaveOrgModalOpen(false);
      setLeaveOrgPendingId(null);
      setLeaveOrgPendingName('');
      if (String(selectedOrganizationId) === String(orgId)) {
        setSelectedOrganizationId('');
        setSelectedDepartmentId('');
        setSelectedChannelId('');
        setChannels([]);
        setDepartments([]);
        setMessages([]);
        setLastWorkspaceSlug('');
      }
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.leaveFail') }));
    } finally {
      setLeavingOrg(false);
    }
  };

  const handleInviteOrganization = async (orgId) => {
    const normalizedMyRole = String(selectedOrganization?.myRole || '').toLowerCase();
    if (!['owner', 'admin', 'hr'].includes(normalizedMyRole)) {
      notifyError(t('organizations.noInvitePermission'));
      return;
    }
    setInviteOrgId(orgId);
    setGeneratedInviteLink('');
    setInviteSearch('');
    setInviteBranchId('');
    setInviteDivisionId('');
    setInviteStructureBranches([]);
    setInviteContextLabel('');
    setInviteModalOpen(true);
    setLoadingInviteFriends(true);
    setGeneratingInviteLink(true);
    try {
      const [friendsPayload, structurePayload] = await Promise.all([
        friendService.getFriends(),
        organizationAPI.getStructure(orgId),
      ]);

      const data = unwrapData(friendsPayload);
      const rawList = Array.isArray(data?.friends) ? data.friends : Array.isArray(data) ? data : [];
      const normalized = rawList.map((item) => {
        const raw = item.friendId || item;
        const id = raw?._id || raw?.id;
        return {
          id,
          name: raw?.displayName || raw?.name || raw?.username || t('organizations.userFallback'),
          username: raw?.username || raw?.email || '',
          avatar: raw?.avatar || null,
        };
      });
      setInviteFriends(normalized.filter((friend) => !!friend.id));

      const structureBody = unwrapData(structurePayload);
      const branches = Array.isArray(structureBody?.branches)
        ? structureBody.branches
        : Array.isArray(structureBody)
          ? structureBody
          : [];
      setInviteStructureBranches(branches);
      const defaultBranchId = branches[0]?._id ? String(branches[0]._id) : '';
      const defaultDivisionId = branches[0]?.divisions?.[0]?._id
        ? String(branches[0].divisions[0]._id)
        : '';
      setInviteBranchId(defaultBranchId);
      setInviteDivisionId(defaultDivisionId);

      const invitePayload = await organizationAPI.createInviteLink(orgId, {
        branchId: defaultBranchId || undefined,
        divisionId: defaultDivisionId || undefined,
      });
      const inviteData = unwrapData(invitePayload);
      setGeneratedInviteLink(inviteData?.inviteUrl || '');
      const branchName = String(inviteData?.context?.branchName || '').trim();
      const divisionName = String(inviteData?.context?.divisionName || '').trim();
      const label = [branchName, divisionName].filter(Boolean).join(' / ');
      setInviteContextLabel(label);
    } catch (error) {
      setInviteFriends([]);
      setGeneratedInviteLink('');
      notifyError(t('organizations.inviteInitFail'));
    } finally {
      setLoadingInviteFriends(false);
      setGeneratingInviteLink(false);
    }
  };

  const regenerateInviteLinkWithContext = async (orgId, branchId, divisionId) => {
    if (!orgId) return;
    setGeneratingInviteLink(true);
    try {
      const invitePayload = await organizationAPI.createInviteLink(orgId, {
        branchId: branchId || undefined,
        divisionId: divisionId || undefined,
      });
      const inviteData = unwrapData(invitePayload);
      setGeneratedInviteLink(inviteData?.inviteUrl || '');
      const branchName = String(inviteData?.context?.branchName || '').trim();
      const divisionName = String(inviteData?.context?.divisionName || '').trim();
      setInviteContextLabel([branchName, divisionName].filter(Boolean).join(' / '));
    } catch (error) {
      setGeneratedInviteLink('');
      notifyError(t('organizations.inviteLinkScopeFail'));
    } finally {
      setGeneratingInviteLink(false);
    }
  };

  const handleInviteFriendToOrganization = async (friendId) => {
    if (!inviteOrgId || !friendId) return;
    setInvitingIds((prev) => (prev.includes(friendId) ? prev : [...prev, friendId]));
    try {
      await organizationAPI.addMember(inviteOrgId, { userId: friendId, role: 'member' });
      notifySuccess(t('organizations.inviteSent'));
    } catch (error) {
      notifyError(t('organizations.inviteFail'));
    } finally {
      setInvitingIds((prev) => prev.filter((id) => id !== friendId));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      notifySuccess(t('organizations.linkCopied'));
    } catch (error) {
      notifyError(t('organizations.linkCopyFail'));
    }
  };

  const handleRespondInvitation = async (invitationId, action) => {
    if (!invitationId) return;
    setRespondingInvitationIds((prev) =>
      prev.includes(invitationId) ? prev : [...prev, invitationId]
    );
    try {
      const res = await organizationAPI.respondInvitation(invitationId, action);
      const body = res?.data ?? res;
      const data = body?.data ?? body;
      if (action === 'accept') {
        if (data?.requiresJoinApplication && data?.requiresAnswers) {
          const orgId = data.organizationId;
          const qs = new URLSearchParams();
          if (data.organizationName) qs.set('name', data.organizationName);
          const q = qs.toString();
          navigate(`/app/collaborate/join/${encodeURIComponent(orgId)}${q ? `?${q}` : ''}`);
          notifySuccess(body?.message || t('organizations.fillJoinFormPrompt'));
        } else if (data?.requiresJoinApplication) {
          notifySuccess(body?.message || t('organizations.applicationPending'));
        } else {
          notifySuccess(t('organizations.inviteAccepted'));
        }
      } else {
        notifySuccess(t('organizations.inviteDeclined'));
      }
      await Promise.all([
        loadOrganizations(),
        loadPendingInvitations(),
        loadPendingJoinApplications(),
        loadJoinApplicationsToReview(),
      ]);
    } catch (error) {
      notifyError(t('organizations.inviteHandleFail'));
    } finally {
      setRespondingInvitationIds((prev) => prev.filter((id) => id !== invitationId));
    }
  };

  const handleCreateChannel = async (channelType = 'chat') => {
    if (!canManageWorkspaceStructure) {
      notifyError(t('taskBoard.createBoardDenied'));
      return;
    }
    const deptWorkspace =
      departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId;
    if (!selectedOrganizationId || !selectedDepartmentId) {
      notifyError(t('organizations.selectDeptTeamForChannel'));
      return;
    }
    if (!deptWorkspace && !selectedTeamId) {
      notifyError(t('organizations.selectDeptTeamForChannel'));
      return;
    }

    setCreateChannelType(channelType);
    setCreateChannelName('');
    setCreateChannelLevel(deptWorkspace ? 'department' : 'team');
    setCreateChannelBranchId(String(selectedBranchId || ''));
    setCreateChannelDivisionId(String(selectedDivisionId || ''));
    setCreateChannelDepartmentId(String(selectedDepartmentId || ''));
    setCreateChannelTeamId(deptWorkspace ? '' : String(selectedTeamId));
    setCreateChannelModalOpen(true);
  };

  const handleSubmitCreateChannel = async () => {
    if (!createChannelName.trim()) {
      notifyError(t('organizations.channelNameRequired'));
      return;
    }
    if (createChannelLevel === 'department') {
      if (!createChannelDepartmentId) {
        notifyError(t('organizations.selectDepartmentRequired'));
        return;
      }
      try {
        await organizationAPI.createChannelByScope(selectedOrganizationId, {
          level: 'department',
          departmentId: createChannelDepartmentId,
          name: createChannelName.trim(),
          type: createChannelType,
        });
        notifySuccess(t('organizations.channelCreated'));
        setCreateChannelModalOpen(false);
        setSelectedBranchId(createChannelBranchId);
        setSelectedDivisionId(createChannelDivisionId);
        setSelectedDepartmentId(createChannelDepartmentId);
        await reloadOrgShell(selectedOrganizationId);
        await loadChannels(
          selectedOrganizationId,
          createChannelDepartmentId,
          departmentWorkspaceActive ? '' : selectedTeamId
        );
      } catch (error) {
        notifyError(t('organizations.channelCreateFail'));
      }
      return;
    }

    if (!createChannelTeamId) {
      notifyError(t('organizations.selectTeamRequired'));
      return;
    }

    try {
      await organizationAPI.createChannelByTeam(selectedOrganizationId, createChannelTeamId, {
        name: createChannelName.trim(),
        type: createChannelType,
      });
      notifySuccess(t('organizations.channelCreated'));
      setSelectedBranchId(createChannelBranchId);
      setSelectedDivisionId(createChannelDivisionId);
      setSelectedDepartmentId(createChannelDepartmentId);
      setSelectedTeamId(createChannelTeamId);
      setCreateChannelModalOpen(false);
      await reloadOrgShell(selectedOrganizationId);
      await loadChannels(selectedOrganizationId, createChannelDepartmentId, createChannelTeamId);
    } catch (error) {
      notifyError(t('organizations.channelCreateFail'));
    }
  };

  const openRenameModal = (type, entity) => {
    if (!entity?._id) return;
    setRenameTargetType(type);
    setRenameTargetId(String(entity._id));
    setRenameTargetName(String(entity?.name || ''));
    setRenameModalOpen(true);
  };

  const handleSubmitRenameEntity = async () => {
    const nextName = String(renameTargetName || '').trim();
    if (!nextName) {
      notifyError(t('organizations.renameEmpty'));
      return;
    }
    try {
      if (renameTargetType === 'division') {
        await organizationAPI.updateDivision(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'department') {
        await organizationAPI.updateDepartment(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'team') {
        await organizationAPI.updateTeamByHierarchy(selectedOrganizationId, renameTargetId, { name: nextName });
      } else if (renameTargetType === 'channel') {
        const targetChannel = channels.find((ch) => String(ch._id) === String(renameTargetId));
        if (targetChannel && String(targetChannel.team || '')) {
          if (!selectedTeamId) {
            notifyError(t('organizations.selectTeamForChannel'));
            return;
          }
          await organizationAPI.updateChannelByTeam(
            selectedOrganizationId,
            selectedTeamId,
            renameTargetId,
            { name: nextName }
          );
        } else {
          await organizationAPI.updateChannelByScope(selectedOrganizationId, renameTargetId, {
            name: nextName,
          });
        }
      }
      notifySuccess(t('organizations.renamedOk'));
      setRenameModalOpen(false);
      await reloadOrgShell(selectedOrganizationId);
      if (selectedDepartmentId) await loadTeams(selectedOrganizationId, selectedDepartmentId);
      if (selectedDepartmentId) {
        await loadChannels(
          selectedOrganizationId,
          selectedDepartmentId,
          departmentWorkspaceActive ? '' : selectedTeamId
        );
      }
    } catch {
      notifyError(t('organizations.renameFailRetry'));
    }
  };

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedChannelId || sendingMessage) return;
    const perm = channelPermissionMatrix?.[String(selectedChannelId)] || {};
    if (!perm.canWrite) {
      notifyError(t('orgPanel.composerReadOnly'));
      return;
    }

    setSendingMessage(true);
    try {
      const replyId = replyingToMessage?._id || replyingToMessage?.id;
      const body = {
        roomId: selectedChannelId,
        content,
        messageType: 'text',
        organizationId: selectedOrganizationId || undefined,
      };
      if (replyId) body.replyToMessageId = replyId;
      const payload = await api.post('/messages', body);
      const created = unwrapData(payload);
      await appendChannelMessage(created);
      setMessageInput('');
      setReplyingToMessage(null);
    } catch (error) {
      notifyError(t('organizations.sendMessageFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendVoiceRoomMessage = async () => {
    const content = voiceMessageInput.trim();
    if (!content || !selectedChannelId || sendingMessage || selectedChannelType !== 'voice') return;

    setSendingMessage(true);
    try {
      const body = {
        roomId: selectedChannelId,
        content,
        messageType: 'text',
        organizationId: selectedOrganizationId || undefined,
      };
      const payload = await api.post('/messages', body);
      const created = unwrapData(payload);
      appendChannelMessage(created);
      setVoiceMessageInput('');
    } catch {
      notifyError(t('organizations.sendMessageFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleVoiceRoomSessionEnd = useCallback(
    (payload) => {
      setVoiceRoomMessages([]);
      setVoiceMessageInput('');
      if (payload?.recordingSaved) {
        notifySuccess(t('orgPanel.voiceRecordingSaved'));
      }
    },
    [t]
  );

  const handleSaveMessageEdit = async (messageId, content) => {
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content });
      if (res?.success === false) {
        throw new Error(res?.message || 'Edit failed');
      }
      const row = res?.data ?? res;
      if (!row || (!row._id && !row.id && !row.content)) {
        throw new Error('Invalid edit response');
      }
      const normalized = normalizeOrgChatMessage(row);
      const enrichedList = await enrichChannelMessages([normalized]);
      const merged = enrichedList[0] || normalized;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...merged } : m))
      );
      notifySuccess(t('organizations.msgUpdated'));
    } catch (error) {
      notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.editFail') }));
      throw error;
    }
  };

  const requestDeleteChannelMessage = (messageId) => {
    if (!messageId) return;
    setDeleteChannelMsgConfirmId(messageId);
  };

  const confirmDeleteChannelMessage = async () => {
    const messageId = deleteChannelMsgConfirmId;
    if (!messageId) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      notifySuccess(t('organizations.msgDeleted'));
    } catch {
      notifyError(t('organizations.deleteFail'));
    }
  };

  const handleForwardRequest = (msg) => {
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const handleForwardConfirm = async ({ channelIds, note }) => {
    if (!forwardSourceMessage || !channelIds?.length) return;
    const chName = selectedChannel?.name || t('organizations.channelNameFallback');
    const preview = String(forwardSourceMessage.content || '').trim().slice(0, 500);
    const header = t('organizations.forwardHeader', { name: chName });
    const body = [note, header, preview].filter(Boolean).join('\n\n');
    setSendingMessage(true);
    try {
      for (const cid of channelIds) {
        await api.post('/messages', {
          roomId: cid,
          content: body,
          messageType: 'text',
          organizationId: selectedOrganizationId || undefined,
        });
      }
      notifySuccess(t('organizations.forwardOk'));
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
    } catch {
      notifyError(t('organizations.forwardFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuickReactMessage = (_message, _emoji) => {
    notify(t('organizations.reactionInfo'), 'info');
  };

  const appendChannelMessage = useCallback(
    async (created) => {
      const raw = created?.data !== undefined ? unwrapData(created) : created;
      const normalized = normalizeOrgChatMessage(raw);
      if (!normalized) return;
      const enrichedList = await enrichChannelMessages([normalized]);
      const msg = enrichedList[0] || normalized;
      const id = msg?._id || msg?.id;
      const sortAsc = (list) =>
        [...list].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      if (selectedChannelType === 'voice') {
        setVoiceRoomMessages((prev) => {
          if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
          return sortAsc([...prev, msg]);
        });
        return;
      }
      setMessages((prev) => {
        if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
        return [...prev, msg];
      });
    },
    [selectedChannelType, enrichChannelMessages]
  );

  const handleAnnounceMeetingJoin = useCallback(
    async ({ title: meetingTitle, joinPath, startAt } = {}) => {
      const deptId = String(selectedDepartmentId || '').trim();
      const orgId = String(selectedOrganizationId || '').trim();
      if (!deptId || !orgId || !joinPath) return;
      let roomId = resolveDeptAnnouncementChannelId(channels, deptId, channelPermissionMatrix);
      if (!roomId) {
        const existing = findDeptChannelByType(channels, deptId, 'announcement');
        roomId = existing?._id ? String(existing._id) : '';
      }
      if (!roomId) return;
      const perm = channelPermissionMatrix?.[String(roomId)] || {};
      if (perm.canWrite === false) return;
      const when = startAt ? new Date(startAt).toLocaleString() : '';
      const content = [
        `📅 ${meetingTitle || t('workspace.moduleMeetings')}`,
        when ? when : null,
        `${t('workspace.deptMeetingJoin')}: ${joinPath}`,
      ]
        .filter(Boolean)
        .join('\n');
      const payload = await api.post('/messages', {
        roomId,
        content,
        messageType: 'text',
        organizationId: orgId,
      });
      const created = unwrapData(payload);
      if (String(selectedChannelId) === String(roomId)) {
        await appendChannelMessage(created);
      }
    },
    [
      selectedDepartmentId,
      selectedOrganizationId,
      channels,
      channelPermissionMatrix,
      selectedChannelId,
      appendChannelMessage,
      t,
    ]
  );

  const handleSendChatOption = async ({ kind, file, payload }) => {
    if (!selectedChannelId || sendingMessage) return;
    const perm = channelPermissionMatrix?.[String(selectedChannelId)] || {};
    if (!perm.canWrite) {
      notifyError(t('orgPanel.composerReadOnly'));
      return;
    }

    let messageType = 'system';
    let content = '';

    if (kind === 'file' && file) {
      setSendingMessage(true);
      setChannelUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'org_room',
            roomId: selectedChannelId,
            organizationId: selectedOrganizationId || undefined,
          },
          (p) => setChannelUploadProgress(p)
        );
        const unwrapped = unwrapData({ data: normalized });
        appendChannelMessage(unwrapped);
        notifySuccess(t('organizations.fileSent'));
      } catch (error) {
        notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.fileSendFail') }));
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    }
    if (kind === 'image' && file) {
      setSendingMessage(true);
      setChannelUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'org_room',
            roomId: selectedChannelId,
            organizationId: selectedOrganizationId || undefined,
          },
          (p) => setChannelUploadProgress(p)
        );
        const unwrapped = unwrapData({ data: normalized });
        appendChannelMessage(unwrapped);
        notifySuccess(t('organizations.imageSent'));
      } catch (error) {
        notifyError(resolveApiErrorMessage(error, { t, fallback: t('organizations.imageSendFail') }));
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    } else if (kind === 'contact') {
      messageType = 'business_card';
      let fields = normalizeBusinessCardFields({
        userId: payload?.userId || '',
        fullName: payload?.fullName || '',
        phone: payload?.phone || '',
        email: payload?.email || '',
        username: payload?.username || '',
      });
      const uid = fields.userId;
      if (uid && !uid.startsWith('manual-') && (!fields.phone || !fields.email || !looksLikeEmail(fields.email))) {
        try {
          const res = await userService.getProfile(uid);
          const body = unwrapData(res);
          const profile = body?.data ?? body;
          fields = applyProfileToBusinessCard(fields, profile);
        } catch {
          /* giữ snapshot từ form chọn liên hệ */
        }
      }
      content = JSON.stringify({
        userId: fields.userId,
        fullName: fields.fullName,
        phone: fields.phone,
        email: fields.email && looksLikeEmail(fields.email) ? fields.email : '',
        avatar: payload?.avatar || '',
        username: fields.username || payload?.username || '',
        role: payload?.role || '',
      });
    } else if (kind === 'poll') {
      messageType = 'system';
      const options = Array.isArray(payload?.options) ? payload.options : [];
      content = t('organizations.poll', {
        q: payload?.question || '',
        options: options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n'),
      });
    } else if (kind === 'topic') {
      messageType = 'system';
      const topicText = String(
        payload?.text ?? (selectedChannelType === 'voice' ? voiceMessageInput : messageInput) ?? ''
      ).trim();
      if (!topicText) {
        notifyError(t('orgPanel.topicNeedText'));
        return;
      }
      content = `Topic: ${topicText}`;
    } else {
      return;
    }

    setSendingMessage(true);
    try {
      const created = await api.post('/messages', {
        roomId: selectedChannelId,
        content,
        messageType,
        organizationId: selectedOrganizationId || undefined,
      });
      const normalized = unwrapData(created);
      appendChannelMessage(normalized);
      if (kind === 'topic' && selectedChannelType === 'voice') {
        setVoiceMessageInput('');
      }
      notifySuccess(t('organizations.customSent'));
    } catch (error) {
      notifyError(t('organizations.customFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleVoiceComposerFileSelected = (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !canWriteInVoiceChannel) return;
    handleSendChatOption({ kind, file });
  };

  const voiceComposerPlusItems = useMemo(() => {
    if (!canWriteInVoiceChannel) return [];
    return [
      {
        key: 'upload-file',
        icon: '📁',
        label: t('orgPanel.menuUploadFile'),
        onClick: () => voiceFileInputRef.current?.click(),
      },
      {
        key: 'upload-image',
        icon: '🖼️',
        label: t('orgPanel.menuUploadImage'),
        onClick: () => voiceImageInputRef.current?.click(),
      },
      {
        key: 'topic',
        icon: '🧵',
        label: t('orgPanel.menuTopic'),
        onClick: () => {
          const topicText = voiceMessageInput.trim();
          if (!topicText) {
            notifyError(t('orgPanel.topicNeedText'));
            return;
          }
          handleSendChatOption({ kind: 'topic', payload: { text: topicText } });
        },
      },
      {
        key: 'poll',
        icon: '🗳️',
        label: t('orgPanel.menuPoll'),
        onClick: () => voiceComposerHelpersRef.current?.openPoll?.(),
      },
      {
        key: 'contact',
        icon: '👤',
        label: t('orgPanel.menuContact'),
        onClick: () => voiceComposerHelpersRef.current?.openContact?.(),
      },
    ];
  }, [canWriteInVoiceChannel, t, voiceMessageInput, handleSendChatOption]);

  const voiceComposerActionItems = useMemo(
    () => [
      {
        key: 'emoji',
        title: 'Emoji',
        content: '🙂',
        className: 'w-8 text-lg',
        onClick: () => voiceComposerHelpersRef.current?.openEmoji?.(),
      },
    ],
    []
  );

  const orgsErrorNotifiedRef = useRef(false);

  useEffect(() => {
    if (landingDemo) {
      setSelectedOrganizationId((prev) => (prev === 'demo-org-vh' ? prev : 'demo-org-vh'));
      return;
    }
    if (!orgsQuery.isError) {
      orgsErrorNotifiedRef.current = false;
      return;
    }
    if (orgsErrorNotifiedRef.current) return;
    orgsErrorNotifiedRef.current = true;
    notifyError(resolveApiErrorMessage(orgsQuery.error, { t, fallback: t('organizations.loadOrgsFail') }));
  }, [landingDemo, orgsQuery.isError, orgsQuery.error, t]);

  useEffect(() => {
    if (landingDemo || !organizationsLoaded) return;
    if (!organizations.length) {
      setSelectedOrganizationId((prev) => (prev === '' ? prev : ''));
      return;
    }
    if (showOrgPicker && !orgIdFromQuery) {
      return;
    }
    const idHint = String(lastOrganizationId || '').trim();
    const matchedById = idHint
      ? organizations.find((o) => orgRecordId(o) === idHint)
      : null;
    const slugHint = String(lastWorkspaceSlug || '').trim();
    const matchedBySlug = !matchedById && slugHint ? findOrgBySlug(organizations, slugHint) : null;
    setSelectedOrganizationId((prev) => {
      const preferred =
        orgRecordId(matchedById) || orgRecordId(matchedBySlug) || orgRecordId(organizations[0]) || '';
      if (!preferred) return prev === '' ? prev : '';
      if (prev && organizations.some((o) => orgRecordId(o) === String(prev))) return prev;
      return preferred;
    });
  }, [
    landingDemo,
    organizationsLoaded,
    organizationIdsKey,
    lastWorkspaceSlug,
    lastOrganizationId,
    showOrgPicker,
    orgIdFromQuery,
  ]);

  useEffect(() => {
    if (!slugPendingOrg || !Array.isArray(orgsQuery.data)) return;
    const pendingId = orgRecordId(slugPendingOrg);
    if (!pendingId) return;
    if (orgsQuery.data.some((o) => orgRecordId(o) === pendingId)) {
      setSlugPendingOrg(null);
    }
  }, [orgsQuery.data, slugPendingOrg]);

  useEffect(() => {
    if (inviteModalOpen && !landingDemo) {
      loadPendingInvitations();
    }
  }, [inviteModalOpen, landingDemo]);

  const canReviewJoinForOrg = useMemo(() => {
    const org = organizations.find((o) => String(o._id) === String(selectedOrganizationId));
    return ['owner', 'admin'].includes(String(org?.myRole || org?.role || '').toLowerCase());
  }, [organizations, selectedOrganizationId]);

  const joinReviewFetchRef = useRef('');

  useEffect(() => {
    if (landingDemo || !canReviewJoinForOrg) return;
    const key = String(selectedOrganizationId || '');
    if (joinReviewFetchRef.current === key) return;
    joinReviewFetchRef.current = key;
    loadJoinApplicationsToReview();
  }, [landingDemo, canReviewJoinForOrg, selectedOrganizationId]);

  const friendsListKey = useMemo(() => {
    const friendList = Array.isArray(friendsQuery.data) ? friendsQuery.data : [];
    return friendList
      .map((item) => orgRecordId(item?.friendId || item))
      .filter(Boolean)
      .sort()
      .join(',');
  }, [friendsQuery.data]);
  const chatContactsFetchRef = useRef('');

  useEffect(() => {
    if (landingDemo) return;
    const fetchKey = `${selectedOrganizationId}|${friendsListKey}`;
    if (chatContactsFetchRef.current === fetchKey) return;
    chatContactsFetchRef.current = fetchKey;

    const friendList = Array.isArray(friendsQuery.data) ? friendsQuery.data : [];
    const mapFriends = friendList
      .map((item) => item.friendId || item)
      .filter(Boolean)
      .map((item) => ({
        id: item._id || item.id,
        name: item.displayName || item.name || item.username || t('organizations.userFallback'),
        username: item.username || '',
        role: item.role || '',
        phone: item.phone || item.phoneNumber || item.mobile || '',
        email: item.email || '',
        avatar: item.avatar || null,
        category: 'friend',
      }))
      .filter((item) => !!item.id);

    if (!selectedOrganizationId) {
      setChatContacts(mapFriends);
      setLoadingChatContacts(false);
      return;
    }

    let cancelled = false;
    setLoadingChatContacts(true);
    (async () => {
      try {
        const memberPayload = await organizationAPI.getMembers(selectedOrganizationId);
        if (cancelled) return;
        const memberData = unwrapData(memberPayload);
        const rawMemberList = Array.isArray(memberData?.data)
          ? memberData.data
          : Array.isArray(memberData)
            ? memberData
            : [];
        const enriched = await enrichMembershipsWithProfiles(rawMemberList, {
          fallback: t('organizations.userFallback'),
          limit: 200,
        });
        if (cancelled) return;
        const memberContacts = enriched
          .map((row) => {
            const email = row.email || '';
            const emailLocal = email.includes('@') ? email.split('@')[0] : '';
            return {
              id: row.userId,
              name: row.displayName || row.username || emailLocal || t('organizations.userFallback'),
              username: row.username || emailLocal || '',
              role: row.role || '',
              phone: '',
              email,
              avatar: row.avatar || null,
              category: 'member',
            };
          })
          .filter((item) => !!item.id);
        setChatContacts([...mapFriends, ...memberContacts]);
      } catch {
        if (!cancelled) setChatContacts(mapFriends);
      } finally {
        if (!cancelled) setLoadingChatContacts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedOrganizationId, landingDemo, friendsListKey, t]);

  useEffect(() => {
    if (!orgIdFromQuery || !organizationsLoaded) return;
    const exists = organizations.some((o) => orgRecordId(o) === orgIdFromQuery);
    if (!exists) return;
    if (String(selectedOrganizationId || '') !== String(orgIdFromQuery)) {
      setSelectedTeamId('');
      setSelectedDepartmentId('');
      setDepartmentWorkspaceActive(false);
      setSelectedDivisionId('');
      setSelectedBranchId('');
      setSelectedChannelId('');
    }
    setSelectedOrganizationId((prev) => (prev === orgIdFromQuery ? prev : orgIdFromQuery));
    const org = organizations.find((o) => orgRecordId(o) === orgIdFromQuery);
    if (org) setActiveWorkspace(workspacePayloadFromOrg(org));
  }, [
    orgIdFromQuery,
    organizationsLoaded,
    organizationIdsKey,
    organizations,
    selectedOrganizationId,
    setActiveWorkspace,
  ]);

  useEffect(() => {
    workspaceDeepLinkRef.current = '';
  }, [orgIdFromQuery]);

  useEffect(() => {
    if (landingDemo || !orgIdFromQuery || !organizationsLoaded) return;
    // Route Dự án: chỉ giữ boardId/projectId — không restore dept/team workspace.
    if (isProjectsRoute) {
      if (workspaceTabProp === 'tasks') setWorkspaceTabView('tasks');
      return;
    }
    if (!departmentIdFromQuery && !teamIdFromQuery && !channelIdFromQuery) return;
    const key = `${orgIdFromQuery}|${departmentIdFromQuery}|${teamIdFromQuery}|${channelIdFromQuery}|${workspaceTabProp || ''}`;
    if (workspaceDeepLinkRef.current === key) return;

    // Chờ shell/structure load xong rồi mới restore — tránh F5 bỏ lỡ departmentId.
    if ((departmentIdFromQuery || teamIdFromQuery) && !findBranchAndDivisionForDepartment) return;

    if (teamIdFromQuery && canSelectTeam(teamIdFromQuery)) {
      const context = resolveTeamContext(teamIdFromQuery);
      if (context.branchId) setSelectedBranchId(context.branchId);
      if (context.divisionId) setSelectedDivisionId(context.divisionId);
      if (context.departmentId) setSelectedDepartmentId(context.departmentId);
      else if (departmentIdFromQuery && canSelectDepartment(departmentIdFromQuery)) {
        handleSelectDepartment(departmentIdFromQuery, { workspace: false });
      }
      setSelectedTeamId(String(teamIdFromQuery));
      setDepartmentWorkspaceActive(false);
    } else if (departmentIdFromQuery && canSelectDepartment(departmentIdFromQuery)) {
      setSelectedTeamId('');
      handleSelectDepartment(departmentIdFromQuery, { workspace: true });
    }

    if (channelIdFromQuery) {
      const ch = channels.find((c) => String(c._id) === String(channelIdFromQuery));
      if (ch?.department && !ch?.team) {
        setSelectedTeamId('');
        const deptId = String(ch.department);
        if (canSelectDepartment(deptId)) {
          handleSelectDepartment(deptId, { workspace: true });
        }
      }
      setSelectedChannelId(channelIdFromQuery);
      setWorkspaceTabView('chat');
    } else if (workspaceTabProp === 'tasks' || workspaceTabProp === 'documents') {
      setWorkspaceTabView(workspaceTabProp);
    }

    workspaceDeepLinkRef.current = key;
  }, [
    landingDemo,
    orgIdFromQuery,
    organizationsLoaded,
    departmentIdFromQuery,
    teamIdFromQuery,
    channelIdFromQuery,
    workspaceTabProp,
    isProjectsRoute,
    channels,
    canSelectDepartment,
    canSelectTeam,
    resolveTeamContext,
    findBranchAndDivisionForDepartment,
  ]);

  // Giữ departmentId/teamId/boardId trên URL tab Task để F5 quay lại đúng chỗ.
  useEffect(() => {
    if (landingDemo || !suiteLayout || !selectedOrganizationId) return;
    if (workspaceTabView !== 'tasks') return;
    const orgId = String(selectedOrganizationId);

    // Org-level projects: chỉ sync boardId/projectId — không gắn department/team.
    if (isProjectsRoute) {
      const projectId = String(
        new URLSearchParams(location.search).get('projectId') || ''
      ).trim();
      const next = buildCollaborateTasksPath(orgId, {
        boardId: boardIdFromQuery || '',
        projectId,
      });
      const current = `${location.pathname}${location.search}`;
      if (current !== next) navigate(next, { replace: true });
      return;
    }

    // Workspace phòng: departmentId (+ boardId) — không ghi teamId lên URL.
    if (departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId) {
      if (
        String(departmentIdFromQuery || '') === String(selectedDepartmentId) &&
        !teamIdFromQuery
      ) {
        return;
      }
      navigate(
        buildCollaborateTasksPath(orgId, {
          departmentId: selectedDepartmentId,
          boardId: boardIdFromQuery || '',
        }),
        { replace: true }
      );
      return;
    }

    if (selectedTeamId && !departmentWorkspaceActive) {
      const deptId = selectedDepartmentId || '';
      if (
        String(teamIdFromQuery || '') === String(selectedTeamId) &&
        String(departmentIdFromQuery || '') === String(deptId)
      ) {
        return;
      }
      navigate(
        buildCollaborateTasksPath(orgId, {
          departmentId: deptId,
          teamId: selectedTeamId,
          boardId: boardIdFromQuery || '',
        }),
        { replace: true }
      );
    }
  }, [
    landingDemo,
    suiteLayout,
    selectedOrganizationId,
    workspaceTabView,
    isProjectsRoute,
    departmentWorkspaceActive,
    selectedDepartmentId,
    selectedTeamId,
    departmentIdFromQuery,
    teamIdFromQuery,
    boardIdFromQuery,
    location.pathname,
    location.search,
    navigate,
  ]);

  useEffect(() => {
    if (!forwardModalOpen || !selectedOrganizationId || !departments.length) {
      if (!forwardModalOpen) setForwardTargets([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setForwardTargetsLoading(true);
      try {
        const blocks = await Promise.all(
          departments.map(async (d) => {
            const payload = await organizationAPI.getChannels(selectedOrganizationId, d._id);
            const list = unwrapData(payload);
            const arr = Array.isArray(list) ? list : [];
            return {
              departmentId: d._id,
              departmentName: displayDepartmentName(d.name, locale) || t('organizations.deptFallback'),
              channels: arr,
            };
          })
        );
        if (!cancelled) setForwardTargets(blocks);
      } catch {
        if (!cancelled) setForwardTargets([]);
      } finally {
        if (!cancelled) setForwardTargetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forwardModalOpen, selectedOrganizationId, departments, locale, t]);

  /** Mở đúng kênh tổ chức khi điều hướng từ Chat bạn bè (tin chưa đọc). */
  useEffect(() => {
    if (landingDemo) return;
    if (!location.state?.openCreateWorkspace) return;
    handleCreateOrganization();
    navigate(location.pathname + location.search, {
      replace: true,
      state: { ...location.state, openCreateWorkspace: undefined },
    });
  }, [landingDemo, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    if (landingDemo) return;
    const target = location.state?.openWorkspace;
    if (!target?.organizationId || !target?.channelId) return;
    if (!organizationIdsKey) return;
    const orgExists = organizations.some(
      (o) => orgRecordId(o) === String(target.organizationId)
    );
    if (!orgExists) return;

    setSelectedOrganizationId(String(target.organizationId));
    if (target.departmentId) {
      setSelectedDepartmentId(String(target.departmentId));
    }
    setSelectedChannelId(String(target.channelId));
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [organizationIdsKey, location.state, navigate, landingDemo, organizations]);

  useEffect(() => {
    if (landingDemo) return;
    const orgId = location.state?.selectOrganizationId;
    if (!orgId || !organizationIdsKey) return;
    const exists = organizations.some((o) => orgRecordId(o) === String(orgId));
    if (!exists) return;
    setSelectedOrganizationId(String(orgId));
    const rest = { ...(location.state || {}) };
    delete rest.selectOrganizationId;
    navigate(location.pathname + location.search, { replace: true, state: rest });
  }, [organizationIdsKey, location.state, navigate, landingDemo, organizations]);

  useEffect(() => {
    if (!shouldRedirectEmptyOrganizations) return;
    navigate('/app/me/dashboard', { replace: true });
  }, [shouldRedirectEmptyOrganizations, navigate]);

  useEffect(() => {
    if (landingDemo) return;
    const params = new URLSearchParams(window.location.search);
    const orgIdFromUrl = params.get('orgId') || params.get('inviteOrgId');
    const tokenFromUrl = params.get('inviteToken');
    if (!orgIdFromUrl || !tokenFromUrl) {
      return;
    }

    const joinOrganizationByLink = async () => {
      let navigatedToJoinForm = false;
      try {
        const res = await organizationAPI.joinByInviteLink(orgIdFromUrl, tokenFromUrl);
        const body = res?.data ?? res;
        const data = body?.data ?? body;
        if (data?.requiresJoinApplication) {
          if (data?.requiresAnswers) {
            navigatedToJoinForm = true;
            const qs = new URLSearchParams();
            if (data.organizationName) qs.set('name', data.organizationName);
            const q = qs.toString();
            navigate(
              `/app/collaborate/join/${encodeURIComponent(orgIdFromUrl)}${q ? `?${q}` : ''}`,
              { replace: true }
            );
          } else {
            notifySuccess(body?.message || t('organizations.applicationPending'));
            await Promise.all([
              loadOrganizations(),
              loadPendingInvitations(),
              loadPendingJoinApplications(),
              loadJoinApplicationsToReview(),
            ]);
          }
        } else {
          notifySuccess(inviteJoinSuccessText(data));
          await Promise.all([
            loadOrganizations(),
            loadPendingInvitations(),
            loadPendingJoinApplications(),
            loadJoinApplicationsToReview(),
          ]);
        }
      } catch (error) {
        notifyError(t('organizations.joinInviteFail'));
      } finally {
        if (!navigatedToJoinForm) {
          params.delete('orgId');
          params.delete('inviteOrgId');
          params.delete('inviteToken');
          const nextQuery = params.toString();
          const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
          window.history.replaceState({}, '', nextUrl);
        }
      }
    };

    joinOrganizationByLink();
  }, [landingDemo]);

  const workspaceStructureKey = useMemo(
    () =>
      workspaceStructure
        .map((b) => orgRecordId(b))
        .filter(Boolean)
        .sort()
        .join(','),
    [workspaceStructure]
  );
  const structureLoadRef = useRef('');

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId || !selectedDepartmentId) return;
    const preferDepartmentOnly =
      suiteLayout &&
      (departmentWorkspaceActive || (Boolean(departmentIdFromQuery) && !teamIdFromQuery));
    const loadKey = `${selectedOrganizationId}|${selectedDepartmentId}|${selectedDivisionId}|${workspaceStructureKey}|deptOnly:${preferDepartmentOnly}|teamQ:${teamIdFromQuery || ''}`;
    if (structureLoadRef.current === loadKey) return;
    structureLoadRef.current = loadKey;

    let cancelled = false;
    (async () => {
      // Suite: không auto nhảy team khi đang (hoặc sắp) ở workspace phòng.
      const shouldAutoSelectTeam =
        !suiteLayout || (!preferDepartmentOnly && Boolean(selectedTeamId || teamIdFromQuery));
      const teamId = await loadTeams(selectedOrganizationId, selectedDepartmentId, {
        autoSelect: shouldAutoSelectTeam,
      });
      if (cancelled) return;
      if (preferDepartmentOnly) {
        setSelectedTeamId('');
      }
      await loadChannels(
        selectedOrganizationId,
        selectedDepartmentId,
        preferDepartmentOnly ? '' : shouldAutoSelectTeam ? teamId || selectedTeamId || teamIdFromQuery : '',
        selectedDivisionId
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    selectedOrganizationId,
    selectedDepartmentId,
    selectedDivisionId,
    workspaceStructureKey,
    landingDemo,
    suiteLayout,
    selectedTeamId,
    departmentWorkspaceActive,
    departmentIdFromQuery,
    teamIdFromQuery,
  ]);

  useEffect(() => {
    if (landingDemo) return undefined;
    const onStructureChanged = (event) => {
      if (String(event?.detail?.orgId || '') !== String(selectedOrganizationId || '')) return;
      if (!selectedOrganizationId || !selectedDepartmentId) return;
      reloadOrgShell(selectedOrganizationId);
      loadChannels(
        selectedOrganizationId,
        selectedDepartmentId,
        departmentWorkspaceActive ? '' : selectedTeamId,
        selectedDivisionId
      );
    };
    window.addEventListener('vh:org-structure-changed', onStructureChanged);
    return () => window.removeEventListener('vh:org-structure-changed', onStructureChanged);
  }, [
    landingDemo,
    selectedOrganizationId,
    selectedDepartmentId,
    selectedTeamId,
    selectedDivisionId,
    departmentWorkspaceActive,
  ]);

  const channelMatrixKey = useMemo(
    () => Object.keys(channelPermissionMatrix || {}).sort().join(','),
    [channelPermissionMatrix]
  );
  const channelsKey = useMemo(
    () => channels.map((ch) => String(ch._id)).sort().join(','),
    [channels]
  );

  useEffect(() => {
    if (landingDemo || !channels.length) return;
    const deptOnlyPick = Boolean(departmentWorkspaceActive && selectedDepartmentId && !selectedTeamId);
    setSelectedChannelId((prev) => {
      const matrixReady = Object.keys(channelPermissionMatrix || {}).length > 0;
      const current = channels.find((ch) => String(ch._id) === String(prev));
      if (current) {
        const isDeptOnly =
          !String(current.team || '') &&
          selectedDepartmentId &&
          String(current.department || '') === String(selectedDepartmentId);
        const teamOk =
          selectedTeamId &&
          String(current.team || '') === String(selectedTeamId);
        const scopeOk = deptOnlyPick
          ? isDeptOnly
          : selectedTeamId
            ? teamOk || isDeptOnly
            : selectedDepartmentId
              ? isDeptOnly
              : !String(current.team || '') || teamOk;
        const perm = channelPermissionMatrix?.[String(prev)];
        const readable = !matrixReady || Boolean(perm?.canSee ?? perm?.canRead);
        if (scopeOk && readable) return prev;
      }
      const next = preferDefaultTextChannelId(
        channels,
        selectedTeamId,
        channelPermissionMatrix,
        selectedDepartmentId,
        deptOnlyPick
      );
      return String(next || '') === String(prev || '') ? prev : next;
    });
  }, [
    landingDemo,
    selectedTeamId,
    selectedDepartmentId,
    departmentWorkspaceActive,
    channelMatrixKey,
    channelsKey,
  ]);

  useEffect(() => {
    if (landingDemo || !departmentWorkspaceActive || !selectedDepartmentId || selectedTeamId) {
      return;
    }
    const ch = channels.find((c) => String(c._id) === String(selectedChannelId));
    if (!ch || !String(ch.team || '')) return;
    const isVoice = String(ch.type || '').toLowerCase() === 'voice';
    const next = isVoice
      ? resolveDeptVoiceChannelId(channels, selectedDepartmentId, channelPermissionMatrix)
      : resolveDeptChatChannelId(channels, selectedDepartmentId, channelPermissionMatrix);
    if (next && next !== selectedChannelId) setSelectedChannelId(next);
    else if (!next) setSelectedChannelId('');
  }, [
    landingDemo,
    departmentWorkspaceActive,
    selectedDepartmentId,
    selectedTeamId,
    selectedChannelId,
    channelsKey,
    channelPermissionMatrix,
  ]);

  const lastMessagesEnrichRef = useRef('');
  const lastMessagesChannelKeyRef = useRef('');

  useEffect(() => {
    if (landingDemo) return;
    if (!selectedOrganizationId) return;
    if (!selectedChannelId) {
      setMessages([]);
      lastMessagesEnrichRef.current = '';
      lastMessagesChannelKeyRef.current = '';
      return;
    }
    if (selectedChannel?.type === 'voice') {
      setMessages([]);
      lastMessagesEnrichRef.current = '';
      lastMessagesChannelKeyRef.current = '';
      return;
    }

    const channelKey = `${selectedOrganizationId}|${selectedChannelId}`;
    if (lastMessagesChannelKeyRef.current !== channelKey) {
      lastMessagesChannelKeyRef.current = channelKey;
      lastMessagesEnrichRef.current = '';
      setMessages([]);
    }

    const fingerprint = orgChannelMessagesQuery.messagesFingerprint ?? '';
    if (!fingerprint && orgChannelMessagesQuery.isLoading) return;

    const enrichKey = `${channelKey}|${fingerprint}`;
    if (lastMessagesEnrichRef.current === enrichKey) return;
    lastMessagesEnrichRef.current = enrichKey;

    let cancelled = false;
    (async () => {
      try {
        const list = orgChannelMessagesQuery.messages || [];
        const enriched = await enrichChannelMessages(list);
        if (!cancelled) setMessages(enriched);
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    landingDemo,
    selectedOrganizationId,
    selectedChannelId,
    selectedChannel?.type,
    orgChannelMessagesQuery.messagesFingerprint,
    orgChannelMessagesQuery.isLoading,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedChannelType !== 'voice') {
      setVoiceChatDismissed(false);
      return;
    }
    setVoiceChatDismissed(false);
    setVoiceMessageInput('');
    if (selectedChannelId) {
      loadVoiceRoomMessages(selectedChannelId);
    } else {
      setVoiceRoomMessages([]);
    }
  }, [selectedChannelId, selectedChannelType, landingDemo, selectedOrganizationId]);

  useEffect(() => {
    if (landingDemo || selectedChannelType !== 'voice' || !selectedChannelId) return undefined;
    if (!joinRoom || !leaveRoom) return undefined;

    const roomKey = String(selectedChannelId);
    joinRoom(roomKey, selectedOrganizationId);

    const appendVoiceMessage = (msg) => {
      const rid = String(msg?.roomId || msg?.room || '');
      if (rid !== roomKey) return;
      void (async () => {
        const enrichedList = await enrichChannelMessages([msg]);
        const normalized = enrichedList[0] || normalizeOrgChatMessage(msg);
        setVoiceRoomMessages((prev) => {
          const id = normalized?._id || normalized?.id;
          if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
          return [...prev, normalized].sort(
            (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
          );
        });
      })();
    };

    on?.('room:new_message', appendVoiceMessage);
    return () => {
      off?.('room:new_message', appendVoiceMessage);
      leaveRoom(roomKey);
    };
  }, [
    selectedChannelId,
    selectedChannelType,
    landingDemo,
    joinRoom,
    leaveRoom,
    on,
    off,
    enrichChannelMessages,
  ]);

  useEffect(() => {
    if (landingDemo || selectedChannelType === 'voice' || !selectedChannelId) return undefined;
    if (!selectedOrganizationId || !joinRoom || !leaveRoom) return undefined;

    const roomKey = String(selectedChannelId);
    joinRoom(roomKey, selectedOrganizationId);

    const appendChatMessage = (msg) => {
      const rid = String(msg?.roomId || msg?.room || '');
      if (rid !== roomKey) return;
      void (async () => {
        const enrichedList = await enrichChannelMessages([msg]);
        const normalized = enrichedList[0] || normalizeOrgChatMessage(msg);
        setMessages((prev) => {
          const id = normalized?._id || normalized?.id;
          if (id && prev.some((m) => String(m._id || m.id) === String(id))) return prev;
          return [...prev, normalized].sort(
            (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
          );
        });
      })();
    };

    on?.('room:new_message', appendChatMessage);
    return () => {
      off?.('room:new_message', appendChatMessage);
      leaveRoom(roomKey);
    };
  }, [
    selectedChannelId,
    selectedChannelType,
    selectedOrganizationId,
    landingDemo,
    joinRoom,
    leaveRoom,
    on,
    off,
    enrichChannelMessages,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedChannelType !== 'voice') {
      previousVoiceChannelIdRef.current = '';
      return;
    }
    const currentVoiceId = String(selectedChannelId || '');
    const previousVoiceId = String(previousVoiceChannelIdRef.current || '');
    if (previousVoiceId && previousVoiceId !== currentVoiceId) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
          const ctx = new AudioContextClass();
          const now = ctx.currentTime;
          const o1 = ctx.createOscillator();
          const o2 = ctx.createOscillator();
          const gain = ctx.createGain();
          o1.type = 'sine';
          o2.type = 'sine';
          o1.frequency.setValueAtTime(740, now);
          o2.frequency.setValueAtTime(980, now + 0.06);
          gain.gain.setValueAtTime(0.0001, now);
          gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
          o1.connect(gain);
          o2.connect(gain);
          gain.connect(ctx.destination);
          o1.start(now);
          o1.stop(now + 0.08);
          o2.start(now + 0.06);
          o2.stop(now + 0.18);
          window.setTimeout(() => ctx.close().catch(() => {}), 260);
        }
      } catch {
        // Không chặn luồng đổi kênh nếu âm báo thất bại.
      }
    }
    previousVoiceChannelIdRef.current = currentVoiceId;
  }, [selectedChannelType, selectedChannelId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadWorkspaceTasks(selectedOrganizationId);
    }
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (landingDemo || authLoading || !isAuthenticated) return;
    if (workspaceTabView !== 'documents') return;
    const orgId = String(selectedOrganizationId || '').trim();
    if (!orgId) return;
    if (!getResolvedBearerToken()) return;
    loadWorkspaceDocuments(orgId);
  }, [
    selectedOrganizationId,
    workspaceTabView,
    landingDemo,
    authLoading,
    isAuthenticated,
    accessToken,
    loadWorkspaceDocuments,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (!on || !off) return;

    const refreshOrgData = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.organizations.my() });
      if (inviteModalOpen) loadPendingInvitations();
      loadPendingJoinApplications();
      if (canReviewJoinForOrg) loadJoinApplicationsToReview();
    };

    const handleOrgEvent = () => {
      refreshOrgData();
    };

    on('organization:invitation_received', handleOrgEvent);
    on('organization:invitation_accepted', handleOrgEvent);
    on('organization:invitation_rejected', handleOrgEvent);
    on('organization:member_joined', handleOrgEvent);
    on('organization:member_removed', handleOrgEvent);
    on('organization:member_role_updated', handleOrgEvent);
    on('organization:updated', handleOrgEvent);
    on('organization:join_application_created', handleOrgEvent);
    on('organization:join_application_approved', handleOrgEvent);
    on('organization:join_application_rejected', handleOrgEvent);

    return () => {
      off('organization:invitation_received', handleOrgEvent);
      off('organization:invitation_accepted', handleOrgEvent);
      off('organization:invitation_rejected', handleOrgEvent);
      off('organization:member_joined', handleOrgEvent);
      off('organization:member_removed', handleOrgEvent);
      off('organization:member_role_updated', handleOrgEvent);
      off('organization:updated', handleOrgEvent);
      off('organization:join_application_created', handleOrgEvent);
      off('organization:join_application_approved', handleOrgEvent);
      off('organization:join_application_rejected', handleOrgEvent);
    };
  }, [on, off, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!location.state?.refreshPendingJoin) return;
    void loadPendingJoinApplications();
    const rest = { ...location.state };
    delete rest.refreshPendingJoin;
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: Object.keys(rest).length ? rest : undefined,
    });
  }, [location.state?.refreshPendingJoin]);

  useEffect(() => {
    if (!on || !off) return;
    const bump = () => setMemberListRefreshKey((k) => k + 1);
    on('organization:member_joined', bump);
    on('organization:member_removed', bump);
    on('organization:member_role_updated', bump);
    on('organization:join_application_approved', bump);
    return () => {
      off('organization:member_joined', bump);
      off('organization:member_removed', bump);
      off('organization:member_role_updated', bump);
      off('organization:join_application_approved', bump);
    };
  }, [on, off]);

  useEffect(() => {
    if (!on || !off || !selectedOrganizationId) return;
    const currentUid = String(user?.userId || user?._id || user?.id || '');
    const refreshIfMatchOrg = (evt) => {
      const payload = evt?.payload || evt || {};
      const eventOrgId = payload?.organizationId || evt?.organizationId || null;
      if (eventOrgId && String(eventOrgId) !== String(selectedOrganizationId)) return;
      const targetUserId = String(payload?.userId || evt?.userId || '');
      if (!targetUserId || targetUserId === currentUid) {
        reloadOrgShell(selectedOrganizationId);
      }
    };
    on('organization:member_role_updated', refreshIfMatchOrg);
    on('organization:member_joined', refreshIfMatchOrg);
    on('organization:member_removed', refreshIfMatchOrg);
    return () => {
      off('organization:member_role_updated', refreshIfMatchOrg);
      off('organization:member_joined', refreshIfMatchOrg);
      off('organization:member_removed', refreshIfMatchOrg);
    };
  }, [on, off, selectedOrganizationId, user?.userId, user?._id, user?.id]);

  const orgCenterShell = suiteLayout
    ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background text-foreground'
    : isDarkMode
      ? 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-100'
      : 'flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-transparent text-slate-900';

  const sidebarDepartments = selectedDivisionId
    ? departments.filter((d) => String(d.division || '') === String(selectedDivisionId))
    : departments;
  const visibleBranches = useMemo(
    () => filterWorkspaceStructureByScope(workspaceStructure, membershipScope),
    [workspaceStructure, membershipScope, isOrgStructureAdmin]
  );

  if (shouldRedirectEmptyOrganizations) {
    return null;
  }
  const branchOptions = Array.isArray(workspaceStructure) ? workspaceStructure : [];
  const divisionOptions = (branchId) => {
    const branch = branchOptions.find((b) => String(b._id) === String(branchId));
    return Array.isArray(branch?.divisions) ? branch.divisions : [];
  };
  const departmentOptions = (branchId, divisionId) => {
    const divs = divisionOptions(branchId);
    const division = divs.find((d) => String(d._id) === String(divisionId));
    return Array.isArray(division?.departments) ? division.departments : [];
  };
  const teamOptions = (branchId, divisionId, departmentId) => {
    const depts = departmentOptions(branchId, divisionId);
    const dept = depts.find((d) => String(d._id) === String(departmentId));
    return Array.isArray(dept?.teams) ? dept.teams : [];
  };

  const orgMainPanel = (
    <OrganizationMainPanel
      landingDemo={landingDemo}
      suiteLayout={suiteLayout}
      suiteMode={suiteMode}
      departmentWorkspaceActive={departmentWorkspaceActive}
      preferredTaskBoardId={boardIdFromQuery}
      preferredProjectId={projectIdFromQuery}
      onBackFromTasks={() => {
        if (departmentWorkspaceActive) {
          handleBackFromDepartmentWorkspace();
        } else {
          setSelectedTeamId('');
        }
      }}
      memberDepartmentIds={memberDepartmentIds}
      memberDepartmentChannelIds={memberDepartmentChannelIds}
      workspaceTabView={workspaceTabView}
      workspaceDocFiles={workspaceDocFiles}
      loadingWorkspaceDocuments={loadingWorkspaceDocuments}
      workspaceDocumentsError={workspaceDocumentsError}
      onWorkspaceDocumentsReload={() => loadWorkspaceDocuments(selectedOrganizationId)}
      notificationsFetchEnabled={notificationsFetchEnabled}
      orgMembers={orgMembers}
      onAnnounceMeetingJoin={handleAnnounceMeetingJoin}
      selectedOrganization={selectedOrganization}
      departments={sidebarDepartments}
      selectedDepartment={selectedDepartment}
      selectedDepartmentId={selectedDepartmentId}
      branches={visibleBranches}
      selectedBranchId={selectedBranchId}
      selectedDivisionId={selectedDivisionId}
      channelPermissionMatrix={channelPermissionMatrix}
      membershipScope={membershipScope}
      onSelectBranch={handleSelectBranch}
      onSelectDivision={handleSelectDivision}
      teams={teams}
      selectedTeamId={selectedTeamId}
      channels={channels}
      selectedChannelId={selectedChannelId}
      messages={messages}
      messageInput={messageInput}
      onChangeMessageInput={setMessageInput}
      onSendMessage={handleSendMessage}
      loadingMessages={selectedChannel?.type !== 'voice' && orgChannelMessagesQuery.isLoading}
      hasMoreOlderMessages={orgChannelMessagesQuery.hasMoreOlder}
      loadingOlderMessages={orgChannelMessagesQuery.loadingOlder}
      onLoadOlderMessages={() => orgChannelMessagesQuery.loadOlderMessages()}
      sendingMessage={sendingMessage}
      currentUserId={user?.userId || user?._id || user?.id}
      currentUser={user}
      onSelectChannel={handleSelectChannel}
      onSelectDepartment={handleSelectDepartment}
      onSelectTeam={handleSelectTeam}
      onOpenNotificationsPage={openWorkspaceNotifications}
      onCreateDivision={canManageWorkspaceStructure ? handleCreateDivision : undefined}
      onCreateDepartment={canManageWorkspaceStructure ? handleCreateDepartment : undefined}
      onCreateTeam={canCreateProject ? handleCreateTeam : undefined}
      onCreateChannel={canManageWorkspaceStructure ? handleCreateChannel : undefined}
      onOpenChannelSettings={handleOpenChannelSettings}
      onOpenDivisionSettings={handleOpenDivisionSettings}
      onOpenDepartmentSettings={handleOpenDepartmentSettings}
      onOpenTeamSettings={handleOpenTeamSettings}
      onRenameDivision={(division) => openRenameModal('division', division)}
      onRenameDepartment={(department) => openRenameModal('department', department)}
      onRenameTeam={(team) => openRenameModal('team', team)}
      onRenameChannel={(channel) => openRenameModal('channel', channel)}
      onSendChatOption={handleSendChatOption}
      chatContacts={chatContacts}
      loadingChatContacts={loadingChatContacts}
      loadingChannels={loadingChannels}
      loadingDepartments={loadingDepartments}
      channelUploadProgress={channelUploadProgress}
      replyingToMessage={replyingToMessage}
      onClearReply={() => setReplyingToMessage(null)}
      onReplyToMessage={(m) => setReplyingToMessage(m)}
      onSaveMessageEdit={handleSaveMessageEdit}
      onDeleteMessage={requestDeleteChannelMessage}
      onForwardMessage={handleForwardRequest}
      onQuickReactMessage={handleQuickReactMessage}
      workspaceOnlineUserIds={onlineUsers}
      workspaceSearchOpen={workspaceSearchOpen}
      onWorkspaceSearchOpenChange={setWorkspaceSearchOpen}
      onWorkspaceSearchJump={({ roomId, organizationId }) => {
        if (organizationId) setSelectedOrganizationId(String(organizationId));
        if (roomId) setSelectedChannelId(String(roomId));
        setWorkspaceSearchOpen(false);
      }}
      workspaceTasks={workspaceTasks}
      loadingWorkspaceTasks={loadingWorkspaceTasks}
      taskWorkspaceScope={taskWorkspaceScope}
      onMoveWorkspaceTask={handleMoveWorkspaceTask}
      onCreateWorkspaceTask={handleCreateWorkspaceTask}
      onWorkspaceTasksRefresh={() => loadWorkspaceTasks(selectedOrganizationId)}
      onOpenOrganizationSettings={handleOpenOrganizationSettingsModal}
      onInviteOrganization={handleInviteOrganization}
      canInviteMembers={['owner', 'admin', 'hr'].includes(
        String(selectedOrganization?.myRole || '').toLowerCase()
      )}
      canManageWorkspaceStructure={canManageWorkspaceStructure}
      canManageChannelRoleAccess={canManageChannelRoleAccess}
      canSeeAllStructure={
        Boolean(membershipScope?.canSeeAllStructure) ||
        isOrgMembershipStructureAdmin(selectedOrganization?.myRole)
      }
      onWorkspaceTabChange={handleWorkspaceTabChange}
      onOpenDocumentInWorkspace={handleOpenDocumentInWorkspace}
      onDisconnectVoice={() => setSelectedChannelId('')}
      organizationId={selectedOrganizationId}
      onVoiceRoomSessionEnd={handleVoiceRoomSessionEnd}
      onRegisterVoiceComposerHelpers={registerVoiceComposerHelpers}
      onAppendComposerEmoji={(emoji) => {
        if (selectedChannelType === 'voice') {
          setVoiceMessageInput((prev) => `${prev || ''}${emoji}`);
          return;
        }
        setMessageInput((prev) => `${prev || ''}${emoji}`);
      }}
      onOpenVoiceChatSidebar={() => setVoiceChatDismissed(false)}
      voiceChatSidebarOpen={
        selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed
      }
    />
  );

  const memberNotReadyPanel = (
    <div className={`${orgCenterShell} items-center justify-center px-6 py-12`}>
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h2 className="text-xl font-semibold text-foreground">
          {t('organizations.memberNotReadyTitle')}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t('organizations.memberNotReadyBody')}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('organizations.memberNotReadyHint')}
        </p>
      </div>
    </div>
  );

  const orgCenterContent = memberAccessIncomplete
    ? memberNotReadyPanel
    : suiteLayout && selectedOrganizationId ? (
      <WorkspaceSlugFigmaShell
        organizationName={selectedOrganization?.name}
        activeTab={shellActiveTab}
        showLanding={isProjectsRoute ? showProjectsLanding : showTeamHub}
        selectedTeam={shellSelectedTeam}
        selectedDepartment={shellSelectedDepartment}
        departmentMode={Boolean(
          !isProjectsRoute &&
            departmentWorkspaceActive &&
            selectedDepartmentId &&
            !selectedTeamId
        )}
        hideChrome={shellActiveTab === 'tasks' || isProjectsRoute}
        locale={locale}
        onTabChange={handleShellTabChange}
        onBackFromSubView={() => {
          if (isProjectsRoute && hasOpenProjectBoard) {
            navigate(buildCollaborateTasksPath(selectedOrganizationId), { replace: true });
            return;
          }
          if (departmentWorkspaceActive) {
            handleBackFromDepartmentWorkspace();
          } else {
            setSelectedTeamId('');
          }
        }}
        teamGrid={
          showProjectsLanding ? (
            <OrganizationTeamGrid
              organizationName={selectedOrganization?.name}
              projects={Array.isArray(orgProjects) ? orgProjects : []}
              assignedTasksCount={assignedTasksCount}
              activeProjectsCount={activeProjectsCount}
              onCreateTeam={canCreateProject ? handleCreateTeam : undefined}
              onSelectProject={(project) => handleSelectOrgProject(project)}
            />
          ) : showDepartmentHub ? (
            <OrganizationDepartmentGrid
              organizationId={selectedOrganizationId}
              organizationName={selectedOrganization?.name}
              departments={hubDepartments}
              teams={teams}
              branches={visibleBranches}
              channels={channels}
              onlineUserIds={onlineUsers}
              membershipScope={membershipScope}
              orgMyRole={selectedOrganization?.myRole}
              onSelectDepartment={(deptId) => handleSelectDepartment(deptId)}
              onDepartmentModuleClick={handleDepartmentModuleClick}
              onCreateDepartment={
                canManageWorkspaceStructure ? handleCreateDepartment : undefined
              }
              onDepartmentSettings={
                isOrgStructureAdmin ? handleOpenDepartmentSettings : undefined
              }
            />
          ) : (
            <OrganizationTeamGrid
              organizationName={selectedOrganization?.name}
              departmentName={
                selectedDepartment?.name
                  ? displayDepartmentName(selectedDepartment.name, locale)
                  : ''
              }
              filterDepartmentId={orgHubNeedsDepartmentStep ? selectedDepartmentId : ''}
              branches={visibleBranches}
              departments={sidebarDepartments}
              teams={teams}
              channels={channels}
              projects={null}
              assignedTasksCount={assignedTasksCount}
              onBack={
                orgHubNeedsDepartmentStep && selectedDepartmentId
                  ? handleBackFromDepartmentHub
                  : undefined
              }
              onSelectTeam={(_team, teamId) => handleSelectTeam(teamId)}
              onModuleClick={handleHubCardModuleClick}
            />
          )
        }
      >
        <div className={orgCenterShell}>{orgMainPanel}</div>
      </WorkspaceSlugFigmaShell>
    ) : (
      <div className={orgCenterShell}>{orgMainPanel}</div>
    );

  return (
    <>
      {showOrgPicker ? (
        <WorkspacesOrgPickerView
          organizations={enrichedOrganizationsForPicker}
          locale={locale}
          onEnterOrg={handleEnterOrgFromPicker}
          onCreateOrg={handleCreateOrganization}
          quickInviteValue={quickInviteInput}
          onQuickInviteChange={setQuickInviteInput}
          onQuickInviteSubmit={handleJoinQuickInvite}
          joiningQuickInvite={joiningQuickInvite}
          joinReviewCountByOrgId={joinReviewCountByOrgId}
        />
      ) : (
      <ThreeFrameLayout
        landingDemo={landingDemo}
        left={suiteLayout ? false : undefined}
        centerScrollable={!isLgViewport}
        center={orgCenterContent}
        right={
          memberAccessIncomplete || showTeamHub || workspaceTabView === 'tasks'
            ? null
            : selectedOrganizationId ? (
            selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed ? (
              <>
                <input
                  ref={voiceFileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => handleVoiceComposerFileSelected(e, 'file')}
                />
                <input
                  ref={voiceImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleVoiceComposerFileSelected(e, 'image')}
                />
                <OrganizationVoiceChannelSidebar
                  channelName={selectedChannel?.name || ''}
                  messages={voiceRoomMessages}
                  messageInput={voiceMessageInput}
                  onChangeMessageInput={setVoiceMessageInput}
                  onSendMessage={handleSendVoiceRoomMessage}
                  sendingMessage={sendingMessage}
                  currentUserId={user?.userId || user?._id || user?.id}
                  currentUser={user}
                  onClose={() => setVoiceChatDismissed(true)}
                  canWriteInChannel={canWriteInVoiceChannel}
                  plusItems={voiceComposerPlusItems}
                  actionItems={voiceComposerActionItems}
                  uploadProgress={channelUploadProgress}
                  uploadLabel={t('orgPanel.uploadChannel')}
                />
              </>
            ) : (
            <OrganizationMemberSidebar
              organizationId={selectedOrganizationId}
              workspaceSlug={String(selectedOrganization?.slug || '').trim()}
              organizationName={selectedOrganization?.name || ''}
              selectedTeamId={selectedTeamId}
              teams={teams}
              workspaceSearchOpen={workspaceSearchOpen}
              onWorkspaceSearchOpenChange={setWorkspaceSearchOpen}
              searchChannels={channels.filter((c) => c.type !== 'voice')}
              selectedChannelId={selectedChannelId}
              channelPermissionMatrix={channelPermissionMatrix}
              serverId={selectedOrganization?.serverId}
              onWorkspaceSearchJump={({ roomId, organizationId }) => {
                if (organizationId) setSelectedOrganizationId(String(organizationId));
                if (roomId) setSelectedChannelId(String(roomId));
                setWorkspaceSearchOpen(false);
              }}
              onlineUsers={onlineUsers}
              socketConnected={socketConnected}
              refreshKey={memberListRefreshKey}
              currentUserId={user?.userId || user?._id || user?.id}
              myRole={selectedOrganization?.myRole}
              canReviewJoinApplications={false}
              joinApplicationsToReview={[]}
              loadingJoinApplicationsToReview={false}
              respondingJoinReviewKeys={[]}
              onApproveJoinApplication={undefined}
              onRejectJoinApplication={undefined}
              onMentionUser={(text) => {
                if (selectedChannelType === 'voice') {
                  setVoiceMessageInput((prev) => `${prev || ''}${text}`);
                } else {
                  setMessageInput((prev) => `${prev || ''}${text}`);
                }
              }}
              onMemberRemoved={() => setMemberListRefreshKey((k) => k + 1)}
            />
            )
          ) : null
        }
        rightWidth={
          selectedChannelType === 'voice' && !workspaceSearchOpen && !voiceChatDismissed
            ? 'w-[340px]'
            : 'w-[280px]'
        }
      />
      )}
      {leaveOrgModalOpen && (
        <Modal
          isOpen={leaveOrgModalOpen}
          onClose={leavingOrg ? () => {} : closeLeaveOrgModal}
          title={t('organizations.leaveTitle')}
          size="sm"
        >
          <p className="text-sm leading-relaxed text-gray-300">
            {t('organizations.leaveIntro')}{' '}
            <span className="font-semibold text-white">&quot;{leaveOrgPendingName}&quot;</span>.{' '}
            {t('organizations.leaveOutro')}
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={closeLeaveOrgModal}
              disabled={leavingOrg}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={confirmLeaveOrganization}
              disabled={leavingOrg}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(225,29,72,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {leavingOrg ? t('organizations.leaving') : t('organizations.leaveBtn')}
            </button>
          </div>
        </Modal>
      )}
      {inviteModalOpen && (
        <Modal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title={t('organizations.inviteModalTitle', {
            name: inviteOrganization?.name || t('organizations.orgShort'),
          })}
          size="md"
        >
          <div className="space-y-4">
            <PageSearchBar
              value={inviteSearch}
              onChange={setInviteSearch}
              placeholder={t('organizations.searchFriendsPh')}
              isDarkMode={isDarkMode}
              size="sm"
              id="org-invite-friend-search"
            />

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-overlay">
              {loadingInviteFriends && (
                <div className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">
                  {t('organizations.loadingFriends')}
                </div>
              )}
              {!loadingInviteFriends && filteredInviteFriends.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-gray-400">
                  {t('organizations.noFriendsInvite')}
                </div>
              )}
              {!loadingInviteFriends &&
                filteredInviteFriends.map((friend) => {
                  const inviting = invitingIds.includes(friend.id);
                  return (
                    <div
                      key={friend.id}
                      className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{friend.name}</div>
                        <div className="truncate text-xs text-gray-400">{friend.username}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInviteFriendToOrganization(friend.id)}
                        disabled={inviting}
                        className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white transition hover:bg-white/20 disabled:opacity-50"
                      >
                        {inviting ? t('organizations.inviting') : t('organizations.inviteBtn')}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">{t('organizations.inviteByLink')}</div>
                {isInviteLinkBeta && (
                  <span className="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
                    Beta
                  </span>
                )}
              </div>
              <div className="mb-2 grid grid-cols-2 gap-2">
                <select
                  value={inviteBranchId}
                  onChange={(event) => {
                    const nextBranchId = event.target.value;
                    const selectedBranch = inviteStructureBranches.find(
                      (b) => String(b._id) === String(nextBranchId)
                    );
                    const nextDivisionId = selectedBranch?.divisions?.[0]?._id
                      ? String(selectedBranch.divisions[0]._id)
                      : '';
                    setInviteBranchId(nextBranchId);
                    setInviteDivisionId(nextDivisionId);
                  }}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-200"
                >
                  {inviteStructureBranches.map((branch) => (
                    <option key={branch._id} value={branch._id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
                <select
                  value={inviteDivisionId}
                  onChange={(event) => setInviteDivisionId(event.target.value)}
                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-xs text-gray-200"
                >
                  {(inviteStructureBranches.find((b) => String(b._id) === String(inviteBranchId))
                    ?.divisions || []
                  ).map((division) => (
                    <option key={division._id} value={division._id}>
                      {division.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[11px] text-cyan-300">
                  {inviteContextLabel
                    ? t('organizations.inviteLinkTo', { label: inviteContextLabel })
                    : t('organizations.inviteLinkWholeOrg')}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    regenerateInviteLinkWithContext(inviteOrgId, inviteBranchId, inviteDivisionId)
                  }
                  className="rounded-md border border-white/15 px-2 py-1 text-xs text-white hover:bg-white/10"
                >
                  Tạo lại link
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedInviteLink || (generatingInviteLink ? t('organizations.generatingLink') : '')}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  disabled={!generatedInviteLink || generatingInviteLink}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  {t('organizations.copyLinkBtn')}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {isInviteLinkBeta ? t('organizations.betaHttp') : t('organizations.betaHttps')}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={createOrgModalOpen}
        onClose={() => {
          if (creatingWorkspace) return;
          setCreateOrgModalOpen(false);
        }}
        title={
          creatingWorkspace
            ? t('organizations.creatingWorkspace')
            : `Create Workspace - Step ${createWorkspaceStep}/5`
        }
        size="sm"
      >
        <div className="relative space-y-3">
          {creatingWorkspace ? (
            <div
              className="absolute inset-0 z-10 flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-xl bg-slate-950/90 px-4 text-center backdrop-blur-sm"
              role="status"
              aria-live="polite"
              aria-busy="true"
            >
              <Loader2
                className="h-10 w-10 animate-spin text-cyan-400"
                strokeWidth={1.75}
                aria-hidden
              />
              <p className="text-sm font-semibold text-white">{t('organizations.creatingWorkspace')}</p>
              <p className="max-w-xs text-xs leading-relaxed text-slate-400">
                {t('organizations.creatingWorkspaceHint')}
              </p>
            </div>
          ) : null}
          {createWorkspaceStep === 1 ? (
            <input
              value={createOrgName}
              onChange={(event) => {
                const nextName = event.target.value;
                setCreateOrgName(nextName);
                setCreateWorkspaceSlug((prev) => prev || toWorkspaceSlug(nextName));
              }}
              placeholder="Workspace name"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
          ) : null}
          {createWorkspaceStep === 2 ? (
            <div className="space-y-2">
              <input
                value={createWorkspaceSlug}
                onChange={(event) => setCreateWorkspaceSlug(toWorkspaceSlug(event.target.value))}
                placeholder="workspace-slug"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
              />
              <p className="text-xs text-gray-400">
                Slug dùng nội bộ (invite); sau tạo sẽ mở kênh tổ chức trong Communicate.
              </p>
            </div>
          ) : null}
          {createWorkspaceStep === 3 ? (
            <div className="space-y-2">
              <select
                value={createWorkspaceType}
                onChange={(event) => setCreateWorkspaceType(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                <option value="company" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Company</option>
                <option value="startup" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Startup</option>
                <option value="education" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Education</option>
                <option value="community" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>Community</option>
              </select>
              <select
                value={createWorkspaceTeamSize}
                onChange={(event) => setCreateWorkspaceTeamSize(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
                style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}
              >
                <option value="1-10" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>1-10</option>
                <option value="11-50" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>11-50</option>
                <option value="51-200" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>51-200</option>
                <option value="201-1000" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>201-1000</option>
                <option value="1000+" style={{ backgroundColor: '#0f172a', color: '#f8fafc' }}>1000+</option>
              </select>
              <input
                value={createWorkspaceIndustry}
                onChange={(event) => setCreateWorkspaceIndustry(event.target.value)}
                placeholder="Industry (optional)"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
              />
            </div>
          ) : null}
          {createWorkspaceStep === 4 ? (
            <div className="space-y-3">
              <div className="text-xs text-gray-400">{t('organizations.designStructureSubtitle')}</div>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-gray-300">
                  Số chi nhánh
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createBranchCountInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          20,
                          setCreateBranchCountInput,
                          setCreateBranchCount
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createBranchCountInput,
                          createBranchCount,
                          1,
                          20,
                          setCreateBranchCountInput,
                          setCreateBranchCount
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createBranchCount,
                            -1,
                            1,
                            20,
                            setCreateBranchCountInput,
                            setCreateBranchCount
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createBranchCount,
                            1,
                            1,
                            20,
                            setCreateBranchCountInput,
                            setCreateBranchCount
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Khối / chi nhánh
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createDivisionPerBranchInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          20,
                          setCreateDivisionPerBranchInput,
                          setCreateDivisionPerBranch
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createDivisionPerBranchInput,
                          createDivisionPerBranch,
                          1,
                          20,
                          setCreateDivisionPerBranchInput,
                          setCreateDivisionPerBranch
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDivisionPerBranch,
                            -1,
                            1,
                            20,
                            setCreateDivisionPerBranchInput,
                            setCreateDivisionPerBranch
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDivisionPerBranch,
                            1,
                            1,
                            20,
                            setCreateDivisionPerBranchInput,
                            setCreateDivisionPerBranch
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Phòng / khối
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createDepartmentPerDivisionInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          30,
                          setCreateDepartmentPerDivisionInput,
                          setCreateDepartmentPerDivision
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createDepartmentPerDivisionInput,
                          createDepartmentPerDivision,
                          1,
                          30,
                          setCreateDepartmentPerDivisionInput,
                          setCreateDepartmentPerDivision
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDepartmentPerDivision,
                            -1,
                            1,
                            30,
                            setCreateDepartmentPerDivisionInput,
                            setCreateDepartmentPerDivision
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createDepartmentPerDivision,
                            1,
                            1,
                            30,
                            setCreateDepartmentPerDivisionInput,
                            setCreateDepartmentPerDivision
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
                <label className="text-xs text-gray-300">
                  Team / phòng
                  <div className="mt-1 flex items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-1 py-1">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={createTeamPerDepartmentInput}
                      onChange={(event) =>
                        updateStructureCountDraft(
                          event.target.value,
                          1,
                          30,
                          setCreateTeamPerDepartmentInput,
                          setCreateTeamPerDepartment
                        )
                      }
                      onBlur={() =>
                        commitStructureCountDraft(
                          createTeamPerDepartmentInput,
                          createTeamPerDepartment,
                          1,
                          30,
                          setCreateTeamPerDepartmentInput,
                          setCreateTeamPerDepartment
                        )
                      }
                      className="w-full rounded-md bg-transparent px-2 py-1.5 text-sm text-white outline-none placeholder:text-gray-500"
                    />
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createTeamPerDepartment,
                            -1,
                            1,
                            30,
                            setCreateTeamPerDepartmentInput,
                            setCreateTeamPerDepartment
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        -
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          adjustStructureCount(
                            createTeamPerDepartment,
                            1,
                            1,
                            30,
                            setCreateTeamPerDepartmentInput,
                            setCreateTeamPerDepartment
                          )
                        }
                        className="h-7 w-7 rounded-md border border-white/15 text-sm text-gray-300 hover:bg-white/10"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </label>
              </div>

              <div className="text-xs text-gray-400">{t('organizations.enterNamesSubtitle')}</div>
              <div className="max-h-[280px] overflow-y-auto pr-1 scrollbar-overlay space-y-3 rounded-xl border border-white/10 bg-black/20 p-2">
                {Array.from({ length: Math.max(1, Number(createBranchCount) || 1) }, (_, bIdx) => {
                  const divisionCount = Math.max(1, Number(createDivisionPerBranch) || 1);
                  const departmentCount = Math.max(1, Number(createDepartmentPerDivision) || 1);
                  const teamCount = Math.max(1, Number(createTeamPerDepartment) || 1);
                  return (
                    <div key={`branch-${bIdx}`} className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
                      <div className="mb-1 text-xs font-semibold text-white">{t('organizations.branchLabelN', { n: bIdx + 1 })}</div>
                      <input
                        value={createBranchNames[bIdx] || ''}
                        onChange={(e) =>
                          setCreateBranchNames((prev) =>
                            prev.map((v, i) => (i === bIdx ? e.target.value : v))
                          )
                        }
                        className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                      />

                      <div className="mt-3 space-y-3 border-l border-white/10 pl-3">
                        {Array.from({ length: divisionCount }, (_, dIdx) => (
                          <div key={`branch-${bIdx}-div-${dIdx}`} className="space-y-2">
                            <div className="text-[11px] font-semibold text-gray-200">{t('organizations.divisionLabelN', { n: dIdx + 1 })}</div>
                            <input
                              value={createDivisionNames?.[bIdx]?.[dIdx] || ''}
                              onChange={(e) =>
                                setCreateDivisionNames((prev) =>
                                  prev.map((branch, bi) =>
                                    bi !== bIdx
                                      ? branch
                                      : branch.map((v, di) => (di === dIdx ? e.target.value : v))
                                  )
                                )
                              }
                              className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                            />

                            <div className="space-y-2 border-l border-white/10 pl-3">
                              {Array.from({ length: departmentCount }, (_, depIdx) => (
                                <div key={`branch-${bIdx}-div-${dIdx}-dept-${depIdx}`} className="space-y-2">
                                  <div className="text-[11px] font-semibold text-gray-200">{t('organizations.deptLabelN', { n: depIdx + 1 })}</div>
                                  <input
                                    value={createDepartmentNames?.[bIdx]?.[dIdx]?.[depIdx] || ''}
                                    onChange={(e) =>
                                      setCreateDepartmentNames((prev) =>
                                        prev.map((branch, bi) =>
                                          bi !== bIdx
                                            ? branch
                                            : branch.map((division, di) =>
                                                di !== dIdx
                                                  ? division
                                                  : division.map((v, dpt) =>
                                                      dpt === depIdx ? e.target.value : v
                                                    )
                                              )
                                        )
                                      )
                                    }
                                    className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                                  />

                                  <div className="space-y-2 border-l border-white/10 pl-3">
                                    {Array.from({ length: teamCount }, (_, tIdx) => (
                                      <div key={`branch-${bIdx}-div-${dIdx}-dept-${depIdx}-team-${tIdx}`} className="space-y-2">
                                        <div className="text-[11px] font-semibold text-gray-200">
                                          Team {depIdx + 1}.{tIdx + 1}
                                        </div>
                                        <input
                                          value={createTeamNames?.[bIdx]?.[dIdx]?.[depIdx]?.[tIdx] || ''}
                                          onChange={(e) =>
                                            setCreateTeamNames((prev) =>
                                              prev.map((branch, bi) =>
                                                bi !== bIdx
                                                  ? branch
                                                  : branch.map((division, di) =>
                                                      di !== dIdx
                                                        ? division
                                                        : division.map((dept, dpt) =>
                                                            dpt !== depIdx
                                                              ? dept
                                                              : dept.map((teamName, teamI) =>
                                                                  teamI === tIdx
                                                                    ? e.target.value
                                                                    : teamName
                                                                )
                                                          )
                                                    )
                                              )
                                            )
                                          }
                                          className="w-full rounded-lg border border-white/15 bg-white/[0.03] px-3 py-2 text-sm text-white outline-none"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
          {createWorkspaceStep === 5 ? (
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-gray-200">
              <div>Name: {createOrgName || '-'}</div>
              <div>Slug: {toWorkspaceSlug(createWorkspaceSlug || createOrgName) || '-'}</div>
              <div>Type: {createWorkspaceType}</div>
              <div>Team size: {createWorkspaceTeamSize}</div>
              <div>Industry: {createWorkspaceIndustry || '-'}</div>
              <div>Branches: {createBranchCount}</div>
              <div>Divisions/Branch: {createDivisionPerBranch}</div>
              <div>Departments/Division: {createDepartmentPerDivision}</div>
              <div>Teams/Department: {createTeamPerDepartment}</div>
            </div>
          ) : null}
          <div
            className={`flex justify-end gap-2 ${creatingWorkspace ? 'pointer-events-none opacity-40' : ''}`}
          >
            <button
              type="button"
              disabled={creatingWorkspace}
              onClick={() => setCreateOrgModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300 disabled:cursor-not-allowed"
            >
              {t('nav.cancel')}
            </button>
            {createWorkspaceStep > 1 ? (
              <button
                type="button"
                disabled={creatingWorkspace}
                onClick={() => setCreateWorkspaceStep((step) => Math.max(1, step - 1))}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300 disabled:cursor-not-allowed"
              >
                Back
              </button>
            ) : null}
            {createWorkspaceStep < 5 ? (
              <button
                type="button"
                disabled={creatingWorkspace}
                onClick={() => setCreateWorkspaceStep((step) => Math.min(5, step + 1))}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Next
              </button>
            ) : null}
            {createWorkspaceStep === 5 ? (
              <button
                type="button"
                disabled={creatingWorkspace}
                onClick={handleSubmitCreateOrganization}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-80"
              >
                {creatingWorkspace ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} aria-hidden />
                    {t('organizations.creatingWorkspace')}
                  </>
                ) : (
                  t('organizations.createWorkspaceSubmit')
                )}
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      <ForwardChannelModal
        isOpen={forwardModalOpen}
        onClose={() => {
          setForwardModalOpen(false);
          setForwardSourceMessage(null);
        }}
        organizationName={selectedOrganization?.name || ''}
        targets={forwardTargets}
        loading={forwardTargetsLoading}
        previewText={forwardPreviewText}
        onConfirm={handleForwardConfirm}
      />

      <Modal
        isOpen={createDivisionModalOpen}
        onClose={() => setCreateDivisionModalOpen(false)}
        title={t('organizationSettings.createDivisionTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Chi nhánh
            <select
              value={createDivisionBranchId}
              onChange={(event) => setCreateDivisionBranchId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {branchOptions.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={createDivisionName}
            onChange={(event) => setCreateDivisionName(event.target.value)}
            placeholder={t('organizationSettings.divisionNamePh')}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDivisionModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateDivision}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo khối
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createDeptModalOpen}
        onClose={() => setCreateDeptModalOpen(false)}
        title={t('organizations.createDeptTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Khối
            <select
              value={createDeptDivisionId}
              onChange={(event) => setCreateDeptDivisionId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {divisionOptions(selectedBranchId).map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <input
            value={createDeptName}
            onChange={(event) => setCreateDeptName(event.target.value)}
            placeholder={t('organizations.createDeptPh')}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDeptModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateDepartment}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {t('organizations.createDeptSubmit')}
            </button>
          </div>
        </div>
      </Modal>

      <CreateTaskBoardModal
        isOpen={createTeamModalOpen}
        onClose={() => {
          if (creatingProjectBoard) return;
          setCreateTeamModalOpen(false);
        }}
        modalTitle={t('adminTasks.createOpen')}
        defaultScopeType="organization"
        organizationId={String(selectedOrganizationId || '')}
        scopeId={String(selectedOrganizationId || '')}
        defaultScopeLabel="ORG"
        creating={creatingProjectBoard}
        onSubmit={handleSubmitCreateProject}
      />

      <Modal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        title={
          createChannelType === 'voice'
            ? t('organizations.createVoiceTitle')
            : t('organizations.createChatTitle')
        }
        size="sm"
      >
        <div className="space-y-3">
          <label className="text-xs text-gray-300">
            Chi nhánh
            <select
              value={createChannelBranchId}
              onChange={(event) => {
                const nextBranchId = event.target.value;
                const nextDivisions = divisionOptions(nextBranchId);
                const nextDivisionId = nextDivisions[0]?._id ? String(nextDivisions[0]._id) : '';
                const nextDepartments = departmentOptions(nextBranchId, nextDivisionId);
                const nextDepartmentId = nextDepartments[0]?._id ? String(nextDepartments[0]._id) : '';
                const nextTeams = teamOptions(nextBranchId, nextDivisionId, nextDepartmentId);
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelBranchId(nextBranchId);
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {branchOptions.map((branch) => (
                <option key={branch._id} value={branch._id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-300">
            Khối
            <select
              value={createChannelDivisionId}
              onChange={(event) => {
                const nextDivisionId = event.target.value;
                const nextDepartments = departmentOptions(createChannelBranchId, nextDivisionId);
                const nextDepartmentId = nextDepartments[0]?._id ? String(nextDepartments[0]._id) : '';
                const nextTeams = teamOptions(createChannelBranchId, nextDivisionId, nextDepartmentId);
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelDivisionId(nextDivisionId);
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {divisionOptions(createChannelBranchId).map((division) => (
                <option key={division._id} value={division._id}>
                  {division.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-300">
            Phòng ban
            <select
              value={createChannelDepartmentId}
              onChange={(event) => {
                const nextDepartmentId = event.target.value;
                const nextTeams = teamOptions(
                  createChannelBranchId,
                  createChannelDivisionId,
                  nextDepartmentId
                );
                const nextTeamId = nextTeams[0]?._id ? String(nextTeams[0]._id) : '';
                setCreateChannelDepartmentId(nextDepartmentId);
                setCreateChannelTeamId(nextTeamId);
              }}
              className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
            >
              {departmentOptions(createChannelBranchId, createChannelDivisionId).map((department) => (
                <option key={department._id} value={department._id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          {createChannelLevel !== 'department' ? (
            <label className="text-xs text-gray-300">
              Team
              <select
                value={createChannelTeamId}
                onChange={(event) => setCreateChannelTeamId(event.target.value)}
                className="mt-1 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white"
              >
                {teamOptions(createChannelBranchId, createChannelDivisionId, createChannelDepartmentId).map(
                  (team) => (
                    <option key={team._id} value={team._id}>
                      {team.name}
                    </option>
                  )
                )}
              </select>
            </label>
          ) : (
            <p className="text-xs text-gray-400">{t('workspace.deptChannelCreateHint')}</p>
          )}
          <input
            value={createChannelName}
            onChange={(event) => setCreateChannelName(event.target.value)}
            placeholder={
              createChannelType === 'voice'
                ? t('organizations.voiceChannelPh')
                : t('organizations.chatChannelPh')
            }
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateChannel}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              {t('organizations.createChannelSubmit')}
            </button>
          </div>
        </div>
      </Modal>
      <Modal
        isOpen={renameModalOpen}
        onClose={() => setRenameModalOpen(false)}
        title={t('organizations.renameTitle')}
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={renameTargetName}
            onChange={(event) => setRenameTargetName(event.target.value)}
            placeholder={t('organizationSettings.newNamePh')}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRenameModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSubmitRenameEntity}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Lưu tên mới
            </button>
          </div>
        </div>
      </Modal>
      <OrganizationChannelRoleSettingsModal
        isOpen={channelSettingsOpen}
        onClose={() => {
          setChannelSettingsOpen(false);
          setChannelSettingsChannel(null);
        }}
        organizationId={selectedOrganizationId}
        channel={channelSettingsChannel}
        locale={locale}
        isDarkMode={isDarkMode}
        canManageChannelRoles={canManageChannelRoleAccess}
        onDeleteChannel={handleDeleteWorkspaceChannel}
        onSaved={() => {
          if (selectedOrganizationId) reloadOrgShell(selectedOrganizationId);
        }}
      />
      <OrganizationScopeRoleSettingsModal
        isOpen={scopeSettingsOpen}
        onClose={() => {
          setScopeSettingsOpen(false);
          setScopeSettingsTarget(null);
        }}
        organizationId={selectedOrganizationId}
        scopeType={scopeSettingsType}
        scope={scopeSettingsTarget}
        locale={locale}
        isDarkMode={isDarkMode}
        canManage={canManageChannelRoleAccess}
        onSaved={() => {
          if (selectedOrganizationId) reloadOrgShell(selectedOrganizationId);
        }}
      />
      <ConfirmDialog
        isOpen={deleteChannelMsgConfirmId != null}
        onClose={() => setDeleteChannelMsgConfirmId(null)}
        onConfirm={confirmDeleteChannelMessage}
        title={t('organizations.deleteMsgTitle')}
        message={t('organizations.deleteMsgMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />
    </>
  );
}

export default OrganizationsPage;

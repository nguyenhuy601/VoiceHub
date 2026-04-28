import { useEffect, useMemo, useState } from 'react';
import { useAppStrings } from '../../locales/appStrings';
import toast from 'react-hot-toast';
import { useLocation } from 'react-router-dom';
import { ConfirmDialog, Modal } from '../../components/Shared';
import OrganizationMemberSidebar from '../../components/Organization/OrganizationMemberSidebar';
import OrganizationMainPanel from '../../components/Organization/OrganizationMainPanel';
import OrganizationSettingsPanel from '../../components/Organization/OrganizationSettingsPanel';
import ForwardChannelModal from '../../components/Organization/ForwardChannelModal';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { useAuth } from '../../context/AuthContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { appShellBg } from '../../theme/shellTheme';
import { displayDepartmentName, channelNameToDisplaySlug } from '../../utils/orgEntityDisplay';

const unwrapData = (payload) => payload?.data ?? payload;

function OrganizationsPage({ landingDemo = false, initialWorkspaceSlug = '' } = {}) {
  const { t, locale } = useAppStrings();
  const { user } = useAuth();
  const { setActiveWorkspace, lastWorkspaceSlug, setLastWorkspaceSlug } = useWorkspace();
  const { isDarkMode } = useTheme();
  const { on, off, onlineUsers, connected: socketConnected } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const location = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  /** Đã hoàn tất ít nhất một lần gọi API danh sách tổ chức (sidebar: chỉ hiện “chưa tham gia” sau khi biết kết quả). */
  const [organizationsLoaded, setOrganizationsLoaded] = useState(false);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
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
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');
  const [generatingInviteLink, setGeneratingInviteLink] = useState(false);
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
  const [createWorkspaceStep, setCreateWorkspaceStep] = useState(1);
  const [createOrgName, setCreateOrgName] = useState('');
  const [createWorkspaceSlug, setCreateWorkspaceSlug] = useState('');
  const [createWorkspaceType, setCreateWorkspaceType] = useState('company');
  const [createWorkspaceTeamSize, setCreateWorkspaceTeamSize] = useState('1-10');
  const [createWorkspaceIndustry, setCreateWorkspaceIndustry] = useState('');
  const [orgSettingsModalOpen, setOrgSettingsModalOpen] = useState(false);
  const [orgForSettings, setOrgForSettings] = useState(null);
  const [createDeptModalOpen, setCreateDeptModalOpen] = useState(false);
  const [createDeptName, setCreateDeptName] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelName, setCreateChannelName] = useState('');
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
  const [workspaceTabView, setWorkspaceTabView] = useState('chat');

  const notify = (message, type = 'success') => {
    if (type === 'fail') toast.error(message);
    else if (type === 'info') toast(message, { icon: 'ℹ️' });
    else toast.success(message);
  };
  const notifySuccess = (message) => notify(message, 'success');
  const notifyError = (message) => notify(message, 'fail');

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org._id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId]
  );
  const selectedDepartment = useMemo(
    () => departments.find((department) => department._id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );
  const selectedChannel = useMemo(
    () => channels.find((ch) => String(ch._id) === String(selectedChannelId)) || null,
    [channels, selectedChannelId]
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
  const hasOrganizations = organizations.length > 0;

  useEffect(() => {
    if (!selectedOrganizationId) return;
    const current = organizations.find((item) => String(item._id) === String(selectedOrganizationId));
    if (!current) return;
    setActiveWorkspace({
      _id: current._id,
      slug: current.slug,
      name: current.name,
      myRole: current.myRole,
    });
  }, [organizations, selectedOrganizationId, setActiveWorkspace]);

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
      const payload = await organizationAPI.getOrganizations();
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setOrganizations(normalized);
      if (normalized.length > 0) {
        const matchedBySlug = normalized.find(
          (item) => String(item.slug || '').trim() === String(lastWorkspaceSlug || '').trim()
        );
        setSelectedOrganizationId((prev) => prev || matchedBySlug?._id || normalized[0]._id);
      } else {
        setSelectedOrganizationId('');
      }
    } catch (error) {
      notifyError(t('organizations.loadOrgsFail'));
    } finally {
      setOrganizationsLoaded(true);
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
    try {
      const payload = await organizationAPI.getMyPendingJoinApplications();
      const list = unwrapData(payload);
      setPendingJoinApplications(Array.isArray(list) ? list : []);
    } catch (error) {
      setPendingJoinApplications([]);
    }
  };

  const loadJoinApplicationsToReview = async () => {
    setLoadingJoinApplicationsToReview(true);
    try {
      const payload = await organizationAPI.getJoinApplicationsToReview();
      const list = unwrapData(payload);
      setJoinApplicationsToReview(Array.isArray(list) ? list : []);
    } catch (error) {
      setJoinApplicationsToReview([]);
    } finally {
      setLoadingJoinApplicationsToReview(false);
    }
  };

  const joinReviewKey = (orgId, applicationId) => `${orgId}:${applicationId}`;

  const handleApproveJoinApplication = async (orgId, applicationId) => {
    if (!orgId || !applicationId) return;
    const key = joinReviewKey(orgId, applicationId);
    setRespondingJoinReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    try {
      await organizationAPI.reviewJoinApplication(orgId, applicationId, { action: 'approve' });
      notifySuccess(t('organizations.approveOk'));
      await Promise.all([loadJoinApplicationsToReview(), loadOrganizations()]);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.approveFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.approveFail'));
    } finally {
      setRespondingJoinReviewKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const handleRejectJoinApplication = async (orgId, applicationId, rejectionReason) => {
    if (!orgId || !applicationId) return;
    const key = joinReviewKey(orgId, applicationId);
    setRespondingJoinReviewKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
    try {
      await organizationAPI.reviewJoinApplication(orgId, applicationId, {
        action: 'reject',
        rejectionReason: String(rejectionReason || '').trim(),
      });
      notifySuccess(t('organizations.rejectOk'));
      await loadJoinApplicationsToReview();
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.rejectFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.rejectFail'));
    } finally {
      setRespondingJoinReviewKeys((prev) => prev.filter((k) => k !== key));
    }
  };

  const loadChatContacts = async () => {
    setLoadingChatContacts(true);
    try {
      const payload = await friendService.getFriends();
      const data = unwrapData(payload);
      const rawList = Array.isArray(data?.friends) ? data.friends : Array.isArray(data) ? data : [];
      const normalized = rawList
        .map((item) => item.friendId || item)
        .filter(Boolean)
        .map((item) => ({
          id: item._id || item.id,
          name: item.displayName || item.name || item.username || t('organizations.userFallback'),
          phone: item.phone || '',
          email: item.email || '',
          avatar: item.avatar || null,
          category: 'friend',
        }))
        .filter((item) => !!item.id);
      setChatContacts(normalized);
    } catch (error) {
      setChatContacts([]);
    } finally {
      setLoadingChatContacts(false);
    }
  };

  const loadDepartments = async (orgId) => {
    if (!orgId) return;
    setLoadingDepartments(true);
    try {
      const payload = await organizationAPI.getDepartments(orgId);
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setDepartments(normalized);
      setSelectedDepartmentId((prev) => {
        if (prev && normalized.some((item) => item._id === prev)) return prev;
        return normalized[0]?._id || '';
      });
    } catch (error) {
      setDepartments([]);
      setSelectedDepartmentId('');
      notifyError(t('organizations.loadDeptFail'));
    } finally {
      setLoadingDepartments(false);
    }
  };

  const loadChannels = async (orgId, deptId) => {
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
      setChannels(normalized);
      setSelectedChannelId((prev) => {
        if (prev && normalized.some((item) => item._id === prev)) return prev;
        return normalized[0]?._id || '';
      });
    } catch (error) {
      setChannels([]);
      setSelectedChannelId('');
      notifyError(t('organizations.loadChannelsFail'));
    } finally {
      setLoadingChannels(false);
    }
  };

  const loadMessages = async (channelId) => {
    if (!channelId) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);
    try {
      const payload = await api.get('/messages', { params: { roomId: channelId, limit: 100 } });
      const data = unwrapData(payload);
      const list = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      // Sắp xếp cũ -> mới để hiển thị tự nhiên trong màn chat
      list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      setMessages(list);
    } catch (error) {
      setMessages([]);
      notifyError(t('organizations.loadMessagesFail'));
    } finally {
      setLoadingMessages(false);
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

  const handleCreateOrganization = async () => {
    setCreateOrgName('');
    setCreateWorkspaceSlug('');
    setCreateWorkspaceType('company');
    setCreateWorkspaceTeamSize('1-10');
    setCreateWorkspaceIndustry('');
    setCreateWorkspaceStep(1);
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
      notifyError('Workspace slug phải có ít nhất 3 ký tự hợp lệ.');
      return;
    }

    try {
      const response = await organizationAPI.createWorkspace({
        name: normalizedName,
        slug: normalizedSlug,
        type: createWorkspaceType,
        teamSize: createWorkspaceTeamSize,
        industry: String(createWorkspaceIndustry || '').trim(),
      });
      const payload = unwrapData(response);
      const created = payload?.data ?? payload;
      notifySuccess(t('organizations.orgCreated'));
      setCreateOrgModalOpen(false);
      setCreateWorkspaceStep(1);
      await loadOrganizations();
      const createdSlug = String(created?.slug || normalizedSlug || '').trim();
      if (createdSlug) {
        navigate(`/w/${encodeURIComponent(createdSlug)}`);
      }
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.orgCreateFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.orgCreateFail'));
    }
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
        const qs = new URLSearchParams();
        if (data.organizationName) qs.set('name', data.organizationName);
        const q = qs.toString();
        navigate(`/workspaces/join/${encodeURIComponent(orgId)}${q ? `?${q}` : ''}`);
        setQuickInviteInput('');
        return;
      }
      notifySuccess(t('organizations.joinedFromInvite'));
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
    if (!selectedOrganizationId) {
      notifyError(t('organizations.selectOrgFirst'));
      return;
    }

    setCreateDeptName('');
    setCreateDeptModalOpen(true);
  };

  const handleSubmitCreateDepartment = async () => {
    if (!createDeptName?.trim()) {
      notifyError(t('organizations.deptNameRequired'));
      return;
    }

    try {
      await organizationAPI.createDepartment(selectedOrganizationId, { name: createDeptName.trim() });
      notifySuccess(t('organizations.deptCreated'));
      setCreateDeptModalOpen(false);
      await loadDepartments(selectedOrganizationId);
    } catch (error) {
      notifyError(t('organizations.deptCreateFail'));
    }
  };

  const handleOpenWorkspace = (orgId) => {
    if (!orgId) return;
    const selected = organizations.find((item) => String(item._id) === String(orgId));
    setSelectedOrganizationId(orgId);
    if (selected?.slug) {
      setLastWorkspaceSlug(selected.slug);
      navigate(`/w/${encodeURIComponent(selected.slug)}`);
    }
  };

  const handleEditOrganization = (orgId) => {
    if (!orgId) return;
    navigate(`/workspaces/${encodeURIComponent(orgId)}/settings`);
  };

  const handleOpenOrganizationSettingsModal = (orgCandidate = null) => {
    const target =
      orgCandidate ||
      organizations.find((o) => String(o._id) === String(selectedOrganizationId)) ||
      selectedOrganization;
    if (!target) return;
    setOrgForSettings(target);
    setOrgSettingsModalOpen(true);
  };

  const handleOrganizationDeleted = (deletedOrgId) => {
    if (String(selectedOrganizationId) === String(deletedOrgId)) {
      setSelectedOrganizationId('');
      setSelectedDepartmentId('');
      setSelectedChannelId('');
      setChannels([]);
      setDepartments([]);
      setMessages([]);
    }
    if (String(selectedOrganization?._id || '') === String(deletedOrgId)) {
      setLastWorkspaceSlug('');
    }
    loadPendingInvitations();
    loadPendingJoinApplications();
    loadJoinApplicationsToReview();
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
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        t('organizations.leaveFail');
      notifyError(typeof msg === 'string' ? msg : t('organizations.leaveFail'));
    } finally {
      setLeavingOrg(false);
    }
  };

  const handleInviteOrganization = async (orgId) => {
    setInviteOrgId(orgId);
    setGeneratedInviteLink('');
    setInviteSearch('');
    setInviteModalOpen(true);
    setLoadingInviteFriends(true);
    setGeneratingInviteLink(true);
    try {
      const [friendsPayload, invitePayload] = await Promise.all([
        friendService.getFriends(),
        organizationAPI.createInviteLink(orgId),
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

      const inviteData = unwrapData(invitePayload);
      setGeneratedInviteLink(inviteData?.inviteUrl || '');
    } catch (error) {
      setInviteFriends([]);
      setGeneratedInviteLink('');
      notifyError(t('organizations.inviteInitFail'));
    } finally {
      setLoadingInviteFriends(false);
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
      await organizationAPI.respondInvitation(invitationId, action);
      if (action === 'accept') {
        notifySuccess(t('organizations.inviteAccepted'));
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
    if (!selectedOrganizationId || !selectedDepartmentId) {
      notifyError(t('organizations.selectDeptFirst'));
      return;
    }

    setCreateChannelType(channelType);
    setCreateChannelName('');
    setCreateChannelModalOpen(true);
  };

  const handleSubmitCreateChannel = async () => {
    if (!createChannelName.trim()) {
      notifyError(t('organizations.channelNameRequired'));
      return;
    }

    try {
      await organizationAPI.createChannel(selectedOrganizationId, selectedDepartmentId, {
        name: createChannelName.trim(),
        type: createChannelType,
      });
      notifySuccess(t('organizations.channelCreated'));
      setCreateChannelModalOpen(false);
      await loadChannels(selectedOrganizationId, selectedDepartmentId);
    } catch (error) {
      notifyError(t('organizations.channelCreateFail'));
    }
  };

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedChannelId || sendingMessage) return;

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
      setMessages((prev) => [...prev, created]);
      setMessageInput('');
      setReplyingToMessage(null);
    } catch (error) {
      notifyError(t('organizations.sendMessageFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSaveMessageEdit = async (messageId, content) => {
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content });
      const raw = unwrapData(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      notifySuccess(t('organizations.msgUpdated'));
    } catch {
      notifyError(t('organizations.editFail'));
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

  const handleSendChatOption = async ({ kind, file, payload }) => {
    if (!selectedChannelId || sendingMessage) return;

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
        setMessages((prev) => [...prev, unwrapped]);
        notifySuccess(t('organizations.fileSent'));
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || t('organizations.fileSendFail'));
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
        setMessages((prev) => [...prev, unwrapped]);
        notifySuccess(t('organizations.imageSent'));
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || t('organizations.imageSendFail'));
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    } else if (kind === 'contact') {
      messageType = 'system';
      content = t('organizations.contactCard', {
        fullName: payload?.fullName || '-',
        phone: payload?.phone || '-',
        email: payload?.email || '-',
      });
    } else if (kind === 'poll') {
      messageType = 'system';
      const options = Array.isArray(payload?.options) ? payload.options : [];
      content = t('organizations.poll', {
        q: payload?.question || '',
        options: options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n'),
      });
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
      setMessages((prev) => [...prev, normalized]);
      notifySuccess(t('organizations.customSent'));
    } catch (error) {
      notifyError(t('organizations.customFail'));
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    if (landingDemo) {
      setOrganizations([
        {
          _id: 'demo-org-vh',
          id: 'demo-org-vh',
          name: 'VoiceHub Demo',
          slug: 'voicehub-demo',
          role: 'admin',
        },
      ]);
      setOrganizationsLoaded(true);
      setSelectedOrganizationId('demo-org-vh');
      return;
    }
    Promise.all([
      loadOrganizations(),
      loadPendingInvitations(),
      loadPendingJoinApplications(),
      loadJoinApplicationsToReview(),
    ]);
    loadChatContacts();
  }, [landingDemo]);

  useEffect(() => {
    if (!initialWorkspaceSlug) return;
    const wantedSlug = String(initialWorkspaceSlug).trim();
    if (!wantedSlug) return;
    const matchedWorkspace = organizations.find((item) => String(item.slug || '') === wantedSlug);
    if (matchedWorkspace) {
      setSelectedOrganizationId(String(matchedWorkspace._id));
      return;
    }
    if (!organizationsLoaded) return;
    let cancelled = false;
    (async () => {
      try {
        const payload = await organizationAPI.getWorkspaceBySlug(wantedSlug);
        const raw = unwrapData(payload);
        const org = raw?.data ?? raw;
        if (!org?._id || cancelled) return;
        setOrganizations((prev) => {
          if (prev.some((o) => String(o._id) === String(org._id))) return prev;
          return [org, ...prev];
        });
        setSelectedOrganizationId(String(org._id));
        if (org?.slug) setLastWorkspaceSlug(org.slug);
      } catch {
        if (!cancelled) {
          notifyError(t('organizations.loadOrgsFail'));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialWorkspaceSlug, organizations, organizationsLoaded, t]);

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
    const target = location.state?.openWorkspace;
    if (!target?.organizationId || !target?.channelId) return;
    if (!organizations.length) return;
    const orgExists = organizations.some((o) => String(o._id) === String(target.organizationId));
    if (!orgExists) return;

    setSelectedOrganizationId(String(target.organizationId));
    if (target.departmentId) {
      setSelectedDepartmentId(String(target.departmentId));
    }
    setSelectedChannelId(String(target.channelId));
    navigate('/workspaces', { replace: true, state: {} });
  }, [organizations, location.state, navigate, landingDemo]);

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
          navigatedToJoinForm = true;
          const qs = new URLSearchParams();
          if (data.organizationName) qs.set('name', data.organizationName);
          const q = qs.toString();
          navigate(
            `/workspaces/join/${encodeURIComponent(orgIdFromUrl)}${q ? `?${q}` : ''}`,
            { replace: true }
          );
        } else {
          notifySuccess(t('organizations.joinedFromInvite'));
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

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadDepartments(selectedOrganizationId);
    }
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadChannels(selectedOrganizationId, selectedDepartmentId);
    }
  }, [selectedOrganizationId, selectedDepartmentId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadMessages(selectedChannelId);
    }
  }, [selectedOrganizationId, selectedChannelId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedOrganizationId) {
      loadWorkspaceTasks(selectedOrganizationId);
    }
  }, [selectedOrganizationId, landingDemo]);

  useEffect(() => {
    if (landingDemo) return;
    if (!on || !off) return;

    const refreshOrgData = () => {
      loadOrganizations();
      loadPendingInvitations();
      loadPendingJoinApplications();
      loadJoinApplicationsToReview();
    };

    const handleOrgEvent = () => {
      refreshOrgData();
    };

    on('organization:invitation_received', handleOrgEvent);
    on('organization:invitation_accepted', handleOrgEvent);
    on('organization:invitation_rejected', handleOrgEvent);
    on('organization:member_joined', handleOrgEvent);
    on('organization:member_removed', handleOrgEvent);
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
    on('organization:join_application_approved', bump);
    return () => {
      off('organization:member_joined', bump);
      off('organization:member_removed', bump);
      off('organization:join_application_approved', bump);
    };
  }, [on, off]);

  const orgCenterShell = isDarkMode
    ? 'flex h-full min-h-0 min-w-0 flex-col bg-[#0b0e14] text-slate-100'
    : `flex h-full min-h-0 min-w-0 flex-col ${appShellBg(false)} text-slate-900`;

  return (
    <>
      <ThreeFrameLayout
        landingDemo={landingDemo}
        center={
          <div className={orgCenterShell}>
          <OrganizationMainPanel
            selectedOrganization={selectedOrganization}
            hasOrganizations={hasOrganizations}
            organizationsLoaded={organizationsLoaded}
            departments={departments}
            selectedDepartment={selectedDepartment}
            channels={channels}
            selectedChannelId={selectedChannelId}
            messages={messages}
            messageInput={messageInput}
            onChangeMessageInput={setMessageInput}
            onSendMessage={handleSendMessage}
            loadingMessages={loadingMessages}
            sendingMessage={sendingMessage}
            currentUserId={user?.userId || user?._id || user?.id}
            onSelectChannel={setSelectedChannelId}
            onSelectDepartment={setSelectedDepartmentId}
            onCreateOrganization={handleCreateOrganization}
            onJoinQuickInvite={handleJoinQuickInvite}
            quickInviteInput={quickInviteInput}
            onChangeQuickInviteInput={setQuickInviteInput}
            joiningQuickInvite={joiningQuickInvite}
            invitations={pendingInvitations}
            loadingInvitations={loadingInvitations}
            respondingInvitationIds={respondingInvitationIds}
            onRespondInvitation={handleRespondInvitation}
            onOpenNotificationsPage={() => navigate('/notifications')}
            onCreateDepartment={handleCreateDepartment}
            onCreateChannel={handleCreateChannel}
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
            onWorkspaceSearchJump={({ roomId }) => {
              if (roomId) setSelectedChannelId(String(roomId));
            }}
            workspaceTasks={workspaceTasks}
            loadingWorkspaceTasks={loadingWorkspaceTasks}
            onMoveWorkspaceTask={handleMoveWorkspaceTask}
            onOpenOrganizationSettings={handleOpenOrganizationSettingsModal}
            onWorkspaceTabChange={setWorkspaceTabView}
          />
          </div>
        }
        right={
          selectedOrganizationId && workspaceTabView !== 'tasks' ? (
            <OrganizationMemberSidebar
              organizationId={selectedOrganizationId}
              organizationName={selectedOrganization?.name || ''}
              onlineUsers={onlineUsers}
              socketConnected={socketConnected}
              refreshKey={memberListRefreshKey}
              currentUserId={user?.userId || user?._id || user?.id}
              myRole={selectedOrganization?.myRole}
              canReviewJoinApplications={['owner', 'admin'].includes(
                String(selectedOrganization?.myRole || '').toLowerCase()
              )}
              joinApplicationsToReview={joinApplicationsToReview.filter(
                (app) => String(app.organizationId) === String(selectedOrganizationId)
              )}
              loadingJoinApplicationsToReview={loadingJoinApplicationsToReview}
              respondingJoinReviewKeys={respondingJoinReviewKeys}
              onApproveJoinApplication={handleApproveJoinApplication}
              onRejectJoinApplication={handleRejectJoinApplication}
              onMentionUser={(text) =>
                setMessageInput((prev) => `${prev || ''}${text}`)
              }
              onMemberRemoved={() => setMemberListRefreshKey((k) => k + 1)}
            />
          ) : null
        }
        rightWidth={workspaceTabView === 'tasks' ? 'w-0' : 'w-[280px]'}
      />
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
            <input
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder={t('organizations.searchFriendsPh')}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
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
        onClose={() => setCreateOrgModalOpen(false)}
        title={`Create Workspace - Step ${createWorkspaceStep}/4`}
        size="sm"
      >
        <div className="space-y-3">
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
              <p className="text-xs text-gray-400">Workspace URL: /w/{createWorkspaceSlug || 'your-slug'}</p>
            </div>
          ) : null}
          {createWorkspaceStep === 3 ? (
            <div className="space-y-2">
              <select
                value={createWorkspaceType}
                onChange={(event) => setCreateWorkspaceType(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="company">Company</option>
                <option value="startup">Startup</option>
                <option value="education">Education</option>
                <option value="community">Community</option>
              </select>
              <select
                value={createWorkspaceTeamSize}
                onChange={(event) => setCreateWorkspaceTeamSize(event.target.value)}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none"
              >
                <option value="1-10">1-10</option>
                <option value="11-50">11-50</option>
                <option value="51-200">51-200</option>
                <option value="201-1000">201-1000</option>
                <option value="1000+">1000+</option>
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
            <div className="rounded-xl border border-white/15 bg-white/5 p-3 text-sm text-gray-200">
              <div>Name: {createOrgName || '-'}</div>
              <div>Slug: {toWorkspaceSlug(createWorkspaceSlug || createOrgName) || '-'}</div>
              <div>Type: {createWorkspaceType}</div>
              <div>Team size: {createWorkspaceTeamSize}</div>
              <div>Industry: {createWorkspaceIndustry || '-'}</div>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOrgModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              {t('nav.cancel')}
            </button>
            {createWorkspaceStep > 1 ? (
              <button
                type="button"
                onClick={() => setCreateWorkspaceStep((step) => Math.max(1, step - 1))}
                className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
              >
                Back
              </button>
            ) : null}
            {createWorkspaceStep < 4 ? (
              <button
                type="button"
                onClick={() => setCreateWorkspaceStep((step) => Math.min(4, step + 1))}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Next
              </button>
            ) : null}
            {createWorkspaceStep === 4 ? (
              <button
                type="button"
                onClick={handleSubmitCreateOrganization}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
              >
                Create Workspace
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
        isOpen={createDeptModalOpen}
        onClose={() => setCreateDeptModalOpen(false)}
        title={t('organizations.createDeptTitle')}
        size="sm"
      >
        <div className="space-y-3">
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
      <ConfirmDialog
        isOpen={deleteChannelMsgConfirmId != null}
        onClose={() => setDeleteChannelMsgConfirmId(null)}
        onConfirm={confirmDeleteChannelMessage}
        title={t('organizations.deleteMsgTitle')}
        message={t('organizations.deleteMsgMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />

      {orgSettingsModalOpen && orgForSettings && (
        <Modal
          isOpen={orgSettingsModalOpen}
          onClose={() => {
            setOrgSettingsModalOpen(false);
            setOrgForSettings(null);
          }}
          title={`Cài đặt tổ chức - ${orgForSettings?.name || ''}`}
          size="full"
          layerClassName="z-[260]"
        >
          <div className="h-[82vh] min-h-[620px]">
            <OrganizationSettingsPanel
              organization={orgForSettings}
              onBack={() => {
                setOrgSettingsModalOpen(false);
                setOrgForSettings(null);
              }}
              onOrganizationUpdated={async () => {
                await loadOrganizations();
                try {
                  const orgId = orgForSettings?._id || orgForSettings?.id;
                  if (!orgId) return;
                  const payload = await organizationAPI.getOrganization(orgId);
                  const raw = unwrapData(payload);
                  const org = raw?.data ?? raw;
                  if (org?._id) setOrgForSettings(org);
                } catch {
                  // keep current snapshot if refresh fails
                }
              }}
              onOrganizationDeleted={(deletedOrgId) => {
                setOrgSettingsModalOpen(false);
                setOrgForSettings(null);
                handleOrganizationDeleted(deletedOrgId);
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

export default OrganizationsPage;

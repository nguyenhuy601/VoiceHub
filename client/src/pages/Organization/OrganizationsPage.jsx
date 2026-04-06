import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Modal, NotificationModal } from '../../components/Shared';
import DepartmentBubbleRail from '../../components/Organization/DepartmentBubbleRail';
import OrganizationMainPanel from '../../components/Organization/OrganizationMainPanel';
import ForwardChannelModal from '../../components/Organization/ForwardChannelModal';
import OrganizationSettingsModal from '../../components/Organization/OrganizationSettingsModal';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import apiClient from '../../services/api/apiClient';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';

const unwrapData = (payload) => payload?.data ?? payload;
const HOME_NOTIFICATION_PREVIEW = [
  {
    id: 'n1',
    title: 'Task được gán',
    message: 'Sarah Chen đã gán bạn vào task "Thiết kế Landing Page"',
    time: '5 phút trước',
    priority: 'high',
  },
  {
    id: 'n2',
    title: '@mention trong chat',
    message: 'Mike Ross đã nhắc đến bạn trong #general',
    time: '15 phut truoc',
    priority: 'medium',
  },
  {
    id: 'n3',
    title: 'Deadline sắp đến',
    message: 'Task "Review Pull Request" sẽ đến hạn trong 2 giờ',
    time: '30 phút trước',
    priority: 'high',
  },
];
const HOME_CALENDAR_PREVIEW = [
  {
    id: 'c1',
    title: 'Họp nhóm hằng ngày',
    time: '10:00',
    date: 'Hôm nay',
    type: 'meeting',
  },
  {
    id: 'c2',
    title: 'Demo khách hàng',
    time: '14:30',
    date: 'Hôm nay',
    type: 'meeting',
  },
  {
    id: 'c3',
    title: 'Đánh giá thiết kế',
    time: '16:00',
    date: 'Ngày mai',
    type: 'review',
  },
];

function OrganizationsPage() {
  const { user } = useAuth();
  const { on, off } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [viewMode, setViewMode] = useState('home');
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
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [respondingInvitationIds, setRespondingInvitationIds] = useState([]);
  const [expandedHomeCards, setExpandedHomeCards] = useState({
    notifications: false,
    calendar: false,
  });
  const [chatContacts, setChatContacts] = useState([]);
  const [loadingChatContacts, setLoadingChatContacts] = useState(false);
  const [createOrgModalOpen, setCreateOrgModalOpen] = useState(false);
  const [createOrgName, setCreateOrgName] = useState('');
  const [orgSettingsModalOpen, setOrgSettingsModalOpen] = useState(false);
  const [orgForSettings, setOrgForSettings] = useState(null);
  const [createDeptModalOpen, setCreateDeptModalOpen] = useState(false);
  const [createDeptName, setCreateDeptName] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelName, setCreateChannelName] = useState('');
  const [notice, setNotice] = useState(null);
  const [leaveOrgModalOpen, setLeaveOrgModalOpen] = useState(false);
  const [leaveOrgPendingId, setLeaveOrgPendingId] = useState(null);
  const [leaveOrgPendingName, setLeaveOrgPendingName] = useState('');
  const [leavingOrg, setLeavingOrg] = useState(false);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwardTargets, setForwardTargets] = useState([]);
  const [forwardTargetsLoading, setForwardTargetsLoading] = useState(false);

  const notify = (message, type = 'success') => {
    setNotice({
      type,
      title: type === 'fail' ? 'Thông báo lỗi' : type === 'info' ? 'Thông tin' : 'Thông báo',
      message,
    });
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

  const loadOrganizations = async () => {
    try {
      const payload = await organizationAPI.getOrganizations();
      const list = unwrapData(payload);
      const normalized = Array.isArray(list) ? list : [];
      setOrganizations(normalized);
      if (normalized.length > 0) {
        setSelectedOrganizationId((prev) => prev || normalized[0]._id);
      } else {
        setSelectedOrganizationId('');
      }
    } catch (error) {
      notifyError('Không thể tải danh sách tổ chức');
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
      notifyError('Không thể tải lời mời tổ chức');
    } finally {
      setLoadingInvitations(false);
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
          name: item.displayName || item.name || item.username || 'Người dùng',
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
      notifyError('Không thể tải phòng ban');
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
      notifyError('Không thể tải danh sách kênh');
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
      const payload = await apiClient.get('/messages', { params: { roomId: channelId, limit: 100 } });
      const data = unwrapData(payload);
      const list = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
      // Sắp xếp cũ -> mới để hiển thị tự nhiên trong màn chat
      list.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
      setMessages(list);
    } catch (error) {
      setMessages([]);
      notifyError('Không thể tải tin nhắn kênh');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateOrganization = async () => {
    setCreateOrgName('');
    setCreateOrgModalOpen(true);
  };

  const handleSubmitCreateOrganization = async () => {
    if (!createOrgName?.trim()) {
      notifyError('Vui lòng nhập tên tổ chức');
      return;
    }

    try {
      await organizationAPI.createOrganization({ name: createOrgName.trim() });
      notifySuccess('Đã tạo tổ chức mới');
      setCreateOrgModalOpen(false);
      await loadOrganizations();
    } catch (error) {
      notifyError('Tạo tổ chức thất bại');
    }
  };

  const handleJoinQuickInvite = async () => {
    const { orgId, token } = extractInvitePayloadFromInput(quickInviteInput);
    if (!orgId || !token) {
      notifyError('Vui lòng dán link mời hợp lệ (có orgId và inviteToken)');
      return;
    }

    setJoiningQuickInvite(true);
    try {
      await organizationAPI.joinByInviteLink(orgId, token);
      notifySuccess('Đã tham gia tổ chức từ link mời');
      setQuickInviteInput('');
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      notifyError('Không thể tham gia tổ chức từ link mời');
    } finally {
      setJoiningQuickInvite(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!selectedOrganizationId) {
      notifyError('Hãy chọn tổ chức trước');
      return;
    }

    setCreateDeptName('');
    setCreateDeptModalOpen(true);
  };

  const handleSubmitCreateDepartment = async () => {
    if (!createDeptName?.trim()) {
      notifyError('Vui lòng nhập tên phòng ban');
      return;
    }

    try {
      await organizationAPI.createDepartment(selectedOrganizationId, { name: createDeptName.trim() });
      notifySuccess('Đã tạo phòng ban');
      setCreateDeptModalOpen(false);
      await loadDepartments(selectedOrganizationId);
    } catch (error) {
      notifyError('Tạo phòng ban thất bại');
    }
  };

  const handleOpenWorkspace = (orgId) => {
    if (!orgId) return;
    setSelectedOrganizationId(orgId);
    setViewMode('workspace');
  };

  const handleOpenHome = () => {
    setViewMode('home');
  };

  const handleEditOrganization = (orgId) => {
    const current = organizations.find((org) => org._id === orgId);
    if (!current) return;
    setOrgForSettings(current);
    setOrgSettingsModalOpen(true);
  };

  const handleOrganizationDeleted = (deletedOrgId) => {
    if (String(selectedOrganizationId) === String(deletedOrgId)) {
      setViewMode('home');
      setSelectedOrganizationId('');
      setSelectedDepartmentId('');
      setSelectedChannelId('');
      setChannels([]);
      setDepartments([]);
      setMessages([]);
    }
    loadPendingInvitations();
  };

  const handleLeaveOrganization = (orgId) => {
    if (!orgId) return;
    const name =
      organizations.find((o) => String(o._id) === String(orgId))?.name || 'tổ chức này';
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
      notifySuccess('Đã rời tổ chức');
      setLeaveOrgModalOpen(false);
      setLeaveOrgPendingId(null);
      setLeaveOrgPendingName('');
      if (String(selectedOrganizationId) === String(orgId)) {
        setViewMode('home');
        setSelectedOrganizationId('');
        setSelectedDepartmentId('');
        setSelectedChannelId('');
        setChannels([]);
        setDepartments([]);
        setMessages([]);
      }
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        'Không thể rời tổ chức';
      notifyError(typeof msg === 'string' ? msg : 'Không thể rời tổ chức');
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
          name: raw?.displayName || raw?.name || raw?.username || 'Người dùng',
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
      notifyError('Không thể khởi tạo dữ liệu mời');
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
      notifySuccess('Đã gửi lời mời tham gia tổ chức');
    } catch (error) {
      notifyError('Mời thành viên thất bại');
    } finally {
      setInvitingIds((prev) => prev.filter((id) => id !== friendId));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      notifySuccess('Đã sao chép link mời');
    } catch (error) {
      notifyError('Không thể sao chép link');
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
        notifySuccess('Đã chấp nhận lời mời tổ chức');
      } else {
        notifySuccess('Đã từ chối lời mời tổ chức');
      }
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      notifyError('Không thể xử lý lời mời');
    } finally {
      setRespondingInvitationIds((prev) => prev.filter((id) => id !== invitationId));
    }
  };

  const handleCreateChannel = async (channelType = 'chat') => {
    if (!selectedOrganizationId || !selectedDepartmentId) {
      notifyError('Hãy chọn phòng ban trước');
      return;
    }

    setCreateChannelType(channelType);
    setCreateChannelName('');
    setCreateChannelModalOpen(true);
  };

  const handleSubmitCreateChannel = async () => {
    if (!createChannelName.trim()) {
      notifyError('Vui lòng nhập tên kênh');
      return;
    }

    try {
      await organizationAPI.createChannel(selectedOrganizationId, selectedDepartmentId, {
        name: createChannelName.trim(),
        type: createChannelType,
      });
      notifySuccess('Đã tạo kênh');
      setCreateChannelModalOpen(false);
      await loadChannels(selectedOrganizationId, selectedDepartmentId);
    } catch (error) {
      notifyError('Tạo kênh thất bại');
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
      const payload = await apiClient.post('/messages', body);
      const created = unwrapData(payload);
      setMessages((prev) => [...prev, created]);
      setMessageInput('');
      setReplyingToMessage(null);
    } catch (error) {
      notifyError('Gửi tin nhắn thất bại');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSaveMessageEdit = async (messageId, content) => {
    try {
      const res = await apiClient.patch(`/messages/${messageId}/edit`, { content });
      const raw = unwrapData(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      notifySuccess('Đã cập nhật tin nhắn');
    } catch {
      notifyError('Không thể chỉnh sửa');
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!messageId || !window.confirm('Xoá tin nhắn này?')) return;
    try {
      await apiClient.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      notifySuccess('Đã xoá tin nhắn');
    } catch {
      notifyError('Không thể xoá');
    }
  };

  const handleForwardRequest = (msg) => {
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const handleForwardConfirm = async ({ channelIds, note }) => {
    if (!forwardSourceMessage || !channelIds?.length) return;
    const chName = selectedChannel?.name || 'kênh';
    const preview = String(forwardSourceMessage.content || '').trim().slice(0, 500);
    const header = `📎 Chuyển tiếp từ #${chName}`;
    const body = [note, header, preview].filter(Boolean).join('\n\n');
    setSendingMessage(true);
    try {
      for (const cid of channelIds) {
        await apiClient.post('/messages', {
          roomId: cid,
          content: body,
          messageType: 'text',
          organizationId: selectedOrganizationId || undefined,
        });
      }
      notifySuccess('Đã chuyển tiếp');
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
    } catch {
      notifyError('Chuyển tiếp thất bại');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleQuickReactMessage = (_message, _emoji) => {
    notify('Phản hồi nhanh (emoji) đồng bộ server sẽ bổ sung sau.', 'info');
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
          apiClient,
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
        notifySuccess('Đã gửi tệp lên kênh');
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || 'Không gửi được tệp');
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
          apiClient,
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
        notifySuccess('Đã gửi hình ảnh lên kênh');
      } catch (error) {
        notifyError(error.response?.data?.message || error.message || 'Không gửi được hình');
      } finally {
        setChannelUploadProgress(null);
        setSendingMessage(false);
      }
      return;
    } else if (kind === 'contact') {
      messageType = 'system';
      content = `👤 Danh thiếp\nTên: ${payload?.fullName || '-'}\nSĐT: ${payload?.phone || '-'}\nEmail: ${payload?.email || '-'}`;
    } else if (kind === 'poll') {
      messageType = 'system';
      const options = Array.isArray(payload?.options) ? payload.options : [];
      content = `📊 Khảo sát: ${payload?.question || ''}\n${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}`;
    } else {
      return;
    }

    setSendingMessage(true);
    try {
      const created = await apiClient.post('/messages', {
        roomId: selectedChannelId,
        content,
        messageType,
        organizationId: selectedOrganizationId || undefined,
      });
      const normalized = unwrapData(created);
      setMessages((prev) => [...prev, normalized]);
      notifySuccess('Đã gửi nội dung vào kênh');
    } catch (error) {
      notifyError('Không thể gửi nội dung');
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    Promise.all([loadOrganizations(), loadPendingInvitations()]);
    loadChatContacts();
  }, []);

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
              departmentName: d.name || 'Phòng ban',
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
  }, [forwardModalOpen, selectedOrganizationId, departments]);

  /** Mở đúng kênh tổ chức khi điều hướng từ Chat bạn bè (tin chưa đọc). */
  useEffect(() => {
    const target = location.state?.openWorkspace;
    if (!target?.organizationId || !target?.channelId) return;
    if (!organizations.length) return;
    const orgExists = organizations.some((o) => String(o._id) === String(target.organizationId));
    if (!orgExists) return;

    setViewMode('workspace');
    setSelectedOrganizationId(String(target.organizationId));
    if (target.departmentId) {
      setSelectedDepartmentId(String(target.departmentId));
    }
    setSelectedChannelId(String(target.channelId));
    navigate('/organizations', { replace: true, state: {} });
  }, [organizations, location.state, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orgIdFromUrl = params.get('orgId') || params.get('inviteOrgId');
    const tokenFromUrl = params.get('inviteToken');
    if (!orgIdFromUrl || !tokenFromUrl) {
      return;
    }

    const joinOrganizationByLink = async () => {
      try {
        await organizationAPI.joinByInviteLink(orgIdFromUrl, tokenFromUrl);
        notifySuccess('Đã tham gia tổ chức từ link mời');
        await Promise.all([loadOrganizations(), loadPendingInvitations()]);
      } catch (error) {
        notifyError('Không thể tham gia tổ chức từ link mời');
      } finally {
        params.delete('orgId');
        params.delete('inviteOrgId');
        params.delete('inviteToken');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}`;
        window.history.replaceState({}, '', nextUrl);
      }
    };

    joinOrganizationByLink();
  }, []);

  useEffect(() => {
    if (selectedOrganizationId && viewMode === 'workspace') {
      loadDepartments(selectedOrganizationId);
    }
  }, [selectedOrganizationId, viewMode]);

  useEffect(() => {
    if (viewMode === 'workspace') {
      loadChannels(selectedOrganizationId, selectedDepartmentId);
    }
  }, [selectedOrganizationId, selectedDepartmentId, viewMode]);

  useEffect(() => {
    if (viewMode === 'workspace') {
      loadMessages(selectedChannelId);
    }
  }, [selectedChannelId, viewMode]);

  useEffect(() => {
    if (!on || !off) return;

    const refreshOrgData = () => {
      loadOrganizations();
      loadPendingInvitations();
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

    return () => {
      off('organization:invitation_received', handleOrgEvent);
      off('organization:invitation_accepted', handleOrgEvent);
      off('organization:invitation_rejected', handleOrgEvent);
      off('organization:member_joined', handleOrgEvent);
      off('organization:member_removed', handleOrgEvent);
      off('organization:updated', handleOrgEvent);
    };
  }, [on, off]);

  return (
    <>
      <ThreeFrameLayout
        center={
          <OrganizationMainPanel
            selectedOrganization={selectedOrganization}
            hasOrganizations={hasOrganizations}
            organizationsLoaded={organizationsLoaded}
            viewMode={viewMode}
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
            homeNotificationPreview={HOME_NOTIFICATION_PREVIEW}
            homeCalendarPreview={HOME_CALENDAR_PREVIEW}
            expandedHomeCards={expandedHomeCards}
            onToggleHomeCard={(cardKey) =>
              setExpandedHomeCards((prev) => ({ ...prev, [cardKey]: !prev[cardKey] }))
            }
            onOpenNotificationsPage={() => navigate('/notifications')}
            onOpenCalendarPage={() => navigate('/calendar')}
            onGoHome={handleOpenHome}
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
            onDeleteMessage={handleDeleteMessage}
            onForwardMessage={handleForwardRequest}
            onQuickReactMessage={handleQuickReactMessage}
          />
        }
        right={
          <DepartmentBubbleRail
            organizations={organizations}
            selectedOrganizationId={selectedOrganizationId}
            viewMode={viewMode}
            onSelectOrganization={setSelectedOrganizationId}
            onOpenWorkspace={handleOpenWorkspace}
            onOpenHome={handleOpenHome}
            onEditOrganization={handleEditOrganization}
            onInviteOrganization={handleInviteOrganization}
            onLeaveOrganization={handleLeaveOrganization}
            onCreateOrganization={handleCreateOrganization}
            invitationCount={pendingInvitations.length}
            organizationsLoaded={organizationsLoaded}
          />
        }
        rightWidth="w-28"
      />
      {leaveOrgModalOpen && (
        <Modal
          isOpen={leaveOrgModalOpen}
          onClose={leavingOrg ? () => {} : closeLeaveOrgModal}
          title="Rời khỏi tổ chức?"
          size="sm"
        >
          <p className="text-sm leading-relaxed text-gray-300">
            Bạn sắp rời khỏi{' '}
            <span className="font-semibold text-white">&quot;{leaveOrgPendingName}&quot;</span>.
            Bạn sẽ mất quyền truy cập kênh và dữ liệu tổ chức cho đến khi được mời lại.
          </p>
          <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4">
            <button
              type="button"
              onClick={closeLeaveOrgModal}
              disabled={leavingOrg}
              className="rounded-xl border border-white/20 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={confirmLeaveOrganization}
              disabled={leavingOrg}
              className="rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_0_16px_rgba(225,29,72,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {leavingOrg ? 'Đang xử lý…' : 'Rời khỏi'}
            </button>
          </div>
        </Modal>
      )}
      {inviteModalOpen && (
        <Modal
          isOpen={inviteModalOpen}
          onClose={() => setInviteModalOpen(false)}
          title={`Mời tham gia ${inviteOrganization?.name || 'tổ chức'}`}
          size="md"
        >
          <div className="space-y-4">
            <input
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder="Tìm kiếm bạn bè"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
            />

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-overlay">
              {loadingInviteFriends && (
                <div className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">Đang tải bạn bè...</div>
              )}
              {!loadingInviteFriends && filteredInviteFriends.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-gray-400">
                  Không tìm thấy bạn bè để mời.
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
                        {inviting ? 'Đang mời...' : 'Mời'}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Mời qua link</div>
                {isInviteLinkBeta && (
                  <span className="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
                    Beta
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedInviteLink || (generatingInviteLink ? 'Đang tạo link mời...' : '')}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  disabled={!generatedInviteLink || generatingInviteLink}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Sao chép
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {isInviteLinkBeta
                  ? 'Link mời đang ở chế độ Beta trên local HTTP. Khi nâng cấp HTTPS, có thể bổ sung xác thực token mời để an toàn hơn.'
                  : 'Link mời đang được chia sẻ qua HTTPS. Bạn có thể nâng cấp endpoint xác thực token mời trong backend.'}
              </p>
            </div>
          </div>
        </Modal>
      )}

      <Modal
        isOpen={createOrgModalOpen}
        onClose={() => setCreateOrgModalOpen(false)}
        title="Tạo tổ chức mới"
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={createOrgName}
            onChange={(event) => setCreateOrgName(event.target.value)}
            placeholder="Nhập tên tổ chức"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOrgModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateOrganization}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo mới
            </button>
          </div>
        </div>
      </Modal>

      <OrganizationSettingsModal
        isOpen={orgSettingsModalOpen}
        onClose={() => {
          setOrgSettingsModalOpen(false);
          setOrgForSettings(null);
        }}
        organization={orgForSettings}
        onOrganizationUpdated={loadOrganizations}
        onOrganizationDeleted={handleOrganizationDeleted}
      />

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
        title="Tạo phòng ban"
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={createDeptName}
            onChange={(event) => setCreateDeptName(event.target.value)}
            placeholder="Nhập tên phòng ban"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateDeptModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateDepartment}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createChannelModalOpen}
        onClose={() => setCreateChannelModalOpen(false)}
        title={createChannelType === 'voice' ? 'Tạo kênh thoại' : 'Tạo kênh chat'}
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={createChannelName}
            onChange={(event) => setCreateChannelName(event.target.value)}
            placeholder={createChannelType === 'voice' ? 'Nhập tên kênh thoại' : 'Nhập tên kênh chat'}
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateChannelModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitCreateChannel}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Tạo kênh
            </button>
          </div>
        </div>
      </Modal>
      <NotificationModal notice={notice} onClose={() => setNotice(null)} />
    </>
  );
}

export default OrganizationsPage;

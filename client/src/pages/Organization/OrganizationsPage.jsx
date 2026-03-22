import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../../components/Shared';
import DepartmentBubbleRail from '../../components/Organization/DepartmentBubbleRail';
import OrganizationMainPanel from '../../components/Organization/OrganizationMainPanel';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { useAuth } from '../../context/AuthContext';
import apiClient from '../../services/api/apiClient';
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
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState([]);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState('');
  const [viewMode, setViewMode] = useState('home');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingOrganizations, setLoadingOrganizations] = useState(true);
  const [loadingDepartments, setLoadingDepartments] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
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
  const [editOrgModalOpen, setEditOrgModalOpen] = useState(false);
  const [editingOrgId, setEditingOrgId] = useState('');
  const [editOrgName, setEditOrgName] = useState('');
  const [createDeptModalOpen, setCreateDeptModalOpen] = useState(false);
  const [createDeptName, setCreateDeptName] = useState('');
  const [createChannelModalOpen, setCreateChannelModalOpen] = useState(false);
  const [createChannelType, setCreateChannelType] = useState('chat');
  const [createChannelName, setCreateChannelName] = useState('');

  const selectedOrganization = useMemo(
    () => organizations.find((org) => org._id === selectedOrganizationId) || null,
    [organizations, selectedOrganizationId]
  );
  const selectedDepartment = useMemo(
    () => departments.find((department) => department._id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
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
    setLoadingOrganizations(true);
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
      toast.error('Không thể tải danh sách tổ chức');
    } finally {
      setLoadingOrganizations(false);
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
      toast.error('Không thể tải lời mời tổ chức');
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
      toast.error('Không thể tải phòng ban');
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
      toast.error('Không thể tải danh sách kênh');
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
      toast.error('Không thể tải tin nhắn kênh');
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
      toast.error('Vui lòng nhập tên tổ chức');
      return;
    }

    try {
      await organizationAPI.createOrganization({ name: createOrgName.trim() });
      toast.success('Đã tạo tổ chức mới');
      setCreateOrgModalOpen(false);
      await loadOrganizations();
    } catch (error) {
      toast.error('Tạo tổ chức thất bại');
    }
  };

  const handleJoinQuickInvite = async () => {
    const { orgId, token } = extractInvitePayloadFromInput(quickInviteInput);
    if (!orgId || !token) {
      toast.error('Vui lòng dán link mời hợp lệ (có orgId và inviteToken)');
      return;
    }

    setJoiningQuickInvite(true);
    try {
      await organizationAPI.joinByInviteLink(orgId, token);
      toast.success('Đã tham gia tổ chức từ link mời');
      setQuickInviteInput('');
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      toast.error('Không thể tham gia tổ chức từ link mời');
    } finally {
      setJoiningQuickInvite(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!selectedOrganizationId) {
      toast.error('Hãy chọn tổ chức trước');
      return;
    }

    setCreateDeptName('');
    setCreateDeptModalOpen(true);
  };

  const handleSubmitCreateDepartment = async () => {
    if (!createDeptName?.trim()) {
      toast.error('Vui lòng nhập tên phòng ban');
      return;
    }

    try {
      await organizationAPI.createDepartment(selectedOrganizationId, { name: createDeptName.trim() });
      toast.success('Đã tạo phòng ban');
      setCreateDeptModalOpen(false);
      await loadDepartments(selectedOrganizationId);
    } catch (error) {
      toast.error('Tạo phòng ban thất bại');
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

  const handleEditOrganization = async (orgId) => {
    const current = organizations.find((org) => org._id === orgId);
    if (!current) return;

    setEditingOrgId(orgId);
    setEditOrgName(current.name || '');
    setEditOrgModalOpen(true);
  };

  const handleSubmitEditOrganization = async () => {
    if (!editingOrgId || !editOrgName.trim()) {
      toast.error('Vui lòng nhập tên tổ chức');
      return;
    }

    try {
      await organizationAPI.updateOrganization(editingOrgId, { name: editOrgName.trim() });
      toast.success('Đã cập nhật tổ chức');
      setEditOrgModalOpen(false);
      await loadOrganizations();
    } catch (error) {
      toast.error('Không thể cập nhật tổ chức');
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
      toast.error('Không thể khởi tạo dữ liệu mời');
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
      toast.success('Đã gửi lời mời tham gia tổ chức');
    } catch (error) {
      toast.error('Mời thành viên thất bại');
    } finally {
      setInvitingIds((prev) => prev.filter((id) => id !== friendId));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      toast.success('Đã sao chép link mời');
    } catch (error) {
      toast.error('Không thể sao chép link');
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
        toast.success('Đã chấp nhận lời mời tổ chức');
      } else {
        toast.success('Đã từ chối lời mời tổ chức');
      }
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      toast.error('Không thể xử lý lời mời');
    } finally {
      setRespondingInvitationIds((prev) => prev.filter((id) => id !== invitationId));
    }
  };

  const handleCreateChannel = async (channelType = 'chat') => {
    if (!selectedOrganizationId || !selectedDepartmentId) {
      toast.error('Hãy chọn phòng ban trước');
      return;
    }

    setCreateChannelType(channelType);
    setCreateChannelName('');
    setCreateChannelModalOpen(true);
  };

  const handleSubmitCreateChannel = async () => {
    if (!createChannelName.trim()) {
      toast.error('Vui lòng nhập tên kênh');
      return;
    }

    try {
      await organizationAPI.createChannel(selectedOrganizationId, selectedDepartmentId, {
        name: createChannelName.trim(),
        type: createChannelType,
      });
      toast.success('Đã tạo kênh');
      setCreateChannelModalOpen(false);
      await loadChannels(selectedOrganizationId, selectedDepartmentId);
    } catch (error) {
      toast.error('Tạo kênh thất bại');
    }
  };

  const handleSendMessage = async () => {
    const content = messageInput.trim();
    if (!content || !selectedChannelId || sendingMessage) return;

    setSendingMessage(true);
    try {
      const payload = await apiClient.post('/messages', {
        roomId: selectedChannelId,
        content,
        messageType: 'text',
        organizationId: selectedOrganizationId || undefined,
      });
      const created = unwrapData(payload);
      setMessages((prev) => [...prev, created]);
      setMessageInput('');
    } catch (error) {
      toast.error('Gửi tin nhắn thất bại');
    } finally {
      setSendingMessage(false);
    }
  };

  const handleSendChatOption = async ({ kind, file, payload }) => {
    if (!selectedChannelId || sendingMessage) return;

    let messageType = 'system';
    let content = '';

    if (kind === 'file' && file) {
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      messageType = 'file';
      content = `📎 Tệp: ${file.name} (${sizeKb} KB)`;
    } else if (kind === 'image' && file) {
      messageType = 'image';
      content = `🖼️ Hình ảnh: ${file.name}`;
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
      toast.success('Đã gửi nội dung vào kênh');
    } catch (error) {
      toast.error('Không thể gửi nội dung');
    } finally {
      setSendingMessage(false);
    }
  };

  useEffect(() => {
    Promise.all([loadOrganizations(), loadPendingInvitations()]);
    loadChatContacts();
  }, []);

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
        toast.success('Đã tham gia tổ chức từ link mời');
        await Promise.all([loadOrganizations(), loadPendingInvitations()]);
      } catch (error) {
        toast.error('Không thể tham gia tổ chức từ link mời');
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

  return (
    <>
      <ThreeFrameLayout
        center={
          <OrganizationMainPanel
            selectedOrganization={selectedOrganization}
            hasOrganizations={hasOrganizations}
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
            onCreateOrganization={handleCreateOrganization}
            invitationCount={pendingInvitations.length}
            loading={loadingOrganizations}
          />
        }
        rightWidth="w-28"
      />
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

      <Modal
        isOpen={editOrgModalOpen}
        onClose={() => setEditOrgModalOpen(false)}
        title="Đổi tên tổ chức"
        size="sm"
      >
        <div className="space-y-3">
          <input
            value={editOrgName}
            onChange={(event) => setEditOrgName(event.target.value)}
            placeholder="Nhập tên tổ chức mới"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOrgModalOpen(false)}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm text-gray-300"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitEditOrganization}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Lưu
            </button>
          </div>
        </div>
      </Modal>

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
    </>
  );
}

export default OrganizationsPage;

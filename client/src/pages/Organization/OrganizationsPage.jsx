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
    title: 'Task duoc gan',
    message: 'Sarah Chen da gan ban vao task "Thiet ke Landing Page"',
    time: '5 phut truoc',
    priority: 'high',
  },
  {
    id: 'n2',
    title: '@mention trong chat',
    message: 'Mike Ross da nhac den ban trong #general',
    time: '15 phut truoc',
    priority: 'medium',
  },
  {
    id: 'n3',
    title: 'Deadline sap den',
    message: 'Task "Review Pull Request" se den han trong 2 gio',
    time: '30 phut truoc',
    priority: 'high',
  },
];
const HOME_CALENDAR_PREVIEW = [
  {
    id: 'c1',
    title: 'Hop nhom hang ngay',
    time: '10:00',
    date: 'Hom nay',
    type: 'meeting',
  },
  {
    id: 'c2',
    title: 'Demo khach hang',
    time: '14:30',
    date: 'Hom nay',
    type: 'meeting',
  },
  {
    id: 'c3',
    title: 'Danh gia thiet ke',
    time: '16:00',
    date: 'Ngay mai',
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
      // Fallback: cho phép dán query string rút gọn
      const token =
        (input.includes('inviteToken=') && input.split('inviteToken=')[1]?.split('&')[0]) || '';
      const orgId =
        (input.includes('orgId=') && input.split('orgId=')[1]?.split('&')[0]) ||
        (input.includes('inviteOrgId=') && input.split('inviteOrgId=')[1]?.split('&')[0]) ||
        '';
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
      toast.error('Khong the tai danh sach to chuc');
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
      toast.error('Khong the tai loi moi to chuc');
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
          name: item.displayName || item.name || item.username || 'Nguoi dung',
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
      toast.error('Khong the tai phong ban');
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
      toast.error('Khong the tai danh sach kenh');
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
      toast.error('Khong the tai tin nhan kenh');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleCreateOrganization = async () => {
    const name = window.prompt('Nhap ten to chuc moi');
    if (!name?.trim()) return;

    try {
      await organizationAPI.createOrganization({ name: name.trim() });
      toast.success('Da tao to chuc moi');
      await loadOrganizations();
    } catch (error) {
      toast.error('Tao to chuc that bai');
    }
  };

  const handleJoinQuickInvite = async () => {
    const { orgId, token } = extractInvitePayloadFromInput(quickInviteInput);
    if (!orgId || !token) {
      toast.error('Vui long dan link moi hop le (co orgId va inviteToken)');
      return;
    }

    setJoiningQuickInvite(true);
    try {
      await organizationAPI.joinByInviteLink(orgId, token);
      toast.success('Da tham gia to chuc tu link moi');
      setQuickInviteInput('');
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      toast.error('Khong the tham gia to chuc tu link moi');
    } finally {
      setJoiningQuickInvite(false);
    }
  };

  const handleCreateDepartment = async () => {
    if (!selectedOrganizationId) {
      toast.error('Hay chon to chuc truoc');
      return;
    }

    const name = window.prompt('Nhap ten phong ban');
    if (!name?.trim()) return;

    try {
      await organizationAPI.createDepartment(selectedOrganizationId, { name: name.trim() });
      toast.success('Da tao phong ban');
      await loadDepartments(selectedOrganizationId);
    } catch (error) {
      toast.error('Tao phong ban that bai');
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

    const nextName = window.prompt('Nhap ten to chuc moi', current.name || '');
    if (!nextName || !nextName.trim()) return;

    try {
      await organizationAPI.updateOrganization(orgId, { name: nextName.trim() });
      toast.success('Da cap nhat to chuc');
      await loadOrganizations();
    } catch (error) {
      toast.error('Khong the cap nhat to chuc');
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
          name: raw?.displayName || raw?.name || raw?.username || 'Nguoi dung',
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
      toast.error('Khong the khoi tao du lieu moi');
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
      toast.success('Da gui loi moi tham gia to chuc');
    } catch (error) {
      toast.error('Moi thanh vien that bai');
    } finally {
      setInvitingIds((prev) => prev.filter((id) => id !== friendId));
    }
  };

  const handleCopyInviteLink = async () => {
    if (!generatedInviteLink) return;
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      toast.success('Da sao chep link moi');
    } catch (error) {
      toast.error('Khong the sao chep link');
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
        toast.success('Da chap nhan loi moi to chuc');
      } else {
        toast.success('Da tu choi loi moi to chuc');
      }
      await Promise.all([loadOrganizations(), loadPendingInvitations()]);
    } catch (error) {
      toast.error('Khong the xu ly loi moi');
    } finally {
      setRespondingInvitationIds((prev) => prev.filter((id) => id !== invitationId));
    }
  };

  const handleCreateChannel = async (channelType = 'chat') => {
    if (!selectedOrganizationId || !selectedDepartmentId) {
      toast.error('Hay chon phong ban truoc');
      return;
    }

    const label = channelType === 'voice' ? 'kenh voice' : 'kenh chat';
    const name = window.prompt(`Nhap ten ${label}`);
    if (!name?.trim()) return;

    try {
      await organizationAPI.createChannel(selectedOrganizationId, selectedDepartmentId, {
        name: name.trim(),
        type: channelType,
      });
      toast.success('Da tao kenh');
      await loadChannels(selectedOrganizationId, selectedDepartmentId);
    } catch (error) {
      toast.error('Tao kenh that bai');
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
      toast.error('Gui tin nhan that bai');
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
      content = `📎 Tep: ${file.name} (${sizeKb} KB)`;
    } else if (kind === 'image' && file) {
      messageType = 'image';
      content = `🖼️ Hinh anh: ${file.name}`;
    } else if (kind === 'contact') {
      messageType = 'system';
      content = `👤 Danh thiep\nTen: ${payload?.fullName || '-'}\nSDT: ${payload?.phone || '-'}\nEmail: ${payload?.email || '-'}`;
    } else if (kind === 'poll') {
      messageType = 'system';
      const options = Array.isArray(payload?.options) ? payload.options : [];
      content = `📊 Khao sat: ${payload?.question || ''}\n${options.map((opt, idx) => `${idx + 1}. ${opt}`).join('\n')}`;
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
      toast.success('Da gui noi dung vao kenh');
    } catch (error) {
      toast.error('Khong the gui noi dung');
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
        toast.success('Da tham gia to chuc tu link moi');
        await Promise.all([loadOrganizations(), loadPendingInvitations()]);
      } catch (error) {
        toast.error('Khong the tham gia to chuc tu link moi');
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
          title={`Moi tham gia ${inviteOrganization?.name || 'to chuc'}`}
          size="md"
        >
          <div className="space-y-4">
            <input
              value={inviteSearch}
              onChange={(event) => setInviteSearch(event.target.value)}
              placeholder="Tim kiem ban be"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
            />

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1 scrollbar-overlay">
              {loadingInviteFriends && (
                <div className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">Dang tai ban be...</div>
              )}
              {!loadingInviteFriends && filteredInviteFriends.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-gray-400">
                  Khong tim thay ban be de moi.
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
                        {inviting ? 'Dang moi...' : 'Moi'}
                      </button>
                    </div>
                  );
                })}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Moi qua link</div>
                {isInviteLinkBeta && (
                  <span className="rounded-md bg-yellow-500/20 px-2 py-0.5 text-xs text-yellow-300">
                    Beta
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={generatedInviteLink || (generatingInviteLink ? 'Dang tao link moi...' : '')}
                  className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-gray-200"
                />
                <button
                  type="button"
                  onClick={handleCopyInviteLink}
                  disabled={!generatedInviteLink || generatingInviteLink}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  Sao chep
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {isInviteLinkBeta
                  ? 'Link moi dang o che do Beta tren local HTTP. Khi nang cap HTTPS, co the bo sung xac thuc token moi de an toan hon.'
                  : 'Link moi dang duoc chia se qua HTTPS. Ban co the nang cap endpoint xac thuc token moi trong backend.'}
              </p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

export default OrganizationsPage;

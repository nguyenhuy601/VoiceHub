import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import toast from 'react-hot-toast';
import {
  Archive,
  AtSign,
  Ban,
  Bell,
  BellOff,
  Calendar,
  ChevronsDown,
  Image as ImageIcon,
  Info,
  Paperclip,
  PanelLeft,
  Phone,
  Pin,
  Search,
  Send,
  Smile,
  Video,
  X,
} from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import UnifiedChatComposer from '../../components/Chat/UnifiedChatComposer';
import {
  ChatMessageAttachmentBody,
  downloadToDisk,
  guessNameFromUrl,
} from '../../components/Chat/ChatFileAttachment';
import ChatMediaViewer from '../../components/Chat/ChatMediaViewer';
import FriendProfileModal from '../../components/Chat/FriendProfileModal';
import ChannelMessageToolbar from '../../components/Organization/ChannelMessageToolbar';
import ChannelMessageMoreMenu from '../../components/Organization/ChannelMessageMoreMenu';
import ForwardToFriendModal from '../../components/Organization/ForwardToFriendModal';
import CreateTaskFromAiModal from '../../components/Chat/CreateTaskFromAiModal';
import FriendChatRightPanel from '../../components/Chat/FriendChatRightPanel';
import FriendPendingRequestsRail from '../../components/Friends/FriendPendingRequestsRail';
import UserAvatar from '../../components/Shared/UserAvatar';
import userService from '../../services/userService';
import { buildFriendChatAttachments, findViewerIndex } from '../../utils/friendChatMedia';
import {
  buildDmSnippetMapFromMessages,
  formatRailTime,
  mergeDmSnippetMap,
  sortFriendsForDmRail,
} from '../../utils/dmConversationList';
import { copyImageToClipboard } from '../../utils/copyMediaToClipboard';
import { formatMessagePreview } from '../../features/search/formatMessagePreview';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFriendPending, useFriendsList, useOrganizationsMy } from '../../hooks/queries';
import { fetchFriendsList } from '../../hooks/queries/fetchers';
import FriendChatSidebarTabs from '../../components/Chat/FriendChatSidebarTabs';
import NewColleagueDmModal from '../../components/Chat/NewColleagueDmModal';
import ColleagueDirectoryRail from '../../components/Chat/ColleagueDirectoryRail';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import FriendChatFilterChips, { RAIL_FILTER } from '../../components/Chat/FriendChatFilterChips';
import FriendChatInvitesPanel from '../../components/Chat/FriendChatInvitesPanel';
import { queryKeys } from '../../lib/queryKeys';
import { parseMessageListPage } from '../../lib/parseMessageListPage';
import { STALE_TIME_FRIENDS_MS } from '../../lib/queryClient';
import { useWorkspace } from '../../context/WorkspaceContext';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';
import { getAiTaskEligibility } from '../../utils/aiTaskEligibility';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import Modal from '../../components/Shared/Modal';
import Toast from '../../components/Shared/Toast';
import friendService from '../../services/friendService';
import api from '../../services/api';
import { uploadChatFileAndCreateMessage } from '../../services/chatFileUpload';
import ChatUploadProgressBar from '../../components/Chat/ChatUploadProgressBar';
import ChatUploadPreviewModal from '../../components/Chat/ChatUploadPreviewModal';
import { useAuth } from '../../context/AuthContext';
import { getUserDisplayName } from '../../utils/helpers';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';
import { COMPOSER_EMOJI_LIST } from '../../utils/chatEmojiList';
import { useSocket } from '../../context/SocketContext';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import friendCallService from '../../services/friendCallService';
import { useTheme } from '../../context/ThemeContext';
import { appShellBg } from '../../theme/shellTheme';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import {
  ConversationSearchPanel,
  DM_SCOPE,
  messageMatchesDmScope,
  PageSearchBar,
} from '../../features/search';
import dmMessageService from '../../services/dmMessageService';
import { isOutgoing } from '../../utils/dmChatHelpers';
import { useFriendDmRealtime } from '../../hooks/useFriendDmRealtime';
import { useFriendChatPageFocus } from '../../hooks/useFriendChatPageFocus';
import FriendChatFigmaView from '../../components/Chat/FriendChatFigmaView';
import {
  FIGMA_CHAT_ROOT,
  FIGMA_CHAT_SIDEBAR,
  FIGMA_CHAT_SIDEBAR_HEAD,
  FIGMA_CHAT_SIDEBAR_TITLE,
  FIGMA_CHAT_SIDEBAR_ARCHIVE_BTN,
  FIGMA_CHAT_SIDEBAR_LIST,
  FIGMA_CHAT_RAIL_ITEM,
  FIGMA_CHAT_RAIL_ITEM_ACTIVE,
  FIGMA_CHAT_RAIL_NAME,
  FIGMA_CHAT_RAIL_NAME_UNREAD,
  FIGMA_CHAT_RAIL_PREVIEW,
  FIGMA_CHAT_RAIL_PREVIEW_UNREAD,
  FIGMA_CHAT_RAIL_TIME,
  FIGMA_CHAT_UNREAD_BADGE,
  FIGMA_CHAT_MAIN_PANEL,
  FIGMA_CHAT_MAIN_INNER,
  FIGMA_CHAT_HEADER,
  FIGMA_CHAT_HEADER_ROW,
  FIGMA_CHAT_HEADER_AVATAR,
  FIGMA_CHAT_HEADER_NAME,
  FIGMA_CHAT_HEADER_META,
  FIGMA_CHAT_HEADER_STATUS,
  FIGMA_CHAT_HEADER_TYPING,
  FIGMA_CHAT_STATUS_DOT,
  FIGMA_CHAT_HEADER_ACTIONS,
  FIGMA_CHAT_ICON_BTN,
  FIGMA_CHAT_ICON_BTN_PHONE,
  FIGMA_CHAT_ICON_BTN_VIDEO,
  FIGMA_CHAT_ICON_BTN_ACTIVE,
  FIGMA_CHAT_MESSAGES,
  FIGMA_CHAT_MESSAGES_INNER,
  FIGMA_CHAT_MESSAGES_STACK,
  FIGMA_CHAT_DATE_DIVIDER_ROW,
  FIGMA_CHAT_DATE_DIVIDER_LINE,
  FIGMA_CHAT_DATE_DIVIDER_LABEL,
  FIGMA_CHAT_BUBBLE_AVATAR_SLOT,
  FIGMA_CHAT_BUBBLE_AVATAR_HIDDEN,
  FIGMA_CHAT_BUBBLE_REPLY,
  FIGMA_CHAT_BUBBLE_REPLY_NAME,
  FIGMA_CHAT_BUBBLE_TIME,
  FIGMA_CHAT_BUBBLE_TOOLBAR,
  FIGMA_CHAT_BUBBLE_TOOLBAR_MINE,
  FIGMA_CHAT_BUBBLE_TOOLBAR_THEIRS,
  FIGMA_CHAT_REACTION,
  FIGMA_CHAT_REACTION_MINE,
  FIGMA_CHAT_COMPOSER_WRAP,
  FIGMA_CHAT_REPLY_BANNER,
  FIGMA_CHAT_EMPTY,
  FIGMA_CHAT_LOAD_OLDER,
  FIGMA_CHAT_JUMP_BTN,
  figmaChatBubbleRow,
  figmaChatBubbleCol,
  figmaChatBubble,
  figmaChatStatusDotColor,
  FIGMA_CHAT_INVITES_PLACEHOLDER,
  FIGMA_CHAT_SIDEBAR_SEARCH,
  FIGMA_CHAT_SIDEBAR_SEARCH_WRAP,
} from '../../components/Chat/figmaChatClasses';

function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const DM_MUTE_STORAGE_KEY = 'voicehub:dm-muted';
const DM_PIN_STORAGE_KEY = 'voicehub:dm-pinned';
const DM_PINNED_MESSAGES_STORAGE_KEY = 'voicehub:dm-pinned-messages';
const DM_ARCHIVE_STORAGE_KEY = 'voicehub:dm-archived';
const DM_DRAFT_PREFIX = 'voicehub:dm-draft:';
const DM_PAGE_SIZE = dmMessageService.pageSize;

function loadIdList(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveIdList(storageKey, ids) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...new Set(ids.map(String).filter(Boolean))]));
  } catch {
    /* ignore */
  }
}

function loadIdMap(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).map(([k, v]) => [String(k), Array.isArray(v) ? v.map(String).filter(Boolean) : []])
    );
  } catch {
    return {};
  }
}

function saveIdMap(storageKey, value) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value || {}));
  } catch {
    /* ignore */
  }
}

function FriendChatPage({ landingDemo = false, suiteLayout = false } = {}) {
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const { setActiveWorkspace, lastOrganizationId, company, activeWorkspace, singleOrgMode } =
    useWorkspace();
  const isSingleCompany = Boolean(singleOrgMode || readSingleOrgModeFlag());
  const directoryOrgId = String(
    company?.id || company?._id || activeWorkspace?._id || activeWorkspace?.id || lastOrganizationId || ''
  ).trim();
  const showColleagueDirectory = Boolean(suiteLayout && directoryOrgId);
  const showFriendInvites = Boolean(suiteLayout && !isSingleCompany);
  const [searchParams] = useSearchParams();
  const [friends, setFriends] = useState([]);
  const [selectedFriendId, setSelectedFriendId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deleteMsgConfirmId, setDeleteMsgConfirmId] = useState(null);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockingFriend, setBlockingFriend] = useState(false);
  const [unblockConfirmOpen, setUnblockConfirmOpen] = useState(false);
  const [unblockingFriend, setUnblockingFriend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  /** Snippet tin DM cuối theo bạn: { at, preview, isMine } */
  const [lastDmByFriendId, setLastDmByFriendId] = useState({});
  /** Calling API to select default conversation (avoid flashing "choose friend") */
  const [resolvingDefaultChat, setResolvingDefaultChat] = useState(false);
  const [friendsLoading, setFriendsLoading] = useState(true);
  /** Lọc danh sách bạn trong rail (PageSearchBar) */
  const [friendRailSearch, setFriendRailSearch] = useState('');
  /** Tìm trong tin DM + bộ lọc loại tin (SearchFilterChips) */
  const [dmMessageSearch, setDmMessageSearch] = useState('');
  const [dmScope, setDmScope] = useState(DM_SCOPE.ALL);
  const [conversationSearchOpen, setConversationSearchOpen] = useState(false);
  const [rightPanelDrawerOpen, setRightPanelDrawerOpen] = useState(false);
  const [sidebarDrawerOpen, setSidebarDrawerOpen] = useState(false);
  /** null = không upload; 0–100 khi đang gửi file/ảnh */
  const [uploadProgress, setUploadProgress] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [forwardSourceMessage, setForwardSourceMessage] = useState(null);
  const [forwarding, setForwarding] = useState(false);
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [createTaskSourceMessage, setCreateTaskSourceMessage] = useState(null);
  const [defaultOrgIdForTask, setDefaultOrgIdForTask] = useState(null);
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});
  const [inlineToast, setInlineToast] = useState(null);
  const [mutedFriendIds, setMutedFriendIds] = useState(() => loadIdList(DM_MUTE_STORAGE_KEY));
  const [pinnedFriendIds, setPinnedFriendIds] = useState(() => loadIdList(DM_PIN_STORAGE_KEY));
  const [pinnedMessageIdsByFriend, setPinnedMessageIdsByFriend] = useState(() =>
    loadIdMap(DM_PINNED_MESSAGES_STORAGE_KEY)
  );
  const [archivedFriendIds, setArchivedFriendIds] = useState(() => loadIdList(DM_ARCHIVE_STORAGE_KEY));
  const [unreadByPeer, setUnreadByPeer] = useState({});
  const [peerTyping, setPeerTyping] = useState(false);
  const [nextOlderPageToken, setNextOlderPageToken] = useState(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const pendingSendsRef = useRef(new Map());
  const messagesEndRef = useRef(null);
  const chatScrollRef = useRef(null);
  const isNearBottomRef = useRef(true);
  const [showJumpToDmLatest, setShowJumpToDmLatest] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [failedUpload, setFailedUpload] = useState(null);
  const [dmServerSearchResults, setDmServerSearchResults] = useState(null);
  const [dmServerSearching, setDmServerSearching] = useState(false);
  const [showArchivedRail, setShowArchivedRail] = useState(false);
  const [pinnedMessagesModalOpen, setPinnedMessagesModalOpen] = useState(false);
  const [blockedByPeer, setBlockedByPeer] = useState(false);
  const { user } = useAuth();
  const { outboundRinging, startOutboundRinging, clearOutboundRinging } = useFriendCallSession();
  const { emit, on, off, onlineUsers, connected: socketConnected } = useSocket();
  useFriendChatPageFocus({ enabled: !landingDemo });
  /** Peer mở từ Directory org — hiện rail tạm nếu chưa có trong GET /friends (auto-friend trễ). */
  const [directoryOpenPeer, setDirectoryOpenPeer] = useState(null);
  useEffect(() => {
    setRightPanelDrawerOpen(false);
    if (
      directoryOpenPeer?.id &&
      selectedFriendId &&
      String(selectedFriendId) !== String(directoryOpenPeer.id)
    ) {
      setDirectoryOpenPeer(null);
    }
  }, [selectedFriendId, directoryOpenPeer]);
  const routedDmUserId = String(
    location.state?.openDmUserId || searchParams.get('openDmUserId') || ''
  );
  const routedComposeText = String(
    location.state?.composeText || searchParams.get('composeText') || ''
  );
  const routedDmDisplayName = String(
    location.state?.openDmDisplayName || searchParams.get('openDmDisplayName') || ''
  ).trim();
  const routedDmAvatar = String(
    location.state?.openDmAvatar || searchParams.get('openDmAvatar') || ''
  ).trim();
  const showPendingRequestsRail = String(searchParams.get('tab') || '').toLowerCase() === 'requests';
  const [sidebarMainTab, setSidebarMainTab] = useState(() => {
    if (showPendingRequestsRail && !isSingleCompany) return 'invites';
    return 'messages';
  });
  const [railFilterTab, setRailFilterTab] = useState(RAIL_FILTER.ALL);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [showNewDmModal, setShowNewDmModal] = useState(false);
  const [inviteActingKey, setInviteActingKey] = useState('');
  const queryClient = useQueryClient();
  const { pendingList, pendingCount, refetch: refetchPending } = useFriendPending({
    enabled: !landingDemo && suiteLayout && showFriendInvites,
  });
  const sentInvitesQuery = useQuery({
    queryKey: [...queryKeys.friends.pending(), 'sent'],
    queryFn: async () => {
      const resp = await friendService.getPendingRequests({
        params: { type: 'sent' },
        skipGlobalErrorHandling: true,
      });
      const raw = resp?.data ?? resp;
      return Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
    },
    enabled: !landingDemo && suiteLayout && showFriendInvites && sidebarMainTab === 'invites',
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!showFriendInvites && sidebarMainTab === 'invites') {
      setSidebarMainTab('messages');
    }
  }, [showFriendInvites, sidebarMainTab]);

  const openColleagueDm = useCallback((colleague) => {
    const id = String(colleague?.userId || '').trim();
    if (!id) return;
    setDirectoryOpenPeer({
      id,
      name: colleague.displayName || t('friendChat.friendDefault'),
      avatar: colleague.avatar || null,
    });
    setSelectedFriendId(id);
    setSidebarMainTab('messages');
    setShowNewDmModal(false);
  }, [t]);

  const formatDateDividerLabel = useCallback(
    (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
      const t0 = startOf(d);
      const now = new Date();
      const today0 = startOf(now);
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const yesterday0 = startOf(y);
      const LOCALE_TAG_EN = 'en-US';
      const LOCALE_TAG_VI = 'vi-VN';
      const loc = locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI;
      const dd = d.toLocaleDateString(loc, { day: '2-digit', month: '2-digit' });
      if (t0 === today0) return t('friendChat.dateToday', { date: dd });
      if (t0 === yesterday0) return t('friendChat.dateYesterday', { date: dd });
      return d.toLocaleDateString(loc, {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    },
    [locale, t]
  );

  // Trong hệ thống hiện tại, ID đăng nhập lưu ở field userId (Auth service),
  // còn _id là của profile. Tin nhắn lưu senderId theo userId.
  const currentUserId = user?.userId || user?._id || user?.id;
  const currentUserName = getUserDisplayName(user) || t('common.you');
  const currentUserAvatar = user?.avatar || null;
  const [friendProfiles, setFriendProfiles] = useState({});
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [mediaViewer, setMediaViewer] = useState({ open: false, index: 0 });
  const currentFriendKey = selectedFriendId ? String(selectedFriendId) : '';
  const isCurrentFriendMuted = currentFriendKey ? mutedFriendIds.includes(currentFriendKey) : false;
  const isCurrentFriendPinned = currentFriendKey ? pinnedFriendIds.includes(currentFriendKey) : false;
  const pinnedMessageIdsCurrentFriend = currentFriendKey
    ? pinnedMessageIdsByFriend[currentFriendKey] || []
    : [];

  const showToast = (message, type = 'success') => {
    setInlineToast({ message, type });
    setTimeout(() => setInlineToast(null), 3000);
  };

  const toggleMuteCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = isCurrentFriendMuted
      ? mutedFriendIds.filter((id) => id !== currentFriendKey)
      : [...mutedFriendIds, currentFriendKey];
    saveIdList(DM_MUTE_STORAGE_KEY, next);
    setMutedFriendIds(next);
    toast.success(
      isCurrentFriendMuted ? t('friendChat.muteOn') : t('friendChat.muteOff')
    );
  }, [currentFriendKey, isCurrentFriendMuted, mutedFriendIds]);

  const togglePinCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = isCurrentFriendPinned
      ? pinnedFriendIds.filter((id) => id !== currentFriendKey)
      : [...pinnedFriendIds, currentFriendKey];
    saveIdList(DM_PIN_STORAGE_KEY, next);
    setPinnedFriendIds(next);
    toast.success(isCurrentFriendPinned ? t('friendChat.pinOff') : t('friendChat.pinOn'));
  }, [currentFriendKey, isCurrentFriendPinned, pinnedFriendIds]);

  const togglePinMessage = useCallback(
    (msg) => {
      if (!currentFriendKey || !msg) return;
      const messageId = msg._id || msg.id;
      if (messageId == null) return;
      const idKey = String(messageId);
      const prevIds = Array.isArray(pinnedMessageIdsByFriend[currentFriendKey])
        ? pinnedMessageIdsByFriend[currentFriendKey]
        : [];
      const hasPinned = prevIds.includes(idKey);
      const nextIds = hasPinned ? prevIds.filter((id) => id !== idKey) : [...prevIds, idKey];
      const nextMap = { ...pinnedMessageIdsByFriend, [currentFriendKey]: nextIds };
      setPinnedMessageIdsByFriend(nextMap);
      saveIdMap(DM_PINNED_MESSAGES_STORAGE_KEY, nextMap);
      toast.success(hasPinned ? t('friendChat.msgPinOff') : t('friendChat.msgPinOn'));
    },
    [currentFriendKey, pinnedMessageIdsByFriend, t]
  );

  const openMutualOrganization = useCallback(
    (org) => {
      if (!org?._id) return;
      setActiveWorkspace({
        organizationId: String(org._id),
        name: org.name,
        slug: org.slug,
      });
      navigate('/app/collaborate/workspaces', { state: { selectOrganizationId: String(org._id) } });
    },
    [navigate, setActiveWorkspace]
  );

  const startFriendCall = useCallback(
    async (media, peerIdOverride) => {
      if (landingDemo) {
        toast(t('friendChat.callVideoSoon'), { icon: '📞' });
        return;
      }
      const calleeId = String(peerIdOverride || selectedFriendId || '').trim();
      if (!calleeId) return;
      if (outboundRinging?.callId) {
        toast.error(t('friendChat.callConflict'));
        return;
      }
      try {
        const res = await friendCallService.initiate({ calleeId, media });
        const data = res?.data?.data ?? res?.data;
        const callId = data?.callId;
        const roomId = data?.roomId;
        if (!callId || !roomId) {
          toast.error(t('friendChat.callStartFail'));
          return;
        }
        const prof = friendProfiles[calleeId];
        const peerLabel =
          prof?.displayName || prof?.name || prof?.username || '';
        startOutboundRinging({
          callId,
          roomId,
          media,
          calleeId,
          peerLabel,
        });
      } catch (err) {
        const status = err.status || err.response?.status;
        if (status === 409) toast.error(t('friendChat.callConflict'));
        else if (status === 403) toast.error(t('friendChat.callDenied'));
        else toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.callStartFail') }));
      }
    },
    [landingDemo, selectedFriendId, outboundRinging?.callId, friendProfiles, startOutboundRinging, t]
  );

  const handleFriendCallBackFromLog = useCallback(
    (media, peerId) => {
      const target = String(peerId || '').trim();
      if (!target) return;
      if (String(selectedFriendId || '') !== target) {
        setSelectedFriendId(target);
      }
      void startFriendCall(media, target);
    },
    [selectedFriendId, startFriendCall]
  );

  const { data: myOrganizations = [] } = useOrganizationsMy({ enabled: !landingDemo });
  const acceptedFriendsQuery = useFriendsList({ status: 'accepted', enabled: !landingDemo });
  const blockedFriendsQuery = useFriendsList({ status: 'blocked', enabled: !landingDemo });

  const refreshFriendsCache = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
  }, [queryClient]);

  useEffect(() => {
    if (landingDemo || !myOrganizations.length) return;
    const first = myOrganizations[0];
    const oid = first?._id || first?.id;
    if (oid) setDefaultOrgIdForTask(String(oid));
  }, [landingDemo, myOrganizations]);

  const mergedFriendsFromQuery = useMemo(() => {
    const tag = (rows, relationshipStatus) =>
      (Array.isArray(rows) ? rows : []).map((row) => ({ ...row, relationshipStatus }));
    return [
      ...tag(acceptedFriendsQuery.data, 'accepted'),
      ...tag(blockedFriendsQuery.data, 'blocked'),
    ];
  }, [acceptedFriendsQuery.data, blockedFriendsQuery.data]);

  useEffect(() => {
    if (landingDemo) {
      setFriends([]);
      setFriendsLoading(false);
      setSelectedFriendId(null);
      setMessages([]);
      return;
    }
    if (acceptedFriendsQuery.isError || blockedFriendsQuery.isError) {
      const err = acceptedFriendsQuery.error || blockedFriendsQuery.error;
      toast.error(resolveApiErrorMessage(err, t('friendChat.loadFriendsFail')));
      setFriends([]);
      setFriendsLoading(false);
      return;
    }
    setFriends(mergedFriendsFromQuery);
    setFriendsLoading(acceptedFriendsQuery.isLoading || blockedFriendsQuery.isLoading);
  }, [
    landingDemo,
    currentUserId,
    t,
    mergedFriendsFromQuery,
    acceptedFriendsQuery.isLoading,
    blockedFriendsQuery.isLoading,
    acceptedFriendsQuery.isError,
    blockedFriendsQuery.isError,
    acceptedFriendsQuery.error,
    blockedFriendsQuery.error,
  ]);

  // Map friends + sắp xếp theo tin nhắn gần nhất; presence realtime khớp Dashboard (onlineUsers từ socket)
  const viewFriends = useMemo(() => {
    const rows = friends.map((f, index) => {
      const u = f.friendId || f;
      const uname = typeof u?.username === 'string' ? u.username.trim() : '';
      const title =
        typeof u?.title === 'string'
          ? u.title.trim()
          : typeof u?.headline === 'string'
            ? u.headline.trim()
            : '';
      const subtitle = title || t('friendChat.dmSubtitle');
      const id = u?._id || u?.userId || u?.id || f.id;
      const isBlockedByMe = String(f.relationshipStatus || '') === 'blocked';
      /** Luôn unique để tránh cảnh báo key khi thiếu user (id trùng undefined). */
      const listKey =
        id != null && id !== ''
          ? String(id)
          : f._id != null
            ? `friendship-${String(f._id)}`
            : `friend-row-${index}`;
      const rawFriendId = f.friendId;
      const presenceKeys = [
        id,
        u?.userId,
        u?._id,
        u?.id,
        typeof rawFriendId === 'string' || typeof rawFriendId === 'number' ? rawFriendId : null,
        rawFriendId && typeof rawFriendId === 'object' ? rawFriendId._id || rawFriendId.userId : null,
      ]
        .filter((x) => x != null && typeof x !== 'object')
        .map(String);
      const uniqueKeys = [...new Set(presenceKeys)];
      return {
        id,
        listKey,
        name: u?.displayName || u?.username || t('common.user'),
        avatar: u?.avatar || null,
        status: String(u?.status || 'offline').toLowerCase(),
        subtitle,
        isBlockedByMe,
        _presenceKeys: uniqueKeys,
      };
    });
    const dirId = directoryOpenPeer?.id ? String(directoryOpenPeer.id) : '';
    if (dirId && !rows.some((r) => String(r.id) === dirId)) {
      rows.unshift({
        id: dirId,
        listKey: `directory-${dirId}`,
        name: directoryOpenPeer.name || t('common.user'),
        avatar: directoryOpenPeer.avatar || null,
        status: 'offline',
        subtitle: t('friendChat.directoryPeerSubtitle'),
        isBlockedByMe: false,
        _presenceKeys: [dirId],
      });
    }
    const sorted = sortFriendsForDmRail(rows, lastDmByFriendId, pinnedFriendIds);
    const onlineSet = new Set((onlineUsers || []).map(String));
    return sorted.map((row) => {
      const { _presenceKeys, ...rest } = row;
      const snippet = lastDmByFriendId[String(rest.id)];
      const inLiveList = (_presenceKeys || [String(rest.id)]).some((k) => onlineSet.has(String(k)));
      const withSnippet = {
        ...rest,
        lastAt: snippet?.at ?? null,
        lastPreview: snippet?.preview ?? '',
        lastIsMine: Boolean(snippet?.isMine),
      };
      /** Khi socket đã nối: chỉ tin danh sách online từ server (khớp Dashboard). */
      if (rest.isBlockedByMe) {
        return { ...withSnippet, status: 'offline' };
      }
      if (socketConnected) {
        return { ...withSnippet, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...withSnippet,
        status: inLiveList ? 'online' : rest.status,
      };
    });
  }, [friends, directoryOpenPeer, lastDmByFriendId, pinnedFriendIds, onlineUsers, socketConnected, t]);

  const viewFriendsEnriched = useMemo(() => {
    return viewFriends.map((f) => {
      const p = friendProfiles[String(f.id)];
      if (!p) return f;
      return {
        ...f,
        name: p.name || f.name,
        avatar: p.avatar ?? f.avatar,
        phone: p.phone ?? f.phone,
        email: p.email ?? f.email,
        username: p.username ?? f.username,
      };
    });
  }, [viewFriends, friendProfiles]);

  const dmServerSearchFiltered = useMemo(() => {
    if (!Array.isArray(dmServerSearchResults)) return null;
    return dmServerSearchResults.filter((m) => messageMatchesDmScope(m, dmScope));
  }, [dmServerSearchResults, dmScope]);

  useEffect(() => {
    if (!conversationSearchOpen || !selectedFriendId) {
      setDmServerSearchResults(null);
      setDmServerSearching(false);
      return undefined;
    }
    const q = dmMessageSearch.trim();
    if (q.length < 2) {
      setDmServerSearchResults(null);
      setDmServerSearching(false);
      return undefined;
    }
    let cancelled = false;
    setDmServerSearching(true);
    const timer = setTimeout(async () => {
      try {
        const resp = await dmMessageService.searchConversation(selectedFriendId, q);
        const data = dmMessageService.unwrap(resp);
        if (!cancelled) setDmServerSearchResults(data?.messages || []);
      } catch {
        if (!cancelled) setDmServerSearchResults([]);
      } finally {
        if (!cancelled) setDmServerSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [conversationSearchOpen, selectedFriendId, dmMessageSearch]);

  const filteredViewFriends = useMemo(() => {
    const visible = viewFriendsEnriched.filter((f) => {
      const archived = archivedFriendIds.includes(String(f.id));
      return showArchivedRail ? archived : !archived;
    });
    const q = friendRailSearch.trim().toLowerCase();
    let list = visible;
    if (q) {
      list = visible.filter((f) => {
        const previewLine = f.lastPreview
          ? `${f.lastIsMine ? t('friendChat.railYouPrefix') : ''}${f.lastPreview}`
          : '';
        const hay = `${f.name || ''} ${f.subtitle || ''} ${previewLine}`.toLowerCase();
        return hay.includes(q);
      });
    }
    if (!suiteLayout || sidebarMainTab !== 'messages') return list;
    if (railFilterTab === RAIL_FILTER.ONLINE) {
      return list.filter((f) => String(f.status || '').toLowerCase() === 'online');
    }
    if (railFilterTab === RAIL_FILTER.UNREAD) {
      return list.filter((f) => {
        const fid = String(f.id || '');
        const unreadCount = f.isBlockedByMe ? 0 : fid ? Number(unreadByPeer[fid] || 0) : 0;
        return unreadCount > 0;
      });
    }
    return list;
  }, [
    viewFriendsEnriched,
    friendRailSearch,
    archivedFriendIds,
    showArchivedRail,
    suiteLayout,
    sidebarMainTab,
    railFilterTab,
    unreadByPeer,
    t,
  ]);

  const totalDmUnread = useMemo(
    () =>
      viewFriendsEnriched.reduce((sum, f) => {
        const fid = String(f.id || '');
        if (!fid || f.isBlockedByMe) return sum;
        return sum + Number(unreadByPeer[fid] || 0);
      }, 0),
    [viewFriendsEnriched, unreadByPeer]
  );

  const receivedInviteRows = useMemo(() => {
    return (Array.isArray(pendingList) ? pendingList : [])
      .map((row) => {
        const profile =
          row?.requester ||
          row?.fromUser ||
          (typeof row?.userId === 'object' ? row.userId : null) ||
          {};
        const id = String(
          profile.userId || profile._id || profile.id || row?.userId || row?.requester || ''
        ).trim();
        return {
          row,
          id,
          rowKey: String(row._id || row.id || id),
          name: profile.displayName || profile.username || profile.name || t('common.user'),
          avatar: profile.avatar,
          subtitle: t('friendChat.pendingWantsFriend'),
          status: profile.status || 'offline',
        };
      })
      .filter((x) => x.id);
  }, [pendingList, t]);

  const sentInviteRows = useMemo(() => {
    const list = sentInvitesQuery.data ?? [];
    return (Array.isArray(list) ? list : [])
      .map((row) => {
        const profile =
          row?.recipient ||
          row?.friendId ||
          (typeof row?.friendId === 'object' ? row.friendId : null) ||
          {};
        const id = String(
          profile.userId || profile._id || profile.id || row?.friendId || ''
        ).trim();
        return {
          row,
          id,
          rowKey: String(row._id || row.id || id),
          name: profile.displayName || profile.username || profile.name || t('common.user'),
          avatar: profile.avatar,
          subtitle: profile.title || profile.headline || '',
          status: profile.status || 'offline',
        };
      })
      .filter((x) => x.id);
  }, [sentInvitesQuery.data, t]);

  const invalidateInviteQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
    refetchPending();
    sentInvitesQuery.refetch();
  }, [queryClient, refetchPending, sentInvitesQuery]);

  const handleAcceptInvite = useCallback(
    async (item) => {
      if (!item?.id || inviteActingKey) return;
      setInviteActingKey(item.rowKey);
      try {
        await friendService.acceptFriend(item.id);
        toast.success(t('friendChat.pendingAcceptOk'));
        invalidateInviteQueries();
        if (item.id) setSelectedFriendId(item.id);
      } catch (err) {
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.pendingActionFail') }));
      } finally {
        setInviteActingKey('');
      }
    },
    [inviteActingKey, invalidateInviteQueries, t]
  );

  const handleRejectInvite = useCallback(
    async (item) => {
      if (!item?.id || inviteActingKey) return;
      setInviteActingKey(item.rowKey);
      try {
        await friendService.rejectFriend(item.id);
        toast.success(t('friendChat.pendingRejectOk'));
        invalidateInviteQueries();
      } catch (err) {
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.pendingActionFail') }));
      } finally {
        setInviteActingKey('');
      }
    },
    [inviteActingKey, invalidateInviteQueries, t]
  );

  const handleWithdrawInvite = useCallback(
    async (item) => {
      if (!item?.id || inviteActingKey) return;
      setInviteActingKey(item.rowKey);
      try {
        await friendService.rejectFriend(item.id);
        toast.success(t('friendChat.pendingRejectOk'));
        invalidateInviteQueries();
      } catch (err) {
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.pendingActionFail') }));
      } finally {
        setInviteActingKey('');
      }
    },
    [inviteActingKey, invalidateInviteQueries, t]
  );

  const dmScopeOptions = useMemo(
    () => [
      { id: DM_SCOPE.ALL, label: t('friendChat.dmScopeAll'), icon: '📋' },
      { id: DM_SCOPE.TEXT, label: t('friendChat.dmScopeMessages'), icon: '💬' },
      { id: DM_SCOPE.FILE, label: t('friendChat.dmScopeFiles'), icon: '📎' },
      { id: DM_SCOPE.IMAGE, label: t('friendChat.dmScopeImages'), icon: '🖼️' },
      { id: DM_SCOPE.LINK, label: t('friendChat.dmScopeLinks'), icon: '🔗' },
      { id: DM_SCOPE.CALENDAR, label: t('friendChat.dmScopeCalendar'), icon: '📅' },
    ],
    [t]
  );

  /** Lấy snippet tin DM gần nhất với mỗi bạn (từ API /messages). */
  const fetchLastDmActivity = useCallback(async () => {
    if (!currentUserId) return {};
    try {
      const resp = await api.get('/messages', { params: { limit: 500, fields: 'summary' } });
      const payload = resp?.data || resp;
      const result = payload?.data || payload;
      const list = result?.messages || [];
      if (!Array.isArray(list)) return {};
      return buildDmSnippetMapFromMessages(list, currentUserId, t);
    } catch {
      return {};
    }
  }, [currentUserId, t]);

  // Khi có danh sách bạn: tự chọn người đã nhắn gần nhất (không ghi đè nếu user đã chọn)
  useEffect(() => {
    if (landingDemo) return;
    if (!currentUserId) return;
    if (friends.length === 0) {
      setSelectedFriendId(null);
      setResolvingDefaultChat(false);
      return;
    }
    let cancelled = false;
    setResolvingDefaultChat(true);
    (async () => {
      try {
        const lastMap = await fetchLastDmActivity();
        if (cancelled) return;
        setLastDmByFriendId((prev) => {
          const next = { ...prev };
          Object.entries(lastMap).forEach(([k, v]) => {
            const key = String(k);
            const existing = next[key];
            if (!existing || (v?.at || 0) >= (existing?.at || 0)) {
              next[key] = v;
            }
          });
          return next;
        });
        setSelectedFriendId((prev) => {
          if (prev) return prev;
          const rows = friends.map((f) => {
            const u = f.friendId || f;
            return {
              id: u?._id || u?.userId || u?.id || f.id,
              name: u?.displayName || u?.username || t('common.user'),
              avatar: u?.avatar || null,
              status: u?.status || 'offline',
            };
          });
          const sorted = sortFriendsForDmRail(rows, lastMap, pinnedFriendIds);
          const withDm = sorted.find((f) => lastMap[String(f.id)]?.at);
          if (withDm) return withDm.id;
          return rows[0]?.id ?? null;
        });
      } finally {
        if (!cancelled) setResolvingDefaultChat(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [friends, currentUserId, fetchLastDmActivity, landingDemo, pinnedFriendIds, t]);

  const parseMessagesResponse = useCallback((resp) => {
    const page = parseMessageListPage(resp);
    return {
      arr: page.messages,
      totalPages: page.totalPages ?? 1,
      currentPage: page.currentPage ?? 1,
      nextPageToken: page.nextPageToken,
      hasMore: page.hasMore,
    };
  }, []);

  // Load messages khi chọn bạn (trang mới nhất trước)
  const loadMessages = useCallback(
    async (friendId) => {
      if (!friendId) return;
      setLoadingMessages(true);
      setNextOlderPageToken(null);
      try {
        const draftRaw = localStorage.getItem(`${DM_DRAFT_PREFIX}${friendId}`);
        if (draftRaw != null) setMessage(draftRaw);
        else setMessage('');

        const cacheKey = queryKeys.dm.messages(friendId);
        const parsed = await queryClient.fetchQuery({
          queryKey: cacheKey,
          queryFn: async () => {
            const resp = await dmMessageService.getConversation(friendId, {
              limit: DM_PAGE_SIZE,
            });
            return parseMessagesResponse(resp);
          },
          staleTime: STALE_TIME_FRIENDS_MS,
        });

        const { arr, totalPages, currentPage, nextPageToken, hasMore } = parsed;
        setMessages(arr);
        setNextOlderPageToken(nextPageToken || null);
        setHasMoreOlder(
          Boolean(hasMore || (currentPage != null && totalPages != null && currentPage < totalPages))
        );
        if (arr.length && currentUserId) {
          const sorted = [...arr].sort(
            (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
          );
          const last = sorted[sorted.length - 1];
          setLastDmByFriendId((prev) => mergeDmSnippetMap(prev, last, currentUserId, t));
        }
      } catch (err) {
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.loadMessagesFail') }));
        setMessages([]);
        setHasMoreOlder(false);
      } finally {
        setLoadingMessages(false);
      }
    },
    [currentUserId, parseMessagesResponse, t, queryClient]
  );

  const loadOlderMessages = useCallback(async () => {
    if (!selectedFriendId || loadingOlder || !hasMoreOlder || !nextOlderPageToken) return;
    setLoadingOlder(true);
    try {
      const parsed = await queryClient.fetchQuery({
        queryKey: [...queryKeys.dm.messages(selectedFriendId), 'token', nextOlderPageToken],
        queryFn: async () => {
          const resp = await dmMessageService.getConversation(selectedFriendId, {
            pageToken: nextOlderPageToken,
            limit: DM_PAGE_SIZE,
          });
          return parseMessagesResponse(resp);
        },
        staleTime: STALE_TIME_FRIENDS_MS,
      });
      const { arr, totalPages, currentPage, nextPageToken, hasMore } = parsed;
      setMessages((prev) => {
        const ids = new Set(prev.map((x) => String(x._id || x.id)));
        const older = arr.filter((m) => !ids.has(String(m._id || m.id)));
        return [...older, ...prev];
      });
      setNextOlderPageToken(nextPageToken || null);
      setHasMoreOlder(
        Boolean(hasMore || (currentPage != null && totalPages != null && currentPage < totalPages))
      );
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.loadOlderFail') }));
    } finally {
      setLoadingOlder(false);
    }
  }, [
    selectedFriendId,
    loadingOlder,
    hasMoreOlder,
    nextOlderPageToken,
    parseMessagesResponse,
    t,
    queryClient,
  ]);

  useEffect(() => {
    if (!routedDmUserId) return;

    const pickFriendIdFromRows = (rows) => {
      for (const f of rows || []) {
        const u = f.friendId || f;
        const candidates = [u?._id, u?.userId, u?.id, f?.userId, f?.id].filter(Boolean).map(String);
        if (candidates.includes(routedDmUserId)) {
          return String(u?._id || u?.userId || u?.id || f?.userId || f?.id);
        }
      }
      return null;
    };

    const matchedLocal = pickFriendIdFromRows(friends);
    if (matchedLocal) {
      setDirectoryOpenPeer(null);
      setSelectedFriendId(matchedLocal);
      if (routedComposeText) setMessage(routedComposeText);
      navigate(location.pathname, { replace: true, state: null });
      return;
    }
    if (friendsLoading) return;

    let cancelled = false;
    (async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
        const accepted = await queryClient.fetchQuery({
          queryKey: queryKeys.friends.list('accepted'),
          queryFn: () => fetchFriendsList('accepted'),
        });
        if (cancelled) return;
        const matched = pickFriendIdFromRows(accepted);
        if (matched) {
          setDirectoryOpenPeer(null);
          setSelectedFriendId(matched);
          if (routedComposeText) setMessage(routedComposeText);
          navigate(location.pathname, { replace: true, state: null });
          return;
        }
      } catch {
        /* soft-open bên dưới */
      }
      if (cancelled) return;
      // Directory DN: vẫn mở hội thoại theo userId; gửi tin vẫn qua assertDmCanSend (auto-friend / block).
      setDirectoryOpenPeer({
        id: routedDmUserId,
        name: routedDmDisplayName || t('common.user'),
        avatar: routedDmAvatar || null,
      });
      setSelectedFriendId(routedDmUserId);
      if (routedComposeText) setMessage(routedComposeText);
      navigate(location.pathname, { replace: true, state: null });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    friends,
    friendsLoading,
    location.pathname,
    navigate,
    queryClient,
    routedComposeText,
    routedDmAvatar,
    routedDmDisplayName,
    routedDmUserId,
    t,
  ]);

  useEffect(() => {
    if (landingDemo) return;
    if (selectedFriendId) {
      loadMessages(selectedFriendId);
    }
  }, [selectedFriendId, loadMessages, landingDemo]);

  useEffect(() => {
    setDmMessageSearch('');
    setDmScope(DM_SCOPE.ALL);
    setPeerTyping(false);
    setDmServerSearchResults(null);
    setBlockedByPeer(false);
  }, [selectedFriendId]);

  useEffect(() => {
    if (!selectedFriendId || landingDemo) return undefined;
    const key = `${DM_DRAFT_PREFIX}${selectedFriendId}`;
    const timer = setTimeout(() => {
      const trimmed = message.trim();
      try {
        if (trimmed) localStorage.setItem(key, message);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [message, selectedFriendId, landingDemo]);

  const onDmSendRejected = useCallback(
    (payload) => {
      const code = payload?.code;
      if (code === 'dm_blocked') {
        const blockerId = payload?.blockerId ? String(payload.blockerId) : '';
        if (blockerId && blockerId !== String(currentUserId || '')) {
          setBlockedByPeer(true);
        }
      } else if (code === 'dm_unblocked') {
        setBlockedByPeer(false);
      }
    },
    [currentUserId]
  );

  const { notifyTyping, refreshUnread, armSendTimeout } = useFriendDmRealtime({
    landingDemo,
    on,
    off,
    emit,
    currentUserId,
    selectedFriendId,
    setMessages,
    setLastDmByFriendId,
    setUnreadByPeer,
    setPeerTyping,
    pendingSendsRef,
    t,
    onDmSendRejected,
  });

  const retrySend = useCallback(
    (failedMsg) => {
      const tempId = failedMsg?._id || failedMsg?.id;
      if (!tempId || !selectedFriendId) return;
      const text = String(failedMsg.content || '').trim();
      if (!text) return;

      setMessages((prev) =>
        prev.map((x) =>
          String(x._id || x.id) === String(tempId)
            ? { ...x, _sendStatus: 'pending', _sendError: null }
            : x
        )
      );

      const replyRef = failedMsg.replyToMessageId;
      const validReplyId =
        replyRef && !String(replyRef).startsWith('temp-') ? replyRef : null;

      const payload = {
        receiverId: selectedFriendId,
        content: text,
        messageType: 'text',
      };
      if (validReplyId) payload.replyToMessageId = validReplyId;

      pendingSendsRef.current.set(String(tempId), {
        receiverId: selectedFriendId,
        content: text,
        replyToMessageId: validReplyId,
      });
      armSendTimeout(String(tempId));
      emit('friend:send', payload);
    },
    [selectedFriendId, emit, armSendTimeout]
  );

  const currentFriend = useMemo(() => {
    if (!selectedFriendId) return null;
    return viewFriendsEnriched.find((f) => f.id === selectedFriendId) || null;
  }, [viewFriendsEnriched, selectedFriendId]);
  const isCurrentFriendBlocked = Boolean(currentFriend?.isBlockedByMe);
  const isDmComposerLocked = isCurrentFriendBlocked || blockedByPeer;

  // Gửi tin nhắn qua socket-service (realtime) + optimistic UI
  const handleSend = async () => {
    if (!selectedFriendId || !message.trim() || isDmComposerLocked || landingDemo) return;

    const text = message.trim();
    const tempId = `temp-${Date.now()}`;
    const replyRef = replyingToMessage?._id || replyingToMessage?.id;
    const validReplyId =
      replyRef && !String(replyRef).startsWith('temp-') ? replyRef : null;

    const optimistic = {
      _id: tempId,
      senderId: currentUserId,
      receiverId: selectedFriendId,
      content: text,
      createdAt: new Date().toISOString(),
      _optimistic: true,
      _sendStatus: 'pending',
      ...(validReplyId ? { replyToMessageId: validReplyId } : {}),
    };

    setMessages((prev) => [...prev, optimistic]);
    setMessage('');
    setReplyingToMessage(null);
    const now = Date.now();
    setLastDmByFriendId((prev) => ({
      ...prev,
      [String(selectedFriendId)]: {
        at: now,
        preview: text,
        isMine: true,
      },
    }));
    const payload = {
      receiverId: selectedFriendId,
      content: text,
      messageType: 'text',
    };
    if (validReplyId) payload.replyToMessageId = validReplyId;

    pendingSendsRef.current.set(String(tempId), {
      receiverId: selectedFriendId,
      content: text,
      replyToMessageId: validReplyId,
    });
    armSendTimeout(String(tempId));
    emit('friend:send', payload);
  };

  const openCalendarForFriend = useCallback(
    (opts = {}) => {
      if (!currentFriend?.id) return;
      if (isCurrentFriendBlocked) {
        toast.error(t('friendChat.scheduleBlockedError'));
        return;
      }
      navigate('/calendar', {
        state: {
          source: 'friend-chat',
          friendId: String(currentFriend.id),
          friendName: currentFriend.name || '',
          prefillType: opts.prefillType || 'reminder',
          prefillTitle:
            opts.prefillTitle ||
            t('friendChat.reminderDefaultTitle', { name: currentFriend.name || '' }),
          prefillAttendees: [currentFriend.name].filter(Boolean),
        },
      });
    },
    [currentFriend, isCurrentFriendBlocked, navigate, t]
  );

  const composerMentionItems = useMemo(
    () =>
      viewFriendsEnriched.slice(0, 40).map((f) => ({
        value: f.id,
        label: f.name || f.username || 'User',
        avatar: f.avatar,
      })),
    [viewFriendsEnriched]
  );

  useEffect(() => {
    if (!selectedFriendId || landingDemo) return undefined;
    const id = String(selectedFriendId);
    let cancelled = false;
    (async () => {
      try {
        const ur = await userService.getProfile(id);
        const raw = ur?.data ?? ur;
        const p = raw?.data ?? raw;
        if (cancelled || !p) return;
        setFriendProfiles((prev) => ({
          ...prev,
          [id]: {
            avatar: p.avatar || prev[id]?.avatar,
            name: p.displayName || p.fullName || p.username || prev[id]?.name,
            phone: p.phone || '',
            email: p.email || '',
            username: p.username || '',
          },
        }));
      } catch {
        /* giữ snapshot từ GET /friends */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFriendId, landingDemo]);

  useEffect(() => {
    setMediaViewer({ open: false, index: 0 });
  }, [selectedFriendId]);

  const friendAttachments = useMemo(
    () =>
      buildFriendChatAttachments(messages, {
        fileFallback: t('friendChat.fileAttachment'),
      }),
    [messages, t]
  );

  const openMediaViewerForMessage = useCallback(
    (messageId) => {
      const idx = findViewerIndex(friendAttachments.viewerItems, messageId);
      setMediaViewer({ open: true, index: idx });
    },
    [friendAttachments.viewerItems]
  );

  const openMediaViewerAtGrid = useCallback(
    (gridIndex) => {
      const item = friendAttachments.mediaItems[gridIndex];
      if (!item) return;
      const idx = findViewerIndex(friendAttachments.viewerItems, item.id);
      setMediaViewer({ open: true, index: idx });
    },
    [friendAttachments.mediaItems, friendAttachments.viewerItems]
  );

  const jumpToMessage = useCallback((messageId) => {
    if (!messageId) return;
    const el = document.querySelector(`[data-dm-message-id="${String(messageId)}"]`);
    if (!el) {
      toast.error(t('friendChat.jumpToMessageFail'));
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-cyan-500/70', 'rounded-md');
    window.setTimeout(() => {
      el.classList.remove('ring-2', 'ring-cyan-500/70', 'rounded-md');
    }, 2200);
  }, [t]);

  const requestDeleteMessage = (messageId) => {
    if (!messageId) return;
    setDeleteMsgConfirmId(messageId);
  };

  const handleForwardRequest = (msg) => {
    setMediaViewer({ open: false, index: 0 });
    setForwardSourceMessage(msg);
    setForwardModalOpen(true);
  };

  const handleAttachmentAction = useCallback(
    async (action, payload = {}) => {
      const { messageId, url, name, message } = payload;
      switch (action) {
        case 'open':
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
          break;
        case 'copy': {
          const mt = String(message?.messageType || '').toLowerCase();
          const isImage =
            mt === 'image' ||
            (url && /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url.split('?')[0]));
          if (isImage && url) {
            const result = await copyImageToClipboard(url);
            if (result === 'image') toast.success(t('friendChat.mediaCopyOk'));
            else if (result === 'url') toast.success(t('friendChat.mediaCopyLinkOk'));
            else toast.error(t('friendChat.mediaCopyFail'));
          } else if (url) {
            try {
              await navigator.clipboard.writeText(url);
              toast.success(t('friendChat.mediaCopyOk'));
            } catch {
              toast.error(t('friendChat.mediaCopyFail'));
            }
          }
          break;
        }
        case 'share':
          if (message) handleForwardRequest(message);
          else toast.error(t('friendChat.forwardFail'));
          break;
        case 'jumpToMessage':
          setMediaViewer({ open: false, index: 0 });
          jumpToMessage(messageId);
          break;
        case 'saveDevice':
          if (url) {
            await downloadToDisk(url, name || guessNameFromUrl(url) || 'download');
            toast.success(t('friendChat.fileOk'));
          }
          break;
        case 'delete':
          if (message) requestDeleteMessage(messageId);
          else toast.error(t('friendChat.deleteFail'));
          break;
        default:
          break;
      }
    },
    [jumpToMessage, handleForwardRequest, requestDeleteMessage, t]
  );

  const sortedChatMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const pinnedMessagesForCurrentFriend = useMemo(() => {
    if (!pinnedMessageIdsCurrentFriend.length) return [];
    const pinnedSet = new Set(pinnedMessageIdsCurrentFriend.map(String));
    return sortedChatMessages
      .filter((m) => {
        const mid = m?._id || m?.id;
        return mid != null && pinnedSet.has(String(mid));
      })
      .sort((a, b) => {
        const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
  }, [pinnedMessageIdsCurrentFriend, sortedChatMessages]);

  const lastOutgoingForReceipt = useMemo(() => {
    if (!currentUserId) return null;
    for (let i = sortedChatMessages.length - 1; i >= 0; i--) {
      const m = sortedChatMessages[i];
      if (!isOutgoing(m, currentUserId)) continue;
      if (m._optimistic || m._sendStatus === 'pending' || m._sendStatus === 'failed') continue;
      if (m.isRecalled) continue;
      return m;
    }
    return null;
  }, [sortedChatMessages, currentUserId]);

  const filteredComposerEmojis = useMemo(() => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return COMPOSER_EMOJI_LIST;
    return COMPOSER_EMOJI_LIST.filter((emoji) => emoji.toLowerCase().includes(keyword));
  }, [emojiSearch]);

  const appendEmoji = (emoji) => {
    setMessage((prev) => `${prev || ''}${emoji}`);
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const clearUploadPreview = useCallback(() => {
    setUploadPreview((prev) => {
      if (prev?.objectUrl) URL.revokeObjectURL(prev.objectUrl);
      return null;
    });
  }, []);

  const performFileUpload = useCallback(
    async (file) => {
      if (!file || !selectedFriendId) return;
      setFailedUpload(null);
      setUploadProgress(0);
      try {
        const normalized = await uploadChatFileAndCreateMessage(
          api,
          file,
          {
            retentionContext: 'dm',
            receiverId: selectedFriendId,
          },
          (p) => setUploadProgress(p)
        );
        toast.success(t('friendChat.fileOk'));
        const id = normalized?._id || normalized?.id;
        setMessages((prev) => {
          if (id && prev.some((x) => String(x._id || x.id) === String(id))) {
            return prev;
          }
          return [...prev, normalized];
        });
        if (normalized) {
          setLastDmByFriendId((prev) =>
            mergeDmSnippetMap(prev, normalized, currentUserId, t)
          );
        }
      } catch (err) {
        setFailedUpload({ file });
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.fileFail') }));
      } finally {
        setUploadProgress(null);
      }
    },
    [selectedFriendId, currentUserId, t, setBlockedByPeer]
  );

  const queueFileForPreview = useCallback(
    (file) => {
      if (!file || !selectedFriendId) return;
      const isImage = (file.type || '').startsWith('image/');
      const objectUrl = isImage ? URL.createObjectURL(file) : null;
      setUploadPreview({ file, objectUrl, isImage });
    },
    [selectedFriendId]
  );

  const handleFriendFileSelected = (event) => {
    const file = event.target.files?.[0];
    if (event.target) event.target.value = '';
    if (!file) return;
    queueFileForPreview(file);
  };

  const confirmUploadPreview = () => {
    const file = uploadPreview?.file;
    clearUploadPreview();
    if (file) performFileUpload(file);
  };

  useEffect(() => () => clearUploadPreview(), [clearUploadPreview]);

  const formatTime = useCallback(
    (iso) => {
      if (!iso) return '';
      const d = new Date(iso);
      const LOCALE_TAG_EN = 'en-US';
      const LOCALE_TAG_VI = 'vi-VN';
      const loc = locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI;
      return d.toLocaleTimeString(loc, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    },
    [locale]
  );

  const unwrapPayload = (payload) => payload?.data ?? payload;

  const plainTextForMessage = (msg) => {
    if (!msg) return '';
    const mt = msg.messageType || 'text';
    if (mt === 'text') return String(msg.content || '');
    if (mt === 'file' || mt === 'image')
      return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || t('friendChat.attachment');
    if (mt === 'call_log') return t('friendChat.callLogPreview');
    return String(msg.content || '');
  };

  const visibleChatMessages = sortedChatMessages;

  const CHAT_NEAR_BOTTOM_PX = 64;

  const updateDmNearBottomState = useCallback(() => {
    const el = chatScrollRef.current;
    if (!el) {
      isNearBottomRef.current = true;
      setShowJumpToDmLatest(false);
      return;
    }
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
    if (maxScroll <= 4) {
      isNearBottomRef.current = true;
      setShowJumpToDmLatest(false);
      return;
    }
    const distFromBottom = maxScroll - el.scrollTop;
    const near = distFromBottom <= CHAT_NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    setShowJumpToDmLatest(!near);
  }, []);

  const handleDmChatScroll = useCallback(() => {
    updateDmNearBottomState();
  }, [updateDmNearBottomState]);

  const scrollDmChatToLatest = useCallback(
    (behavior = 'auto') => {
      const el = chatScrollRef.current;
      if (!el) return;
      const apply = () => {
        const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
        if (maxScroll > 0) {
          if (behavior === 'smooth') {
            el.scrollTo({ top: maxScroll, behavior: 'smooth' });
          } else {
            el.scrollTop = maxScroll;
          }
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior, block: 'end' });
        }
        isNearBottomRef.current = true;
        setShowJumpToDmLatest(false);
      };
      requestAnimationFrame(() => {
        apply();
        requestAnimationFrame(updateDmNearBottomState);
      });
    },
    [updateDmNearBottomState]
  );

  useEffect(() => {
    if (!selectedFriendId) return;
    isNearBottomRef.current = true;
    setShowJumpToDmLatest(false);
  }, [selectedFriendId]);

  useEffect(() => {
    if (!selectedFriendId || loadingMessages) return;
    scrollDmChatToLatest('auto');
  }, [selectedFriendId, loadingMessages, scrollDmChatToLatest]);

  useEffect(() => {
    if (!selectedFriendId || loadingMessages) return;
    if (!isNearBottomRef.current) return;
    scrollDmChatToLatest(sortedChatMessages.length > 0 ? 'smooth' : 'auto');
  }, [selectedFriendId, sortedChatMessages, loadingMessages, scrollDmChatToLatest]);

  const matchesDmMessage = useCallback(
    (m) => {
      if (!messageMatchesDmScope(m, dmScope)) return false;
      const q = dmMessageSearch.trim().toLowerCase();
      if (!q) return false;
      return plainTextForMessage(m).toLowerCase().includes(q);
    },
    [dmScope, dmMessageSearch]
  );

  const handleConversationSearchSelect = useCallback(
    (m) => {
      const mid = m?._id || m?.id;
      jumpToMessage(mid);
      setConversationSearchOpen(false);
    },
    [jumpToMessage]
  );

  /** Ảnh / file: không hiện sao chép. Còn lại: có nội dung chuỗi (kể cả link). */
  const canShowCopyTextInMenu = (msg) => {
    if (!msg) return false;
    const t = String(msg.messageType || 'text').toLowerCase();
    if (t === 'image' || t === 'file') return false;
    if (msg.fileMeta) return false;
    const raw = msg.content;
    if (raw == null) return false;
    const s = typeof raw === 'string' ? raw : String(raw);
    return s.trim().length > 0;
  };

  const handleMessageRowMouseEnter = (messageId, event) => {
    const el = event?.currentTarget;
    if (!el) return;
    const needBelow = shouldPlaceToolbarBelowBubble(el);
    const next = needBelow ? 'below' : 'above';
    setToolbarPlacementById((prev) => {
      const key = String(messageId);
      if (prev[key] === next) return prev;
      return { ...prev, [key]: next };
    });
  };

  const canEditDmMessage = (msg) => {
    if (!msg || msg._optimistic) return false;
    const t = msg.messageType || 'text';
    if (t !== 'text') return false;
    if (msg.fileMeta) return false;
    return true;
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId) return;
    try {
      const res = await api.patch(`/messages/${messageId}/edit`, { content: trimmed });
      const raw = unwrapPayload(res);
      const updated = raw?.data !== undefined ? raw.data : raw;
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      toast.success(t('friendChat.msgUpdated'));
      cancelEdit();
    } catch {
      toast.error(t('friendChat.editFail'));
    }
  };

  const confirmDeleteMessage = async () => {
    const messageId = deleteMsgConfirmId;
    if (!messageId) return;
    try {
      await api.delete(`/messages/${messageId}`);
      setMessages((prev) => prev.filter((m) => String(m._id || m.id) !== String(messageId)));
      toast.success(t('friendChat.msgDeleted'));
    } catch {
      toast.error(t('friendChat.deleteFail'));
    }
  };

  const forwardPreviewText = useMemo(() => {
    if (!forwardSourceMessage) return '';
    return formatMessagePreview(forwardSourceMessage, t);
  }, [forwardSourceMessage, t]);

  const handleForwardConfirm = async ({ friendIds, note }) => {
    if (!forwardSourceMessage || !friendIds?.length) return;
    const mt = String(forwardSourceMessage.messageType || 'text').toLowerCase();
    const isAttachment = mt === 'image' || mt === 'file';
    const rawContent = String(forwardSourceMessage.content || '').trim();
    const attachmentUrl = /^https?:\/\//i.test(rawContent) ? rawContent : '';
    const fromName = currentFriend?.name || t('friendChat.chatTitleFallback');
    const header = t('friendChat.forwardHeader', { name: fromName });
    setForwarding(true);
    try {
      for (const fid of friendIds) {
        if (note) {
          await api.post('/messages', {
            receiverId: fid,
            content: note,
            messageType: 'text',
          });
        }
        if (isAttachment && attachmentUrl) {
          await api.post('/messages', {
            receiverId: fid,
            content: attachmentUrl,
            messageType: mt === 'image' ? 'image' : 'file',
          });
        } else {
          const preview = formatMessagePreview(forwardSourceMessage, t);
          const body = [header, preview].filter(Boolean).join('\n\n');
          await api.post('/messages', {
            receiverId: fid,
            content: body,
            messageType: 'text',
          });
        }
      }
      toast.success(t('friendChat.forwardOk'));
      setForwardModalOpen(false);
      setForwardSourceMessage(null);
      const now = Date.now();
      const fwdPreview = formatMessagePreview(forwardSourceMessage, t);
      setLastDmByFriendId((prev) => {
        const next = { ...prev };
        friendIds.forEach((id) => {
          next[String(id)] = { at: now, preview: fwdPreview, isMine: true };
        });
        return next;
      });
    } catch {
      toast.error(t('friendChat.forwardFail'));
    } finally {
      setForwarding(false);
    }
  };

  const userAlreadyReacted = useCallback(
    (msg, emoji) => {
      const me = String(currentUserId || '').trim();
      if (!me || !emoji) return false;
      const rows = Array.isArray(msg?.reactions) ? msg.reactions : [];
      return rows.some(
        (r) =>
          String(r.emoji || '') === String(emoji) &&
          String(r.userId?._id || r.userId || '') === me
      );
    },
    [currentUserId]
  );

  const handleToggleReaction = async (msg, emoji) => {
    const messageId = msg?._id || msg?.id;
    if (!messageId || String(messageId).startsWith('temp-') || !emoji) return;
    const remove = userAlreadyReacted(msg, emoji);
    try {
      const resp = remove
        ? await dmMessageService.removeReaction(messageId, emoji)
        : await dmMessageService.addReaction(messageId, emoji);
      const updated = dmMessageService.unwrap(resp);
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
    } catch {
      toast.error(t('friendChat.reactionFail'));
    }
  };

  const handleQuickReactMessage = (msg, emoji) => {
    void handleToggleReaction(msg, emoji);
  };

  const confirmRecallMessage = async (messageId) => {
    if (!messageId) return;
    try {
      const resp = await dmMessageService.recallMessage(messageId);
      const updated = dmMessageService.unwrap(resp);
      setMessages((prev) =>
        prev.map((m) => (String(m._id || m.id) === String(messageId) ? { ...m, ...updated } : m))
      );
      toast.success(t('friendChat.recallOk'));
    } catch {
      toast.error(t('friendChat.recallFail'));
    }
  };

  const confirmBlockCurrentFriend = async () => {
    if (!selectedFriendId || landingDemo) return;
    setBlockingFriend(true);
    try {
      await friendService.blockFriend(selectedFriendId);
      toast.success(t('friendChat.blockOk'));
      setFriends((prev) =>
        prev.map((row) => {
          const uid = row.friendId?._id || row.friendId?.userId || row.friendId;
          if (String(uid || '') !== String(selectedFriendId)) return row;
          return { ...row, relationshipStatus: 'blocked' };
        })
      );
      refreshFriendsCache();
      refreshUnread();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.blockFail') }));
    } finally {
      setBlockingFriend(false);
    }
  };

  const confirmUnblockCurrentFriend = async () => {
    if (!selectedFriendId || landingDemo) return;
    setUnblockingFriend(true);
    try {
      await friendService.unblockFriend(selectedFriendId);
      toast.success(t('friendChat.unblockOk'));
      setBlockedByPeer(false);
      refreshFriendsCache();
      refreshUnread();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('friendChat.unblockFail') }));
    } finally {
      setUnblockingFriend(false);
    }
  };

  const toggleArchiveCurrentFriend = useCallback(() => {
    if (!currentFriendKey) return;
    const next = archivedFriendIds.includes(currentFriendKey)
      ? archivedFriendIds.filter((id) => id !== currentFriendKey)
      : [...archivedFriendIds, currentFriendKey];
    saveIdList(DM_ARCHIVE_STORAGE_KEY, next);
    setArchivedFriendIds(next);
    toast.success(
      archivedFriendIds.includes(currentFriendKey)
        ? t('friendChat.unarchiveOk')
        : t('friendChat.archiveOk')
    );
  }, [archivedFriendIds, currentFriendKey, t]);

  const replyLabelForDm = (msg) => {
    if (!msg) return t('friendChat.friendDefault');
    const sid = msg.senderId?._id || msg.senderId;
    if (String(sid || '') === String(currentUserId || '')) return t('common.you');
    return currentFriend?.name || t('friendChat.friendDefault');
  };

  const chatShell = isDarkMode
    ? 'flex h-screen overflow-hidden bg-background text-foreground'
    : `flex h-screen overflow-hidden ${appShellBg(false)} text-foreground`;
  const chatInner = suiteLayout
    ? `${FIGMA_CHAT_ROOT} min-h-0 flex-1`
    : `${FIGMA_CHAT_ROOT} min-h-0 min-w-0 flex-1 gap-2 p-2`;
  const emptyText = 'text-muted-foreground';
  const headerAccent = 'text-primary';
  const avatarTile = FIGMA_CHAT_HEADER_AVATAR;
  const replyBanner = FIGMA_CHAT_REPLY_BANNER;
  const composerWrap =
    'shrink-0 rounded-[18px] border border-border bg-surface px-3 py-1.5 shadow-[0_8px_24px_rgba(15,23,42,0.10)]';
  const composerIconBtn =
    'w-8 text-muted-foreground hover:bg-muted hover:text-primary';
  const composerSendBtn =
    'h-10 w-10 rounded-xl bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50';
  const emojiModalPanel = isDarkMode
    ? 'fixed bottom-24 right-8 z-50 h-[420px] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface-overlay shadow-2xl'
    : 'fixed bottom-24 right-8 z-50 h-[420px] w-[min(520px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl';

  const chatSidebar = (
        <aside className={FIGMA_CHAT_SIDEBAR}>
          <div className={FIGMA_CHAT_SIDEBAR_HEAD}>
            {suiteLayout ? (
              <>
                <FriendChatSidebarTabs
                  activeTab={sidebarMainTab}
                  onTabChange={setSidebarMainTab}
                  messagesBadge={totalDmUnread}
                  invitesBadge={showFriendInvites ? pendingCount : 0}
                  showColleagues={showColleagueDirectory}
                  showInvites={showFriendInvites}
                  onNewMessage={() => {
                    if (showColleagueDirectory) setShowNewDmModal(true);
                    else setShowAddFriendModal(true);
                  }}
                  newMessageTitle={
                    showColleagueDirectory
                      ? t('friendChat.newDmTitle')
                      : t('friendChat.addFriendTitle')
                  }
                />
                {sidebarMainTab === 'messages' ? (
                  <div className={FIGMA_CHAT_SIDEBAR_SEARCH_WRAP}>
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <input
                      id="friend-rail-search"
                      aria-label={t('friendChat.searchFriendsAria')}
                      value={friendRailSearch}
                      onChange={(e) => setFriendRailSearch(e.target.value)}
                      placeholder={t('friendChat.searchFriendsPlaceholder')}
                      className={FIGMA_CHAT_SIDEBAR_SEARCH}
                    />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <p className={FIGMA_CHAT_SIDEBAR_TITLE}>
                    {showArchivedRail ? t('friendChat.archivedRailTitle') : t('friendChat.railTitle')}
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowArchivedRail((v) => !v)}
                    className={FIGMA_CHAT_SIDEBAR_ARCHIVE_BTN}
                  >
                    {showArchivedRail ? t('friendChat.showActiveChats') : t('friendChat.showArchived')}
                  </button>
                </div>
                <PageSearchBar
                  value={friendRailSearch}
                  onChange={setFriendRailSearch}
                  placeholder={t('friendChat.searchFriendsPlaceholder')}
                  isDarkMode={isDarkMode}
                  id="friend-rail-search"
                  aria-label={t('friendChat.searchFriendsAria')}
                  size="sm"
                  variant="subtle"
                />
              </>
            )}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {suiteLayout && sidebarMainTab === 'messages' ? (
            <FriendChatFilterChips value={railFilterTab} onChange={setRailFilterTab} />
          ) : null}
          {suiteLayout && showFriendInvites && sidebarMainTab === 'invites' ? (
            <FriendChatInvitesPanel
              received={receivedInviteRows}
              sent={sentInviteRows}
              loading={
                (pendingCount > 0 && receivedInviteRows.length === 0 && !pendingList?.length) ||
                sentInvitesQuery.isLoading
              }
              actingKey={inviteActingKey}
              onAccept={handleAcceptInvite}
              onReject={handleRejectInvite}
              onWithdraw={handleWithdrawInvite}
              emptyReceivedTitle={t('friendChat.pendingRequestsTitle')}
              emptyReceivedHint={t('friendChat.pendingWantsFriend')}
            />
          ) : suiteLayout && showColleagueDirectory && sidebarMainTab === 'colleagues' ? (
            <ColleagueDirectoryRail
              orgId={directoryOrgId}
              currentUserId={currentUserId}
              selectedUserId={selectedFriendId}
              onlineUsers={onlineUsers}
              onSelectColleague={openColleagueDm}
            />
          ) : (
          <div className={FIGMA_CHAT_SIDEBAR_LIST}>
            {friendsLoading ? (
              <div className={`px-3.5 py-4 text-center text-xs leading-relaxed ${emptyText}`}>
                {t('friendChat.loadingRail')}
              </div>
            ) : (
              filteredViewFriends.map((f) => {
                const active = selectedFriendId === f.id;
                const fid = String(f.id || '');
                const isMuted = fid ? mutedFriendIds.includes(fid) : false;
                const isPinned = fid ? pinnedFriendIds.includes(fid) : false;
                const isBlocked = Boolean(f.isBlockedByMe);
                const unreadCount = isBlocked ? 0 : fid ? Number(unreadByPeer[fid] || 0) : 0;
                const hasUnread = unreadCount > 0;
                return (
                  <button
                    key={f.listKey}
                    type="button"
                    onClick={() => setSelectedFriendId(f.id)}
                    title={f.name}
                    aria-label={t('friendChat.openChatAria', { name: f.name })}
                    aria-current={active ? 'true' : undefined}
                    className={`${FIGMA_CHAT_RAIL_ITEM} ${active ? FIGMA_CHAT_RAIL_ITEM_ACTIVE : ''}`}
                  >
                    <UserAvatar
                      avatar={f.avatar}
                      userId={f.id}
                      name={f.name}
                      size="md"
                      showOnline
                      status={f.status}
                      ringClassName="border border-border bg-muted shadow-inner"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-1">
                          <div className={hasUnread ? FIGMA_CHAT_RAIL_NAME_UNREAD : FIGMA_CHAT_RAIL_NAME}>
                            {f.name}
                          </div>
                          {isMuted && (
                            <BellOff className={`h-3 w-3 shrink-0 ${emptyText}`} aria-hidden />
                          )}
                          {isBlocked && (
                            <Ban
                              className="h-3 w-3 shrink-0 text-destructive"
                              aria-label={t('friendChat.blockedRailLabel')}
                            />
                          )}
                        </div>
                        {f.lastAt ? (
                          <span className={FIGMA_CHAT_RAIL_TIME}>
                            {formatRailTime(f.lastAt, locale, t)}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-1">
                        <p className={hasUnread ? FIGMA_CHAT_RAIL_PREVIEW_UNREAD : FIGMA_CHAT_RAIL_PREVIEW}>
                          {isBlocked
                            ? t('friendChat.blockedRailLabel')
                            : f.lastPreview
                              ? `${f.lastIsMine ? t('friendChat.railYouPrefix') : ''}${f.lastPreview}`
                              : f.subtitle}
                        </p>
                        <div className="flex shrink-0 items-center gap-1">
                          {unreadCount > 0 && (
                            <span className={FIGMA_CHAT_UNREAD_BADGE}>
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </span>
                          )}
                          {isPinned && (
                            <Pin
                              className="h-3 w-3 shrink-0 text-warning"
                              aria-label="Pinned"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
            {!friendsLoading && viewFriends.length === 0 && (
              <div className={`px-3.5 py-4 text-center text-xs leading-relaxed ${emptyText}`}>
                {t('friendChat.emptyRail')}
              </div>
            )}
            {!friendsLoading && viewFriends.length > 0 && filteredViewFriends.length === 0 && (
              <div className={`px-3.5 py-4 text-center text-xs leading-relaxed ${emptyText}`}>
                {t('friendChat.friendSearchNoMatch')}
              </div>
            )}
          </div>
          )}
          {!landingDemo && !suiteLayout && (
            <FriendPendingRequestsRail
              isDarkMode={isDarkMode}
              defaultExpanded={showPendingRequestsRail}
              onAccepted={(item) => {
                if (item?.id) setSelectedFriendId(item.id);
                refreshFriendsCache();
              }}
            />
          )}
          </div>
        </aside>
  );

  const chatMainColumn = (
    <>
          <div className={`${FIGMA_CHAT_MAIN_PANEL} min-h-0`}>
          <div className={FIGMA_CHAT_MAIN_INNER}>
          {suiteLayout && showFriendInvites && sidebarMainTab === 'invites' ? (
            <div className={FIGMA_CHAT_INVITES_PLACEHOLDER}>
              <div className="text-4xl" aria-hidden>
                👥
              </div>
              <div className="text-[0.9375rem] font-semibold text-foreground">
                Quản lý lời mời kết bạn
              </div>
              <p className="max-w-[260px] text-[0.8125rem] leading-relaxed text-muted-foreground">
                Chấp nhận lời mời để bắt đầu trò chuyện, hoặc thu hồi lời mời đã gửi từ danh sách bên trái.
              </p>
            </div>
          ) : friendsLoading ? (
            <div className={FIGMA_CHAT_EMPTY}>
              {t('friendChat.loadingFriends')}
            </div>
          ) : viewFriends.length === 0 && !selectedFriendId ? (
            <div className={`${FIGMA_CHAT_EMPTY} flex flex-col items-center gap-3 px-4 text-center`}>
              <p>{t('friendChat.emptyMain')}</p>
              {showColleagueDirectory ? (
                <button
                  type="button"
                  className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-95"
                  onClick={() => setShowNewDmModal(true)}
                >
                  {t('friendChat.newDmCta')}
                </button>
              ) : null}
            </div>
          ) : resolvingDefaultChat ? (
            <div className={FIGMA_CHAT_EMPTY}>{t('friendChat.openingChat')}</div>
          ) : !currentFriend ? (
            <div className={FIGMA_CHAT_EMPTY}>{t('friendChat.pickFriend')}</div>
          ) : (
            <>
              <header className={FIGMA_CHAT_HEADER}>
                <div className={FIGMA_CHAT_HEADER_ROW}>
                  <UserAvatar
                    avatar={currentFriend.avatar}
                    userId={currentFriend.id}
                    name={currentFriend.name}
                    size="lg"
                    showOnline
                    status={currentFriend.status}
                    onClick={() => setProfileModalOpen(true)}
                    ringClassName={`${avatarTile} cursor-pointer`}
                    title={t('friendChat.profileTitle')}
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className={FIGMA_CHAT_HEADER_NAME}>{currentFriend.name}</h2>
                    <div className={FIGMA_CHAT_HEADER_META} aria-live="polite">
                      {isCurrentFriendBlocked ? (
                        <span className={FIGMA_CHAT_HEADER_STATUS}>{t('friendChat.blockedRailLabel')}</span>
                      ) : peerTyping ? (
                        <span className={FIGMA_CHAT_HEADER_TYPING}>{t('friendChat.typing')}</span>
                      ) : (
                        <>
                          <span
                            className={`${FIGMA_CHAT_STATUS_DOT} ${figmaChatStatusDotColor(currentFriend.status)}`}
                            aria-hidden
                          />
                          <span className={FIGMA_CHAT_HEADER_STATUS}>
                            {currentFriend.status === 'online'
                              ? t('friendChat.online')
                              : t('friendChat.offline')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className={FIGMA_CHAT_HEADER_ACTIONS}>
                    <button
                      type="button"
                      title={t('friendChat.openConversationList')}
                      onClick={() => setSidebarDrawerOpen(true)}
                      className={`${FIGMA_CHAT_ICON_BTN} lg:hidden`}
                      aria-label={t('friendChat.openConversationList')}
                    >
                      <PanelLeft className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.callAudio')}
                      onClick={() => startFriendCall('audio')}
                      disabled={Boolean(outboundRinging?.callId) || isDmComposerLocked}
                      className={FIGMA_CHAT_ICON_BTN_PHONE}
                    >
                      <Phone className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.callVideo')}
                      onClick={() => startFriendCall('video')}
                      disabled={Boolean(outboundRinging?.callId) || isDmComposerLocked}
                      className={FIGMA_CHAT_ICON_BTN_VIDEO}
                    >
                      <Video className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={isCurrentFriendMuted ? t('friendChat.footerUnmute') : t('friendChat.convoNotif')}
                      onClick={toggleMuteCurrentFriend}
                      className={FIGMA_CHAT_ICON_BTN}
                    >
                      {isCurrentFriendMuted ? (
                        <BellOff className="h-4 w-4" strokeWidth={2} />
                      ) : (
                        <Bell className="h-4 w-4" strokeWidth={2} />
                      )}
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.viewPinnedMessages')}
                      onClick={() => setPinnedMessagesModalOpen(true)}
                      className={FIGMA_CHAT_ICON_BTN}
                    >
                      <Pin className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.openConversationSearch')}
                      onClick={() => setConversationSearchOpen((v) => !v)}
                      className={
                        conversationSearchOpen ? FIGMA_CHAT_ICON_BTN_ACTIVE : FIGMA_CHAT_ICON_BTN
                      }
                      aria-label={t('friendChat.openConversationSearch')}
                    >
                      <Search className="h-4 w-4" strokeWidth={2} />
                    </button>
                    <button
                      type="button"
                      title={t('friendChat.profileTitle')}
                      onClick={() => setRightPanelDrawerOpen(true)}
                      className={`${FIGMA_CHAT_ICON_BTN} lg:hidden`}
                      aria-label={t('friendChat.profileTitle')}
                    >
                      <Info className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                </div>
                {blockedByPeer && !isCurrentFriendBlocked && (
                  <div
                    className={`mt-3 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isDarkMode
                        ? 'border-amber-500/35 bg-amber-500/10 text-amber-100'
                        : 'border-amber-200 bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1">{t('friendChat.blockedByPeerBanner')}</span>
                  </div>
                )}
                {isCurrentFriendBlocked && (
                  <div
                    className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                      isDarkMode
                        ? 'border-rose-500/35 bg-rose-500/10 text-rose-100'
                        : 'border-rose-200 bg-rose-50 text-rose-900'
                    }`}
                  >
                    <span className="min-w-0 flex-1">{t('friendChat.blockedBanner')}</span>
                    <button
                      type="button"
                      onClick={() => setUnblockConfirmOpen(true)}
                      disabled={unblockingFriend}
                      className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-rose-500/20 text-rose-100 hover:bg-rose-500/30'
                          : 'bg-white text-rose-800 hover:bg-rose-100'
                      }`}
                    >
                      {t('friendChat.unblockConfirmBtn')}
                    </button>
                  </div>
                )}
              </header>
              <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
                <div
                  ref={chatScrollRef}
                  className={FIGMA_CHAT_MESSAGES}
                  onScroll={handleDmChatScroll}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const file = e.dataTransfer?.files?.[0];
                    if (file) handleFriendFileSelected({ target: { files: [file], value: '' } });
                  }}
                >
                  <div className={FIGMA_CHAT_MESSAGES_INNER}>
                    <div className={FIGMA_CHAT_MESSAGES_STACK}>
                      {loadingMessages ? (
                        <div className={`flex min-h-[30vh] items-center justify-center text-center ${emptyText}`}>
                          {t('friendChat.loadingMessages')}
                        </div>
                      ) : (
                        <>
                          {hasMoreOlder && (
                            <div className="flex justify-center pb-2">
                              <button
                                type="button"
                                onClick={loadOlderMessages}
                                disabled={loadingOlder}
                                className={FIGMA_CHAT_LOAD_OLDER}
                              >
                                {loadingOlder ? t('friendChat.loadingOlder') : t('friendChat.loadOlder')}
                              </button>
                            </div>
                          )}
                  {visibleChatMessages.map((m, idx) => {
                    const mid = m._id || m.id;
                    const rawSender = m.senderId?._id || m.senderId || '';
                    const senderId = String(rawSender);
                    const myId = currentUserId ? String(currentUserId) : null;

                    const isMine = myId && senderId === myId;

                    const prev = idx > 0 ? visibleChatMessages[idx - 1] : null;
                    const showDayDivider =
                      !prev || messageDayKey(m.createdAt) !== messageDayKey(prev.createdAt);

                    const prevSenderId = prev
                      ? String(prev.senderId?._id || prev.senderId || '')
                      : '';
                    const prevSame =
                      !showDayDivider && prev && prevSenderId === senderId;

                    const replyId = m.replyToMessageId;
                    const parentMsg = replyId
                      ? [...messages].find((x) => String(x._id || x.id) === String(replyId))
                      : null;
                    const replyPreview = parentMsg
                      ? plainTextForMessage(parentMsg).slice(0, 160)
                      : t('friendChat.threadRoot');
                    const isEditing = editingMessageId && String(editingMessageId) === String(mid);
                    const showToolbar = !isEditing && uploadProgress == null;
                    const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                    const receiptMsg = lastOutgoingForReceipt;
                    const showReadReceipt =
                      isMine &&
                      receiptMsg &&
                      String(mid) === String(receiptMsg._id || receiptMsg.id);
                    const readReceiptLabel = receiptMsg?.isRead
                      ? t('friendChat.readReceipt')
                      : t('friendChat.sentReceipt');
                    const sendFailed = isMine && m._sendStatus === 'failed';
                    const sendPending = isMine && m._sendStatus === 'pending';
                    const reactionRows = Array.isArray(m.reactions) ? m.reactions : [];

                    return (
                      <Fragment key={mid != null && mid !== '' ? String(mid) : `dm-msg-${idx}`}>
                        {showDayDivider && (
                          <div className={FIGMA_CHAT_DATE_DIVIDER_ROW}>
                            <div className={FIGMA_CHAT_DATE_DIVIDER_LINE} aria-hidden />
                            <span className={FIGMA_CHAT_DATE_DIVIDER_LABEL}>
                              {formatDateDividerLabel(m.createdAt)}
                            </span>
                            <div className={FIGMA_CHAT_DATE_DIVIDER_LINE} aria-hidden />
                          </div>
                        )}
                        <div
                          data-dm-message-id={mid != null ? String(mid) : undefined}
                          className={figmaChatBubbleRow(isMine, prevSame)}
                          onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                        >
                          {showToolbar && (
                            <div
                              className={`${FIGMA_CHAT_BUBBLE_TOOLBAR} ${
                                isMine
                                  ? FIGMA_CHAT_BUBBLE_TOOLBAR_MINE
                                  : FIGMA_CHAT_BUBBLE_TOOLBAR_THEIRS
                              } ${
                                toolbarPlace === 'below'
                                  ? 'top-full mt-1 translate-y-0'
                                  : ''
                              }`}
                            >
                              <ChannelMessageToolbar
                                compact
                                recentReactionsStorageKey="vh_dm_recent_reactions"
                                isMine={isMine}
                                showEdit={isMine && canEditDmMessage(m)}
                                disabled={uploadProgress != null}
                                onQuickReact={(emoji) => handleQuickReactMessage(m, emoji)}
                                onOpenEmojiPicker={() => {}}
                                onMiddleAction={() => {
                                  if (isMine && canEditDmMessage(m)) {
                                    setEditingMessageId(mid);
                                    setEditDraft(String(m.content || ''));
                                  } else {
                                    setReplyingToMessage(m);
                                  }
                                }}
                                onForward={() => handleForwardRequest(m)}
                                onMore={(e) => {
                                  const r = e?.currentTarget?.getBoundingClientRect?.();
                                  if (r) {
                                    setMoreMenu({ open: true, anchorRect: r, message: m });
                                  }
                                }}
                              />
                            </div>
                          )}
                          {!isMine && (
                            <div
                              className={`${FIGMA_CHAT_BUBBLE_AVATAR_SLOT} ${
                                prevSame ? FIGMA_CHAT_BUBBLE_AVATAR_HIDDEN : ''
                              }`}
                            >
                              <UserAvatar
                                avatar={currentFriend?.avatar}
                                userId={currentFriend?.id}
                                name={currentFriend?.name}
                                size="sm"
                                ringClassName="border border-border bg-muted text-foreground shadow-inner"
                              />
                            </div>
                          )}
                          <div className={figmaChatBubbleCol(isMine)}>
                            <div className={figmaChatBubble(isMine)}>
                              {replyId && (
                                <button
                                  type="button"
                                  onClick={() => jumpToMessage(replyId)}
                                  className={FIGMA_CHAT_BUBBLE_REPLY}
                                >
                                  <span className={FIGMA_CHAT_BUBBLE_REPLY_NAME}>
                                    @{replyLabelForDm(parentMsg || {})}{' '}
                                  </span>
                                  <span className="line-clamp-2">{replyPreview}</span>
                                </button>
                              )}
                              {isEditing ? (
                                <div className="space-y-2">
                                  <textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        submitEdit(mid);
                                      }
                                      if (e.key === 'Escape') cancelEdit();
                                    }}
                                    rows={3}
                                    className={`w-full resize-y rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary`}
                                  />
                                  <p className={`text-[11px] ${emptyText}`}>
                                    {t('friendChat.editEscape')}{' '}
                                    <button
                                      type="button"
                                      className={`${headerAccent} hover:underline`}
                                      onClick={cancelEdit}
                                    >
                                      {t('friendChat.editCancel')}
                                    </button>
                                    {' • '}
                                    {t('friendChat.editEnter')}{' '}
                                    <button
                                      type="button"
                                      className={`${headerAccent} hover:underline`}
                                      onClick={() => submitEdit(mid)}
                                    >
                                      {t('friendChat.editSave')}
                                    </button>
                                  </p>
                                </div>
                              ) : m.isRecalled ? (
                                <p className={`text-sm italic ${emptyText}`}>
                                  {t('friendChat.recalledPlaceholder')}
                                </p>
                              ) : (
                                <ChatMessageAttachmentBody
                                  message={m}
                                  mentionVariant="friend"
                                  currentUserId={currentUserId}
                                  onFriendCallBack={handleFriendCallBackFromLog}
                                  onImageClick={(_url, messageId) => openMediaViewerForMessage(messageId)}
                                />
                              )}
                            </div>
                            {reactionRows.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {Object.entries(
                                  reactionRows.reduce((acc, r) => {
                                    const em = r.emoji;
                                    if (!em) return acc;
                                    acc[em] = (acc[em] || 0) + 1;
                                    return acc;
                                  }, {})
                                ).map(([em, count]) => {
                                  const mineReact = userAlreadyReacted(m, em);
                                  return (
                                    <button
                                      key={em}
                                      type="button"
                                      title={
                                        mineReact
                                          ? t('friendChat.reactionRemoveHint')
                                          : t('friendChat.reactionAddHint')
                                      }
                                      onClick={() => handleToggleReaction(m, em)}
                                      className={
                                        mineReact && isMine
                                          ? FIGMA_CHAT_REACTION_MINE
                                          : FIGMA_CHAT_REACTION
                                      }
                                    >
                                      <span>{em}</span>
                                      <span className="text-[0.6875rem] font-semibold tabular-nums">
                                        {count}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                            {(sendPending || sendFailed) && (
                              <div className={`text-[0.6875rem] ${emptyText}`}>
                                {sendPending && <span>{t('friendChat.sending')}</span>}
                                {sendFailed && (
                                  <span className="text-destructive">
                                    {t('friendChat.sendFailed')}{' '}
                                    <button
                                      type="button"
                                      className="font-semibold underline"
                                      onClick={() => retrySend(m)}
                                    >
                                      {t('friendChat.retrySend')}
                                    </button>
                                  </span>
                                )}
                              </div>
                            )}
                            <div className={FIGMA_CHAT_BUBBLE_TIME}>
                              <span>{formatTime(m.createdAt)}</span>
                              {m.editedAt && (
                                <span>{t('friendChat.edited')}</span>
                              )}
                              {showReadReceipt && (
                                <span className="font-medium">{readReceiptLabel}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}
                          <div ref={messagesEndRef} className="h-px w-full shrink-0" aria-hidden />
                        </>
                      )}
                    </div>
                  </div>
                </div>
                {showJumpToDmLatest &&
                  visibleChatMessages.length > 0 &&
                  !loadingMessages &&
                  currentFriend && (
                    <button
                      type="button"
                      title={t('orgPanel.scrollToLatest')}
                      aria-label={t('orgPanel.scrollToLatest')}
                      onClick={() => scrollDmChatToLatest('smooth')}
                      className={FIGMA_CHAT_JUMP_BTN}
                    >
                      <ChevronsDown className="h-5 w-5" strokeWidth={2.25} />
                    </button>
                  )}
                {conversationSearchOpen && currentFriend && !resolvingDefaultChat && (
                  <div className="absolute bottom-0 right-0 top-0 z-40 flex w-[min(360px,92%)] border-l border-border bg-surface shadow-xl">
                    <ConversationSearchPanel
                      inline
                      hideScopeChips
                      open={conversationSearchOpen}
                      onClose={() => setConversationSearchOpen(false)}
                      isDarkMode={isDarkMode}
                      locale={locale}
                      query={dmMessageSearch}
                      onQueryChange={setDmMessageSearch}
                      scope={dmScope}
                      onScopeChange={setDmScope}
                      scopeOptions={dmScopeOptions}
                      messages={sortedChatMessages}
                      matchesMessage={matchesDmMessage}
                      onSelectMessage={handleConversationSearchSelect}
                      serverResults={
                        dmMessageSearch.trim().length >= 2 ? dmServerSearchFiltered : null
                      }
                      serverSearching={dmServerSearching}
                    />
                  </div>
                )}
              </div>
              <div className={FIGMA_CHAT_COMPOSER_WRAP}>
                {failedUpload?.file && uploadProgress == null && (
                  <div
                    className={`mb-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${
                      isDarkMode
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                        : 'border-rose-200 bg-rose-50 text-rose-800'
                    }`}
                  >
                    <span className="truncate">{t('friendChat.uploadFailed')}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold underline"
                      onClick={() => performFileUpload(failedUpload.file)}
                    >
                      {t('friendChat.retryUpload')}
                    </button>
                  </div>
                )}
                <ChatUploadProgressBar
                  percent={uploadProgress}
                  label={t('friendChat.uploadLabel')}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFriendFileSelected}
                />
                <UnifiedChatComposer
                  flatInner
                  rowClassName="flex items-center gap-2"
                  showSendButton={false}
                  mentionItems={composerMentionItems}
                  wrapperClassName={composerWrap}
                  topSlot={
                    replyingToMessage ? (
                      <div className={replyBanner}>
                        <div className="min-w-0">
                          <span className={emptyText}>{t('friendChat.replying')}</span>
                          <span className={`font-semibold ${headerAccent}`}>
                            {replyLabelForDm(replyingToMessage)}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setReplyingToMessage(null)}
                          className={`rounded-full p-1.5 transition ${emptyText} ${
                            isDarkMode ? 'hover:bg-white/10 hover:text-white' : 'hover:bg-slate-200 hover:text-slate-900'
                          }`}
                          aria-label={t('friendChat.cancelReplyAria')}
                        >
                          ✕
                        </button>
                      </div>
                    ) : null
                  }
                  value={message}
                  onChange={(v) => {
                    setMessage(v);
                    if (v.trim()) notifyTyping();
                  }}
                  onSend={handleSend}
                  onPaste={(e) => {
                    const file = e.clipboardData?.files?.[0];
                    if (file) {
                      e.preventDefault();
                      handleFriendFileSelected({ target: { files: [file], value: '' } });
                    }
                  }}
                  placeholder={
                    isDmComposerLocked
                      ? blockedByPeer
                        ? t('friendChat.composerBlockedByPeer')
                        : t('friendChat.composerBlocked')
                      : uploadProgress != null
                        ? t('friendChat.sendingFile')
                        : currentFriend
                          ? t('friendChat.placeholderDm', { name: currentFriend.name })
                          : t('friendChat.placeholderPick')
                  }
                  disabled={!selectedFriendId || uploadProgress != null || isDmComposerLocked}
                  sendDisabled={!message.trim() || isDmComposerLocked}
                  sendLabel={t('friendChat.send')}
                  leadingItems={[
                    {
                      key: 'upload-file',
                      title: t('friendChat.uploadFile'),
                      content: <Paperclip className="h-5 w-5" strokeWidth={2} />,
                      className: composerIconBtn,
                      onClick: () => fileInputRef.current?.click(),
                    },
                    {
                      key: 'upload-image',
                      title: t('friendChat.uploadImage'),
                      content: <ImageIcon className="h-5 w-5" strokeWidth={2} />,
                      className: composerIconBtn,
                      onClick: () => imageInputRef.current?.click(),
                    },
                    {
                      key: 'emoji',
                      title: t('friendChat.emojiTab'),
                      content: <Smile className="h-5 w-5" strokeWidth={2} />,
                      className: composerIconBtn,
                      onClick: () => {
                        setEmojiPickerTab('emoji');
                        setShowEmojiPicker((prev) => !prev);
                      },
                    },
                    {
                      key: 'mention',
                      title: t('friendChat.dmScopeMention'),
                      content: <AtSign className="h-5 w-5" strokeWidth={2} />,
                      className: composerIconBtn,
                      onClick: () => {
                        setMessage((prev) => `${prev || ''}${prev && !/\s$/.test(prev) ? ' ' : ''}@`);
                        notifyTyping();
                      },
                    },
                  ]}
                  actionItems={[
                    {
                      key: 'send',
                      title: t('friendChat.send'),
                      content: <Send className="h-5 w-5" strokeWidth={2} />,
                      disabled: !message.trim() || isDmComposerLocked || uploadProgress != null || !selectedFriendId,
                      className: composerSendBtn,
                      onClick: handleSend,
                    },
                  ]}
                />
                <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
                  Enter để gửi · Shift+Enter xuống dòng
                </p>

                {showEmojiPicker && (
                  <>
                    <button
                      type="button"
                      aria-label={t('friendChat.closeEmoji')}
                      onClick={() => setShowEmojiPicker(false)}
                      className="fixed top-0 right-0 bottom-0 left-[var(--vh-nav-rail-width,3.5rem)] z-40 cursor-default bg-black/30"
                    />
                    <div className={emojiModalPanel}>
                      <div
                        className={`flex items-center gap-2 border-b px-4 py-3 ${
                          isDarkMode ? 'border-slate-700' : 'border-slate-200'
                        }`}
                      >
                        {[
                          { id: 'gif', label: t('friendChat.gif') },
                          { id: 'sticker', label: t('friendChat.stickerTab') },
                          { id: 'emoji', label: t('friendChat.emojiTab') },
                        ].map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setEmojiPickerTab(tab.id)}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                              emojiPickerTab === tab.id
                                ? isDarkMode
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-cyan-600 text-white'
                                : isDarkMode
                                  ? 'text-gray-300 hover:bg-slate-800/70'
                                  : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <div className="border-b border-slate-700 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <input
                            value={emojiSearch}
                            onChange={(e) => setEmojiSearch(e.target.value)}
                            placeholder={t('friendChat.emojiSearchPh')}
                            className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                          />
                        </div>
                      </div>

                      <div className="h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
                        {emojiPickerTab !== 'emoji' ? (
                          <div className="flex h-full items-center justify-center text-sm text-gray-400">
                            {t('friendChat.emojiBetaMsg')}
                          </div>
                        ) : (
                          <div className="grid grid-cols-9 gap-2">
                            {filteredComposerEmojis.map((emoji, idx) => (
                              <button
                                key={`${emoji}-${idx}`}
                                type="button"
                                onClick={() => appendEmoji(emoji)}
                                className="h-11 rounded-lg bg-[#111a2c] text-2xl transition hover:bg-slate-700/80"
                              >
                                {emoji}
                              </button>
                            ))}
                            {filteredComposerEmojis.length === 0 && (
                              <div className="col-span-9 rounded-lg border border-dashed border-slate-700 px-3 py-6 text-center text-sm text-gray-400">
                                {t('friendChat.emojiNoMatch')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          </div>

          <ChannelMessageMoreMenu
            open={moreMenu.open}
            anchorRect={moreMenu.anchorRect}
            onClose={() => setMoreMenu({ open: false, anchorRect: null, message: null })}
            isMine={
              moreMenu.message
                ? String(moreMenu.message?.senderId?._id || moreMenu.message?.senderId || '') ===
                  String(currentUserId || '')
                : false
            }
            canCopy={canShowCopyTextInMenu(moreMenu.message)}
            onCopyText={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              const raw = msg.content;
              if (raw == null) return;
              const s = typeof raw === 'string' ? raw : String(raw);
              const trimmed = s.trim();
              if (trimmed) navigator.clipboard.writeText(trimmed);
            }}
            onReply={() => moreMenu.message && setReplyingToMessage(moreMenu.message)}
            onForward={() => moreMenu.message && handleForwardRequest(moreMenu.message)}
            onPinToggle={() => {
              const msg = moreMenu.message;
              if (!msg) return;
              togglePinMessage(msg);
            }}
            pinLabel={
              (() => {
                const msg = moreMenu.message;
                const messageId = msg?._id || msg?.id;
                if (messageId == null) return t('friendChat.msgPinAction');
                return pinnedMessageIdsCurrentFriend.includes(String(messageId))
                  ? t('friendChat.msgUnpinAction')
                  : t('friendChat.msgPinAction');
              })()
            }
            onEdit={() => {
              const msg = moreMenu.message;
              if (!msg || !canEditDmMessage(msg)) return;
              setEditingMessageId(msg._id || msg.id);
              setEditDraft(String(msg.content || ''));
            }}
            onDelete={() => {
              const msg = moreMenu.message;
              if (msg) requestDeleteMessage(msg._id || msg.id);
            }}
            onRecall={() => {
              const msg = moreMenu.message;
              if (msg) confirmRecallMessage(msg._id || msg.id);
            }}
            /* D5: không truyền onCreateTask — ẩn AI extract task trên DM */
          />

          {/* Modal giữ mount an toàn nhưng không mở từ menu DM (D5). */}
          <CreateTaskFromAiModal
            isOpen={false}
            onClose={() => {
              setCreateTaskModalOpen(false);
              setCreateTaskSourceMessage(null);
            }}
            messageId={createTaskSourceMessage?._id || createTaskSourceMessage?.id}
            organizationId={defaultOrgIdForTask}
            currentUserId={currentUserId}
            messagePreview={
              createTaskSourceMessage ? plainTextForMessage(createTaskSourceMessage).slice(0, 500) : ''
            }
            onConfirmed={() => showToast(t('friendChat.taskFromAi'), 'success')}
          />

          <ForwardToFriendModal
            isOpen={forwardModalOpen}
            onClose={() => {
              setForwardModalOpen(false);
              setForwardSourceMessage(null);
            }}
            friends={viewFriends}
            excludeFriendId={selectedFriendId}
            previewText={forwardPreviewText}
            previewMessage={forwardSourceMessage}
            loading={false}
            submitting={forwarding}
            onConfirm={handleForwardConfirm}
          />
          </div>
    </>
  );

  const chatRightPanel =
    currentFriend && !resolvingDefaultChat && viewFriends.length > 0 ? (
      <FriendChatRightPanel
        friend={currentFriend}
        messages={messages}
        attachments={friendAttachments}
        currentUserId={currentUserId}
        onBlock={() => {
          if (isCurrentFriendBlocked) setUnblockConfirmOpen(true);
          else setBlockConfirmOpen(true);
        }}
        onSchedule={() =>
          openCalendarForFriend({
            prefillType: 'meeting',
            prefillTitle: t('friendChat.meetingPrefillTitle', {
              name: currentFriend.name || t('friendChat.friendDefault'),
            }),
          })
        }
        onArchive={toggleArchiveCurrentFriend}
        isArchived={archivedFriendIds.includes(String(currentFriend.id || ''))}
        isBlocked={isCurrentFriendBlocked}
        onOpenProfile={() => setProfileModalOpen(true)}
        onOpenMediaAt={openMediaViewerAtGrid}
        onViewAllMedia={() => setMediaViewer({ open: true, index: 0 })}
        onAttachmentAction={handleAttachmentAction}
        onOpenCalendarForFriend={openCalendarForFriend}
        onOpenMutualOrganization={openMutualOrganization}
      />
    ) : null;

  return (
    <>
      {suiteLayout ? (
        <FriendChatFigmaView
          sidebar={chatSidebar}
          main={chatMainColumn}
          rightPanel={chatRightPanel}
          sidebarDrawerOpen={sidebarDrawerOpen}
          onSidebarDrawerClose={() => setSidebarDrawerOpen(false)}
          sidebarDrawerCloseLabel={t('common.close')}
        />
      ) : (
        <div className={chatShell}>
          <NavigationSidebar landingDemo={landingDemo} />
          <div className={chatInner}>
            {chatSidebar}
            <div className="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {chatMainColumn}
              </div>
              {chatRightPanel ? (
                <div className="hidden min-h-0 shrink-0 lg:flex">{chatRightPanel}</div>
              ) : null}
            </div>
          </div>
        </div>
      )}
      {sidebarDrawerOpen && !suiteLayout ? (
        <div className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setSidebarDrawerOpen(false)}
          />
          <div className="absolute left-0 top-0 z-10 h-full max-w-full shadow-2xl [&>aside]:!flex">
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => setSidebarDrawerOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-lg bg-muted p-2 text-muted-foreground shadow-sm transition hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
            {chatSidebar}
          </div>
        </div>
      ) : null}
      {rightPanelDrawerOpen && chatRightPanel ? (
        <div className="fixed inset-0 z-[240] bg-black/40 backdrop-blur-[1px] lg:hidden">
          <button
            type="button"
            aria-label={t('common.close')}
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setRightPanelDrawerOpen(false)}
          />
          <div className="absolute right-0 top-0 z-10 h-full max-w-full shadow-2xl">
            <button
              type="button"
              aria-label={t('common.close')}
              onClick={() => setRightPanelDrawerOpen(false)}
              className="absolute right-3 top-3 z-20 rounded-lg bg-muted p-2 text-muted-foreground shadow-sm transition hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
            {chatRightPanel}
          </div>
        </div>
      ) : null}
      <FriendProfileModal
        isOpen={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        friend={currentFriend}
        onMessage={() => setProfileModalOpen(false)}
      />
      {mediaViewer.open && (
        <ChatMediaViewer
          items={friendAttachments.viewerItems}
          initialIndex={mediaViewer.index}
          messages={messages}
          currentUserId={currentUserId}
          onAttachmentAction={handleAttachmentAction}
          onClose={() => setMediaViewer({ open: false, index: 0 })}
        />
      )}
      <ChatUploadPreviewModal
        open={Boolean(uploadPreview?.file)}
        file={uploadPreview?.file}
        previewUrl={uploadPreview?.objectUrl}
        isDarkMode={isDarkMode}
        title={t('friendChat.uploadPreviewTitle')}
        confirmLabel={t('friendChat.send')}
        cancelLabel={t('nav.cancel')}
        onCancel={clearUploadPreview}
        onConfirm={confirmUploadPreview}
      />
      <Modal
        isOpen={pinnedMessagesModalOpen}
        onClose={() => setPinnedMessagesModalOpen(false)}
        title={t('friendChat.pinnedMessagesTitle')}
        size="md"
      >
        {pinnedMessagesForCurrentFriend.length === 0 ? (
          <p className={`py-6 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('friendChat.pinnedMessagesEmpty')}
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {pinnedMessagesForCurrentFriend.map((msg) => {
              const messageId = msg?._id || msg?.id;
              const senderName =
                String(msg?.senderId?._id || msg?.senderId || '') === String(currentUserId || '')
                  ? currentUserName
                  : currentFriend?.name || t('friendChat.friendDefault');
              return (
                <div
                  key={String(messageId)}
                  className={`rounded-xl border px-3 py-2 ${
                    isDarkMode ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className={`truncate text-xs font-semibold ${isDarkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {senderName}
                    </span>
                    <span className={`shrink-0 text-[11px] ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatTime(msg?.createdAt)}
                    </span>
                  </div>
                  <p className={`line-clamp-2 text-sm ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {plainTextForMessage(msg) || t('friendChat.attachmentMessageFallback')}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPinnedMessagesModalOpen(false);
                        jumpToMessage(messageId);
                      }}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode ? 'bg-cyan-600 text-white hover:bg-cyan-500' : 'bg-cyan-600 text-white hover:bg-cyan-700'
                      }`}
                    >
                      {t('friendChat.goToPinnedMessage')}
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePinMessage(msg)}
                      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                        isDarkMode
                          ? 'bg-white/10 text-slate-200 hover:bg-white/15'
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                      }`}
                    >
                      {t('friendChat.unpinShort')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        isOpen={deleteMsgConfirmId != null}
        onClose={() => setDeleteMsgConfirmId(null)}
        onConfirm={confirmDeleteMessage}
        title={t('friendChat.confirmDeleteTitle')}
        message={t('friendChat.confirmDeleteMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />
      <ConfirmDialog
        isOpen={blockConfirmOpen}
        onClose={() => !blockingFriend && setBlockConfirmOpen(false)}
        onConfirm={async () => {
          await confirmBlockCurrentFriend();
          setBlockConfirmOpen(false);
        }}
        title={t('friendChat.blockUser')}
        message={t('friendChat.blockConfirm', { name: currentFriend?.name || '' })}
        confirmText={t('friendChat.blockConfirmBtn')}
        cancelText={t('nav.cancel')}
      />
      <ConfirmDialog
        isOpen={unblockConfirmOpen}
        onClose={() => !unblockingFriend && setUnblockConfirmOpen(false)}
        onConfirm={async () => {
          await confirmUnblockCurrentFriend();
          setUnblockConfirmOpen(false);
        }}
        title={t('friendChat.unblockUser')}
        message={t('friendChat.unblockConfirm', { name: currentFriend?.name || '' })}
        confirmText={t('friendChat.unblockConfirmBtn')}
        cancelText={t('nav.cancel')}
      />
      {inlineToast && (
        <Toast
          message={inlineToast.message}
          type={inlineToast.type}
          onClose={() => setInlineToast(null)}
        />
      )}
      <AddFriendModal
        isOpen={showAddFriendModal && !showColleagueDirectory}
        onClose={() => setShowAddFriendModal(false)}
        onFriendlistChanged={() => {
          refreshFriendsCache();
          invalidateInviteQueries();
        }}
      />
      <NewColleagueDmModal
        isOpen={showNewDmModal && showColleagueDirectory}
        onClose={() => setShowNewDmModal(false)}
        orgId={directoryOrgId}
        currentUserId={currentUserId}
        onSelectColleague={openColleagueDm}
      />
    </>
  );
}

export default FriendChatPage;



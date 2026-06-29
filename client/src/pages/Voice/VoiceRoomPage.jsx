import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import {
  Calendar,
  ChevronUp,
  Clock,
  LayoutGrid,
  LogIn,
  Maximize2,
  MessageSquare,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  PhoneOff,
  PictureInPicture2,
  Plus,
  Search,
  Send,
  Settings,
  UserPlus,
  Users,
  Video,
  VideoOff,
  Wifi,
  X,
} from 'lucide-react';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import api from '../../services/api';
import { organizationAPI } from '../../services/api/organizationAPI';
import userService from '../../services/userService';
import friendService from '../../services/friendService';
import { useAuth } from '../../context/AuthContext';
import { useFriendCallSession } from '../../context/FriendCallSessionContext';
import { useTheme } from '../../context/ThemeContext';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  VoiceSessionRecorder,
  loadVoiceMeetingRecording,
  pruneVoiceMeetingRecordingsExcept,
  saveVoiceMeetingRecording,
} from '../../utils/voiceMeetingRecording';
import { MEETING_HISTORY_MAX_ITEMS } from '../../components/Voice/VoiceActiveRoomsList';
import { MIN_VOICE_RECORDING_SEC } from '../../utils/voiceRecordingUtils';
import { appShellBg } from '../../theme/shellTheme';
import { PageSearchBar } from '../../features/search';
import { useLocale } from '../../context/LocaleContext';
import {
  buildLayoutTiles,
  gridWrapperClass,
  soloTileWrapClass,
  tileItemClass,
} from './voiceMeetingLayout';
import VoiceAudioSettingsPanel from './VoiceAudioSettingsPanel';
import { buildAudioConstraints, loadVoiceAudioPrefs, saveVoiceAudioPrefs } from './voiceAudioPrefs';
import { bindAndPlayRemoteAudio, applyRemoteAudioElement } from './voiceRemoteAudio';
import { resolveAppOrigin } from '../../utils/browserOrigin';
import { emitNotificationsRefresh } from '../../services/notificationSync';
import UserAvatar from '../../components/Shared/UserAvatar';
import { isAvatarImageUrl } from '../../utils/avatarDisplay';
import {
  FIGMA_VOICE_CTRL_BTN,
  FIGMA_VOICE_CTRL_BTN_ACTIVE,
  FIGMA_VOICE_CTRL_BTN_DANGER,
  FIGMA_VOICE_CTRL_BTN_IDLE,
  FIGMA_VOICE_CTRL_DIVIDER,
  FIGMA_VOICE_CTRL_END,
  FIGMA_VOICE_CTRL_GROUP,
  FIGMA_VOICE_LOBBY_CREATE_CARD,
  FIGMA_VOICE_LOBBY_CREATE_ICON,
  FIGMA_VOICE_LOBBY_HEADER,
  FIGMA_VOICE_LOBBY_HEADER_ICON,
  FIGMA_VOICE_LOBBY_HEADER_TITLE,
  FIGMA_VOICE_LOBBY_JOIN_CARD,
  FIGMA_VOICE_LOBBY_LIVE_BADGE,
  FIGMA_VOICE_LOBBY_LIVE_DOT,
  FIGMA_VOICE_LOBBY_LIVE_TEXT,
  FIGMA_VOICE_LOBBY_PAGE_INNER,
  FIGMA_VOICE_LOBBY_PREJOIN_GRID,
  FIGMA_VOICE_LOBBY_PRIMARY_BTN,
  FIGMA_VOICE_LOBBY_ROOT,
  FIGMA_VOICE_LOBBY_SCROLL,
  FIGMA_VOICE_AVATAR_STACK,
  FIGMA_VOICE_AVATAR_STACK_CHIP,
  FIGMA_VOICE_AVATAR_STACK_OVERFLOW,
  FIGMA_VOICE_CHAT_INPUT,
  FIGMA_VOICE_CHAT_SEND_BTN,
  FIGMA_VOICE_GRID_AREA_INLINE,
  FIGMA_VOICE_GRID_SCROLL,
  FIGMA_VOICE_MAIN_ROW,
  FIGMA_VOICE_MODAL_BACKDROP,
  FIGMA_VOICE_MODAL_HEADER,
  FIGMA_VOICE_MODAL_SHELL,
  FIGMA_VOICE_PEOPLE_AVATAR,
  FIGMA_VOICE_PEOPLE_ROW,
  FIGMA_VOICE_SIDE_CLOSE_BTN,
  FIGMA_VOICE_SIDE_TAB_ROW,
  FIGMA_VOICE_STATUS_DOT,
  FIGMA_VOICE_TILE_AVATAR_FALLBACK,
  FIGMA_VOICE_TILE_BADGE_ROW,
  FIGMA_VOICE_TILE_BASE,
  FIGMA_VOICE_TILE_HOVER_BTN,
  FIGMA_VOICE_TILE_HOVER_BTN_DANGER,
  FIGMA_VOICE_TILE_HOVER_OVERLAY,
  FIGMA_VOICE_TILE_IDLE,
  FIGMA_VOICE_TILE_MUTE_BADGE,
  FIGMA_VOICE_TILE_NAME_BADGE,
  FIGMA_VOICE_TILE_ROLE_BADGE,
  FIGMA_VOICE_TILE_SPEAKING,
  FIGMA_VOICE_TILE_VIDEO,
  FIGMA_VOICE_TILE_YOU_BADGE,
  FIGMA_VOICE_TOP_CHANNEL,
  FIGMA_VOICE_TOP_DIVIDER,
  FIGMA_VOICE_TOP_META,
  FIGMA_VOICE_TOP_TITLE,
  FIGMA_VOICE_WIFI_BADGE,
  FIGMA_VOICE_WIFI_ICON,
  FIGMA_VOICE_WIFI_TEXT,
  figmaVoiceCtrlOuter,
  figmaVoiceCtrlPill,
  figmaVoiceGridArea,
  figmaVoiceGridClass,
  figmaVoiceSoloTileClass,
  figmaVoiceGridInner,
  figmaVoiceRoomRoot,
  figmaVoiceSidePanel,
  figmaVoiceSideTab,
  figmaVoiceTopBar,
} from '../../components/Voice/figmaVoiceClasses';
import VoiceSpeakingWaveform from '../../components/Voice/VoiceSpeakingWaveform';
import { voiceParticipantColor, voiceParticipantInitials } from '../../utils/voiceParticipantColor';
import { FIGMA_PAGE_SHELL } from '../../components/Layout/figmaPageClasses';
import VoiceLobbyView from '../../components/Voice/VoiceLobbyView';
import VoiceAiTranscribeControl from '../../components/Voice/VoiceAiTranscribeControl';
import VoiceMeetingTile from '../../components/Voice/VoiceMeetingTile';

/** Nút thanh họp: icon + (badge) + chevron + nhãn — tham chiếu layout Zoom/Teams (hình 1) */
function VoiceToolbarControl({
  label,
  icon: Icon,
  iconOff,
  onClick,
  chevron = true,
  badge,
  active = true,
  pressed = false,
  suiteLayout = false,
}) {
  const OffIcon = iconOff || Icon;
  if (suiteLayout) {
    const btnState = !active
      ? FIGMA_VOICE_CTRL_BTN_DANGER
      : pressed
        ? FIGMA_VOICE_CTRL_BTN_ACTIVE
        : FIGMA_VOICE_CTRL_BTN_IDLE;
    return (
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={badge != null ? `${label} (${badge})` : label}
        className={`${FIGMA_VOICE_CTRL_BTN} ${btnState}`}
      >
        {active ? (
          <Icon className="h-[17px] w-[17px] shrink-0 text-white" strokeWidth={1.75} />
        ) : (
          <OffIcon className="h-[17px] w-[17px] shrink-0 text-white" strokeWidth={1.75} />
        )}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-w-[56px] flex-col items-center gap-1 rounded-lg px-1.5 py-1 text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/50 ${
        pressed ? 'bg-sky-500/25 ring-1 ring-sky-400/50' : ''
      }`}
    >
      <div className="flex items-center justify-center gap-0.5">
        {active ? (
          <Icon className="h-6 w-6 shrink-0 text-white" strokeWidth={1.75} />
        ) : (
          <OffIcon className="h-6 w-6 shrink-0 text-red-400" strokeWidth={1.75} />
        )}
        {badge != null && (
          <span className="text-xs font-semibold tabular-nums text-white/90">{badge}</span>
        )}
        {chevron && <ChevronUp className="h-3 w-3 shrink-0 text-white/40" aria-hidden />}
      </div>
      <span className="max-w-[72px] text-center text-[11px] leading-tight text-white/60 group-hover:text-white/85">
        {label}
      </span>
    </button>
  );
}

const getSignalBaseUrl = () => resolveAppOrigin() || 'http://127.0.0.1:3000';

const getSignalPath = () => import.meta.env.VITE_VOICE_SIGNAL_PATH || '/voice-socket';
const RECENT_VOICE_CALLS_KEY = 'vh.voice.recentCalls';
const LEGACY_RESERVED_MEETING_CODE_KEY = 'vh.voice.reservedMeetingCode';
const INVITE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

function clearLegacyReservedMeetingCode() {
  try {
    sessionStorage.removeItem(LEGACY_RESERVED_MEETING_CODE_KEY);
  } catch {
    /* ignore */
  }
}

function unwrapVoiceApi(res) {
  const body = res?.data;
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return body.data;
  }
  return body ?? null;
}

const initialVoiceAudioPrefs = loadVoiceAudioPrefs();

const normalizeToken = (rawToken) => {
  if (!rawToken) return null;
  let token = String(rawToken).trim();
  if (!token) return null;
  if (token.startsWith('Bearer ')) token = token.slice(7).trim();
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }
  if (!token || token === 'null' || token === 'undefined') return null;
  return token;
};

function formatCallDuration(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function mapMeetingToLobbyRow(meeting) {
  const host = meeting?.hostProfile || meeting?.hostId;
  const hostName =
    (host && typeof host === 'object'
      ? host.displayName || host.fullName || host.username || host.email?.split('@')[0]
      : '') || '';
  const start = meeting?.startTime ? new Date(meeting.startTime) : null;
  const end = meeting?.endTime ? new Date(meeting.endTime) : null;
  let durationSec = 0;
  if (start && end) {
    durationSec = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
  } else if (start && meeting?.status === 'active') {
    durationSec = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  }
  const participants = Array.isArray(meeting?.participants)
    ? meeting.participants.filter((p) => !p?.leftAt).length
    : 0;
  return {
    id: String(meeting?._id || meeting?.id || ''),
    lobbyRoomId: meeting?.lobbyRoomId || '',
    title: meeting?.title || meeting?.lobbyRoomId || '',
    hostName,
    startTime: meeting?.startTime,
    endTime: meeting?.endTime,
    durationSec,
    active: meeting?.status === 'active',
    hasRecording: Boolean(meeting?.recordingUrl) && durationSec >= MIN_VOICE_RECORDING_SEC,
    participants,
    max: 10,
    color: '#2563EB',
  };
}

function parseMembersRes(res) {
  const raw = res?.data ?? res;
  const arr = raw?.data ?? raw;
  return Array.isArray(arr) ? arr : [];
}

function parseOrgListRes(res) {
  if (!res) return [];
  if (Array.isArray(res.data)) return res.data;
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data?.data)) return res.data.data;
  return [];
}

function memberUserId(m) {
  const u = m?.user;
  if (u && typeof u === 'object') return String(u._id || u.id || '');
  return String(u || '');
}

function deptMatchesMember(m, deptId) {
  const d = m?.department;
  const did = d && typeof d === 'object' ? d._id || d.id : d;
  return String(did || '') === String(deptId || '');
}

function VoiceRoomPage({ landingDemo = false, suiteLayout = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const safeRoomId = roomId?.startsWith(':') ? roomId.slice(1) || '' : roomId || '';
  const voiceRouteBase = suiteLayout ? '/app/communicate/voice' : '/voice';
  const { openFriendCall, session: friendCallSession } = useFriendCallSession();
  const { user } = useAuth();
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const LOCALE_TAG_EN = 'en-US';
  const LOCALE_TAG_VI = 'vi-VN';
  const timeLocale = locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI;

  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [hasLocalVideoTrack, setHasLocalVideoTrack] = useState(false);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState(false);
  const [remoteSpeakingMap, setRemoteSpeakingMap] = useState({});
  const [joining, setJoining] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [viewStage, setViewStage] = useState('home'); // home | prejoin | inRoom
  /** create = cuộc họp mới (mã random, không sửa); join = tham gia phòng có sẵn */
  const [prejoinMode, setPrejoinMode] = useState(null);
  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinModalCode, setJoinModalCode] = useState('');
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [meetingCode, setMeetingCode] = useState(safeRoomId || '');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [clockTick, setClockTick] = useState(0);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [prejoinAudioEnabled, setPrejoinAudioEnabled] = useState(true);
  const [prejoinVideoEnabled, setPrejoinVideoEnabled] = useState(true);

  /** free = phòng tự do (mời bạn bè); org = theo tổ chức + phòng ban */
  const [roomKind, setRoomKind] = useState('free');
  const [selectedOrgId, setSelectedOrgId] = useState('');
  const [selectedDeptId, setSelectedDeptId] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [orgsLoading, setOrgsLoading] = useState(false);

  const [rightPanel, setRightPanel] = useState(null); // null | 'chat' | 'people'
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteCandidates, setInviteCandidates] = useState([]);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState([]);
  const [roomHostUserId, setRoomHostUserId] = useState('');
  const [joinRequestStatus, setJoinRequestStatus] = useState('none');
  const [pendingJoinRequests, setPendingJoinRequests] = useState([]);
  const [inviteSending, setInviteSending] = useState(false);
  const [joinRequestSubmitting, setJoinRequestSubmitting] = useState(false);
  const [voiceFriends, setVoiceFriends] = useState([]);
  const [recentCalls, setRecentCalls] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(RECENT_VOICE_CALLS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [lobbyMeetings, setLobbyMeetings] = useState([]);
  const [recordingPlayback, setRecordingPlayback] = useState(null);
  const [aiTranscribeEnabled, setAiTranscribeEnabled] = useState(false);

  const [roomMessages, setRoomMessages] = useState([]);
  const [roomChatInput, setRoomChatInput] = useState('');
  const [roomChatEmojiOpen, setRoomChatEmojiOpen] = useState(false);
  const [allowParticipantChat, setAllowParticipantChat] = useState(true);

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [layoutModalOpen, setLayoutModalOpen] = useState(false);
  const [layoutMode, setLayoutMode] = useState(() => localStorage.getItem('vh.voice.layoutMode') || 'auto');
  const [maxTiles, setMaxTiles] = useState(() => Number(localStorage.getItem('vh.voice.maxTiles') || 10));
  const [hideNoVideo, setHideNoVideo] = useState(() => localStorage.getItem('vh.voice.hideNoVideo') === '1');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pipOpen, setPipOpen] = useState(false);
  const [pipBox, setPipBox] = useState({ x: 80, y: 90, w: 360, h: 204 });
  const pipDragRef = useRef(null);
  const pipResizeRef = useRef(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('audio');
  const [audioInputs, setAudioInputs] = useState([]);
  const [audioOutputs, setAudioOutputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedMicId, setSelectedMicId] = useState(initialVoiceAudioPrefs.micDeviceId);
  const [selectedSpeakerId, setSelectedSpeakerId] = useState(initialVoiceAudioPrefs.speakerDeviceId);
  const [micVolume, setMicVolume] = useState(initialVoiceAudioPrefs.micVolume);
  const [speakerVolume, setSpeakerVolume] = useState(initialVoiceAudioPrefs.speakerVolume);
  const [speakerOff, setSpeakerOff] = useState(initialVoiceAudioPrefs.speakerOff);
  const [selectedCamId, setSelectedCamId] = useState('');
  const [sendResolution, setSendResolution] = useState('auto');
  const [recvResolution, setRecvResolution] = useState('auto');

  const localVideoRef = useRef(null);
  const prejoinVideoRef = useRef(null);
  const prejoinStreamRef = useRef(null);
  const mediasoupRef = useRef({
    socket: null,
    device: null,
    sendTransport: null,
    recvTransport: null,
    audioProducer: null,
    videoProducer: null,
    consumers: new Map(),
    localStream: null,
    remoteStreams: new Map(),
  });
  const currentRoomRef = useRef(safeRoomId || 'room1');
  const audioLevelMonitorsRef = useRef(new Map());
  const meetingRootRef = useRef(null);
  const moreMenuWrapRef = useRef(null);
  const pipVideoRef = useRef(null);
  const voiceInitTokenRef = useRef(0);
  const meetingIdRef = useRef(null);
  const sessionRecorderRef = useRef(new VoiceSessionRecorder());
  const endingRoomRef = useRef(false);
  const audioElsRef = useRef(new Map());
  const joinRequestAwaitingEnterRef = useRef(false);
  const prevJoinRequestStatusRef = useRef('none');
  const autoEnterOnApproveRef = useRef(false);
  const remoteOutputOptsRef = useRef({
    speakerOff: initialVoiceAudioPrefs.speakerOff,
    speakerVolume: initialVoiceAudioPrefs.speakerVolume,
    speakerDeviceId: initialVoiceAudioPrefs.speakerDeviceId,
  });

  const localDisplayName = useMemo(
    () => user?.displayName || user?.fullName || user?.name || user?.email?.split('@')[0] || t('common.you'),
    [user, t]
  );
  const localAvatar = user?.avatar || null;
  const currentUserId = useMemo(() => String(user?._id || user?.id || user?.userId || ''), [user]);

  const isRoomHost = useMemo(() => {
    if (!currentUserId) return false;
    if (roomHostUserId) return String(roomHostUserId) === currentUserId;
    return prejoinMode === 'create';
  }, [currentUserId, roomHostUserId, prejoinMode]);

  useEffect(() => {
    setDisplayNameInput((prev) => (prev.trim() ? prev : localDisplayName));
  }, [localDisplayName]);

  useEffect(() => {
    if (landingDemo) {
      setVoiceFriends([]);
      return;
    }
    let cancelled = false;
    friendService
      .getFriends()
      .then((resp) => {
        if (cancelled) return;
        const payload = resp?.data || resp;
        const result = payload?.data || payload;
        const list = result?.friends || result;
        const rows = Array.isArray(list) ? list : [];
        setVoiceFriends(
          rows.slice(0, 8).map((f) => {
            const u = f.friendId || f;
            const id = String(u?._id || u?.userId || u?.id || f.id || '');
            return {
              id,
              label: u?.displayName || u?.fullName || u?.username || u?.email?.split('@')?.[0] || id.slice(-6),
              subtitle: u?.email || '',
              avatar: u?.avatar || null,
            };
          })
        );
      })
      .catch(() => {
        if (!cancelled) setVoiceFriends([]);
      });
    return () => {
      cancelled = true;
    };
  }, [landingDemo]);

  useEffect(() => {
    const kind = searchParams.get('kind');
    if (kind === 'org' || kind === 'free') setRoomKind(kind);
    const oid = searchParams.get('orgId');
    if (oid) setSelectedOrgId(oid);
    const did = searchParams.get('deptId');
    if (did) setSelectedDeptId(did);
  }, [searchParams]);

  useEffect(() => {
    if (viewStage !== 'prejoin' || prejoinMode !== 'join' || roomKind !== 'free') return;
    const code = String(meetingCode || '').trim();
    if (!code) return;
    let cancelled = false;
    const loadStatus = async () => {
      try {
        const lobbyRes = await api.get(`/voice/rooms/${encodeURIComponent(code)}/lobby`, {
          skipGlobalErrorHandling: true,
        });
        if (cancelled) return;
        const lobby = unwrapVoiceApi(lobbyRes);
        if (lobby?.hostUserId) setRoomHostUserId(String(lobby.hostUserId));
        const isLobbyHost =
          lobby?.role === 'host' || String(lobby?.hostUserId || '') === String(currentUserId);
        if (isLobbyHost) {
          setJoinRequestStatus('approved');
          return;
        }

        const res = await api.get(`/voice/rooms/${encodeURIComponent(code)}/join-requests/me`, {
          skipGlobalErrorHandling: true,
        });
        if (cancelled) return;
        const data = unwrapVoiceApi(res);
        const status = data?.status || 'none';
        if (status === 'pending') {
          joinRequestAwaitingEnterRef.current = true;
        }
        setJoinRequestStatus(status);
      } catch {
        if (!cancelled) setJoinRequestStatus('none');
      }
    };
    loadStatus();
    const timer = setInterval(loadStatus, 3000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [viewStage, prejoinMode, roomKind, meetingCode, currentUserId]);

  useEffect(() => {
    if (viewStage !== 'inRoom' || roomKind !== 'free') return;
    const code = String(activeRoomId || safeRoomId || meetingCode || '').trim();
    if (!code) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/voice/rooms/${encodeURIComponent(code)}/lobby`, {
          skipGlobalErrorHandling: true,
        });
        if (cancelled) return;
        const lobby = unwrapVoiceApi(res);
        if (lobby?.hostUserId) setRoomHostUserId(String(lobby.hostUserId));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewStage, roomKind, activeRoomId, safeRoomId, meetingCode]);

  useEffect(() => {
    autoEnterOnApproveRef.current = false;
    joinRequestAwaitingEnterRef.current = false;
    prevJoinRequestStatusRef.current = 'none';
  }, [meetingCode, viewStage, prejoinMode]);

  useEffect(() => {
    if (viewStage !== 'inRoom' || rightPanel !== 'people' || roomKind !== 'free' || !isRoomHost) {
      return undefined;
    }
    const room = String(activeRoomId || safeRoomId || meetingCode || '').trim();
    if (!room) return undefined;
    let cancelled = false;
    const loadPending = async () => {
      try {
        const res = await api.get(`/voice/rooms/${encodeURIComponent(room)}/join-requests`, {
          skipGlobalErrorHandling: true,
        });
        if (cancelled) return;
        const rows = unwrapVoiceApi(res);
        setPendingJoinRequests(Array.isArray(rows) ? rows : []);
      } catch {
        if (!cancelled) setPendingJoinRequests([]);
      }
    };
    loadPending();
    const timer = setInterval(loadPending, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [viewStage, rightPanel, roomKind, isRoomHost, activeRoomId, safeRoomId, meetingCode]);

  /** Cuộc gọi bạn bè: gọi thoại → tắt video ở prejoin */
  useEffect(() => {
    const m = searchParams.get('friendCallMedia');
    if (m === 'audio') {
      setPrejoinVideoEnabled(false);
    } else if (m === 'video') {
      setPrejoinVideoEnabled(true);
    }
  }, [searchParams]);

  /** URL cũ /voice/friend-1on1-*?callId=… → modal 1-1 trên chat, không lobby VoiceRoom */
  useEffect(() => {
    if (landingDemo) return;
    const callId = String(searchParams.get('callId') || '').trim();
    const room = String(safeRoomId || '').trim();
    if (!callId || !room.startsWith('friend-1on1-')) return;
    if (friendCallSession?.callId === callId) {
      navigate('/app/communicate/chat/friends', { replace: true });
      return;
    }
    const media = searchParams.get('friendCallMedia') === 'audio' ? 'audio' : 'video';
    openFriendCall?.({
      roomId: room,
      callId,
      media,
      peerUserId: '',
      peerLabel: '',
    });
    navigate('/app/communicate/chat/friends', { replace: true });
  }, [
    landingDemo,
    safeRoomId,
    searchParams,
    friendCallSession?.callId,
    openFriendCall,
    navigate,
  ]);

  useEffect(() => {
    if (viewStage !== 'prejoin' || roomKind !== 'org') return undefined;
    let cancelled = false;
    (async () => {
      setOrgsLoading(true);
      try {
        const res = await organizationAPI.getOrganizations();
        const list = parseOrgListRes(res);
        if (!cancelled) setOrganizations(list);
      } catch {
        if (!cancelled) setOrganizations([]);
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewStage, roomKind]);

  useEffect(() => {
    if (viewStage !== 'prejoin' || roomKind !== 'org' || !selectedOrgId) {
      setDepartments([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await organizationAPI.getDepartments(selectedOrgId);
        const raw = res?.data ?? res;
        const arr = raw?.data ?? raw;
        const list = Array.isArray(arr) ? arr : [];
        if (!cancelled) setDepartments(list);
      } catch {
        if (!cancelled) setDepartments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [viewStage, roomKind, selectedOrgId]);

  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (viewStage !== 'inRoom') {
      setCallDurationSec(0);
      return undefined;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setCallDurationSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [viewStage, activeRoomId]);

  const totalParticipants = useMemo(() => participants.length + 1, [participants.length]);
  const currentMeetingCode = useMemo(() => activeRoomId || safeRoomId || 'room1', [activeRoomId, safeRoomId]);

  const inRoomTitle = useMemo(() => {
    if (roomKind === 'org' && selectedOrgId) {
      return t('voiceRoom.roomTypeOrg');
    }
    return t('voiceRoom.pageTitle');
  }, [roomKind, selectedOrgId, t]);

  const inRoomChannelLabel = useMemo(() => {
    if (roomKind === 'org' && selectedOrgId) {
      return `#org-${String(selectedOrgId).slice(-6)}`;
    }
    return `#${String(currentMeetingCode).replace(/^VH-/i, '').toLowerCase() || 'voice'}`;
  }, [roomKind, selectedOrgId, currentMeetingCode]);

  const avatarStackItems = useMemo(() => {
    const localName = displayNameInput || localDisplayName;
    const localColor = voiceParticipantColor(localName);
    const rows = [
      {
        id: 'local',
        initials: voiceParticipantInitials(localName),
        color: localColor,
      },
      ...participants.slice(0, 3).map((p) => {
        const name = p.displayName || p.userId || 'P';
        return {
          id: p.socketId,
          initials: voiceParticipantInitials(name),
          color: voiceParticipantColor(name),
        };
      }),
    ];
    const overflow = Math.max(0, totalParticipants - rows.length);
    return { rows, overflow };
  }, [displayNameInput, localDisplayName, participants, totalParticipants]);

  const filteredInviteRows = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    if (!q) return inviteCandidates;
    return inviteCandidates.filter(
      (c) =>
        String(c.label || '')
          .toLowerCase()
          .includes(q) ||
        String(c.subtitle || '')
          .toLowerCase()
          .includes(q)
    );
  }, [inviteCandidates, inviteSearch]);

  const layoutTiles = useMemo(
    () =>
      buildLayoutTiles({
        participants,
        hideNoVideo,
        maxTiles,
        isCameraOff,
        hasLocalVideo: hasLocalVideoTrack,
      }),
    [participants, hideNoVideo, maxTiles, isCameraOff, hasLocalVideoTrack]
  );

  const meetingGridClass = useMemo(
    () =>
      suiteLayout
        ? figmaVoiceGridClass(layoutMode, layoutTiles.length)
        : gridWrapperClass(layoutMode, layoutTiles.length),
    [layoutMode, suiteLayout, layoutTiles.length]
  );

  const soloTileClass = useMemo(
    () => (suiteLayout ? figmaVoiceSoloTileClass(layoutTiles.length) : soloTileWrapClass(layoutTiles.length)),
    [suiteLayout, layoutTiles.length]
  );

  useEffect(() => {
    localStorage.setItem('vh.voice.layoutMode', layoutMode);
  }, [layoutMode]);
  useEffect(() => {
    localStorage.setItem('vh.voice.maxTiles', String(maxTiles));
  }, [maxTiles]);
  useEffect(() => {
    localStorage.setItem('vh.voice.hideNoVideo', hideNoVideo ? '1' : '0');
  }, [hideNoVideo]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const close = (e) => {
      if (moreMenuWrapRef.current?.contains(e.target)) return;
      setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moreMenuOpen]);

  const pipDragging = useRef(null);

  useEffect(() => {
    const onMove = (e) => {
      const d = pipDragging.current;
      if (!d) return;
      if (d.type === 'move') {
        setPipBox((b) => ({
          ...b,
          x: Math.max(8, Math.min(window.innerWidth - b.w - 8, d.ox + (e.clientX - d.sx))),
          y: Math.max(8, Math.min(window.innerHeight - b.h - 8, d.oy + (e.clientY - d.sy))),
        }));
      } else if (d.type === 'resize') {
        setPipBox((b) => ({
          ...b,
          w: Math.max(200, Math.min(window.innerWidth - b.x - 8, d.ow + (e.clientX - d.sx))),
          h: Math.max(120, Math.min(window.innerHeight - b.y - 8, d.oh + (e.clientY - d.sy))),
        }));
      }
    };
    const onUp = () => {
      pipDragging.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  useEffect(() => {
    if (!pipOpen || !pipVideoRef.current) return;
    const s = mediasoupRef.current.localStream;
    if (s && pipVideoRef.current) {
      pipVideoRef.current.srcObject = s;
      pipVideoRef.current.play?.().catch(() => {});
    }
  }, [pipOpen, isCameraOff, hasLocalVideoTrack]);

  useEffect(() => {
    if (!selectedSpeakerId || typeof HTMLMediaElement === 'undefined') return;
    if (!('setSinkId' in HTMLMediaElement.prototype)) return;
    const apply = (el) => {
      if (el?.setSinkId) {
        el.setSinkId(selectedSpeakerId).catch(() => {});
      }
    };
    apply(localVideoRef.current);
    apply(pipVideoRef.current);
    document.querySelectorAll('video').forEach(apply);
  }, [selectedSpeakerId, pipOpen, layoutTiles.length, participants.length]);

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setAudioInputs(list.filter((d) => d.kind === 'audioinput'));
      setAudioOutputs(list.filter((d) => d.kind === 'audiooutput'));
      setVideoInputs(list.filter((d) => d.kind === 'videoinput'));
      const ls = mediasoupRef.current.localStream;
      const at = ls?.getAudioTracks?.()?.[0];
      const vt = ls?.getVideoTracks?.()?.[0];
      const aset = at?.getSettings?.();
      const vset = vt?.getSettings?.();
      if (aset?.deviceId) setSelectedMicId(aset.deviceId);
      if (vset?.deviceId) setSelectedCamId(vset.deviceId);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    if (settingsOpen) refreshMediaDevices();
  }, [settingsOpen, refreshMediaDevices]);

  useEffect(() => {
    if (typeof HTMLMediaElement === 'undefined') return;
    const vol = Math.min(1, Math.max(0, speakerVolume / 100));
    document.querySelectorAll('video, audio').forEach((el) => {
      if ('volume' in el) el.volume = vol;
    });
  }, [speakerVolume, pipOpen, participants.length]);

  useEffect(() => {
    remoteOutputOptsRef.current = {
      speakerOff,
      speakerVolume,
      speakerDeviceId: selectedSpeakerId,
    };
    audioElsRef.current.forEach((el) => {
      void applyRemoteAudioElement(el, remoteOutputOptsRef.current);
    });
  }, [speakerOff, speakerVolume, selectedSpeakerId]);

  useEffect(() => {
    if (viewStage !== 'inRoom') return;
    participants.forEach((p) => {
      const el = audioElsRef.current.get(p.socketId);
      if (el && p.stream) {
        void bindAndPlayRemoteAudio(el, p.stream, remoteOutputOptsRef.current);
      }
    });
  }, [participants, viewStage]);

  const toggleMeetingFullscreen = useCallback(async () => {
    const el = meetingRootRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.fullscreenFail'));
    }
  }, [t]);

  const applyMicrophoneDevice = useCallback(
    async (deviceId) => {
      if (!deviceId) return;
      setSelectedMicId(deviceId);
      saveVoiceAudioPrefs({ micDeviceId: deviceId });

      const { localStream, audioProducer } = mediasoupRef.current;
      const previewStream = prejoinStreamRef.current;
      const targetStream = localStream || previewStream;
      if (!targetStream) return;

      if (!audioProducer) {
        try {
          const ns = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { ideal: deviceId } },
            video: false,
          });
          const nt = ns.getAudioTracks()[0];
          if (!nt) return;
          targetStream.getAudioTracks().forEach((tr) => {
            targetStream.removeTrack(tr);
            tr.stop();
          });
          targetStream.addTrack(nt);
          return;
        } catch (e) {
          console.error(e);
          toast.error(t('voiceRoom.micFail'));
          return;
        }
      }

      if (!localStream || !audioProducer) return;
      try {
        const ns = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
          video: false,
        });
        const nt = ns.getAudioTracks()[0];
        if (!nt) return;
        stopAudioLevelMonitor('local');
        localStream.getAudioTracks().forEach((t) => {
          localStream.removeTrack(t);
          t.stop();
        });
        localStream.addTrack(nt);
        startAudioLevelMonitor('local', localStream, (speaking) => {
          setIsLocalSpeaking(speaking && !isMuted);
        });
        await audioProducer.replaceTrack({ track: nt });
        toast.success(t('voiceRoom.micOk'));
      } catch (e) {
        console.error(e);
        toast.error(t('voiceRoom.micFail'));
      }
    },
    [isMuted, t]
  );

  const applyCameraDevice = useCallback(async (deviceId) => {
    if (!deviceId) return;
    setSelectedCamId(deviceId);
    const { localStream, videoProducer, sendTransport } = mediasoupRef.current;
    if (!localStream || !sendTransport) return;
    try {
      const ns = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId } },
      });
      const nt = ns.getVideoTracks()[0];
      if (!nt) return;
      localStream.getVideoTracks().forEach((t) => {
        localStream.removeTrack(t);
        t.stop();
      });
      localStream.addTrack(nt);
      if (videoProducer && !videoProducer.closed) {
        await videoProducer.replaceTrack({ track: nt });
      } else {
        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: nt,
          appData: { mediaTag: 'video' },
        });
      }
      setHasLocalVideoTrack(true);
      setIsCameraOff(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStream;
      }
      if (pipVideoRef.current) pipVideoRef.current.srcObject = localStream;
      toast.success(t('voiceRoom.camOk'));
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.camFail'));
    }
  }, [t]);

  const applySendResolutionPref = useCallback(async (mode) => {
    setSendResolution(mode);
    const vt = mediasoupRef.current.localStream?.getVideoTracks?.()?.[0];
    if (!vt || mode === 'auto') return;
    const map = {
      '720': { width: 1280, height: 720 },
      '360': { width: 640, height: 360 },
      '180': { width: 320, height: 180 },
    };
    const dim = map[mode];
    if (!dim) return;
    try {
      await vt.applyConstraints({
        width: { ideal: dim.width },
        height: { ideal: dim.height },
      });
      toast.success(t('voiceRoom.resOk'));
    } catch (e) {
      toast.error(t('voiceRoom.resFail'));
    }
  }, [t]);

  const generateMeetingCode = () => `room-${Math.random().toString(36).slice(2, 8)}`;

  const stopAudioLevelMonitor = (key) => {
    const monitor = audioLevelMonitorsRef.current.get(key);
    if (!monitor) return;
    if (monitor.rafId) cancelAnimationFrame(monitor.rafId);
    monitor.source?.disconnect?.();
    monitor.audioContext?.close?.().catch(() => {});
    audioLevelMonitorsRef.current.delete(key);
  };

  const startAudioLevelMonitor = (key, stream, onSpeakingChange) => {
    if (!stream || audioLevelMonitorsRef.current.has(key)) return;
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks.length) return;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioContext = new AudioContextClass();
      void audioContext.resume?.().catch?.(() => {});
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);
      let lastSpeaking = false;

      const detect = () => {
        analyser.getByteTimeDomainData(data);
        let sumSquares = 0;
        for (let i = 0; i < data.length; i += 1) {
          const v = (data[i] - 128) / 128;
          sumSquares += v * v;
        }
        const rms = Math.sqrt(sumSquares / data.length);
        const speaking = rms > 0.04;
        if (speaking !== lastSpeaking) {
          lastSpeaking = speaking;
          onSpeakingChange(speaking);
        }
        const monitor = audioLevelMonitorsRef.current.get(key);
        if (monitor) {
          monitor.rafId = requestAnimationFrame(detect);
        }
      };

      audioLevelMonitorsRef.current.set(key, {
        audioContext,
        analyser,
        source,
        rafId: requestAnimationFrame(detect),
      });
    } catch (monitorError) {
      console.warn('startAudioLevelMonitor failed', monitorError);
    }
  };

  const addOrUpdateParticipant = (payload) => {
    setParticipants((prev) => {
      const index = prev.findIndex((p) => p.socketId === payload.socketId);
      if (index >= 0) {
        const next = [...prev];
        next[index] = { ...next[index], ...payload };
        return next;
      }
      return [...prev, payload];
    });
  };

  const removeParticipant = (socketId) => {
    setParticipants((prev) => prev.filter((item) => item.socketId !== socketId));
  };

  /**
   * Gỡ preview trước khi vào phòng.
   * @param {{ keepStreamForRoom?: boolean }} opts — nếu true: stream đã chuyển sang `mediasoupRef.localStream`,
   *   KHÔNG được stop track (nếu stop sẽ làm mất hình trong phòng và hỏng producer).
   */
  const stopPrejoinPreview = (opts = {}) => {
    const { keepStreamForRoom = false } = opts;
    if (prejoinStreamRef.current) {
      const sameAsRoom =
        keepStreamForRoom && mediasoupRef.current.localStream === prejoinStreamRef.current;
      if (sameAsRoom) {
        if (prejoinVideoRef.current) {
          prejoinVideoRef.current.srcObject = null;
        }
        prejoinStreamRef.current = null;
        return;
      }
      prejoinStreamRef.current.getTracks().forEach((track) => track.stop());
      prejoinStreamRef.current = null;
    }
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = null;
    }
  };

  const teardownVoiceSession = useCallback(({ notifyServer = true } = {}) => {
    const {
      socket,
      audioProducer,
      videoProducer,
      sendTransport,
      recvTransport,
      consumers,
      localStream,
      remoteStreams,
    } = mediasoupRef.current;

    if (notifyServer && socket?.connected && currentRoomRef.current) {
      socket.emit('voice:leaveRoom', { roomId: currentRoomRef.current });
    }

    for (const consumer of consumers.values()) {
      try {
        consumer.close();
      } catch {
        /* ignore */
      }
    }
    consumers.clear();
    remoteStreams.clear();

    audioProducer?.close();
    videoProducer?.close();
    sendTransport?.close();
    recvTransport?.close();

    mediasoupRef.current.audioProducer = null;
    mediasoupRef.current.videoProducer = null;
    mediasoupRef.current.sendTransport = null;
    mediasoupRef.current.recvTransport = null;
    mediasoupRef.current.device = null;

    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }
    mediasoupRef.current.localStream = null;

    stopAudioLevelMonitor('local');
    for (const key of [...audioLevelMonitorsRef.current.keys()]) {
      if (key.startsWith('remote:')) stopAudioLevelMonitor(key);
    }

    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    mediasoupRef.current.socket = null;
  }, []);

  const loadLobbyMeetings = useCallback(async () => {
    if (landingDemo) return;
    try {
      const res = await api.get('/meetings', {
        params: { mine: '1', limit: MEETING_HISTORY_MAX_ITEMS },
        skipGlobalErrorHandling: true,
      });
      const data = unwrapVoiceApi(res);
      const rows = Array.isArray(data?.meetings) ? data.meetings : [];
      setLobbyMeetings(rows);
      const keepIds = rows.map((m) => String(m._id || m.id || '')).filter(Boolean);
      pruneVoiceMeetingRecordingsExcept(keepIds).catch(() => {});
    } catch {
      setLobbyMeetings([]);
    }
  }, [landingDemo]);

  const finalizeSessionRecording = useCallback(async (meetingIdOverride, lobbyRoomId) => {
    const saved = await sessionRecorderRef.current.stop();
    const mid = meetingIdOverride || meetingIdRef.current;
    if (saved?.blob?.size && mid) {
      await saveVoiceMeetingRecording(mid, saved.blob, {
        durationSec: saved.durationSec,
        lobbyRoomId: lobbyRoomId || currentRoomRef.current,
      });
    }
    meetingIdRef.current = null;
    return saved;
  }, []);

  const resetAfterRoomExit = useCallback(() => {
    clearLegacyReservedMeetingCode();
    setMeetingCode('');
    setRemoteSpeakingMap({});
    setIsLocalSpeaking(false);
    setHasLocalVideoTrack(false);
    setConnected(false);
    setActiveRoomId(null);
    setViewStage('home');
    setRightPanel(null);
    setInviteModalOpen(false);
    setRoomChatEmojiOpen(false);
    setRoomMessages([]);
    setRoomChatInput('');
    setMoreMenuOpen(false);
    setLayoutModalOpen(false);
    setSettingsOpen(false);
    setPipOpen(false);
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  const startPrejoinPreview = async (audioEnabled = true, videoEnabled = true) => {
    stopPrejoinPreview();
    if (!audioEnabled && !videoEnabled) return;

    const mergedStream = new MediaStream();
    let hasAtLeastOneTrack = false;
    let hadPermissionError = false;

    // Xin quyền theo từng loại để không fail toàn bộ preview.
    if (videoEnabled) {
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = videoStream.getVideoTracks()[0];
        if (videoTrack) {
          mergedStream.addTrack(videoTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (videoErr) {
        hadPermissionError = true;
        console.warn('Video preview permission error', videoErr);
      }
    }

    if (audioEnabled) {
      try {
        const micDeviceId = selectedMicId || loadVoiceAudioPrefs().micDeviceId;
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: buildAudioConstraints(micDeviceId),
        });
        const audioTrack = audioStream.getAudioTracks()[0];
        if (audioTrack) {
          mergedStream.addTrack(audioTrack);
          hasAtLeastOneTrack = true;
        }
      } catch (audioErr) {
        hadPermissionError = true;
        console.warn('Audio preview permission error', audioErr);
      }
    }

    if (!hasAtLeastOneTrack) {
      if (hadPermissionError) {
        toast.error(t('voiceRoom.previewFail'));
      }
      return;
    }

    prejoinStreamRef.current = mergedStream;
    if (prejoinVideoRef.current) {
      prejoinVideoRef.current.srcObject = mergedStream;
    }

    if (videoEnabled && mergedStream.getVideoTracks().length === 0) {
      setPrejoinVideoEnabled(false);
    }
    if (audioEnabled && mergedStream.getAudioTracks().length === 0) {
      setPrejoinAudioEnabled(false);
    }
  };

  const requestSocket = (eventName, payload, { timeoutMs = 20000 } = {}) =>
    new Promise((resolve, reject) => {
      const socket = mediasoupRef.current.socket;
      if (!socket) {
        reject(new Error('Voice socket unavailable'));
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error(`Socket request timed out: ${eventName}`));
      }, timeoutMs);
      socket.emit(eventName, payload, (response) => {
        clearTimeout(timer);
        if (!response?.success) {
          reject(new Error(response?.error || `Socket request failed: ${eventName}`));
          return;
        }
        resolve(response);
      });
    });

  const waitForVoiceSocketConnect = (socket, initToken) =>
    new Promise((resolve, reject) => {
      if (initToken !== voiceInitTokenRef.current) {
        reject(new Error('Voice connect cancelled'));
        return;
      }
      if (socket.connected) {
        resolve();
        return;
      }
      const onConnect = () => {
        cleanup();
        resolve();
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
    });

  const ensureRemoteParticipant = (producerMeta) => {
    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: null,
      audioOn: true,
      videoOn: true,
    });
  };

  const consumeProducer = async (producerMeta) => {
    const { recvTransport, device } = mediasoupRef.current;
    if (!recvTransport || !device) return;

    ensureRemoteParticipant(producerMeta);

    const consumeResp = await requestSocket('voice:consume', {
      roomId: currentRoomRef.current,
      transportId: recvTransport.id,
      producerId: producerMeta.producerId,
      rtpCapabilities: device.rtpCapabilities,
    });

    const consumerParams = consumeResp.consumer;
    const consumer = await recvTransport.consume({
      id: consumerParams.id,
      producerId: consumerParams.producerId,
      kind: consumerParams.kind,
      rtpParameters: consumerParams.rtpParameters,
      appData: {},
    });

    mediasoupRef.current.consumers.set(consumer.id, consumer);

    const currentStream =
      mediasoupRef.current.remoteStreams.get(producerMeta.socketId) || new MediaStream();
    currentStream.addTrack(consumer.track);
    mediasoupRef.current.remoteStreams.set(producerMeta.socketId, currentStream);

    addOrUpdateParticipant({
      socketId: producerMeta.socketId,
      userId: producerMeta.userId,
      displayName: producerMeta.displayName || 'Participant',
      stream: currentStream,
      audioOn: producerMeta.kind === 'audio' ? true : undefined,
      videoOn: producerMeta.kind === 'video' ? true : undefined,
    });

    await requestSocket('voice:resumeConsumer', {
      roomId: currentRoomRef.current,
      consumerId: consumer.id,
    });
    if (consumer.paused) {
      consumer.resume();
    }
    if (consumer.track && !consumer.track.enabled) {
      consumer.track.enabled = true;
    }

    const audioEl = audioElsRef.current.get(producerMeta.socketId);
    if (audioEl) {
      void bindAndPlayRemoteAudio(audioEl, currentStream, remoteOutputOptsRef.current);
    }
  };

  const loadInviteCandidates = useCallback(async () => {
    setInviteLoading(true);
    try {
      if (roomKind === 'free') {
        const resp = await friendService.getFriends();
        const payload = resp?.data || resp;
        const result = payload?.data || payload;
        const list = result?.friends || result;
        const friends = Array.isArray(list) ? list : [];
        setInviteCandidates(
          friends.map((f) => {
            const u = f.friendId || f;
            const id = String(u?._id || u?.id || f.id || '');
            const uname = typeof u?.username === 'string' ? u.username.trim() : '';
            return {
              id,
              label:
                u?.displayName || u?.fullName || u?.username || u?.email?.split('@')[0] || id.slice(-6),
              subtitle: u?.email || (uname ? `@${uname}` : '') || '',
              avatar: u?.avatar || null,
            };
          })
        );
        return;
      }
      if (roomKind === 'org' && selectedOrgId && selectedDeptId) {
        const res = await organizationAPI.getMembers(selectedOrgId);
        const members = parseMembersRes(res);
        const filtered = members.filter(
          (m) =>
            String(m?.status || 'active') === 'active' &&
            deptMatchesMember(m, selectedDeptId) &&
            memberUserId(m) !== currentUserId
        );
        const rows = await Promise.all(
          filtered.map(async (m) => {
            const uid = memberUserId(m);
            let label = `…${uid.slice(-6)}`;
            let subtitle = '';
            let avatar = null;
            try {
              const ur = await userService.getProfile(uid);
              const raw = ur?.data ?? ur;
              const p = raw?.data ?? raw;
              label =
                p?.displayName || p?.fullName || p?.username || p?.email?.split('@')[0] || label;
              subtitle = p?.email || '';
              avatar = p?.avatar || null;
            } catch {
              /* giữ mặc định */
            }
            return { id: uid, label, subtitle, avatar };
          })
        );
        setInviteCandidates(rows);
        return;
      }
      setInviteCandidates([]);
    } catch (e) {
      console.error(e);
      toast.error(t('voiceRoom.inviteLoadFail'));
      setInviteCandidates([]);
    } finally {
      setInviteLoading(false);
    }
  }, [roomKind, selectedOrgId, selectedDeptId, currentUserId]);

  useEffect(() => {
    if (!inviteModalOpen) return;
    loadInviteCandidates();
  }, [inviteModalOpen, loadInviteCandidates]);

  useEffect(() => {
    if (!inviteModalOpen) {
      setInviteSearch('');
      setSelectedInviteIds([]);
    }
  }, [inviteModalOpen]);

  useEffect(() => {
    if (!location.state?.openInviteModal) return;
    const sourceId = String(location.state?.sourceFriendId || '').trim();
    setInviteModalOpen(true);
    if (sourceId) setSelectedInviteIds([sourceId]);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  const initVoiceRoom = async ({
    targetRoomId,
    audioEnabled = true,
    videoEnabled = true,
    displayName = '',
  }) => {
    const roomTarget = targetRoomId || safeRoomId || 'room1';
    teardownVoiceSession({ notifyServer: false });
    const initToken = ++voiceInitTokenRef.current;
    try {
      setJoining(true);
      setError('');
      setParticipants([]);
      currentRoomRef.current = roomTarget;
      setActiveRoomId(roomTarget);

      await api.get(`/voice/rooms/${encodeURIComponent(roomTarget)}/bootstrap`, {
        skipGlobalErrorHandling: true,
      }).catch(() => null);

      if (initToken !== voiceInitTokenRef.current) return;

      let localStream = prejoinStreamRef.current;
      if (!localStream) {
        if (audioEnabled || videoEnabled) {
          const micDeviceId = selectedMicId || loadVoiceAudioPrefs().micDeviceId;
          localStream = await navigator.mediaDevices.getUserMedia({
            audio: audioEnabled ? buildAudioConstraints(micDeviceId) : false,
            video: Boolean(videoEnabled),
          });
        } else {
          localStream = new MediaStream();
        }
      }
      mediasoupRef.current.localStream = localStream;
      // localVideoRef chỉ mount khi viewStage === 'inRoom' — gán srcObject trong ref callback / useEffect
      setHasLocalVideoTrack(localStream.getVideoTracks().length > 0);

      startAudioLevelMonitor('local', localStream, (speaking) => {
        setIsLocalSpeaking(speaking && !isMuted);
      });

      const token = normalizeToken(localStorage.getItem('token'));
      const socket = io(`${getSignalBaseUrl()}/voice`, {
        path: getSignalPath(),
        // Qua reverse proxy HTTPS, ưu tiên polling trước để giảm lỗi WS handshake sớm.
        transports: ['polling', 'websocket'],
        auth: token ? { token } : {},
      });
      mediasoupRef.current.socket = socket;

      socket.on('connect', () => {
        if (initToken !== voiceInitTokenRef.current) return;
        setConnected(true);
      });
      socket.on('disconnect', () => {
        if (initToken !== voiceInitTokenRef.current) return;
        setConnected(false);
      });
      socket.on('connect_error', (err) => {
        if (initToken !== voiceInitTokenRef.current) return;
        setError(resolveApiErrorMessage(err, { t, fallback: t('voiceRoom.connectFail') }));
      });

      socket.on('voice:roomClosed', async (payload) => {
        if (initToken !== voiceInitTokenRef.current) return;
        if (endingRoomRef.current) return;
        await finalizeSessionRecording(payload?.meetingId, payload?.roomId);
        teardownVoiceSession({ notifyServer: false });
        resetAfterRoomExit();
        loadLobbyMeetings();
        if (payload?.recordingSaved) {
          toast.success(t('voiceRoom.recordingSaved'));
        } else {
          toast(t('voiceRoom.roomClosedByHost'));
        }
        navigate(voiceRouteBase);
      });

      socket.on('voice:peerJoined', (payload) => {
        if (initToken !== voiceInitTokenRef.current) return;
        addOrUpdateParticipant({
          socketId: payload.socketId,
          userId: payload.userId,
          displayName: payload.displayName || 'Participant',
          stream: mediasoupRef.current.remoteStreams.get(payload.socketId) || null,
        });
      });

      socket.on('voice:peerLeft', (payload) => {
        if (initToken !== voiceInitTokenRef.current) return;
        removeParticipant(payload.socketId);
        stopAudioLevelMonitor(`remote:${payload.socketId}`);
        setRemoteSpeakingMap((prev) => {
          const next = { ...prev };
          delete next[payload.socketId];
          return next;
        });
        const stream = mediasoupRef.current.remoteStreams.get(payload.socketId);
        if (stream) {
          stream.getTracks().forEach((track) => track.stop());
          mediasoupRef.current.remoteStreams.delete(payload.socketId);
        }
      });

      await waitForVoiceSocketConnect(socket, initToken);
      if (initToken !== voiceInitTokenRef.current) {
        teardownVoiceSession({ notifyServer: false });
        return;
      }

      const mediasoupModule = await import('mediasoup-client');
      if (initToken !== voiceInitTokenRef.current) {
        teardownVoiceSession({ notifyServer: false });
        return;
      }
      const DeviceClass = mediasoupModule.Device;

      const joinResp = await requestSocket('voice:joinRoom', { roomId: roomTarget, displayName });
      meetingIdRef.current = joinResp.meetingId || null;
      const device = new DeviceClass();
      await device.load({ routerRtpCapabilities: joinResp.rtpCapabilities });
      mediasoupRef.current.device = device;

      const sendTransportData = await requestSocket('voice:createTransport', {
        roomId: roomTarget,
        direction: 'send',
      });
      const sendTransport = device.createSendTransport(sendTransportData.transport);
      mediasoupRef.current.sendTransport = sendTransport;

      sendTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: roomTarget,
          transportId: sendTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        requestSocket('voice:produce', {
          roomId: roomTarget,
          transportId: sendTransport.id,
          kind,
          rtpParameters,
          appData,
        })
          .then((resp) => callback({ id: resp.producerId }))
          .catch(errback);
      });

      const audioTrack = audioEnabled ? localStream.getAudioTracks()[0] : null;
      const videoTrack = videoEnabled ? localStream.getVideoTracks()[0] : null;
      if (audioTrack) {
        mediasoupRef.current.audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { mediaTag: 'audio' },
        });
      }
      if (videoTrack) {
        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: { mediaTag: 'video' },
        });
      }

      const recvTransportData = await requestSocket('voice:createTransport', {
        roomId: roomTarget,
        direction: 'recv',
      });
      const recvTransport = device.createRecvTransport(recvTransportData.transport);
      mediasoupRef.current.recvTransport = recvTransport;

      recvTransport.on('connect', ({ dtlsParameters }, callback, errback) => {
        requestSocket('voice:connectTransport', {
          roomId: roomTarget,
          transportId: recvTransport.id,
          dtlsParameters,
        })
          .then(() => callback())
          .catch(errback);
      });

      const producers = await requestSocket('voice:getProducers', { roomId: roomTarget });
      for (const producerMeta of producers.producers || []) {
        await consumeProducer(producerMeta);
      }

      socket.on('voice:newProducer', async (producerMeta) => {
        if (initToken !== voiceInitTokenRef.current) return;
        try {
          await consumeProducer(producerMeta);
        } catch (consumeError) {
          console.error('consume new producer failed', consumeError);
        }
      });
      if (initToken !== voiceInitTokenRef.current) {
        teardownVoiceSession({ notifyServer: false });
        return;
      }
      sessionRecorderRef.current.start(
        mediasoupRef.current.localStream,
        mediasoupRef.current.remoteStreams
      );
      setIsMuted(!audioTrack);
      setIsCameraOff(!videoTrack);
      setViewStage('inRoom');
      pushRecentCall(roomTarget);
      stopPrejoinPreview({ keepStreamForRoom: true });

      const qs = new URLSearchParams();
      qs.set('kind', roomKind);
      if (roomKind === 'org') {
        if (selectedOrgId) qs.set('orgId', selectedOrgId);
        if (selectedDeptId) qs.set('deptId', selectedDeptId);
      }
      const cid = searchParams.get('callId');
      if (cid) qs.set('callId', cid);
      const fcm = searchParams.get('friendCallMedia');
      if (fcm) qs.set('friendCallMedia', fcm);
      navigate(`${voiceRouteBase}/${encodeURIComponent(roomTarget)}?${qs.toString()}`, { replace: true });
    } catch (initError) {
      if (initToken !== voiceInitTokenRef.current) return;
      console.error(initError);
      const errName = String(initError?.name || '');
      const errMsg = String(initError?.message || '');
      let msg;
      if (errName === 'NotAllowedError' || /permission/i.test(errMsg)) {
        msg = t('voiceRoom.previewFail');
      } else if (
        errName === 'NotReadableError' ||
        errName === 'AbortError' ||
        /in use|busy|allocated/i.test(errMsg)
      ) {
        msg = t('voiceRoom.micInUse');
      } else if (/no more available ports/i.test(errMsg)) {
        msg = t('voiceRoom.rtcPortsExhausted');
      } else {
        msg = resolveApiErrorMessage(initError, { t, fallback: t('voiceRoom.connectFail') });
      }
      setError(msg);
      toast.error(msg);
      autoEnterOnApproveRef.current = false;
      teardownVoiceSession({ notifyServer: false });
    } finally {
      if (initToken === voiceInitTokenRef.current) {
        setJoining(false);
      }
    }
  };

  useEffect(() => {
    const prev = prevJoinRequestStatusRef.current;
    prevJoinRequestStatusRef.current = joinRequestStatus;

    if (viewStage !== 'prejoin' || roomKind !== 'free' || prejoinMode !== 'join') return;
    if (joinRequestStatus !== 'approved' || isRoomHost || joining || autoEnterOnApproveRef.current) {
      return;
    }
    if (prev !== 'pending' && !joinRequestAwaitingEnterRef.current) return;

    const code = String(meetingCode || '').trim();
    if (!code) return;

    autoEnterOnApproveRef.current = true;
    joinRequestAwaitingEnterRef.current = false;
    toast.success(t('voiceRoom.joinRequestApproved'));
    initVoiceRoom({
      targetRoomId: code,
      audioEnabled: prejoinAudioEnabled,
      videoEnabled: prejoinVideoEnabled,
      displayName: displayNameInput,
    });
  }, [
    joinRequestStatus,
    viewStage,
    roomKind,
    prejoinMode,
    isRoomHost,
    joining,
    meetingCode,
    prejoinAudioEnabled,
    prejoinVideoEnabled,
    displayNameInput,
    t,
  ]);

  const endMeetingAsHost = useCallback(async () => {
    const room = String(currentRoomRef.current || '').trim();
    const socket = mediasoupRef.current.socket;
    if (!room) return;
    if (!socket?.connected) {
      toast.error(t('voiceRoom.connectFail'));
      return;
    }
    if (endingRoomRef.current) return;

    endingRoomRef.current = true;
    try {
      const resp = await requestSocket('voice:endRoomAsHost', { roomId: room });
      const saved = await finalizeSessionRecording(resp?.meetingId, room);
      teardownVoiceSession({ notifyServer: false });
      resetAfterRoomExit();
      loadLobbyMeetings();
      if (resp?.recordingSaved || saved) {
        toast.success(t('voiceRoom.recordingSaved'));
      } else {
        toast.success(t('voiceRoom.roomClosedByHost'));
      }
      navigate(voiceRouteBase);
    } catch (endErr) {
      console.error(endErr);
      const msg = resolveApiErrorMessage(endErr, { t, fallback: t('common.errorGeneric') });
      toast.error(msg);
      endingRoomRef.current = false;
    }
  }, [finalizeSessionRecording, loadLobbyMeetings, navigate, resetAfterRoomExit, t, voiceRouteBase]);

  const leaveRoom = async () => {
    try {
      const friendCallId = searchParams.get('callId');
      if (friendCallId && !landingDemo) {
        try {
          await api.post(`/voice/calls/${encodeURIComponent(friendCallId)}/end`);
        } catch {
          /* ignore — vẫn rời phòng */
        }
      }

      await finalizeSessionRecording();
      teardownVoiceSession({ notifyServer: true });
      resetAfterRoomExit();
      loadLobbyMeetings();
      navigate(voiceRouteBase);
    } catch (leaveError) {
      console.error(leaveError);
      endingRoomRef.current = false;
      await finalizeSessionRecording();
      teardownVoiceSession({ notifyServer: false });
      resetAfterRoomExit();
      navigate(voiceRouteBase);
    }
  };

  const pushRecentCall = useCallback(
    (roomTarget) => {
      const entry = {
        roomId: String(roomTarget || ''),
        roomKind,
        label:
          String(roomTarget || '') ||
          (roomKind === 'org'
            ? `${t('voiceRoom.roomTypeOrg')} ${selectedOrgId ? `#${selectedOrgId}` : ''}`.trim()
            : t('voiceRoom.roomTypeFree')),
        joinedAt: new Date().toISOString(),
      };
      setRecentCalls((prev) => {
        const next = [entry, ...prev.filter((item) => String(item.roomId) !== entry.roomId)].slice(0, 8);
        try {
          localStorage.setItem(RECENT_VOICE_CALLS_KEY, JSON.stringify(next));
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [roomKind, selectedOrgId, t]
  );

  const toggleMute = async () => {
    const producer = mediasoupRef.current.audioProducer;
    if (!producer) return;
    if (isMuted) {
      await producer.resume();
    } else {
      await producer.pause();
    }
    setIsMuted((prev) => {
      const nextMuted = !prev;
      if (nextMuted) setIsLocalSpeaking(false);
      return nextMuted;
    });
  };

  const toggleCamera = async () => {
    try {
      const { sendTransport } = mediasoupRef.current;

      // Bat camera lai: mo thiet bi cam that va tao producer moi
      if (isCameraOff) {
        if (!sendTransport) return;

        const camStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const newVideoTrack = camStream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        if (!mediasoupRef.current.localStream) {
          mediasoupRef.current.localStream = new MediaStream();
        }
        const localStream = mediasoupRef.current.localStream;

        // Dam bao chi co 1 video track local
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        localStream.addTrack(newVideoTrack);

        mediasoupRef.current.videoProducer = await sendTransport.produce({
          track: newVideoTrack,
          appData: { mediaTag: 'video' },
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }

        setHasLocalVideoTrack(true);
        setIsCameraOff(false);
        return;
      }

      // Tat camera: close producer + stop track de giai phong camera o he thong
      const producer = mediasoupRef.current.videoProducer;
      if (producer) {
        producer.close();
        mediasoupRef.current.videoProducer = null;
      }

      const localStream = mediasoupRef.current.localStream;
      if (localStream) {
        localStream.getVideoTracks().forEach((track) => {
          track.stop();
          localStream.removeTrack(track);
        });
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStream;
        }
      }

      setHasLocalVideoTrack(false);
      setIsCameraOff(true);
    } catch (cameraError) {
      console.error(cameraError);
      toast.error(resolveApiErrorMessage(cameraError, { t, fallback: t('voiceRoom.cameraToggleFail') }));
    }
  };

  useEffect(() => {
    clearLegacyReservedMeetingCode();
  }, []);

  useEffect(() => {
    if (landingDemo) return undefined;
    if (!safeRoomId) {
      setViewStage('home');
      setPrejoinMode(null);
      return undefined;
    }
    setMeetingCode(safeRoomId);
    const invitedJoin = searchParams.get('join') === '1';
    if (invitedJoin) {
      setPrejoinMode('join');
      setRoomKind('free');
      setJoinRequestStatus('none');
      setViewStage((prev) => (prev === 'inRoom' ? 'inRoom' : 'prejoin'));
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/voice/rooms/${encodeURIComponent(safeRoomId)}/lobby`, {
          skipGlobalErrorHandling: true,
        });
        if (cancelled) return;
        const lobby = unwrapVoiceApi(res);
        const isLobbyHost =
          lobby?.role === 'host' ||
          String(lobby?.hostUserId || '') === String(currentUserId);
        if (lobby?.hostUserId) setRoomHostUserId(String(lobby.hostUserId));
        setPrejoinMode(isLobbyHost ? 'create' : 'join');
        setRoomKind('free');
      } catch {
        if (!cancelled) {
          setPrejoinMode('join');
          setRoomKind('free');
        }
      }
      if (!cancelled) {
        setViewStage((prev) => (prev === 'inRoom' ? 'inRoom' : 'prejoin'));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [safeRoomId, searchParams, landingDemo, currentUserId]);

  useEffect(() => {
    return () => {
      voiceInitTokenRef.current += 1;
      teardownVoiceSession({ notifyServer: true });
      stopPrejoinPreview();
    };
  }, [teardownVoiceSession]);

  useEffect(() => {
    if (landingDemo) return;
    const activeRemoteKeys = new Set();
    participants.forEach((participant) => {
      const key = `remote:${participant.socketId}`;
      activeRemoteKeys.add(key);
      if (participant.stream) {
        startAudioLevelMonitor(key, participant.stream, (speaking) => {
          setRemoteSpeakingMap((prev) => {
            if (prev[participant.socketId] === speaking) return prev;
            return { ...prev, [participant.socketId]: speaking };
          });
        });
      }
    });

    for (const key of [...audioLevelMonitorsRef.current.keys()]) {
      if (key.startsWith('remote:') && !activeRemoteKeys.has(key)) {
        stopAudioLevelMonitor(key);
      }
    }
  }, [participants, landingDemo]);

  useEffect(() => {
    if (landingDemo) return undefined;
    if (viewStage !== 'prejoin') return undefined;
    startPrejoinPreview(prejoinAudioEnabled, prejoinVideoEnabled);
    return () => {
      stopPrejoinPreview();
    };
  }, [viewStage, prejoinAudioEnabled, prejoinVideoEnabled, landingDemo]);

  /** Đảm bảo gán lại stream sau khi vào phòng (ref mount / StrictMode / re-render). */
  useEffect(() => {
    if (landingDemo) return;
    if (viewStage !== 'inRoom') return;
    if (!hasLocalVideoTrack || isCameraOff) return;
    const stream = mediasoupRef.current.localStream;
    const el = localVideoRef.current;
    if (!stream || !el) return;
    const live = stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      el.play?.().catch(() => {});
    }
  }, [viewStage, hasLocalVideoTrack, isCameraOff, joining, landingDemo]);

  const handleNewMeeting = () => {
    clearLegacyReservedMeetingCode();
    const code = generateMeetingCode();
    setMeetingCode(code);
    setPrejoinMode('create');
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setRoomKind('free');
    setSelectedOrgId('');
    setSelectedDeptId('');
    setJoinModalOpen(false);
    setJoining(false);
    setJoinRequestSubmitting(false);
    setViewStage('prejoin');
  };

  const openJoinModal = () => {
    setJoinModalCode(String(meetingCode || '').trim());
    setJoinModalOpen(true);
  };

  const handleJoinModalConfirm = () => {
    const code = String(joinModalCode || '').trim();
    if (!code) {
      toast.error(t('voiceRoom.meetingIdRequired'));
      return;
    }
    setMeetingCode(code);
    setPrejoinMode('join');
    setJoinModalOpen(false);
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setViewStage('prejoin');
  };

  const handlePrejoinCancel = () => {
    stopPrejoinPreview();
    clearLegacyReservedMeetingCode();
    if (prejoinMode === 'create') {
      setMeetingCode('');
      if (safeRoomId) {
        navigate(voiceRouteBase, { replace: true });
      }
    }
    setPrejoinMode(null);
    setViewStage('home');
  };

  const lobbyRooms = useMemo(
    () => lobbyMeetings.map((row) => mapMeetingToLobbyRow(row)),
    [lobbyMeetings]
  );

  useEffect(() => {
    if (landingDemo || viewStage !== 'home') return undefined;
    loadLobbyMeetings();
    const timer = setInterval(loadLobbyMeetings, 30000);
    return () => clearInterval(timer);
  }, [landingDemo, viewStage, loadLobbyMeetings]);

  const lobbyActiveCount = useMemo(
    () => lobbyRooms.filter((room) => room.active).length,
    [lobbyRooms]
  );

  const handleLobbyJoinByCode = useCallback((code) => {
    const trimmed = String(code || '').trim();
    if (!trimmed) return;
    setMeetingCode(trimmed);
    setPrejoinMode('join');
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setJoinModalOpen(false);
    setViewStage('prejoin');
  }, []);

  const handleLobbyJoinRoom = useCallback((room) => {
    const code = String(room?.lobbyRoomId || room?.id || '').trim();
    if (!code) return;
    setMeetingCode(code);
    setPrejoinMode('join');
    setPrejoinAudioEnabled(true);
    setPrejoinVideoEnabled(true);
    setViewStage('prejoin');
  }, []);

  const handlePlayRecording = useCallback(
    async (meeting) => {
      const meetingId = String(meeting?.id || '').trim();
      if (!meetingId) return;
      try {
        const row = await loadVoiceMeetingRecording(meetingId);
        if (!row?.blob?.size) {
          toast.error(t('voiceRoom.recordingNotFound'));
          return;
        }
        const url = URL.createObjectURL(row.blob);
        setRecordingPlayback((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { meetingId, url, title: meeting?.title || meeting?.lobbyRoomId || '' };
        });
      } catch {
        toast.error(t('voiceRoom.recordingNotFound'));
      }
    },
    [t]
  );

  const closeRecordingPlayback = useCallback(() => {
    setRecordingPlayback((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  }, []);

  const handleResolveJoinRequest = async (requestId, action) => {
    const room = String(activeRoomId || safeRoomId || meetingCode || '').trim();
    if (!room || !requestId) return;
    try {
      await api.post(
        `/voice/rooms/${encodeURIComponent(room)}/join-requests/${encodeURIComponent(requestId)}/${action}`,
        {},
        { skipGlobalErrorHandling: true }
      );
      setPendingJoinRequests((prev) => prev.filter((r) => String(r.id) !== String(requestId)));
      emitNotificationsRefresh();
      toast.success(action === 'approve' ? t('voiceRoom.approveBtn') : t('voiceRoom.rejectBtn'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('common.errorGeneric') }));
    }
  };

  const handleSendInvites = async () => {
    const room = String(activeRoomId || safeRoomId || meetingCode || '').trim();
    if (!room) return;
    const q = inviteSearch.trim();
    const emails = INVITE_EMAIL_RE.test(q) ? [q.toLowerCase()] : [];
    const friendIds = [...selectedInviteIds];
    if (!friendIds.length && !emails.length) {
      toast.error(t('voiceRoom.inviteNoMatch'));
      return;
    }
    try {
      setInviteSending(true);
      await api.post(
        `/voice/rooms/${encodeURIComponent(room)}/invites`,
        {
          friendIds,
          emails,
          hostName: displayNameInput || localDisplayName,
        },
        { skipGlobalErrorHandling: true }
      );
      toast.success(t('voiceRoom.inviteSentOk'));
      setInviteModalOpen(false);
      setInviteSearch('');
      setSelectedInviteIds([]);
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('voiceRoom.inviteSentFail') }));
    } finally {
      setInviteSending(false);
    }
  };

  const handleJoinMeeting = async () => {
    const code = String(meetingCode || '').trim();
    if (!code) {
      toast.error(t('voiceRoom.meetingIdRequired'));
      return;
    }
    if (roomKind === 'org') {
      if (!selectedOrgId) {
        toast.error(t('voiceRoom.selectOrg'));
        return;
      }
      if (!selectedDeptId) {
        toast.error(t('voiceRoom.selectDept'));
        return;
      }
      initVoiceRoom({
        targetRoomId: code,
        audioEnabled: prejoinAudioEnabled,
        videoEnabled: prejoinVideoEnabled,
        displayName: displayNameInput,
      });
      return;
    }

    const isCreatorFlow =
      roomKind === 'free' &&
      (prejoinMode === 'create' || isRoomHost);

    if (isCreatorFlow) {
      try {
        setJoinRequestSubmitting(true);
        const res = await api.post(
          `/voice/rooms/${encodeURIComponent(code)}/lobby/host`,
          {},
          { skipGlobalErrorHandling: true }
        );
        const data = unwrapVoiceApi(res);
        if (data?.hostUserId) setRoomHostUserId(String(data.hostUserId));
        else setRoomHostUserId(currentUserId);
      } catch (err) {
        const status = err?.status || err?.response?.status;
        const msg = resolveApiErrorMessage(err, { t, fallback: t('common.errorGeneric') });
        if (status !== 409) {
          toast.error(msg);
          setJoinRequestSubmitting(false);
          return;
        }
        setRoomHostUserId(currentUserId);
      }
      setJoinRequestSubmitting(false);
      initVoiceRoom({
        targetRoomId: code,
        audioEnabled: prejoinAudioEnabled,
        videoEnabled: prejoinVideoEnabled,
        displayName: displayNameInput,
      });
      return;
    }

    if (roomKind === 'free' && prejoinMode === 'join') {
      if (joinRequestStatus === 'approved' || isRoomHost) {
        initVoiceRoom({
          targetRoomId: code,
          audioEnabled: prejoinAudioEnabled,
          videoEnabled: prejoinVideoEnabled,
          displayName: displayNameInput,
        });
        return;
      }
      if (joinRequestStatus === 'pending') return;
      try {
        setJoinRequestSubmitting(true);
        await api.post(
          `/voice/rooms/${encodeURIComponent(code)}/join-requests`,
          { displayName: displayNameInput || localDisplayName },
          { skipGlobalErrorHandling: true }
        );
        setJoinRequestStatus('pending');
        joinRequestAwaitingEnterRef.current = true;
        autoEnterOnApproveRef.current = false;
        toast.success(t('voiceRoom.joinRequestSent'));
      } catch (err) {
        const msg = resolveApiErrorMessage(err, { t, fallback: t('common.errorGeneric') });
        if (
          msg.includes('Host does not need') ||
          msg.includes('does not need a join request')
        ) {
          initVoiceRoom({
            targetRoomId: code,
            audioEnabled: prejoinAudioEnabled,
            videoEnabled: prejoinVideoEnabled,
            displayName: displayNameInput,
          });
          return;
        }
        if (msg.includes('host has not started')) {
          toast.error(t('voiceRoom.hostNotStarted'));
        } else {
          toast.error(msg);
        }
      } finally {
        setJoinRequestSubmitting(false);
      }
      return;
    }

    initVoiceRoom({
      targetRoomId: code,
      audioEnabled: prejoinAudioEnabled,
      videoEnabled: prejoinVideoEnabled,
      displayName: displayNameInput,
    });
  };

  const isCreatorPrejoin = useMemo(
    () => roomKind === 'free' && (prejoinMode === 'create' || isRoomHost),
    [roomKind, prejoinMode, isRoomHost]
  );

  const prejoinPrimaryLabel = useMemo(() => {
    if (roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join') {
      if (joinRequestStatus === 'approved') return t('voiceRoom.enterRoomBtn');
      if (joinRequestStatus === 'pending') return t('voiceRoom.waitingApprovalBtn');
      return t('voiceRoom.requestJoinBtn');
    }
    return t('voiceRoom.startBtn');
  }, [roomKind, isCreatorPrejoin, prejoinMode, joinRequestStatus, t]);

  const prejoinPrimaryDisabled =
    joinRequestSubmitting ||
    (viewStage === 'prejoin' && joining) ||
    (roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'pending');

  const clockNow = new Date();
  const dateLine = clockNow
    .toLocaleDateString(timeLocale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    .toUpperCase();

  const voiceNav = useMemo(
    () => [
      {
        id: 'new',
        label: t('voiceRoom.newMeeting'),
        icon: Plus,
        onClick: handleNewMeeting,
      },
      {
        id: 'join',
        label: t('voiceRoom.joinNav'),
        icon: LogIn,
        onClick: openJoinModal,
      },
      {
        id: 'schedule',
        label: t('voiceRoom.schedule'),
        icon: Calendar,
        onClick: () => navigate('/calendar'),
      },
      {
        id: 'settings',
        label: t('voiceRoom.settingsTitle'),
        icon: Settings,
        onClick: () => {
          setSettingsTab('audio');
          setSettingsOpen(true);
        },
      },
    ],
    [navigate, t, handleNewMeeting, openJoinModal]
  );

  /** Khung lobby: sáng = cùng tông shell app; tối = nền đen (trước khi vào phòng) */
  const voiceLobby = useMemo(
    () =>
      `flex min-h-0 flex-1 w-full flex-col overflow-hidden lg:flex-row ${
        isDarkMode ? 'bg-black' : 'bg-white/55 backdrop-blur-sm'
      }`,
    [isDarkMode]
  );

  const renderMeetingTile = (tile, index) => {
    const extra = [tileItemClass(layoutMode, index), soloTileClass].filter(Boolean).join(' ');
    const legacyClasses = {
      tileBase:
        'relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-black/40 md:min-h-[260px]',
      tileSpeaking: 'border-emerald-400/50 shadow-[0_0_20px_rgba(52,211,153,0.2)]',
      tileSpeakingLocal: 'border-emerald-400/60 shadow-[0_0_24px_rgba(52,211,153,0.25)]',
      tileIdle: 'border-white/10',
      videoClass: 'h-full min-h-[200px] w-full flex-1 object-cover',
      avatarFallback:
        'flex min-h-[220px] flex-1 flex-col items-center justify-center gap-3 bg-zinc-900/80 md:min-h-[260px]',
    };

    if (tile.kind === 'local') {
      return (
        <VoiceMeetingTile
          key="local"
          suiteLayout={suiteLayout}
          extraClass={extra}
          isSpeaking={isLocalSpeaking && !isMuted}
          isMuted={isMuted}
          name={displayNameInput || localDisplayName}
          youLabel={t('voiceRoom.youBadge')}
          roleLabel={isRoomHost ? t('voiceRoom.host') : ''}
          showYouBadge
          hasVideo={hasLocalVideoTrack && !isCameraOff}
          videoRef={localVideoRef}
          videoStream={mediasoupRef.current.localStream}
          localAvatar={localAvatar}
          localUserId={user?.id || user?._id}
          avatarSize="hero"
          legacyClasses={{
            ...legacyClasses,
            tileSpeaking: legacyClasses.tileSpeakingLocal,
            avatarFallback:
              'flex min-h-[220px] flex-1 flex-col items-center justify-center gap-4 bg-gradient-to-b from-zinc-900/80 to-black/80 md:min-h-[260px]',
          }}
        />
      );
    }

    const participant = tile.participant;
    const pName = participant.displayName || participant.userId || t('voiceRoom.memberFallback');
    const hasRemoteVideo = participant.stream && participant.stream.getVideoTracks().length > 0;

    return (
      <VoiceMeetingTile
        key={participant.socketId}
        suiteLayout={suiteLayout}
        extraClass={extra}
        isSpeaking={Boolean(remoteSpeakingMap[participant.socketId])}
        isMuted={false}
        name={pName}
        hasVideo={hasRemoteVideo}
        videoStream={participant.stream}
        camOffLabel={t('voiceRoom.camOff')}
        showHostActions={suiteLayout && isRoomHost && roomKind === 'free'}
        onHoverMute={() => toast.success(t('voiceRoom.toastMuteParticipant', { name: pName }))}
        onHoverKick={() => toast.error(t('voiceRoom.toastKickParticipant', { name: pName }))}
        legacyClasses={legacyClasses}
      />
    );
  };

  const renderVoiceSidePanelBody = () => (
    <>
      <div className={FIGMA_VOICE_SIDE_TAB_ROW}>
        {[
          { id: 'people', label: t('voiceRoom.toolbarMembers') },
          { id: 'chat', label: t('voiceRoom.toolbarChat') },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRightPanel(tab.id)}
            className={figmaVoiceSideTab(rightPanel === tab.id)}
          >
            {tab.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setRightPanel(null)}
          className={FIGMA_VOICE_SIDE_CLOSE_BTN}
          aria-label={t('voiceRoom.closeAria')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {rightPanel === 'chat' && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
            {roomMessages.map((m) => {
              const accent = voiceParticipantColor(m.userName || localDisplayName);
              return (
                <div key={m.id} className="flex gap-1.5">
                  <div
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.55rem] font-bold"
                    style={{ background: `${accent}25`, color: accent }}
                  >
                    {voiceParticipantInitials(m.userName || localDisplayName)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 text-[0.6875rem] font-semibold" style={{ color: accent }}>
                      {m.userName || localDisplayName}
                    </div>
                    <p className="m-0 text-[0.8125rem] leading-relaxed text-foreground/80">{m.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="relative shrink-0 border-t border-white/[0.07] p-2.5">
            <div className="flex gap-1.5">
              <input
                value={roomChatInput}
                onChange={(e) => setRoomChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const text = roomChatInput.trim();
                    if (!text || !allowParticipantChat) return;
                    setRoomMessages((prev) => [
                      ...prev,
                      {
                        id: `${Date.now()}`,
                        text,
                        userName: displayNameInput || localDisplayName,
                        timeLabel: clockNow.toLocaleTimeString(timeLocale, {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        }),
                      },
                    ]);
                    setRoomChatInput('');
                  }
                }}
                disabled={!allowParticipantChat}
                placeholder={
                  allowParticipantChat ? t('voiceRoom.chatPlaceholder') : t('voiceRoom.chatDisabled')
                }
                className={FIGMA_VOICE_CHAT_INPUT}
              />
              <button
                type="button"
                className={FIGMA_VOICE_CHAT_SEND_BTN}
                disabled={!allowParticipantChat || !roomChatInput.trim()}
                onClick={() => {
                  const text = roomChatInput.trim();
                  if (!text) return;
                  setRoomMessages((prev) => [
                    ...prev,
                    {
                      id: `${Date.now()}`,
                      text,
                      userName: displayNameInput || localDisplayName,
                      timeLabel: clockNow.toLocaleTimeString(timeLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      }),
                    },
                  ]);
                  setRoomChatInput('');
                }}
              >
                <Send className="h-3.5 w-3.5" aria-hidden />
              </button>
            </div>
          </div>
        </div>
      )}

      {rightPanel === 'people' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          <div className={FIGMA_VOICE_PEOPLE_ROW}>
            <div
              className={FIGMA_VOICE_PEOPLE_AVATAR}
              style={{
                background: `${voiceParticipantColor(displayNameInput || localDisplayName)}25`,
                color: voiceParticipantColor(displayNameInput || localDisplayName),
                border: isLocalSpeaking && !isMuted ? `2px solid ${voiceParticipantColor(displayNameInput || localDisplayName)}` : '2px solid transparent',
              }}
            >
              {voiceParticipantInitials(displayNameInput || localDisplayName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[0.8125rem] font-medium text-foreground">
                {displayNameInput || localDisplayName}
              </div>
              {isRoomHost ? (
                <div className="text-[0.6875rem] font-semibold text-primary">{t('voiceRoom.host')}</div>
              ) : null}
            </div>
            <div className="flex gap-1">
              {isMuted ? <MicOff className="h-3.5 w-3.5 text-destructive" aria-hidden /> : null}
              {isCameraOff ? <VideoOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden /> : null}
            </div>
          </div>
          {participants.map((p) => {
            const pName = p.displayName || p.userId || t('voiceRoom.memberFallback');
            const accent = voiceParticipantColor(pName);
            const speaking = Boolean(remoteSpeakingMap[p.socketId]);
            return (
              <div key={p.socketId} className={FIGMA_VOICE_PEOPLE_ROW}>
                <div
                  className={FIGMA_VOICE_PEOPLE_AVATAR}
                  style={{
                    background: `${accent}25`,
                    color: accent,
                    border: speaking ? `2px solid ${accent}` : '2px solid transparent',
                  }}
                >
                  {voiceParticipantInitials(pName)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8125rem] font-medium text-foreground">{pName}</div>
                </div>
                <VideoOff className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
              </div>
            );
          })}
          {isRoomHost ? (
            <button
              type="button"
              onClick={() => setInviteModalOpen(true)}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
            >
              <UserPlus className="h-4 w-4" />
              {t('voiceRoom.addPeopleTitle')}
            </button>
          ) : null}
          {roomKind === 'free' && isRoomHost ? (
            <div className="mt-4">
              <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
                {t('voiceRoom.pendingApprovalTitle')}
              </p>
              {pendingJoinRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('voiceRoom.pendingApprovalEmpty')}</p>
              ) : (
                <ul className="space-y-2">
                  {pendingJoinRequests.map((req) => (
                    <li
                      key={req.id}
                      className="flex items-center gap-2 rounded-lg border border-warning/20 bg-warning/5 p-2"
                    >
                      <div
                        className={FIGMA_VOICE_PEOPLE_AVATAR}
                        style={{
                          background: `${voiceParticipantColor(req.displayName || req.userId)}25`,
                          color: voiceParticipantColor(req.displayName || req.userId),
                        }}
                      >
                        {voiceParticipantInitials(req.displayName || req.userId || '?')}
                      </div>
                      <div className="min-w-0 flex-1 truncate text-sm text-foreground">
                        {req.displayName || req.userId}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResolveJoinRequest(req.id, 'approve')}
                        className="rounded-md bg-success px-2 py-1 text-xs font-semibold text-white hover:bg-success/90"
                      >
                        {t('voiceRoom.approveBtn')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResolveJoinRequest(req.id, 'reject')}
                        className="rounded-md border border-white/20 px-2 py-1 text-xs text-muted-foreground hover:bg-white/10"
                      >
                        {t('voiceRoom.rejectBtn')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>
      )}
    </>
  );

  useEffect(() => {
    return () => {
      if (recordingPlayback?.url) URL.revokeObjectURL(recordingPlayback.url);
    };
  }, [recordingPlayback]);

  return (
    <div
      className={
        suiteLayout
          ? `${FIGMA_PAGE_SHELL} flex h-full min-h-0 overflow-hidden`
          : `flex h-screen max-h-[100dvh] overflow-hidden ${isDarkMode ? 'bg-[#050810]' : appShellBg(false)}`
      }
    >
      {!suiteLayout && <NavigationSidebar landingDemo={landingDemo} />}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {viewStage !== 'inRoom' ? (
          suiteLayout && viewStage === 'home' ? (
            <VoiceLobbyView
              roomCode={meetingCode}
              onRoomCodeChange={setMeetingCode}
              onCreateRoom={handleNewMeeting}
              onJoinByCode={handleLobbyJoinByCode}
              meetings={lobbyRooms}
              onJoinRoom={handleLobbyJoinRoom}
              onPlayRecording={handlePlayRecording}
              locale={timeLocale}
              liveRoomsCount={lobbyActiveCount}
              createTitle={t('voiceRoom.createTitle')}
              createButtonLabel={t('voiceRoom.createNow')}
              joinTitle={t('voiceRoom.joinModalTitle')}
              joinFieldLabel={t('voiceRoom.roomCode')}
              joinButtonLabel={t('voiceRoom.joinNav')}
            />
          ) : suiteLayout && viewStage === 'prejoin' ? (
            <div className={FIGMA_VOICE_LOBBY_ROOT}>
              <header className={FIGMA_VOICE_LOBBY_HEADER}>
                <div className={FIGMA_VOICE_LOBBY_HEADER_ICON}>
                  <Mic className="h-3.5 w-3.5 text-warning" aria-hidden />
                </div>
                <h4 className={FIGMA_VOICE_LOBBY_HEADER_TITLE}>{t('voiceRoom.pageTitle')}</h4>
                <div className={FIGMA_VOICE_LOBBY_LIVE_BADGE}>
                  <span className={FIGMA_VOICE_LOBBY_LIVE_DOT} />
                  <span className={FIGMA_VOICE_LOBBY_LIVE_TEXT}>
                    {lobbyActiveCount > 0
                      ? t('voiceRoom.liveRoomsCount', { n: lobbyActiveCount })
                      : t('voiceRoom.liveRoomsEmpty')}
                  </span>
                </div>
              </header>

              <div className={FIGMA_VOICE_LOBBY_SCROLL}>
                <div className={FIGMA_VOICE_LOBBY_PAGE_INNER}>
                  <div className={FIGMA_VOICE_LOBBY_PREJOIN_GRID}>
                  <section className={`${FIGMA_VOICE_LOBBY_CREATE_CARD} min-w-0 xl:sticky xl:top-4`}>
                    <div className={FIGMA_VOICE_LOBBY_CREATE_ICON}>
                      <Video className="h-[22px] w-[22px] text-primary-foreground" aria-hidden />
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      {t('voiceRoom.previewTitle')}
                    </h3>
                    <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                      {t('voiceRoom.previewSubtitle')}
                    </p>
                    <div className="overflow-hidden rounded-2xl border border-border bg-background/70 shadow-inner">
                      <div className="relative aspect-video max-h-[min(42vh,300px)] w-full bg-black sm:max-h-[min(48vh,360px)] lg:max-h-none">
                        {prejoinVideoEnabled ? (
                          <video
                            ref={prejoinVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-surface-raised to-background">
                            <UserAvatar
                              avatar={localAvatar}
                              userId={user?.id || user?._id}
                              name={displayNameInput || localDisplayName}
                              size="2xl"
                            />
                            <span className="text-sm text-muted-foreground">
                              {t('voiceRoom.camOffShort')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 gap-2 border-t border-border bg-surface p-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => setPrejoinAudioEnabled((v) => !v)}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                            prejoinAudioEnabled
                              ? 'border border-border bg-background text-foreground hover:border-primary/30'
                              : 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
                          }`}
                        >
                          {prejoinAudioEnabled ? (
                            <Mic className="h-4 w-4" aria-hidden />
                          ) : (
                            <MicOff className="h-4 w-4" aria-hidden />
                          )}
                          {prejoinAudioEnabled ? t('voiceRoom.micOn') : t('voiceRoom.micOff')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPrejoinVideoEnabled((v) => !v)}
                          className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                            prejoinVideoEnabled
                              ? 'border border-border bg-background text-foreground hover:border-primary/30'
                              : 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90'
                          }`}
                        >
                          {prejoinVideoEnabled ? (
                            <Video className="h-4 w-4" aria-hidden />
                          ) : (
                            <VideoOff className="h-4 w-4" aria-hidden />
                          )}
                          {prejoinVideoEnabled ? t('voiceRoom.camOn') : t('voiceRoom.camBtnOff')}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className={`${FIGMA_VOICE_LOBBY_JOIN_CARD} min-w-0`}>
                    <div className="mb-[18px] flex h-12 w-12 items-center justify-center rounded-xl border border-cyan-500/20 bg-cyan-500/10">
                      {prejoinMode === 'create' ? (
                        <Plus className="h-[22px] w-[22px] text-cyan-400" aria-hidden />
                      ) : (
                        <LogIn className="h-[22px] w-[22px] text-cyan-400" aria-hidden />
                      )}
                    </div>
                    <h3 className="mb-2 text-base font-semibold text-foreground">
                      {prejoinMode === 'create' ? t('voiceRoom.createTitle') : t('voiceRoom.joinTitle')}
                    </h3>
                    <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                      {t('voiceRoom.controlsTitle')}
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                          {t('voiceRoom.roomCode')}
                        </label>
                        <input
                          value={meetingCode}
                          readOnly={prejoinMode === 'create'}
                          onChange={(e) => {
                            if (prejoinMode === 'create') return;
                            setMeetingCode(e.target.value);
                          }}
                          placeholder="VH-XXXXXX"
                          className={`h-11 w-full rounded-[9px] border px-3 font-mono text-[0.9375rem] tracking-[0.08em] outline-none transition ${
                            prejoinMode === 'create'
                              ? 'cursor-default border-border bg-muted text-muted-foreground'
                              : 'border-border bg-input-background text-foreground placeholder:text-muted-foreground focus:border-cyan-400 focus:shadow-[0_0_0_3px_rgba(34,211,238,0.14)]'
                          }`}
                        />
                      </div>

                      <div>
                        <span className="mb-2 block text-xs font-semibold uppercase text-muted-foreground">
                          {t('voiceRoom.roomKind')}
                        </span>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {[
                            { id: 'free', label: t('voiceRoom.roomTypeFree') },
                            { id: 'org', label: t('voiceRoom.roomTypeOrg') },
                          ].map((kind) => (
                            <button
                              key={kind.id}
                              type="button"
                              onClick={() => {
                                setRoomKind(kind.id);
                                if (kind.id === 'free') {
                                  setSelectedOrgId('');
                                  setSelectedDeptId('');
                                }
                              }}
                              className={`rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${
                                roomKind === kind.id
                                  ? 'border-primary/40 bg-primary/10 text-primary shadow-sm'
                                  : 'border-border bg-surface text-foreground hover:border-primary/25 hover:bg-muted'
                              }`}
                            >
                              {kind.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {roomKind === 'org' ? (
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                              {t('voiceRoom.orgLabel')}
                            </span>
                            <select
                              value={selectedOrgId}
                              onChange={(e) => {
                                setSelectedOrgId(e.target.value);
                                setSelectedDeptId('');
                              }}
                              disabled={orgsLoading}
                              className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50"
                            >
                              <option value="">
                                {orgsLoading ? t('common.loadingEllipsis') : t('voiceRoom.selectOrgPh')}
                              </option>
                              {organizations.map((o) => (
                                <option key={String(o._id || o.id)} value={String(o._id || o.id)}>
                                  {o.name || t('common.org')}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                              {t('voiceRoom.deptLabel')}
                            </span>
                            <select
                              value={selectedDeptId}
                              onChange={(e) => setSelectedDeptId(e.target.value)}
                              disabled={!selectedOrgId}
                              className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition focus:border-primary disabled:opacity-50"
                            >
                              <option value="">{t('voiceRoom.selectDeptPh')}</option>
                              {departments.map((d) => (
                                <option key={String(d._id || d.id)} value={String(d._id || d.id)}>
                                  {d.name || t('common.department')}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                      ) : null}

                      <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                          {t('voiceRoom.displayName')}
                        </span>
                        <input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder={localDisplayName}
                          className="h-11 w-full rounded-[9px] border border-border bg-input-background px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary"
                        />
                      </label>

                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={!prejoinAudioEnabled}
                            onChange={(e) => setPrejoinAudioEnabled(!e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                          />
                          {t('voiceRoom.muteJoin')}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-foreground">
                          <input
                            type="checkbox"
                            checked={!prejoinVideoEnabled}
                            onChange={(e) => setPrejoinVideoEnabled(!e.target.checked)}
                            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
                          />
                          {t('voiceRoom.camOffJoin')}
                        </label>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleJoinMeeting}
                      disabled={prejoinPrimaryDisabled}
                      className={`${FIGMA_VOICE_LOBBY_PRIMARY_BTN} mt-6 w-full justify-center disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0`}
                    >
                      <Mic className="h-[15px] w-[15px]" aria-hidden />
                      {joinRequestSubmitting ? t('voiceRoom.connectingRoom') : prejoinPrimaryLabel}
                    </button>

                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'pending' ? (
                      <p className="mt-3 rounded-lg border border-warning/20 bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
                        {t('voiceRoom.joinRequestSent')}
                      </p>
                    ) : null}
                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'approved' ? (
                      <p className="mt-3 rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-center text-xs font-medium text-success">
                        {t('voiceRoom.joinRequestApproved')}
                      </p>
                    ) : null}
                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'rejected' ? (
                      <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-center text-xs font-medium text-destructive">
                        {t('voiceRoom.joinRequestRejected')}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={handlePrejoinCancel}
                      className="mt-3 w-full rounded-lg py-2 text-center text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      {t('nav.cancel')}
                    </button>
                  </section>
                </div>
                </div>
              </div>
            </div>
          ) : (
          <div className={voiceLobby}>
            {/* Cột trái: menu (hình 1) */}
            <aside
              className={`flex h-full min-h-0 w-52 shrink-0 flex-col overflow-hidden border-r py-4 md:w-56 ${
                isDarkMode ? 'border-white/10' : 'border-slate-200 bg-white/50'
              }`}
            >
              <div className="shrink-0 space-y-1 px-3">
              {voiceNav.map((item) => {
                const active =
                  (item.id === 'new' &&
                    !settingsOpen &&
                    (viewStage === 'home' ||
                      (viewStage === 'prejoin' && prejoinMode === 'create'))) ||
                  (item.id === 'join' &&
                    (joinModalOpen || (viewStage === 'prejoin' && prejoinMode === 'join'))) ||
                  (item.id === 'settings' && settingsOpen);
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={item.onClick}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? isDarkMode
                          ? 'border border-cyan-500/50 bg-white/[0.06] text-white shadow-[0_0_28px_rgba(6,182,212,0.2)]'
                          : 'border border-cyan-500/60 bg-cyan-50 text-slate-900 shadow-md'
                        : isDarkMode
                          ? 'text-gray-500 hover:bg-white/5 hover:text-gray-200'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0 opacity-90" strokeWidth={1.75} />
                    <span className="text-sm font-medium leading-tight">{item.label}</span>
                  </button>
                );
              })}
              </div>
              <div className="scrollbar-voice-sidebar min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 pl-3 pr-1.5">
              <div className={`mt-4 border-t pt-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`mb-2 px-2 text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                  Ban be
                </div>
                <div className="space-y-1.5">
                  {voiceFriends.length === 0 ? (
                    <div className={`rounded-xl px-3 py-2 text-xs ${isDarkMode ? 'bg-white/[0.04] text-gray-500' : 'bg-slate-100 text-slate-500'}`}>
                      Chua co ban be de goi nhanh
                    </div>
                  ) : (
                    voiceFriends.map((friend) => (
                      <button
                        key={friend.id}
                        type="button"
                        onClick={() => {
                          setRoomKind('free');
                          setViewStage('prejoin');
                          setInviteModalOpen(true);
                        }}
                        className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition ${
                          isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-100'
                        }`}
                      >
                        <UserAvatar
                          avatar={friend.avatar}
                          userId={friend.id || friend.userId}
                          name={friend.label}
                          size="chip"
                        />
                        <span className="min-w-0">
                          <span className={`block truncate text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                            {friend.label}
                          </span>
                          <span className={`block truncate text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                            {friend.subtitle || 'Friend'}
                          </span>
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className={`mt-4 border-t pt-4 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`}>
                <div className={`mb-2 px-2 text-[11px] font-bold uppercase tracking-wider ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                  Lich su cuoc goi
                </div>
                <div className="space-y-1.5">
                  {recentCalls.length === 0 ? (
                    <div className={`rounded-xl px-3 py-2 text-xs ${isDarkMode ? 'bg-white/[0.04] text-gray-500' : 'bg-slate-100 text-slate-500'}`}>
                      Chua co cuoc goi gan day
                    </div>
                  ) : (
                    recentCalls.map((item) => (
                      <button
                        key={`${item.roomId}-${item.joinedAt}`}
                        type="button"
                        onClick={() => {
                          setMeetingCode(String(item.roomId || ''));
                          setPrejoinMode('join');
                          setViewStage('prejoin');
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition ${isDarkMode ? 'hover:bg-white/[0.06]' : 'hover:bg-slate-100'}`}
                      >
                        <span className={`min-w-0 truncate text-xs font-semibold ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}>
                          {item.label || item.roomId || 'Voice room'}
                        </span>
                        <span className={`shrink-0 text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}>
                          {item.joinedAt ? new Date(item.joinedAt).toLocaleDateString('vi-VN') : ''}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </div>
              </div>
            </aside>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-6 md:px-8">
              {/* Đồng hồ + ngày */}
              <div className="mb-8 text-center">
                <div
                  className={`text-4xl font-bold tabular-nums tracking-[0.2em] md:text-5xl md:tracking-[0.25em] ${
                    isDarkMode ? 'text-white' : 'text-slate-900'
                  }`}
                  suppressHydrationWarning
                  data-clock-tick={clockTick}
                >
                  {clockNow.toLocaleTimeString(timeLocale, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false,
                  })}
                </div>
                <p
                  className={`mt-3 text-[11px] font-medium uppercase tracking-[0.2em] md:text-xs ${
                    isDarkMode ? 'text-gray-500' : 'text-slate-600'
                  }`}
                >
                  {dateLine}
                </p>
              </div>

              {viewStage === 'home' && (
                <div
                  className={`flex min-h-[min(520px,70vh)] flex-1 flex-col items-center justify-center rounded-2xl border px-6 py-16 ${
                    isDarkMode
                      ? 'border-white/10 bg-[#121212]'
                      : 'border-slate-200 bg-white shadow-md'
                  }`}
                >
                  <p
                    className={`text-lg md:text-xl ${isDarkMode ? 'text-white' : 'text-slate-800'}`}
                  >
                    {t('voiceRoom.noMeetings')}
                  </p>
                  <button
                    type="button"
                    onClick={handleNewMeeting}
                    className="mt-8 rounded-2xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-cyan-900/25 transition hover:brightness-110"
                  >
                    {t('voiceRoom.createNow')}
                  </button>
                </div>
              )}

              {viewStage === 'prejoin' && (
                <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-8 lg:flex-row lg:items-start lg:justify-center lg:gap-8">
                  <div
                    className={`w-full min-w-0 rounded-2xl border p-4 lg:max-w-md lg:flex-1 ${
                      isDarkMode
                        ? 'border-white/10 bg-[#141414]'
                        : 'border-slate-200 bg-white shadow-sm'
                    }`}
                  >
                    <div
                      className={`relative aspect-video overflow-hidden rounded-xl ${
                        isDarkMode ? 'bg-black/50' : 'bg-slate-200'
                      }`}
                    >
                      {prejoinVideoEnabled ? (
                        <video
                          ref={prejoinVideoRef}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-3">
                          <UserAvatar
                            avatar={localAvatar}
                            userId={user?.id || user?._id}
                            name={displayNameInput || localDisplayName}
                            size="2xl"
                          />
                          <span
                            className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                          >
                            {t('voiceRoom.camOffShort')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPrejoinAudioEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinAudioEnabled
                            ? isDarkMode
                              ? 'border border-white/10 bg-black/40 text-white'
                              : 'border border-slate-200 bg-white text-slate-900 shadow-sm'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinAudioEnabled ? t('voiceRoom.micOn') : t('voiceRoom.micOff')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPrejoinVideoEnabled((v) => !v)}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ${
                          prejoinVideoEnabled
                            ? isDarkMode
                              ? 'border border-white/10 bg-black/40 text-white'
                              : 'border border-slate-200 bg-white text-slate-900 shadow-sm'
                            : 'bg-red-600 text-white'
                        }`}
                      >
                        {prejoinVideoEnabled ? t('voiceRoom.camOn') : t('voiceRoom.camBtnOff')}
                      </button>
                    </div>
                  </div>

                  <div
                    className={`w-full min-w-0 rounded-2xl border p-5 sm:p-6 md:p-8 lg:max-w-md lg:shrink-0 ${
                      isDarkMode
                        ? 'border-white/10 bg-[#141414]'
                        : 'border-slate-200 bg-white shadow-sm'
                    }`}
                  >
                    <h2
                      className={`mb-8 text-3xl font-bold lg:text-right ${
                        isDarkMode ? 'text-white' : 'text-slate-900'
                      }`}
                    >
                      {prejoinMode === 'create'
                        ? t('voiceRoom.createTitle')
                        : t('voiceRoom.joinTitle')}
                    </h2>
                    <div className="space-y-5">
                      <div>
                        <label
                          className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.roomCode')}
                        </label>
                        <input
                          value={meetingCode}
                          readOnly={prejoinMode === 'create'}
                          onChange={(e) => {
                            if (prejoinMode === 'create') return;
                            setMeetingCode(e.target.value);
                          }}
                          placeholder="room-abc123"
                          className={`w-full rounded-xl border px-4 py-3 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                            prejoinMode === 'create'
                              ? isDarkMode
                                ? 'cursor-default border-white/10 bg-black/30 text-gray-300'
                                : 'cursor-default border-slate-200 bg-slate-50 text-slate-700'
                              : isDarkMode
                                ? 'border-white/10 bg-black/50 text-white placeholder:text-gray-600'
                                : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                      <div>
                        <span
                          className={`mb-2 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.roomKind')}
                        </span>
                        <div
                          className={`flex flex-wrap gap-4 text-sm ${isDarkMode ? 'text-gray-200' : 'text-slate-800'}`}
                        >
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="voice-room-kind"
                              checked={roomKind === 'free'}
                              onChange={() => {
                                setRoomKind('free');
                                setSelectedOrgId('');
                                setSelectedDeptId('');
                              }}
                              className={`h-4 w-4 text-violet-600 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                            />
                            {t('voiceRoom.roomTypeFree')}
                          </label>
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="radio"
                              name="voice-room-kind"
                              checked={roomKind === 'org'}
                              onChange={() => setRoomKind('org')}
                              className={`h-4 w-4 text-violet-600 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                            />
                            {t('voiceRoom.roomTypeOrg')}
                          </label>
                        </div>
                      </div>
                      {roomKind === 'org' && (
                        <div className="space-y-3">
                          <div>
                            <label
                              className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                            >
                              {t('voiceRoom.orgLabel')}
                            </label>
                            <select
                              value={selectedOrgId}
                              onChange={(e) => {
                                setSelectedOrgId(e.target.value);
                                setSelectedDeptId('');
                              }}
                              disabled={orgsLoading}
                              className={`w-full rounded-xl border px-4 py-3 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-white/10 bg-black/50 text-white'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            >
                              <option value="">
                                {orgsLoading ? t('common.loadingEllipsis') : t('voiceRoom.selectOrgPh')}
                              </option>
                              {organizations.map((o) => (
                                <option key={String(o._id || o.id)} value={String(o._id || o.id)}>
                                  {o.name || t('common.org')}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label
                              className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                            >
                              {t('voiceRoom.deptLabel')}
                            </label>
                            <select
                              value={selectedDeptId}
                              onChange={(e) => setSelectedDeptId(e.target.value)}
                              disabled={!selectedOrgId}
                              className={`w-full rounded-xl border px-4 py-3 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/40 disabled:opacity-50 ${
                                isDarkMode
                                  ? 'border-white/10 bg-black/50 text-white'
                                  : 'border-slate-200 bg-white text-slate-900'
                              }`}
                            >
                              <option value="">{t('voiceRoom.selectDeptPh')}</option>
                              {departments.map((d) => (
                                <option key={String(d._id || d.id)} value={String(d._id || d.id)}>
                                  {d.name || t('common.department')}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}
                      <div>
                        <label
                          className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                        >
                          {t('voiceRoom.displayName')}
                        </label>
                        <input
                          value={displayNameInput}
                          onChange={(e) => setDisplayNameInput(e.target.value)}
                          placeholder={localDisplayName}
                          className={`w-full rounded-xl border px-4 py-3 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                            isDarkMode
                              ? 'border-white/10 bg-black/50 text-white placeholder:text-gray-600'
                              : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                          }`}
                        />
                      </div>
                      <label
                        className={`flex cursor-pointer items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!prejoinAudioEnabled}
                          onChange={(e) => setPrejoinAudioEnabled(!e.target.checked)}
                          className={`h-4 w-4 rounded text-cyan-600 focus:ring-cyan-500 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                        />
                        {t('voiceRoom.muteJoin')}
                      </label>
                      <label
                        className={`flex cursor-pointer items-center gap-3 text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={!prejoinVideoEnabled}
                          onChange={(e) => setPrejoinVideoEnabled(!e.target.checked)}
                          className={`h-4 w-4 rounded text-cyan-600 focus:ring-cyan-500 ${isDarkMode ? 'border-white/20 bg-black/50' : 'border-slate-300 bg-white'}`}
                        />
                        {t('voiceRoom.camOffJoin')}
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={handleJoinMeeting}
                      disabled={prejoinPrimaryDisabled}
                      className="mt-8 w-full rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 py-3.5 text-center text-base font-semibold text-white shadow-lg transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {joinRequestSubmitting ? t('voiceRoom.connectingRoom') : prejoinPrimaryLabel}
                    </button>
                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'pending' ? (
                      <p
                        className={`mt-3 text-center text-xs ${isDarkMode ? 'text-gray-500' : 'text-slate-500'}`}
                      >
                        {t('voiceRoom.joinRequestSent')}
                      </p>
                    ) : null}
                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'approved' ? (
                      <p
                        className={`mt-3 text-center text-xs ${isDarkMode ? 'text-emerald-500' : 'text-emerald-600'}`}
                      >
                        {t('voiceRoom.joinRequestApproved')}
                      </p>
                    ) : null}
                    {roomKind === 'free' && !isCreatorPrejoin && prejoinMode === 'join' && joinRequestStatus === 'rejected' ? (
                      <p className="mt-3 text-center text-xs text-red-500">{t('voiceRoom.joinRequestRejected')}</p>
                    ) : null}
                    <button
                      type="button"
                      onClick={handlePrejoinCancel}
                      className={`mt-4 w-full py-2 text-center text-sm transition ${
                        isDarkMode
                          ? 'text-gray-500 hover:text-gray-300'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t('nav.cancel')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
          )
        ) : (
          <div
            ref={meetingRootRef}
            className={`${figmaVoiceRoomRoot(suiteLayout)}${suiteLayout ? ' flex flex-col' : ''}`}
          >
            <div className="sr-only" aria-hidden>
              {participants.map((p) => (
                <audio
                  key={p.socketId}
                  ref={(el) => {
                    if (el) {
                      audioElsRef.current.set(p.socketId, el);
                      if (p.stream) {
                        void bindAndPlayRemoteAudio(el, p.stream, remoteOutputOptsRef.current);
                      } else {
                        void applyRemoteAudioElement(el, remoteOutputOptsRef.current);
                      }
                    } else {
                      audioElsRef.current.delete(p.socketId);
                    }
                  }}
                  autoPlay
                  playsInline
                />
              ))}
            </div>
            {error && (
              <div className="absolute right-5 top-5 z-30 max-w-xs rounded-lg bg-destructive/90 px-3 py-2 text-xs text-destructive-foreground">
                {error}
              </div>
            )}
            {joining && (
              <div
                className={`absolute right-5 z-30 rounded-full px-4 py-2 text-sm shadow-lg backdrop-blur-md ${
                  suiteLayout
                    ? 'top-16 border border-white/10 bg-surface-raised/95 text-foreground'
                    : 'top-16 bg-zinc-900/95 text-gray-300'
                }`}
              >
                {t('voiceRoom.connectingRoom')}
              </div>
            )}

            {(() => {
              const topBarInner = (
                <>
                  <span
                    className={
                      suiteLayout
                        ? `${FIGMA_VOICE_STATUS_DOT} vh-anim-fade-in`
                        : 'h-2 w-2 shrink-0 rounded-full bg-emerald-500'
                    }
                    title={connected ? t('voiceRoom.connected') : t('voiceRoom.connecting')}
                  />
                  <span className={suiteLayout ? FIGMA_VOICE_TOP_TITLE : 'max-w-[140px] truncate font-semibold tracking-tight md:max-w-[220px]'}>
                    {suiteLayout ? inRoomTitle : currentMeetingCode}
                  </span>
                  {suiteLayout ? (
                    <span className={FIGMA_VOICE_TOP_CHANNEL}>{inRoomChannelLabel}</span>
                  ) : null}
                  {!suiteLayout ? (
                    <>
                      <span className="text-white/25">|</span>
                      <Users className="h-4 w-4 shrink-0 text-white/70" aria-hidden />
                      <span className="tabular-nums">{totalParticipants}</span>
                    </>
                  ) : null}
                  {suiteLayout ? (
                    <span className={FIGMA_VOICE_WIFI_BADGE} title={connected ? t('voiceRoom.connected') : t('voiceRoom.connecting')}>
                      <Wifi className={FIGMA_VOICE_WIFI_ICON} aria-hidden />
                      <span className={FIGMA_VOICE_WIFI_TEXT}>
                        {connected ? t('voiceRoom.connected') : t('voiceRoom.connecting')}
                      </span>
                    </span>
                  ) : null}
                  <span className={suiteLayout ? 'ml-auto flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground' : FIGMA_VOICE_TOP_DIVIDER}>
                    {suiteLayout ? (
                      <>
                        <Clock className="h-3.5 w-3.5" aria-hidden />
                        <span className={FIGMA_VOICE_TOP_META}>{formatCallDuration(callDurationSec)}</span>
                      </>
                    ) : (
                      '|'
                    )}
                  </span>
                  {!suiteLayout ? (
                    <>
                      <span className="text-white/25">|</span>
                      <span className="tabular-nums text-white/90">{formatCallDuration(callDurationSec)}</span>
                    </>
                  ) : null}
                  {suiteLayout ? (
                    <div className={FIGMA_VOICE_AVATAR_STACK}>
                      {avatarStackItems.rows.map((item, i) => (
                        <div
                          key={item.id}
                          className={FIGMA_VOICE_AVATAR_STACK_CHIP}
                          style={{ background: item.color, marginLeft: i > 0 ? '-8px' : undefined }}
                        >
                          {item.initials}
                        </div>
                      ))}
                      {avatarStackItems.overflow > 0 ? (
                        <div className={FIGMA_VOICE_AVATAR_STACK_OVERFLOW} style={{ marginLeft: '-8px' }}>
                          +{avatarStackItems.overflow}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </>
              );

              const gridContent = (
                <div className={figmaVoiceGridInner(suiteLayout, layoutTiles.length)}>
                  <div
                    className={
                      suiteLayout
                        ? 'w-full'
                        : 'rounded-2xl border-2 border-violet-500/35 bg-black/30 p-4 shadow-[0_0_60px_rgba(139,92,246,0.08)] md:p-6'
                    }
                  >
                    {layoutTiles.length === 0 ? (
                      <p className="py-12 text-center text-sm text-muted-foreground">{t('voiceRoom.noVideoTiles')}</p>
                    ) : layoutMode === 'sidebar' && layoutTiles.length > 1 ? (
                      <div className={`${meetingGridClass} min-h-[200px]`}>
                        <div className="min-h-0 min-w-0 flex-1 lg:flex-[3]">
                          {renderMeetingTile(layoutTiles[0], 0)}
                        </div>
                        <div className="flex flex-col gap-3 overflow-y-auto lg:max-h-[min(70vh,560px)] lg:w-52 lg:shrink-0">
                          {layoutTiles.slice(1).map((tile, i) => renderMeetingTile(tile, i + 1))}
                        </div>
                      </div>
                    ) : (
                      <div className={meetingGridClass}>
                        {layoutTiles.map((tile, i) => renderMeetingTile(tile, i))}
                      </div>
                    )}
                  </div>
                </div>
              );

              return suiteLayout ? (
                <>
                  <div className={`hidden lg:flex ${figmaVoiceTopBar(suiteLayout, { fullWidth: true })}`}>
                    {topBarInner}
                  </div>
                  <div className={FIGMA_VOICE_MAIN_ROW}>
                    <div className={`${FIGMA_VOICE_GRID_AREA_INLINE} relative`}>
                      {pipOpen && (
                        <div className="pointer-events-none absolute inset-0 z-[25] flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center backdrop-blur-sm">
                          <p className="max-w-md text-lg text-foreground">{t('voiceRoom.pipBody')}</p>
                          <p className="max-w-md text-sm text-muted-foreground">{t('voiceRoom.pipSecondLine')}</p>
                          <button
                            type="button"
                            className="pointer-events-auto rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                            onClick={() => setPipOpen(false)}
                          >
                            {t('voiceRoom.pipRestore')}
                          </button>
                        </div>
                      )}
                      <div className={`lg:hidden ${figmaVoiceTopBar(suiteLayout)}`}>{topBarInner}</div>
                      <div className={FIGMA_VOICE_GRID_SCROLL}>{gridContent}</div>
                    </div>
                    {rightPanel ? (
                      <div className={`hidden lg:flex ${figmaVoiceSidePanel(suiteLayout, true, { inline: true })}`}>
                        {renderVoiceSidePanelBody()}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <div className={figmaVoiceTopBar(suiteLayout)}>{topBarInner}</div>
                  <div className="pointer-events-none absolute bottom-28 left-4 z-20 text-left text-sm text-white/90 md:bottom-32 md:left-8">
                    <div className="tabular-nums font-medium" suppressHydrationWarning>
                      {clockNow.toLocaleTimeString(timeLocale, {
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                    </div>
                    <div className="mt-0.5 max-w-[200px] truncate text-xs text-white/45">{currentMeetingCode}</div>
                  </div>
                  <div className={figmaVoiceGridArea(suiteLayout)}>{gridContent}</div>
                </>
              );
            })()}

            {isFullscreen && (
              <div className="pointer-events-none absolute left-0 right-0 top-0 z-[60] flex justify-center px-4 pt-3">
                <div className="pointer-events-auto flex max-w-lg items-center gap-3 rounded-lg bg-black/85 px-4 py-2 text-xs text-white shadow-lg backdrop-blur-md md:text-sm">
                  <span className="text-white/85">
                    {t('voiceRoom.fullscreenExitHint')}{' '}
                    <button
                      type="button"
                      className="font-semibold text-sky-400 underline hover:text-sky-300"
                      onClick={() => document.exitFullscreen?.()}
                    >
                      {t('voiceRoom.exitShort')}
                    </button>
                  </span>
                </div>
              </div>
            )}

            {pipOpen && (
              <div
                className="fixed z-[55] overflow-hidden rounded-lg border border-white/20 bg-black shadow-2xl"
                style={{
                  left: pipBox.x,
                  top: pipBox.y,
                  width: pipBox.w,
                  height: pipBox.h,
                }}
              >
                <div
                  className="flex cursor-move items-center justify-between gap-2 border-b border-white/10 bg-surface-raised/95 px-2 py-1.5"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pipDragging.current = {
                      type: 'move',
                      sx: e.clientX,
                      sy: e.clientY,
                      ox: pipBox.x,
                      oy: pipBox.y,
                    };
                  }}
                >
                  <span className="truncate text-[11px] text-white/80">{t('voiceRoom.pipLabel')}</span>
                  <button
                    type="button"
                    className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"
                    onClick={() => setPipOpen(false)}
                    aria-label={t('voiceRoom.closePipAria')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="relative bg-black" style={{ height: pipBox.h - 40 }}>
                  {hasLocalVideoTrack && !isCameraOff ? (
                    <video
                      ref={pipVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-surface-raised text-sm text-muted-foreground">
                      {t('voiceRoom.camOffShort')}
                    </div>
                  )}
                  <button
                    type="button"
                    className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize opacity-70"
                    aria-label={t('voiceRoom.zoomAria')}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      pipDragging.current = {
                        type: 'resize',
                        sx: e.clientX,
                        sy: e.clientY,
                        ow: pipBox.w,
                        oh: pipBox.h,
                      };
                    }}
                  >
                    <span className="block h-full w-full border-r-2 border-b-2 border-white/50" />
                  </button>
                </div>
              </div>
            )}

            {/* Thanh điều khiển nổi (hình 3) */}
            <div className={figmaVoiceCtrlOuter(suiteLayout)}>
              <div className={figmaVoiceCtrlPill(suiteLayout)}>
                <div className={suiteLayout ? FIGMA_VOICE_CTRL_GROUP : 'flex items-end gap-1 sm:gap-3'}>
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarAudio')}
                    icon={Mic}
                    iconOff={MicOff}
                    active={!isMuted}
                    onClick={toggleMute}
                    chevron
                    suiteLayout={suiteLayout}
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarVideo')}
                    icon={Video}
                    iconOff={VideoOff}
                    active={!isCameraOff}
                    onClick={toggleCamera}
                    chevron
                    suiteLayout={suiteLayout}
                  />
                </div>

                {suiteLayout && <div className={FIGMA_VOICE_CTRL_DIVIDER} aria-hidden />}

                <div
                  className={
                    suiteLayout
                      ? FIGMA_VOICE_CTRL_GROUP
                      : 'flex flex-1 flex-wrap items-end justify-center gap-0.5 sm:gap-2 md:gap-4'
                  }
                >
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarMembers')}
                    icon={Users}
                    badge={totalParticipants}
                    pressed={rightPanel === 'people'}
                    onClick={() => setRightPanel((p) => (p === 'people' ? null : 'people'))}
                    chevron
                    suiteLayout={suiteLayout}
                  />
                  <VoiceToolbarControl
                    label={t('voiceRoom.toolbarChat')}
                    icon={MessageSquare}
                    pressed={rightPanel === 'chat'}
                    onClick={() => setRightPanel((p) => (p === 'chat' ? null : 'chat'))}
                    chevron
                    suiteLayout={suiteLayout}
                  />
                  <div className="relative" ref={moreMenuWrapRef}>
                    <VoiceToolbarControl
                      label={t('voiceRoom.toolbarMore')}
                      icon={MoreHorizontal}
                      pressed={moreMenuOpen}
                      onClick={() => setMoreMenuOpen((v) => !v)}
                      chevron={false}
                      suiteLayout={suiteLayout}
                    />
                    {moreMenuOpen && (
                      <div className="absolute bottom-full left-1/2 z-[45] mb-2 w-[min(calc(100vw-2rem),17rem)] -translate-x-1/2 rounded-xl border border-white/10 bg-surface-raised py-1.5 shadow-2xl">
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setLayoutModalOpen(true);
                          }}
                        >
                          <LayoutGrid className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.layoutTitle')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            toggleMeetingFullscreen();
                          }}
                        >
                          {isFullscreen ? (
                            <Minimize2 className="h-4 w-4 shrink-0 text-white/80" />
                          ) : (
                            <Maximize2 className="h-4 w-4 shrink-0 text-white/80" />
                          )}
                          {isFullscreen ? t('voiceRoom.fullscreenExit') : t('voiceRoom.fullscreenEnter')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setPipOpen(true);
                          }}
                        >
                          <PictureInPicture2 className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.openPip')}
                        </button>
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-white hover:bg-white/10"
                          onClick={() => {
                            setMoreMenuOpen(false);
                            setSettingsOpen(true);
                            setSettingsTab('audio');
                          }}
                        >
                          <Settings className="h-4 w-4 shrink-0 text-white/80" />
                          {t('voiceRoom.settingsTitle')}
                        </button>
                        {roomKind === 'free' && isRoomHost ? (
                          <>
                            <div className="my-1 border-t border-white/10" aria-hidden />
                            <button
                              type="button"
                              className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm text-red-400 hover:bg-red-500/10"
                              onClick={() => {
                                setMoreMenuOpen(false);
                                void endMeetingAsHost();
                              }}
                            >
                              <PhoneOff className="h-4 w-4 shrink-0" aria-hidden />
                              {t('voiceRoom.endMeeting')}
                            </button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                {suiteLayout && <div className={FIGMA_VOICE_CTRL_DIVIDER} aria-hidden />}

                {suiteLayout ? (
                  <div className="shrink-0">
                    <VoiceAiTranscribeControl
                      active={aiTranscribeEnabled}
                      onToggle={() => setAiTranscribeEnabled((v) => !v)}
                    />
                  </div>
                ) : null}

                {suiteLayout && <div className={FIGMA_VOICE_CTRL_DIVIDER} aria-hidden />}

                <div className={suiteLayout ? FIGMA_VOICE_CTRL_GROUP : 'flex items-end'}>
                  <button
                    type="button"
                    onClick={leaveRoom}
                    className={
                      suiteLayout
                        ? FIGMA_VOICE_CTRL_END
                        : 'group flex flex-col items-center gap-1 rounded-xl px-2 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60'
                    }
                    title={t('voiceRoom.leaveMeeting')}
                  >
                    {suiteLayout ? (
                      <>
                        <PhoneOff className="h-4 w-4 text-destructive-foreground" aria-hidden />
                        <span>{t('voiceRoom.leaveShort')}</span>
                      </>
                    ) : (
                      <>
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 shadow-lg transition group-hover:bg-red-500">
                          <X className="h-6 w-6 text-white" strokeWidth={2.5} aria-hidden />
                        </div>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-white/70 group-hover:text-white">
                          {t('voiceRoom.leaveShort')}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {rightPanel ? (
              <div className={`${suiteLayout ? 'lg:hidden ' : ''}${figmaVoiceSidePanel(suiteLayout, true)}`}>
                {renderVoiceSidePanelBody()}
              </div>
            ) : null}


            {inviteModalOpen && (
              <div className={FIGMA_VOICE_MODAL_BACKDROP}>
                <div role="dialog" aria-modal="true" className={`${FIGMA_VOICE_MODAL_SHELL} max-h-[min(90vh,520px)] max-w-md`}>
                  <div className={FIGMA_VOICE_MODAL_HEADER}>
                    <h3 className="text-base font-semibold text-foreground">{t('voiceRoom.addPeopleTitle')}</h3>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(false)}
                      className="rounded-lg p-1 text-white/60 hover:bg-white/10"
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="border-b border-white/5 px-4 py-2">
                    <PageSearchBar
                      value={inviteSearch}
                      onChange={setInviteSearch}
                      placeholder={t('voiceRoom.invitePh')}
                      isDarkMode
                      size="sm"
                      id="voice-invite-search"
                    />
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
                    <p className="px-2 pb-2 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      {t('voiceRoom.inviteSuggest')}
                      {roomKind === 'org' ? t('voiceRoom.inviteScopeOrg') : t('voiceRoom.inviteScopeFriends')}
                    </p>
                    {inviteLoading ? (
                      <p className="px-3 py-6 text-center text-sm text-gray-500">{t('common.loadingEllipsis')}</p>
                    ) : filteredInviteRows.length === 0 ? (
                      <p className="px-3 py-6 text-center text-sm text-gray-500">
                        {t('voiceRoom.inviteNoMatch')}
                      </p>
                    ) : (
                      <ul className="space-y-1">
                        {filteredInviteRows.map((row) => (
                          <li
                            key={row.id}
                            className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-white/5"
                            onClick={() =>
                              setSelectedInviteIds((prev) =>
                                prev.includes(String(row.id))
                                  ? prev.filter((id) => id !== String(row.id))
                                  : [...prev, String(row.id)]
                              )
                            }
                          >
                            <UserAvatar
                              avatar={row.avatar}
                              userId={row.id || row.userId}
                              name={row.label}
                              size="md"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-white">{row.label}</div>
                              {row.subtitle ? (
                                <div className="truncate text-xs text-gray-500">{row.subtitle}</div>
                              ) : null}
                            </div>
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-white/20"
                              checked={selectedInviteIds.includes(String(row.id))}
                              readOnly
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="border-t border-white/10 px-4 py-3">
                    <p className="mb-3 text-center text-xs text-gray-500">{t('voiceRoom.inviteFooter')}</p>
                    {roomKind === 'free' && isRoomHost ? (
                      <button
                        type="button"
                        disabled={
                          inviteSending ||
                          (!selectedInviteIds.length && !INVITE_EMAIL_RE.test(inviteSearch.trim()))
                        }
                        onClick={handleSendInvites}
                        className="flex w-full items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {inviteSending ? t('common.loadingEllipsis') : t('voiceRoom.inviteSendBtn')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            )}

            {layoutModalOpen && (
              <div className={FIGMA_VOICE_MODAL_BACKDROP}>
                <div role="dialog" aria-modal="true" className={`${FIGMA_VOICE_MODAL_SHELL} max-w-lg`}>
                  <div className={`${FIGMA_VOICE_MODAL_HEADER} px-5 py-4`}>
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">{t('voiceRoom.layoutTitle')}</h2>
                      <p className="mt-1 text-xs text-muted-foreground">{t('voiceRoom.layoutSaved')}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                      onClick={() => setLayoutModalOpen(false)}
                      aria-label={t('voiceRoom.closeAria')}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <div className="space-y-3">
                      {[
                        { id: 'auto', label: t('voiceRoom.layoutAuto') },
                        { id: 'tiled', label: t('voiceRoom.layoutTiled') },
                        { id: 'spotlight', label: t('voiceRoom.layoutSpotlight') },
                        { id: 'sidebar', label: t('voiceRoom.layoutSidebar') },
                      ].map((opt) => (
                        <label
                          key={opt.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2.5 hover:bg-white/5"
                        >
                          <input
                            type="radio"
                            name="voice-layout-mode"
                            checked={layoutMode === opt.id}
                            onChange={() => setLayoutMode(opt.id)}
                            className="h-4 w-4 accent-primary"
                          />
                          <span className="text-sm text-foreground">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{t('voiceRoom.tileCount')}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{maxTiles}</span>
                      </div>
                      <input
                        type="range"
                        min={1}
                        max={16}
                        value={maxTiles}
                        onChange={(e) => setMaxTiles(Number(e.target.value))}
                        className="w-full accent-primary"
                      />
                      <p className="mt-1 text-xs text-muted-foreground">{t('voiceRoom.tileCountHelp')}</p>
                    </div>
                    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-3">
                      <span className="text-sm text-foreground">{t('voiceRoom.hideNoVideo')}</span>
                      <input
                        type="checkbox"
                        checked={hideNoVideo}
                        onChange={(e) => setHideNoVideo(e.target.checked)}
                        className="h-4 w-4 rounded border-white/20 accent-primary"
                      />
                    </label>
                  </div>
                  <div className="border-t border-white/10 px-5 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                      onClick={() => setLayoutModalOpen(false)}
                    >
                      {t('voiceRoom.layoutDone')}
                    </button>
                  </div>
                </div>
              </div>
            )}

          </div>
        )}
            {settingsOpen &&
              createPortal(
                <div className={FIGMA_VOICE_MODAL_BACKDROP}>
                  <div
                    role="dialog"
                    aria-modal="true"
                    className={`${FIGMA_VOICE_MODAL_SHELL} max-h-[min(92vh,720px)] max-w-3xl`}
                  >
                    <aside className="w-52 shrink-0 border-r border-white/10 bg-surface py-4">
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition ${
                          settingsTab === 'audio'
                            ? 'border-l-4 border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                        }`}
                        onClick={() => setSettingsTab('audio')}
                      >
                        {t('voiceRoom.settingsAudioTab')}
                      </button>
                      <button
                        type="button"
                        className={`flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition ${
                          settingsTab === 'video'
                            ? 'border-l-4 border-primary bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
                        }`}
                        onClick={() => setSettingsTab('video')}
                      >
                        {t('voiceRoom.settingsVideoTab')}
                      </button>
                    </aside>
                    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
                      <div className={`${FIGMA_VOICE_MODAL_HEADER} px-6 py-4`}>
                        <h2 className="text-lg font-semibold text-foreground">{t('voiceRoom.settingsTitle')}</h2>
                        <button
                          type="button"
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                          onClick={() => setSettingsOpen(false)}
                          aria-label={t('voiceRoom.closeAria')}
                        >
                          <X className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        {settingsTab === 'audio' && (
                          <VoiceAudioSettingsPanel
                            t={t}
                            isDarkMode={isDarkMode}
                            micId={selectedMicId}
                            speakerId={selectedSpeakerId}
                            micVolume={micVolume}
                            speakerVolume={speakerVolume}
                            onMicIdChange={setSelectedMicId}
                            onSpeakerIdChange={setSelectedSpeakerId}
                            onMicVolumeChange={setMicVolume}
                            onSpeakerVolumeChange={setSpeakerVolume}
                            onApplyMic={applyMicrophoneDevice}
                            active={settingsOpen && settingsTab === 'audio'}
                          />
                        )}
                        {settingsTab === 'video' && (
                          <div className="space-y-5">
                            <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
                              {t('voiceRoom.videoBetaBanner')}
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">{t('voiceRoom.camLabel')}</label>
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                                <select
                                  value={selectedCamId}
                                  onChange={(e) => applyCameraDevice(e.target.value)}
                                  className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                                >
                                  {videoInputs.length === 0 ? (
                                    <option value="">{t('common.loadingEllipsis')}</option>
                                  ) : (
                                    videoInputs.map((d) => (
                                      <option key={d.deviceId || d.label} value={d.deviceId}>
                                        {d.label || t('voiceRoom.camFallback', { suffix: d.deviceId?.slice(-6) || '' })}
                                      </option>
                                    ))
                                  )}
                                </select>
                                <div className="h-24 w-40 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-black">
                                  {hasLocalVideoTrack && !isCameraOff ? (
                                    <video
                                      autoPlay
                                      playsInline
                                      muted
                                      className="h-full w-full object-cover"
                                      ref={(node) => {
                                        if (!node) return;
                                        const s = mediasoupRef.current.localStream;
                                        if (s && node.srcObject !== s) {
                                          node.srcObject = s;
                                          node.play?.().catch(() => {});
                                        }
                                      }}
                                    />
                                  ) : (
                                    <div className="flex h-full items-center justify-center text-xs text-gray-500">
                                      {t('voiceRoom.noVideoPreview')}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">
                                {t('voiceRoom.sendResLabel')}
                              </label>
                              <select
                                value={sendResolution}
                                onChange={(e) => applySendResolutionPref(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="auto">{t('voiceRoom.resAuto')}</option>
                                <option value="720">{t('voiceRoom.res720')}</option>
                                <option value="360">{t('voiceRoom.res360')}</option>
                                <option value="180">{t('voiceRoom.res180')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="mb-2 block text-sm font-medium text-blue-700">
                                {t('voiceRoom.recvResLabel')}
                              </label>
                              <select
                                value={recvResolution}
                                onChange={(e) => setRecvResolution(e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm"
                              >
                                <option value="auto">{t('voiceRoom.resAuto')}</option>
                                <option value="720">720p</option>
                                <option value="360">360p</option>
                                <option value="180">180p</option>
                              </select>
                              <p className="mt-1 text-xs text-gray-500">
                                {t('voiceRoom.recvQualityHint')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>,
                document.body
              )}

        {joinModalOpen &&
          createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
              <div
                role="dialog"
                aria-modal="true"
                className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl ${
                  isDarkMode ? 'border-white/10 bg-[#1e1e1e]' : 'border-slate-200 bg-white'
                }`}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3
                    className={`text-lg font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}
                  >
                    {t('voiceRoom.joinModalTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setJoinModalOpen(false)}
                    className={`rounded-lg p-1 ${isDarkMode ? 'text-white/60 hover:bg-white/10' : 'text-slate-500 hover:bg-slate-100'}`}
                    aria-label={t('voiceRoom.closeAria')}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <label
                  className={`mb-1.5 block text-sm ${isDarkMode ? 'text-gray-400' : 'text-slate-600'}`}
                >
                  {t('voiceRoom.roomCode')}
                </label>
                <input
                  value={joinModalCode}
                  onChange={(e) => setJoinModalCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleJoinModalConfirm();
                  }}
                  autoFocus
                  placeholder="room-abc123"
                  className={`mb-6 w-full rounded-xl border px-4 py-3 focus:border-cyan-500/50 focus:outline-none focus:ring-1 focus:ring-cyan-500/40 ${
                    isDarkMode
                      ? 'border-white/10 bg-black/50 text-white placeholder:text-gray-600'
                      : 'border-slate-200 bg-white text-slate-900 placeholder:text-slate-400'
                  }`}
                />
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setJoinModalOpen(false)}
                    className={`flex-1 rounded-xl border py-2.5 text-sm font-medium ${
                      isDarkMode
                        ? 'border-white/10 text-gray-300 hover:bg-white/5'
                        : 'border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {t('nav.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleJoinModalConfirm}
                    className="flex-1 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-sky-500 py-2.5 text-sm font-semibold text-white hover:brightness-110"
                  >
                    {t('voiceRoom.joinModalContinue')}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )}
        {recordingPlayback &&
          createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
              onClick={closeRecordingPlayback}
              role="presentation"
            >
              <div
                className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-label={t('voiceRoom.recordingPlaybackTitle')}
              >
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {t('voiceRoom.recordingPlaybackTitle')}
                  </h3>
                  <button
                    type="button"
                    onClick={closeRecordingPlayback}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-muted"
                    aria-label={t('voiceRoom.closeAria')}
                  >
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </div>
                <p className="mb-3 truncate text-xs text-muted-foreground">{recordingPlayback.title}</p>
                <audio src={recordingPlayback.url} controls autoPlay className="w-full" />
              </div>
            </div>,
            document.body
          )}
      </div>
    </div>
  );
}

export default VoiceRoomPage;

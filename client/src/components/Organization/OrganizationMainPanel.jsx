import { Fragment, useMemo, useRef, useState } from 'react';
import { Bell, Filter, Search, Zap } from 'lucide-react';
import { Modal } from '../Shared';
import UnifiedChatComposer from '../Chat/UnifiedChatComposer';
import ChatUploadProgressBar from '../Chat/ChatUploadProgressBar';
import { ChatMessageAttachmentBody } from '../Chat/ChatFileAttachment';
import ChannelMessageToolbar from './ChannelMessageToolbar';
import ChannelMessageMoreMenu from './ChannelMessageMoreMenu';
import { shouldPlaceToolbarBelowBubble } from '../../utils/messageToolbarPlacement';

function formatJoinAnswerValue(value) {
  if (value === undefined || value === null) return '—';
  if (Array.isArray(value)) {
    const parts = value.filter((v) => v != null && String(v).trim() !== '');
    return parts.length ? parts.join(', ') : '—';
  }
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value).trim();
  return s || '—';
}

/**
 * Bản rõ: nhãn từ formSnapshot (lúc nộp đơn), giá trị từ answers.
 * Không có snapshot (đơn cũ) → trả mode raw.
 */
function messageDayKey(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateDividerLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const t0 = startOf(d);
  const now = new Date();
  const today0 = startOf(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday0 = startOf(y);
  const dd = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  if (t0 === today0) return `HÔM NAY — ${dd}`;
  if (t0 === yesterday0) return `HÔM QUA — ${dd}`;
  return d.toLocaleDateString('vi-VN', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function senderInitials(message) {
  const u = message?.senderId;
  if (u && typeof u === 'object') {
    const n = u.displayName || u.username || u.fullName || '';
    if (typeof n === 'string' && n.trim()) {
      const p = n.trim().split(/\s+/);
      if (p.length >= 2) return `${p[0][0]}${p[p.length - 1][0]}`.toUpperCase();
      return n.slice(0, 2).toUpperCase();
    }
  }
  return 'TV';
}

function buildJoinAnswerDisplayRows(answers, formSnapshot) {
  const raw = answers && typeof answers === 'object' ? answers : {};
  const fields = formSnapshot?.fields;
  if (!Array.isArray(fields) || fields.length === 0) {
    return { mode: 'raw', rows: [] };
  }
  const rows = fields.map((f) => {
    const id = f.id;
    return {
      id: String(id),
      label: String(f.label || id || '').trim() || String(id),
      value: formatJoinAnswerValue(raw[id]),
    };
  });
  const seen = new Set(fields.map((f) => String(f.id)));
  for (const k of Object.keys(raw)) {
    if (seen.has(k)) continue;
    rows.push({
      id: k,
      label: k,
      value: formatJoinAnswerValue(raw[k]),
    });
  }
  return { mode: 'labeled', rows };
}

const OrganizationMainPanel = ({
  selectedOrganization,
  hasOrganizations = true,
  /** false: chưa biết user có tổ chức hay không — không hiển thị màn empty/home để tránh nháy UI */
  organizationsLoaded = false,
  viewMode = 'home',
  departments = [],
  selectedDepartment,
  channels = [],
  selectedChannelId,
  messages = [],
  messageInput = '',
  onChangeMessageInput,
  onSendMessage,
  loadingMessages = false,
  sendingMessage = false,
  currentUserId,
  onSelectChannel,
  onSelectDepartment,
  onCreateOrganization,
  onJoinQuickInvite,
  quickInviteInput = '',
  onChangeQuickInviteInput,
  joiningQuickInvite = false,
  invitations = [],
  loadingInvitations = false,
  respondingInvitationIds = [],
  onRespondInvitation,
  /** Đơn gia nhập cần duyệt (owner/admin) — Trang chủ tổ chức */
  joinApplicationsToReview = [],
  loadingJoinApplicationsToReview = false,
  respondingJoinReviewKeys = [],
  onApproveJoinApplication,
  onRejectJoinApplication,
  homeNotificationPreview = [],
  homeCalendarPreview = [],
  expandedHomeCards = { notifications: false, calendar: false },
  onToggleHomeCard,
  onOpenNotificationsPage,
  onOpenCalendarPage,
  onGoHome,
  onCreateDepartment,
  onCreateChannel,
  onSendChatOption,
  chatContacts = [],
  loadingChatContacts = false,
  loadingChannels = false,
  loadingDepartments = false,
  channelUploadProgress = null,
  /** Trả lời tin (Discord-like) */
  replyingToMessage = null,
  onClearReply,
  onReplyToMessage,
  onSaveMessageEdit,
  onDeleteMessage,
  onForwardMessage,
  onQuickReactMessage,
  /** ID user đang socket online — avatar stack + số đếm ở header workspace */
  workspaceOnlineUserIds = [],
}) => {
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState('24h');
  const [allowMultiAnswer, setAllowMultiAnswer] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactCategory, setContactCategory] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [emojiSearch, setEmojiSearch] = useState('');
  const [emojiPickerTab, setEmojiPickerTab] = useState('emoji');
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [moreMenu, setMoreMenu] = useState({ open: false, anchorRect: null, message: null });
  const [joinRejectDraft, setJoinRejectDraft] = useState({
    open: false,
    organizationId: null,
    applicationId: null,
    reason: '',
  });
  /** Hover: thanh công cụ phía trên bubble hoặc phía dưới (tránh cắt khi tin ở đầu khung chat) */
  const [toolbarPlacementById, setToolbarPlacementById] = useState({});

  const chatChannels = channels.filter((channel) => channel.type !== 'voice');
  const voiceChannels = channels.filter((channel) => channel.type === 'voice');
  const selectedChannel = channels.find((channel) => channel._id === selectedChannelId) || null;

  const sortedWorkspaceMessages = useMemo(() => {
    return [...messages].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [messages]);

  const formatTime = (isoDate) => {
    if (!isoDate) return '';
    return new Date(isoDate).toLocaleTimeString('vi-VN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const plainTextForMessage = (msg) => {
    if (!msg) return '';
    const t = msg.messageType || 'text';
    if (t === 'text') return String(msg.content || '');
    if (t === 'file' || t === 'image')
      return msg.fileMeta?.originalName || String(msg.content || '').slice(0, 200) || '[Đính kèm]';
    return String(msg.content || '');
  };

  /** Ảnh / file: không hiện sao chép. Còn lại: có nội dung chuỗi (kể cả link) là cho phép. */
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

  const canEditOrgMessage = (msg) => {
    const t = msg?.messageType || 'text';
    if (t !== 'text') return false;
    if (msg?.fileMeta) return false;
    return true;
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditDraft('');
  };

  const submitEdit = async (messageId) => {
    const trimmed = editDraft.trim();
    if (!trimmed || !messageId) return;
    await onSaveMessageEdit?.(messageId, trimmed);
    cancelEdit();
  };

  const replyToLabel = (msg) => {
    const sid = msg?.senderId?._id || msg?.senderId;
    if (String(sid || '') === String(currentUserId || '')) return 'Bạn';
    return 'Thành viên';
  };

  const handleCreateContactCard = () => {
    setContactSearch('');
    setContactCategory('all');
    setSelectedContactId('');
    setIsContactModalOpen(true);
  };

  const handleCreatePoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration('24h');
    setAllowMultiAnswer(false);
    setIsPollModalOpen(true);
  };

  const handleFileSelected = (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onSendChatOption?.({ kind, file });
  };

  const normalizedContacts = chatContacts.map((item) => {
    const id = item.id || item._id;
    return {
      id,
      name: item.name || item.displayName || item.username || 'Nguoi dung',
      phone: item.phone || '',
      email: item.email || item.username || '',
      avatar: item.avatar || null,
      category: item.category || 'friend',
    };
  });

  const filteredContacts = normalizedContacts.filter((contact) => {
    const byCategory = contactCategory === 'all' || contact.category === contactCategory;
    const bySearch =
      !contactSearch.trim() ||
      `${contact.name} ${contact.phone} ${contact.email}`
        .toLowerCase()
        .includes(contactSearch.trim().toLowerCase());
    return byCategory && bySearch;
  });

  const composerEmojiList = [
    '😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎',
    '🥳', '🤩', '😇', '🤔', '😢', '😭', '😡', '😴',
    '👍', '👎', '👏', '🙌', '🙏', '💪', '🤝', '👀',
    '❤️', '💜', '🧡', '💙', '🔥', '✨', '🎉', '🚀',
  ];

  const filteredComposerEmojis = composerEmojiList.filter((emoji) => {
    const keyword = emojiSearch.trim().toLowerCase();
    if (!keyword) return true;
    return emoji.toLowerCase().includes(keyword);
  });

  const addPollOption = () => {
    if (pollOptions.length >= 6) return;
    setPollOptions((prev) => [...prev, '']);
  };

  const updatePollOption = (index, value) => {
    setPollOptions((prev) => prev.map((item, idx) => (idx === index ? value : item)));
  };

  const removePollOption = (index) => {
    if (pollOptions.length <= 2) return;
    setPollOptions((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmitPoll = () => {
    const question = pollQuestion.trim();
    const options = pollOptions.map((item) => item.trim()).filter(Boolean);
    if (!question || options.length < 2) return;
    onSendChatOption?.({
      kind: 'poll',
      payload: {
        question,
        options,
        duration: pollDuration,
        allowMultiAnswer,
      },
    });
    setIsPollModalOpen(false);
  };

  const handleSubmitContact = () => {
    const selected = normalizedContacts.find((item) => item.id === selectedContactId);
    if (!selected) return;
    onSendChatOption?.({
      kind: 'contact',
      payload: {
        fullName: selected.name,
        phone: selected.phone,
        email: selected.email,
      },
    });
    setIsContactModalOpen(false);
  };

  const appendEmoji = (emoji) => {
    onChangeMessageInput?.(`${messageInput || ''}${emoji}`);
    setShowEmojiPicker(false);
    setEmojiSearch('');
  };

  const joinReviewKey = (organizationId, applicationId) => `${organizationId}:${applicationId}`;

  const renderJoinApplicationsToReviewPanel = () => (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-[#1a1528]/90 to-[#111422]/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)] p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/20 text-sm">
              📋
            </span>
            <h4 className="truncate text-sm font-semibold tracking-wide text-white">
              Đơn gia nhập chờ duyệt
            </h4>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Tổng hợp từ các tổ chức bạn quản trị. Nội dung hiển thị theo tên câu hỏi và câu trả lời đã gửi.
          </p>
        </div>
        <span className="inline-flex min-w-[30px] items-center justify-center rounded-full border border-violet-300/30 bg-violet-400/15 px-2 py-0.5 text-xs font-semibold text-violet-200">
          {joinApplicationsToReview.length}
        </span>
      </div>

      {loadingJoinApplicationsToReview && (
        <div className="space-y-2">
          <div className="h-16 animate-pulse rounded-xl bg-white/10" />
          <div className="h-16 animate-pulse rounded-xl bg-white/5" />
        </div>
      )}

      {!loadingJoinApplicationsToReview && joinApplicationsToReview.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-center">
          <div className="text-sm font-medium text-gray-200">Không có đơn chờ duyệt</div>
          <div className="mt-1 text-xs text-gray-500">
            Khi có người gửi đơn vào tổ chức bạn quản trị, đơn sẽ hiển thị tại đây.
          </div>
        </div>
      )}

      {!loadingJoinApplicationsToReview && joinApplicationsToReview.length > 0 && (
        <ul className="space-y-3">
          {joinApplicationsToReview.map((app) => {
            const oid = app.organizationId;
            const aid = app.applicationId;
            const key = joinReviewKey(oid, aid);
            const busy = respondingJoinReviewKeys.includes(key);
            return (
              <li
                key={key}
                className="rounded-xl border border-white/10 bg-black/25 p-3 text-sm text-gray-200"
              >
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-white">{app.organizationName}</div>
                    <div className="mt-0.5 font-mono text-[11px] text-gray-500">
                      Người nộp: {app.applicantUser}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-500">
                    {app.submittedAt
                      ? new Date(app.submittedAt).toLocaleString('vi-VN')
                      : ''}
                  </span>
                </div>
                {(() => {
                  const { mode, rows } = buildJoinAnswerDisplayRows(app.answers, app.formSnapshot);
                  if (mode === 'labeled' && rows.length > 0) {
                    return (
                      <div className="mb-3 max-h-48 space-y-2.5 overflow-y-auto rounded-lg border border-white/10 bg-black/35 p-3">
                        {rows.map((row) => (
                          <div key={row.id}>
                            <div className="text-[11px] font-semibold text-cyan-100/90">{row.label}</div>
                            <div className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-100">
                              {row.value}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return (
                    <pre className="mb-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-xs text-amber-100/90">
                      {JSON.stringify(app.answers || {}, null, 2)}
                    </pre>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onApproveJoinApplication?.(oid, aid)}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Duyệt
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      setJoinRejectDraft({
                        open: true,
                        organizationId: oid,
                        applicationId: aid,
                        reason: '',
                      })
                    }
                    className="rounded-lg border border-red-500/50 px-3 py-1.5 text-xs text-red-300 transition hover:bg-red-950/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Từ chối
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const renderInvitationPanel = (compact = false) => (
    <div
      className={`rounded-2xl border border-white/10 bg-gradient-to-br from-[#181b2a]/80 to-[#111422]/80 shadow-[0_8px_30px_rgba(0,0,0,0.25)] ${
        compact ? 'p-3.5' : 'p-4'
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm">
              📨
            </span>
            <h4 className="truncate text-sm font-semibold tracking-wide text-white">
              Lời mời tham gia tổ chức
            </h4>
          </div>
          <p className="mt-1 text-xs text-gray-400">
            Quản lý và phản hồi lời mời ngay tại Organization Home
          </p>
        </div>
        <span className="inline-flex min-w-[30px] items-center justify-center rounded-full border border-cyan-300/30 bg-cyan-400/15 px-2 py-0.5 text-xs font-semibold text-cyan-200">
          {invitations.length}
        </span>
      </div>

      {loadingInvitations && (
        <div className="space-y-2">
          <div className="h-11 animate-pulse rounded-xl bg-white/10" />
          <div className="h-11 animate-pulse rounded-xl bg-white/5" />
        </div>
      )}

      {!loadingInvitations && invitations.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-3 py-3 text-center">
          <div className="text-sm font-medium text-gray-200">Không có lời mời mới</div>
          <div className="mt-1 text-xs text-gray-500">
            Khi có người mời bạn vào tổ chức, thông báo sẽ hiển thị tại đây.
          </div>
        </div>
      )}

      {!loadingInvitations && invitations.length > 0 && (
        <div className="space-y-2">
          {invitations.map((invite) => {
            const invitationId = invite.invitationId || invite._id;
            const orgName = invite.organization?.name || 'Tổ chức';
            const isResponding = respondingInvitationIds.includes(invitationId);
            const createdAt = invite.createdAt
              ? new Date(invite.createdAt).toLocaleDateString('vi-VN')
              : '';

            return (
              <div
                key={invitationId}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-white/20 hover:bg-white/[0.05]"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{orgName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
                      <span className="rounded-md bg-white/10 px-1.5 py-0.5">
                        Vai trò: {invite.role || 'member'}
                      </span>
                      {createdAt && <span>Mời ngày {createdAt}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => onRespondInvitation?.(invitationId, 'reject')}
                    className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-semibold text-gray-200 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Từ chối
                  </button>
                  <button
                    type="button"
                    disabled={isResponding}
                    onClick={() => onRespondInvitation?.(invitationId, 'accept')}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(99,102,241,0.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Chấp nhận
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderHomeWidget = ({
    icon,
    title,
    subtitle,
    cardKey,
    items = [],
    expanded = false,
    onToggle,
    onViewAll,
    emptyMessage,
    renderItem,
  }) => (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-sm">
              {icon}
            </span>
            <h4 className="truncate text-sm font-semibold text-white">{title}</h4>
          </div>
          <p className="mt-1 text-xs text-gray-400">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-white/15 px-2 py-0.5 text-xs text-gray-300">
            {items.length}
          </span>
          <button
            type="button"
            onClick={() => onToggle?.(cardKey)}
            className="rounded-md border border-white/15 px-2 py-1 text-xs text-gray-200 transition hover:bg-white/10"
          >
            {expanded ? 'Ẩn' : 'Mở'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2">
          {items.length === 0 && (
            <div className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-gray-400">
              {emptyMessage}
            </div>
          )}
          {items.map((item, idx) => (
            <div key={item.id || idx}>{renderItem(item)}</div>
          ))}
        </div>
      )}

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={onViewAll}
          className="rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-3 py-1.5 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-400/20"
        >
          Xem tất cả
        </button>
      </div>
    </div>
  );

  if (!organizationsLoaded) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-12 py-14 text-center shadow-[0_0_40px_rgba(0,0,0,0.35)]">
          <div
            className="mx-auto h-11 w-11 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-400"
            role="status"
            aria-label="Đang tải"
          />
          <p className="mt-5 text-sm text-gray-400">Đang tải không gian tổ chức…</p>
        </div>
      </div>
    );
  }

  if (!hasOrganizations) {
    return (
      <div className="flex h-full flex-col p-6">
        <div className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/15 p-5">
          <div className="flex h-full items-center justify-center">
            <div className="mx-auto w-full max-w-xl text-center">
              <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600/70 to-fuchsia-500/70 text-4xl shadow-[0_0_24px_rgba(123,47,247,0.45)]">
                🏢
              </div>
              <h3 className="mt-4 text-2xl font-bold text-white">Chưa tham gia tổ chức nào</h3>
              <p className="mt-2 text-sm leading-7 text-[#A0A0B2]">
                Trò chuyện theo phòng ban
                <br />
                Quản lý nhân sự
                <br />
                Làm việc nhóm hiệu quả
              </p>

              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onCreateOrganization}
                  className="h-10 rounded-[10px] bg-gradient-to-r from-[#7B2FF7] to-[#F107A3] px-5 text-sm font-semibold text-white transition hover:scale-[1.04] hover:shadow-[0_0_12px_rgba(123,47,247,0.6)]"
                >
                  Tạo tổ chức
                </button>
                <button
                  type="button"
                  onClick={onJoinQuickInvite}
                  disabled={joiningQuickInvite}
                  className="h-10 rounded-[10px] border border-white/20 bg-transparent px-5 text-sm font-semibold text-white transition hover:scale-[1.03] hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {joiningQuickInvite ? 'Đang tham gia...' : 'Tham gia'}
                </button>
              </div>

              <div className="mx-auto mt-5 flex max-w-lg items-center gap-2">
                <input
                  value={quickInviteInput}
                  onChange={(event) => onChangeQuickInviteInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      onJoinQuickInvite();
                    }
                  }}
                  placeholder="Dán link mời (inviteToken)"
                  className="h-10 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white outline-none placeholder:text-[#6B6B80] focus:border-[#7B2FF7] focus:shadow-[0_0_10px_rgba(123,47,247,0.35)]"
                />
                <button
                  type="button"
                  onClick={onJoinQuickInvite}
                  disabled={joiningQuickInvite}
                  className="h-10 rounded-lg bg-gradient-to-r from-[#7B2FF7] to-[#F107A3] px-4 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Tham gia
                </button>
              </div>

              <div className="mx-auto mt-6 max-w-xl text-left">{renderInvitationPanel()}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'home') {
    const busyRejectKey =
      joinRejectDraft.open && joinRejectDraft.organizationId && joinRejectDraft.applicationId
        ? joinReviewKey(joinRejectDraft.organizationId, joinRejectDraft.applicationId)
        : null;
    const rejectModalBusy = busyRejectKey && respondingJoinReviewKeys.includes(busyRejectKey);

    return (
      <>
        <div className="flex h-full flex-col p-6">
          <div className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/15 p-5">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-xl font-semibold text-white">Trang chủ tổ chức</h3>
                <p className="text-sm text-gray-400">
                  Tổng hợp nhanh lịch, thông báo, lời mời và đơn gia nhập từ các tổ chức
                </p>
              </div>
              <button
                type="button"
                onClick={onGoHome}
                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-200 transition hover:bg-white/10"
              >
                Đang ở Home
              </button>
            </div>

            <div className="scrollbar-overlay h-[calc(100%-4.5rem)] space-y-4 overflow-y-auto pr-1">
              {renderJoinApplicationsToReviewPanel()}
              {renderInvitationPanel()}

            {renderHomeWidget({
              icon: '🔔',
              title: 'Thông báo',
              subtitle: 'Thông tin quan trọng được tóm tắt theo thời gian',
              cardKey: 'notifications',
              items: homeNotificationPreview.slice(0, 5),
              expanded: !!expandedHomeCards.notifications,
              onToggle: onToggleHomeCard,
              onViewAll: onOpenNotificationsPage,
              emptyMessage: 'Không có thông báo mới.',
              renderItem: (item) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-gray-400">{item.message}</div>
                    </div>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.priority === 'high'
                          ? 'bg-red-500/20 text-red-200'
                          : 'bg-blue-500/20 text-blue-200'
                      }`}
                    >
                      {item.priority === 'high' ? 'Quan trọng' : 'Thông thường'}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-500">{item.time}</div>
                </div>
              ),
            })}

            {renderHomeWidget({
              icon: '📅',
              title: 'Lịch',
              subtitle: 'Sự kiện sắp tới trong ngày và tuần',
              cardKey: 'calendar',
              items: homeCalendarPreview.slice(0, 5),
              expanded: !!expandedHomeCards.calendar,
              onToggle: onToggleHomeCard,
              onViewAll: onOpenCalendarPage,
              emptyMessage: 'Không có sự kiện sắp tới.',
              renderItem: (item) => (
                <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">{item.title}</div>
                      <div className="mt-0.5 text-xs text-gray-400">
                        {item.date} - {item.time}
                      </div>
                    </div>
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] text-gray-200">
                      {item.type}
                    </span>
                  </div>
                </div>
              ),
            })}
          </div>
        </div>
      </div>

        <Modal
          isOpen={joinRejectDraft.open}
          onClose={() => {
            if (rejectModalBusy) return;
            setJoinRejectDraft({
              open: false,
              organizationId: null,
              applicationId: null,
              reason: '',
            });
          }}
          title="Từ chối đơn gia nhập"
          size="sm"
        >
          <p className="mb-3 text-sm text-gray-400">Lý do từ chối (tuỳ chọn)</p>
          <textarea
            rows={4}
            value={joinRejectDraft.reason}
            onChange={(e) =>
              setJoinRejectDraft((p) => ({ ...p, reason: e.target.value }))
            }
            className="mb-4 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              disabled={rejectModalBusy}
              onClick={() => {
                if (rejectModalBusy) return;
                setJoinRejectDraft({
                  open: false,
                  organizationId: null,
                  applicationId: null,
                  reason: '',
                });
              }}
              className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200 hover:bg-white/10 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              disabled={rejectModalBusy}
              onClick={async () => {
                if (
                  !joinRejectDraft.organizationId ||
                  !joinRejectDraft.applicationId ||
                  rejectModalBusy
                )
                  return;
                await onRejectJoinApplication?.(
                  joinRejectDraft.organizationId,
                  joinRejectDraft.applicationId,
                  joinRejectDraft.reason
                );
                setJoinRejectDraft({
                  open: false,
                  organizationId: null,
                  applicationId: null,
                  reason: '',
                });
              }}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Xác nhận từ chối
            </button>
          </div>
        </Modal>
      </>
    );
  }

  const orgName = selectedOrganization?.name || 'Tổ chức';
  const deptName = selectedDepartment?.name || '—';
  const chSlug = selectedChannel ? String(selectedChannel.name || 'chat').replace(/\s+/g, '-').toLowerCase() : '';
  const onlinePreviewIds = (workspaceOnlineUserIds || []).slice(0, 5);

  return (
    <>
    <div className="flex h-full min-h-0 flex-col bg-[#0b0e14]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[252px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0c0f15]">
          <div className="border-b border-white/[0.06] px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[11px] font-bold uppercase tracking-wider text-[#6d7380]">Phòng ban</h2>
              <button
                type="button"
                onClick={onCreateDepartment}
                className="rounded-lg bg-white/[0.06] px-2 py-1 text-xs font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
              >
                + Tạo
              </button>
            </div>
            <div className="scrollbar-overlay max-h-[40vh] space-y-1 overflow-y-auto pr-0.5">
              {loadingDepartments && <div className="h-9 animate-pulse rounded-xl bg-white/10" />}
              {!loadingDepartments && departments.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-[#8e9297]">
                  Chưa có phòng ban.
                </div>
              )}
              {departments.map((department) => (
                <button
                  key={department._id}
                  type="button"
                  onClick={() => onSelectDepartment(department._id)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
                    selectedDepartment?._id === department._id
                      ? 'bg-[#5865F2]/20 text-white ring-1 ring-[#5865F2]/40'
                      : 'text-[#b4b8c4] hover:bg-white/[0.04]'
                  }`}
                >
                  {department.name}
                </button>
              ))}
            </div>
          </div>

          {selectedDepartment && (
            <div className="flex min-h-0 flex-1 flex-col px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#6d7380]">Kênh thoại</span>
                <button
                  type="button"
                  onClick={() => onCreateChannel('voice')}
                  className="text-lg leading-none text-[#8e9297] transition hover:text-white"
                >
                  +
                </button>
              </div>
              <div className="mb-4 space-y-0.5">
                {voiceChannels.map((channel) => (
                  <button
                    key={channel._id}
                    type="button"
                    onClick={() => onSelectChannel(channel._id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                      selectedChannelId === channel._id
                        ? 'bg-white/[0.08] text-white'
                        : 'text-[#9aa0ae] hover:bg-white/[0.04]'
                    }`}
                  >
                    🔊 {channel.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#080a0f]">
          <header className="shrink-0 border-b border-white/[0.06] bg-[#0b0e14] px-4 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <nav className="min-w-0 text-[13px] text-[#9aa0ae]">
                <span className="font-semibold text-white">{orgName}</span>
                <span className="mx-1.5 text-[#4e5258]">›</span>
                <span>{deptName}</span>
                <span className="mx-1.5 text-[#4e5258]">›</span>
                <span className="text-[#5865F2]">#{chSlug || 'kênh'}</span>
              </nav>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-[#12151f] py-1 pl-1 pr-2.5">
                  <div className="flex -space-x-2">
                    {onlinePreviewIds.map((oid, i) => (
                      <div
                        key={`${oid}-${i}`}
                        className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#12151f] bg-gradient-to-br from-violet-500 to-fuchsia-600 text-[10px] font-bold text-white"
                        title={String(oid).slice(-6)}
                      >
                        {String(oid).slice(-2)}
                      </div>
                    ))}
                  </div>
                  <span className="text-xs font-semibold text-[#b4b8c4]">
                    {workspaceOnlineUserIds?.length || 0} online
                  </span>
                </div>
                <button
                  type="button"
                  title="Lệnh nhanh"
                  className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#12151f] px-3 py-2 text-xs text-[#9aa0ae] transition hover:bg-white/[0.06]"
                  onClick={() => onSendChatOption?.({ kind: 'quick-command-placeholder' })}
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">Lệnh nhanh</span>
                  <kbd className="hidden rounded bg-black/40 px-1.5 py-0.5 font-mono text-[10px] text-[#6d7380] sm:inline">
                    ⌘K
                  </kbd>
                </button>
                <button
                  type="button"
                  title="Thông báo"
                  className="rounded-xl p-2 text-[#9aa0ae] transition hover:bg-white/[0.06] hover:text-white"
                  onClick={() => onOpenNotificationsPage?.()}
                >
                  <Bell className="h-5 w-5" />
                </button>
              </div>
            </div>

            {selectedDepartment && chatChannels.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {chatChannels.map((channel, cidx) => {
                  const active = String(selectedChannelId) === String(channel._id);
                  const fakeBadge = (cidx % 5) + 1;
                  return (
                    <button
                      key={channel._id}
                      type="button"
                      onClick={() => onSelectChannel(channel._id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? 'border-[#5865F2] bg-[#5865F2]/15 text-white shadow-[0_0_12px_rgba(88,101,242,0.25)]'
                          : 'border-white/[0.08] bg-[#12151f] text-[#9aa0ae] hover:border-white/15 hover:text-white'
                      }`}
                    >
                      #{String(channel.name || 'chat').replace(/\s+/g, '-').toLowerCase()}
                      {fakeBadge > 0 && (
                        <span className="rounded-full bg-[#5865F2]/40 px-1.5 py-0 text-[10px] text-white">
                          {fakeBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => onCreateChannel('chat')}
                  className="rounded-full border border-dashed border-white/15 px-2.5 py-1.5 text-xs text-[#6d7380] hover:text-white"
                >
                  + Kênh
                </button>
              </div>
            )}
          </header>

          <div className="flex shrink-0 items-center justify-between border-b border-white/[0.05] bg-[#0b0e14] px-4 py-2">
            <p className="text-xs text-[#8e9297]">
              <span className="font-semibold text-[#b4b8c4]">{messages.length}</span> tin nhắn — cuộc trò chuyện đang diễn
              ra
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Lọc"
                className="rounded-lg p-2 text-[#8e9297] hover:bg-white/[0.06] hover:text-white"
                onClick={() => onSendChatOption?.({ kind: 'filter-placeholder' })}
              >
                <Filter className="h-4 w-4" />
              </button>
              <button
                type="button"
                title="Tìm trong kênh"
                className="rounded-lg p-2 text-[#8e9297] hover:bg-white/[0.06] hover:text-white"
                onClick={() => onSendChatOption?.({ kind: 'search-placeholder' })}
              >
                <Search className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="scrollbar-overlay min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {loadingMessages && (
                <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-300">Đang tải tin nhắn...</div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                  Chưa có tin nhắn trong kênh này.
                </div>
              )}

              {!loadingMessages &&
                sortedWorkspaceMessages.map((message, idx) => {
                  const mid = message._id || message.id;
                  const senderId = message?.senderId?._id || message?.senderId;
                  const isMine = String(senderId || '') === String(currentUserId || '');
                  const type = message?.messageType || 'text';
                  const typeLabel =
                    type === 'image' ? 'HÌNH ẢNH' : type === 'file' ? 'TỆP' : type === 'system' ? 'HỆ THỐNG' : 'TIN';
                  const replyId = message.replyToMessageId;
                  const parentMsg = replyId
                    ? sortedWorkspaceMessages.find((m) => String(m._id || m.id) === String(replyId))
                    : null;
                  const replyPreview = parentMsg
                    ? plainTextForMessage(parentMsg).slice(0, 160)
                    : 'Tin nhắn gốc';
                  const isEditing = editingMessageId && String(editingMessageId) === String(mid);
                  const showToolbar = !isEditing && !sendingMessage;

                  const toolbarPlace = toolbarPlacementById[String(mid)] ?? 'above';

                  const prev = idx > 0 ? sortedWorkspaceMessages[idx - 1] : null;
                  const showDayDivider =
                    !prev || messageDayKey(message.createdAt) !== messageDayKey(prev.createdAt);

                  const displayName = isMine
                    ? 'Bạn'
                    : message.senderId?.displayName ||
                      message.senderId?.username ||
                      message.senderId?.fullName ||
                      'Thành viên';
                  const roleCapsule = isMine ? 'BẠN' : type === 'system' ? 'HỆ THỐNG' : 'THÀNH VIÊN';

                  const bubbleMine =
                    'border border-[#5865F2]/45 bg-gradient-to-br from-[#5865F2]/35 to-[#4752c4]/25 text-white shadow-[0_0_20px_rgba(88,101,242,0.12)]';
                  const bubbleOther = 'border border-white/[0.07] bg-[#1a1d26] text-slate-100';

                  return (
                    <Fragment key={mid}>
                      {showDayDivider && (
                        <div className="flex justify-center py-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-[#12151f] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#8e9297]">
                            <Zap className="h-3 w-3 text-amber-400" />
                            {formatDateDividerLabel(message.createdAt)}
                          </span>
                        </div>
                      )}
                      <div
                        className={`flex w-full items-start gap-3 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                      >
                        {!isMine && (
                          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600/80 to-fuchsia-700/80 text-xs font-bold text-white shadow-inner">
                            {senderInitials(message)}
                          </div>
                        )}
                        <div
                          className={`group relative min-w-0 max-w-[min(100%,36rem)] flex-1 ${isMine ? 'text-right' : ''}`}
                          onMouseEnter={(e) => handleMessageRowMouseEnter(mid, e)}
                        >
                          {showToolbar && (
                            <div
                              className={`absolute z-20 opacity-0 transition-opacity group-hover:opacity-100 ${
                                toolbarPlace === 'below' ? 'top-full mt-1' : 'bottom-full mb-1'
                              } ${isMine ? 'right-0' : 'left-0'}`}
                            >
                              <ChannelMessageToolbar
                                isMine={isMine}
                                showEdit={isMine && canEditOrgMessage(message)}
                                disabled={sendingMessage}
                                onQuickReact={(emoji) => onQuickReactMessage?.(message, emoji)}
                                onOpenEmojiPicker={() => {}}
                                onMiddleAction={() => {
                                  if (isMine && canEditOrgMessage(message)) {
                                    setEditingMessageId(mid);
                                    setEditDraft(String(message.content || ''));
                                  } else {
                                    onReplyToMessage?.(message);
                                  }
                                }}
                                onForward={() => onForwardMessage?.(message)}
                                onMore={(e) => {
                                  const r = e?.currentTarget?.getBoundingClientRect?.();
                                  if (r) {
                                    setMoreMenu({
                                      open: true,
                                      anchorRect: r,
                                      message,
                                    });
                                  }
                                }}
                              />
                            </div>
                          )}
                          <div
                            className={`mb-1 flex flex-wrap items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}
                          >
                            <span className="text-sm font-bold text-white">{displayName}</span>
                            <span className="rounded-md bg-white/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#9aa0ae]">
                              {roleCapsule}
                            </span>
                            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-[#6d7380]">
                              {typeLabel}
                            </span>
                            <span className="text-[11px] tabular-nums text-[#6d7380]">
                              {formatTime(message.createdAt)}
                            </span>
                            {message.editedAt && (
                              <span className="text-[10px] text-[#6d7380]">(đã sửa)</span>
                            )}
                          </div>
                          <div
                            className={`inline-block w-full rounded-2xl px-3.5 py-2.5 text-left text-sm ${isMine ? bubbleMine : bubbleOther}`}
                          >
                            {replyId && (
                              <div
                                className={`mb-2 border-l-2 pl-2 text-[11px] ${isMine ? 'border-white/30 text-white/80' : 'border-[#5865F2]/40 text-[#8e9297]'}`}
                              >
                                <span className={`font-semibold ${isMine ? 'text-white' : 'text-[#a29bfe]'}`}>
                                  @{replyToLabel(parentMsg || {})}{' '}
                                </span>
                                <span className="line-clamp-2">{replyPreview}</span>
                              </div>
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
                                  className="w-full resize-y rounded-lg border border-white/20 bg-black/35 px-2 py-1.5 text-sm text-white outline-none focus:border-[#5865F2]/50"
                                />
                                <p className="text-[11px] text-[#8e9297]">
                                  Escape{' '}
                                  <button type="button" className="text-[#a29bfe] hover:underline" onClick={cancelEdit}>
                                    hủy
                                  </button>
                                  {' · '}
                                  Enter{' '}
                                  <button
                                    type="button"
                                    className="text-[#a29bfe] hover:underline"
                                    onClick={() => submitEdit(mid)}
                                  >
                                    lưu
                                  </button>
                                </p>
                              </div>
                            ) : (
                              <ChatMessageAttachmentBody message={message} />
                            )}
                          </div>
                        </div>
                        {isMine && (
                          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#5865F2]/35 bg-[#1e2230] text-[10px] font-bold uppercase tracking-tight text-[#a29bfe]">
                            Bạn
                          </div>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
            </div>

            <div className="relative mt-auto shrink-0 border-t border-white/[0.06] bg-[#0b0e14] px-4 pb-4 pt-3">
              <ChatUploadProgressBar
                percent={channelUploadProgress}
                label="Đang tải lên kênh…"
              />
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => handleFileSelected(event, 'file')}
              />
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => handleFileSelected(event, 'image')}
              />
              <UnifiedChatComposer
                richToolbar
                showAiToggle
                aiEnabled={false}
                onAiToggle={() => onSendChatOption?.({ kind: 'ai-draft-toggle' })}
                wrapperClassName="shrink-0 rounded-2xl border border-white/[0.06] bg-[#12151c] p-3"
                topSlot={
                  replyingToMessage ? (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-t-xl border border-slate-700/80 bg-[#1a1d21] px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <span className="text-gray-500">Đang phản hồi </span>
                        <span className="font-semibold text-[#a29bfe]">{replyToLabel(replyingToMessage)}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => onClearReply?.()}
                        className="rounded-full p-1.5 text-gray-400 transition hover:bg-white/10 hover:text-white"
                        aria-label="Huỷ trả lời"
                      >
                        ✕
                      </button>
                    </div>
                  ) : null
                }
                value={messageInput}
                onChange={onChangeMessageInput}
                onSend={onSendMessage}
                placeholder={
                  selectedChannelId
                    ? `Nhấn vào #${chSlug || 'kênh'} — @mention — /lệnh`
                    : 'Chọn kênh để nhắn tin'
                }
                disabled={!selectedChannelId || sendingMessage}
                sendDisabled={!messageInput.trim()}
                sendLabel="Gửi"
                plusItems={[
                  { key: 'upload-file', icon: '📁', label: 'Tải lên tệp', onClick: () => fileInputRef.current?.click() },
                  { key: 'upload-image', icon: '🖼️', label: 'Gửi hình ảnh', onClick: () => imageInputRef.current?.click() },
                  { key: 'topic', icon: '🧵', label: 'Tạo chủ đề', onClick: () => onSendChatOption?.({ kind: 'topic' }) },
                  { key: 'poll', icon: '🗳️', label: 'Tạo khảo sát', onClick: handleCreatePoll },
                  { key: 'contact', icon: '👤', label: 'Gửi danh thiếp', onClick: handleCreateContactCard },
                ]}
                actionItems={[
                  {
                    key: 'emoji',
                    title: 'Emoji',
                    content: '🙂',
                    className: 'w-8 text-lg',
                    onClick: () => {
                      setEmojiPickerTab('emoji');
                      setShowEmojiPicker((prev) => !prev);
                    },
                  },
                ]}
              />

              {showEmojiPicker && (
                <>
                  <button
                    type="button"
                    aria-label="Đóng bảng emoji"
                    onClick={() => setShowEmojiPicker(false)}
                    className="fixed inset-0 z-40 cursor-default bg-black/30"
                  />
                  <div className="fixed bottom-24 right-8 z-50 h-[420px] w-[520px] overflow-hidden rounded-2xl border border-slate-700 bg-[#0b1220] shadow-2xl">
                    <div className="flex items-center gap-2 border-b border-slate-700 px-4 py-3">
                      {[
                        { id: 'gif', label: 'Ảnh động' },
                        { id: 'sticker', label: 'Sticker' },
                        { id: 'emoji', label: 'Emoji' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setEmojiPickerTab(tab.id)}
                          className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                            emojiPickerTab === tab.id
                              ? 'bg-slate-700 text-white'
                              : 'text-gray-300 hover:bg-slate-800/70'
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
                          onChange={(event) => setEmojiSearch(event.target.value)}
                          placeholder="Tìm emoji hợp lý nhất"
                          className="h-11 flex-1 rounded-xl border border-blue-500/70 bg-[#0d1525] px-3 text-sm text-white outline-none placeholder:text-gray-400"
                        />
                        <button
                          type="button"
                          onClick={() => onSendChatOption?.({ kind: 'add-emoji-beta' })}
                          className="h-11 rounded-xl bg-slate-700 px-4 text-sm font-semibold text-white transition hover:bg-slate-600"
                        >
                          Thêm emoji
                        </button>
                      </div>
                    </div>

                    <div className="h-[calc(100%-126px)] overflow-y-auto p-3 scrollbar-overlay">
                      {emojiPickerTab !== 'emoji' ? (
                        <div className="flex h-full items-center justify-center text-sm text-gray-400">
                          Mục này đang ở bản beta.
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
                              Không tìm thấy emoji phù hợp.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
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
          const t = plainTextForMessage(moreMenu.message);
          if (t) navigator.clipboard.writeText(t);
        }}
        onReply={() => moreMenu.message && onReplyToMessage?.(moreMenu.message)}
        onForward={() => moreMenu.message && onForwardMessage?.(moreMenu.message)}
        onEdit={() => {
          const m = moreMenu.message;
          if (!m || !canEditOrgMessage(m)) return;
          setEditingMessageId(m._id || m.id);
          setEditDraft(String(m.content || ''));
        }}
        onDelete={() => {
          const m = moreMenu.message;
          if (m) onDeleteMessage?.(m._id || m.id);
        }}
      />

      <Modal isOpen={isPollModalOpen} onClose={() => setIsPollModalOpen(false)} title="Tạo một khảo sát" size="md">
        <div className="space-y-4">
          <div>
            <div className="mb-1 text-sm font-semibold text-white">Câu hỏi</div>
            <input
              value={pollQuestion}
              maxLength={300}
              onChange={(event) => setPollQuestion(event.target.value)}
              placeholder="Câu hỏi bạn muốn đặt ra là gì?"
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
            />
            <div className="mt-1 text-right text-xs text-gray-400">{pollQuestion.length} / 300</div>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-white">Câu trả lời</div>
            <div className="space-y-2">
              {pollOptions.map((option, index) => (
                <div key={`poll-option-${index}`} className="flex items-center gap-2">
                  <input
                    value={option}
                    onChange={(event) => updatePollOption(index, event.target.value)}
                    placeholder="Nhập câu trả lời của bạn"
                    className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500"
                  />
                  <button
                    type="button"
                    onClick={() => removePollOption(index)}
                    disabled={pollOptions.length <= 2}
                    className="rounded-lg border border-white/15 px-2 py-1 text-sm text-white transition hover:bg-white/10 disabled:opacity-40"
                  >
                    🗑
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addPollOption}
                className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                + Thêm một câu trả lời khác
              </button>
            </div>
          </div>

          <div>
            <div className="mb-1 text-sm font-semibold text-white">Khoảng thời gian</div>
            <select
              value={pollDuration}
              onChange={(event) => setPollDuration(event.target.value)}
              className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              <option value="1h">1 giờ</option>
              <option value="6h">6 giờ</option>
              <option value="24h">24 giờ</option>
              <option value="3d">3 ngày</option>
              <option value="7d">7 ngày</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-200">
            <input
              type="checkbox"
              checked={allowMultiAnswer}
              onChange={(event) => setAllowMultiAnswer(event.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            Cho phép nhiều câu trả lời
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsPollModalOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitPoll}
              disabled={!pollQuestion.trim() || pollOptions.map((item) => item.trim()).filter(Boolean).length < 2}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Bài đăng
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isContactModalOpen} onClose={() => setIsContactModalOpen(false)} title="Gửi danh thiếp" size="lg">
        <div className="space-y-3">
          <input
            value={contactSearch}
            onChange={(event) => setContactSearch(event.target.value)}
            placeholder="Tìm danh thiếp theo tên"
            className="w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-500"
          />

          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'Tất cả' },
              { key: 'friend', label: 'Bạn bè' },
              { key: 'work', label: 'Công việc' },
              { key: 'family', label: 'Gia đình' },
            ].map((category) => (
              <button
                key={category.key}
                type="button"
                onClick={() => setContactCategory(category.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  contactCategory === category.key
                    ? 'bg-blue-500 text-white'
                    : 'border border-white/15 text-gray-300 hover:bg-white/10'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02] p-2">
            {loadingChatContacts && (
              <div className="rounded-lg bg-white/5 px-3 py-2 text-sm text-gray-300">Đang tải danh bạ...</div>
            )}
            {!loadingChatContacts && filteredContacts.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/15 px-3 py-2 text-sm text-gray-400">
                Không có danh thiếp phù hợp.
              </div>
            )}
            {!loadingChatContacts &&
              filteredContacts.map((contact) => (
                <label
                  key={contact.id}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-white/5"
                >
                  <input
                    type="radio"
                    name="contact-card"
                    checked={selectedContactId === contact.id}
                    onChange={() => setSelectedContactId(contact.id)}
                    className="h-4 w-4"
                  />
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/60 to-violet-500/60 text-xs font-bold text-white">
                    {(contact.name || 'U').charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{contact.name}</div>
                    <div className="truncate text-xs text-gray-400">{contact.phone || contact.email || '-'}</div>
                  </div>
                </label>
              ))}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsContactModalOpen(false)}
              className="rounded-xl border border-white/15 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmitContact}
              disabled={!selectedContactId}
              className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              Gửi danh thiếp
            </button>
          </div>
        </div>
      </Modal>

    </>
  );
};

export default OrganizationMainPanel;

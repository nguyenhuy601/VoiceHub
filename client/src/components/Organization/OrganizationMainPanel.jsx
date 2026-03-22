import { useEffect, useRef, useState } from 'react';
import { Modal } from '../Shared';

const OrganizationMainPanel = ({
  selectedOrganization,
  hasOrganizations = true,
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
}) => {
  const [showComposerMenu, setShowComposerMenu] = useState(false);
  const [isPollModalOpen, setIsPollModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState(['', '']);
  const [pollDuration, setPollDuration] = useState('24h');
  const [allowMultiAnswer, setAllowMultiAnswer] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactCategory, setContactCategory] = useState('all');
  const [selectedContactId, setSelectedContactId] = useState('');
  const menuRef = useRef(null);
  const menuButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);

  const chatChannels = channels.filter((channel) => channel.type !== 'voice');
  const voiceChannels = channels.filter((channel) => channel.type === 'voice');
  const selectedChannel = channels.find((channel) => channel._id === selectedChannelId) || null;

  const formatTime = (isoDate) => {
    if (!isoDate) return '';
    return new Date(isoDate).toLocaleTimeString('vi-VN', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  useEffect(() => {
    if (!showComposerMenu) return undefined;
    const handleOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target)
      ) {
        setShowComposerMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showComposerMenu]);

  const handleCreateContactCard = () => {
    setContactSearch('');
    setContactCategory('all');
    setSelectedContactId('');
    setIsContactModalOpen(true);
    setShowComposerMenu(false);
  };

  const handleCreatePoll = () => {
    setPollQuestion('');
    setPollOptions(['', '']);
    setPollDuration('24h');
    setAllowMultiAnswer(false);
    setIsPollModalOpen(true);
    setShowComposerMenu(false);
  };

  const handleFileSelected = (event, kind) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    onSendChatOption?.({ kind, file });
    setShowComposerMenu(false);
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
    return (
      <div className="flex h-full flex-col p-6">
        <div className="min-h-0 flex-1 rounded-2xl border border-white/10 bg-black/15 p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-4">
            <div>
              <h3 className="text-xl font-semibold text-white">Trang chủ tổ chức</h3>
              <p className="text-sm text-gray-400">
                Tổng hợp nhanh lịch, thông báo và lời mời của không gian tổ chức
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
    );
  }

  return (
    <div className="flex h-full flex-col p-6">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="min-h-0 rounded-2xl border border-white/10 bg-black/15 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-300">
              Phòng ban
            </h2>
            <button
              type="button"
              onClick={onCreateDepartment}
              className="rounded-md bg-white/10 px-2 py-1 text-xs text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              + Tạo
            </button>
          </div>

          <div className="scrollbar-overlay space-y-2 overflow-y-auto pr-1">
            {loadingDepartments && <div className="h-9 animate-pulse rounded-lg bg-white/10" />}

            {!loadingDepartments && departments.length === 0 && (
              <div className="rounded-lg border border-dashed border-white/15 p-3 text-sm text-gray-400">
                Chưa có phòng ban nào.
              </div>
            )}

            {departments.map((department) => (
              <button
                key={department._id}
                type="button"
                onClick={() => onSelectDepartment(department._id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                  selectedDepartment?._id === department._id
                    ? 'bg-cyan-500/20 text-cyan-200'
                    : 'bg-white/5 text-gray-200 hover:bg-white/10'
                }`}
              >
                {department.name}
              </button>
            ))}
          </div>

          {selectedDepartment && (
            <div className="mt-4 border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kênh Chat</div>
                <button
                  type="button"
                  onClick={() => onCreateChannel('chat')}
                  className="text-sm text-gray-300 transition hover:text-white"
                >
                  +
                </button>
              </div>
              <div className="space-y-1">
                {chatChannels.map((channel) => (
                  <button
                    key={channel._id}
                    type="button"
                    onClick={() => onSelectChannel(channel._id)}
                    className={`w-full rounded-md px-2 py-1 text-left text-sm transition ${
                      selectedChannelId === channel._id
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    # {channel.name}
                  </button>
                ))}
              </div>

              <div className="mb-2 mt-4 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Kênh Thoại</div>
                <button
                  type="button"
                  onClick={() => onCreateChannel('voice')}
                  className="text-sm text-gray-300 transition hover:text-white"
                >
                  +
                </button>
              </div>
              <div className="space-y-1">
                {voiceChannels.map((channel) => (
                  <button
                    key={channel._id}
                    type="button"
                    onClick={() => onSelectChannel(channel._id)}
                    className={`w-full rounded-md px-2 py-1 text-left text-sm transition ${
                      selectedChannelId === channel._id
                        ? 'bg-cyan-500/20 text-cyan-200'
                        : 'text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    🔊 {channel.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-h-0 rounded-2xl border border-white/10 bg-black/15 p-5">
          <div className="flex h-full flex-col">
            <div className="mb-3 border-b border-white/10 pb-3">
              <h3 className="text-lg font-semibold text-white">
                {selectedDepartment ? selectedDepartment.name : 'Chưa chọn phòng ban'}
              </h3>
              <p className="text-sm text-gray-400">
                {selectedOrganization
                  ? `Tổ chức: ${selectedOrganization.name}${selectedChannel ? ` • Kênh: ${selectedChannel.name}` : ''}`
                  : 'Đang tải dữ liệu...'}
              </p>
            </div>

            <div className="scrollbar-overlay min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {loadingMessages && (
                <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-300">Đang tải tin nhắn...</div>
              )}

              {!loadingMessages && messages.length === 0 && (
                <div className="rounded-xl bg-white/5 p-4 text-sm text-gray-300">
                  Chưa có tin nhắn trong kênh này.
                </div>
              )}

              {!loadingMessages &&
                messages.map((message) => {
                  const senderId = message?.senderId?._id || message?.senderId;
                  const isMine = String(senderId || '') === String(currentUserId || '');
                  const type = message?.messageType || 'text';
                  const typeLabel =
                    type === 'image' ? 'Hình ảnh' : type === 'file' ? 'Tệp' : type === 'system' ? 'Hệ thống' : 'Tin nhắn';
                  return (
                    <div
                      key={message._id || message.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                          isMine ? 'bg-cyan-500/20 text-cyan-100' : 'bg-white/10 text-white'
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-white/70">
                          <span>{isMine ? 'Bạn' : 'Thành viên'}</span>
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">{typeLabel}</span>
                          <span>{formatTime(message.createdAt)}</span>
                        </div>
                        <div className="break-words whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="relative mt-3 flex shrink-0 gap-2 border-t border-white/10 pt-3">
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
              <button
                ref={menuButtonRef}
                type="button"
                disabled={!selectedChannelId || sendingMessage}
                onClick={() => setShowComposerMenu((prev) => !prev)}
                className="h-10 w-10 rounded-xl border border-white/15 bg-white/5 text-2xl leading-none text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                +
              </button>
              {showComposerMenu && (
                <div
                  ref={menuRef}
                  className="absolute bottom-[56px] left-0 z-20 w-52 rounded-xl border border-white/10 bg-gray-900/95 p-2 shadow-2xl"
                >
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    Tải lên tệp
                  </button>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    Gửi hình ảnh
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateContactCard}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    Gửi danh thiếp
                  </button>
                  <button
                    type="button"
                    onClick={handleCreatePoll}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm text-white transition hover:bg-white/10"
                  >
                    Tạo khảo sát
                  </button>
                </div>
              )}
              <input
                value={messageInput}
                onChange={(event) => onChangeMessageInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    onSendMessage();
                  }
                }}
                placeholder={selectedChannelId ? 'Nhập tin nhắn...' : 'Chọn kênh để nhắn tin'}
                disabled={!selectedChannelId || sendingMessage}
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 disabled:opacity-60"
              />
              <button
                type="button"
                onClick={onSendMessage}
                disabled={!selectedChannelId || !messageInput.trim() || sendingMessage}
                className="rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Gửi
              </button>
            </div>
          </div>
        </div>
      </div>

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

    </div>
  );
};

export default OrganizationMainPanel;

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  Bell,
  CalendarDays,
  Clock,
  FileText,
  Info,
  MapPin,
  Mic,
  Pin,
  Timer,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog, GradientButton, Modal } from '../../components/Shared';
import {
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { resolveMentionNavIndex } from '../../utils/chatComposerLimits';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { useCalendarFeed } from '../../hooks/useCalendarFeed';
import { useTaskDueAlerts } from '../../hooks/useTaskDueAlerts';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import UserAvatar from '../../components/Shared/UserAvatar';
import { getMeetingJoinState, toDateKey } from '../../utils/calendarUtils';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { LOCAL_CUSTOM_KEY } from '../../utils/dmCalendarReminders';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import {
  FIGMA_PAGE_CARD_PAD,
  FIGMA_PAGE_SHELL,
} from '../../components/Layout/figmaPageClasses';
import CalendarFigmaView from '../../components/Calendar/CalendarFigmaView';
import { hasBackendCapability } from '../../config/backendCapabilities';

const CALENDAR_WRITE_ENABLED = hasBackendCapability('calendarEventService');

const CALENDAR_LOCAL_KEY = LOCAL_CUSTOM_KEY;
const EVENT_TITLE_MAX_LENGTH = 200;
const EVENT_LOCATION_MAX_LENGTH = 200;
const EVENT_DESCRIPTION_MAX_LENGTH = 500;
const ATTENDEE_QUERY_MAX_LENGTH = 120;
const EVENT_TYPE_OPTIONS = [
  { id: 'meeting', labelKey: 'calendar.kindMeeting', Icon: Mic },
  { id: 'deadline', labelKey: 'calendar.typeDeadline', Icon: AlarmClock },
  { id: 'reminder', labelKey: 'calendar.tabReminder', Icon: Bell },
];
const DEFAULT_DURATION_MINUTES = '30';
const DURATION_MINUTE_OPTIONS = ['15', '30', '45', '60', '90', '120'];
const LEGACY_DURATION_MAP = {
  '15 ph\u00fat': '15',
  '30 ph\u00fat': '30',
  '45 ph\u00fat': '45',
  '1 gi\u1edd': '60',
  '1.5 gi\u1edd': '90',
  '2 gi\u1edd': '120',
  '15 min': '15',
  '30 min': '30',
  '45 min': '45',
  '1 hour': '60',
  '1.5 hours': '90',
  '2 hours': '120',
};

function resolveLocaleTag(locale) {
  return String(locale || '').toLowerCase() === 'en' ? 'en-US' : 'vi-VN';
}

function normalizeDurationMinutes(value) {
  if (value == null || value === '') return DEFAULT_DURATION_MINUTES;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) return raw;
  return LEGACY_DURATION_MAP[raw] || DEFAULT_DURATION_MINUTES;
}

function durationLabelForMinutes(minutes, t) {
  const keyByMinutes = {
    15: 'dur15',
    30: 'dur30',
    45: 'dur45',
    60: 'dur60',
    90: 'dur90',
    120: 'dur120',
  };
  const key = keyByMinutes[Number(minutes)];
  return key ? t(`calendar.${key}`) : String(minutes);
}

function parseTimeInputToDisplay(hhmm, loc) {
  if (!hhmm || !String(hhmm).includes(':')) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const d = new Date();
  d.setHours(h, m, 0, 0);
  const tag = resolveLocaleTag(loc);
  return d.toLocaleTimeString(tag, { hour: '2-digit', minute: '2-digit' });
}

function CalendarPage({
  spaceOrganizationId = '',
  spaceProjectId = '',
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { activeWorkspace, company } = useWorkspace();
  const organizationId = useMemo(() => {
    const fromSpace = String(spaceOrganizationId || '').trim();
    if (fromSpace) return fromSpace;
    const fromQuery = String(searchParams.get('organizationId') || '').trim();
    if (fromQuery) return fromQuery;
    const path = String(location.pathname || '');
    const onOrgSuite =
      path.startsWith('/app/collaborate') ||
      path.startsWith('/app/company') ||
      path.startsWith('/app/projects');
    if (!onOrgSuite) return '';
    return String(
      activeWorkspace?._id ||
        activeWorkspace?.id ||
        activeWorkspace?.organizationId ||
        company?.id ||
        company?._id ||
        company?.organizationId ||
        ''
    ).trim();
  }, [searchParams, location.pathname, activeWorkspace, company, spaceOrganizationId]);
  const projectIdFilter = String(spaceProjectId || searchParams.get('projectId') || '').trim();
  const { t } = useAppStrings();
  const formIdPrefix = useId();
  const fieldId = (name) => `${formIdPrefix}-${name}`;
  const { locale } = useLocale();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [createType, setCreateType] = useState('meeting');
  /** Gắn nhắc hẹn / sự kiện local với bạn DM (từ chat) */
  const [dmPeerFriendId, setDmPeerFriendId] = useState('');
  const [dmPeerFriendName, setDmPeerFriendName] = useState('');
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: DEFAULT_DURATION_MINUTES,
    location: '',
    description: '',
    attendeesText: '',
  });
  const [attendeeNames, setAttendeeNames] = useState([]);
  const [attendeeSuggestions, setAttendeeSuggestions] = useState([]);
  const [showAttendeeSuggestions, setShowAttendeeSuggestions] = useState(false);
  const [attendeeActiveIndex, setAttendeeActiveIndex] = useState(-1);
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState(null);
  /** month | week | list — Figma suite layout */
  const [viewMode, setViewMode] = useState('month');

  const {
    events,
    tasksForAlerts,
    reloadLocal,
    refetch,
    loading: feedLoading,
    error: feedError,
  } = useCalendarFeed(selectedDate, organizationId, projectIdFilter);

  useTaskDueAlerts(tasksForAlerts, {
    enabled: true,
    onAlert: ({ title }) => {
      toast(t('calendar.toastDeadlineAlert', { title }));
    },
  });

  const selectedDateEvents = useMemo(() => {
    const key = toDateKey(selectedDate);
    return events
      .filter((e) => e.date === key)
      .sort((a, b) => new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime());
  }, [events, selectedDate]);

  const upcomingMonthEvents = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    return events.filter((e) => {
      if (!e.date) return false;
      const d = new Date(`${e.date}T12:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [events, selectedDate]);

  const resetEventForm = () => {
    setEditingEventId(null);
    setCreateType('meeting');
    setAttendeeNames([]);
    setShowAttendeeSuggestions(false);
    setAttendeeActiveIndex(-1);
    setEventForm({
      title: '',
      date: '',
      time: '',
      duration: DEFAULT_DURATION_MINUTES,
      location: '',
      description: '',
      attendeesText: '',
    });
  };

  const openCreateModal = (prefilledTitle = null) => {
    resetEventForm();
    const dateStr = toDateKey(selectedDate);
    const title = prefilledTitle || `${t('calendar.newEventDefault', { date: dateStr })}`;
    setEventForm((prev) => ({
      ...prev,
      date: dateStr,
      time: '09:00',
      title: title,
    }));
    setShowCreateEventModal(true);
  };

  useEffect(() => {
    const state = location.state;
    if (!state || state.source !== 'friend-chat') return;
    const prefillTitle = String(state.prefillTitle || '').trim();
    const prefillAttendees = Array.isArray(state.prefillAttendees)
      ? state.prefillAttendees.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const prefillType = String(state.prefillType || '').trim();
    const friendId = String(state.friendId || '').trim();
    const friendName = String(state.friendName || '').trim();

    if (prefillType === 'reminder' || prefillType === 'meeting' || prefillType === 'deadline') {
      setCreateType(prefillType);
    }
    if (friendId) setDmPeerFriendId(friendId);
    if (friendName) setDmPeerFriendName(friendName);
    if (state.prefillDate) {
      const d = String(state.prefillDate).trim();
      if (d) setSelectedDate(new Date(`${d}T12:00:00`));
    }

    openCreateModal(prefillTitle || null);
    if (prefillAttendees.length > 0) {
      setAttendeeNames(Array.from(new Set(prefillAttendees)));
    }
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    const openCreate = searchParams.get('openCreate');
    const friendId = String(searchParams.get('friendId') || '').trim();
    const friendName = String(searchParams.get('friendName') || '').trim();
    const type = String(searchParams.get('type') || '').trim();
    if (openCreate !== '1' || !friendId) return;

    if (type === 'reminder' || type === 'meeting' || type === 'deadline') {
      setCreateType(type);
    }
    setDmPeerFriendId(friendId);
    if (friendName) setDmPeerFriendName(friendName);
    openCreateModal(
      friendName
        ? t('calendar.reminderWithFriend', { name: friendName })
        : null
    );
    navigate(`${location.pathname}`, { replace: true });
  }, [searchParams, navigate, location.pathname, t]);

  const openEditModal = (eventData) => {
    if (!eventData) return;
    if (eventData.source === 'api') {
      toast(t('calendar.toastEditElsewhere'));
      return;
    }
    setEditingEventId(eventData.id);
    setCreateType(eventData.type || 'meeting');
    setEventForm({
      title: eventData.title || '',
      date: eventData.date || '',
      time: eventData.timeInput || eventData.time || '',
      duration: normalizeDurationMinutes(eventData.duration),
      location: eventData.location || '',
      description: eventData.description || '',
      attendeesText: '',
    });
    if (Array.isArray(eventData.attendeeNames)) {
      setAttendeeNames(eventData.attendeeNames.filter(Boolean));
    } else {
      setAttendeeNames([]);
    }
    setShowCreateEventModal(true);
  };

  const handleAddAttendees = () => {
    const raw = String(eventForm.attendeesText || '').trim();
    if (!raw) {
      toast.error(t('calendar.toastParticipantName'));
      return;
    }

    const parsed = raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      toast.error(t('calendar.toastParticipantInvalid'));
      return;
    }

    setAttendeeNames((prev) => Array.from(new Set([...prev, ...parsed])));
    setEventForm((prev) => ({ ...prev, attendeesText: '' }));
    toast.success(t('calendar.toastParticipantAdded'));
  };

  const addAttendeeName = (name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    setAttendeeNames((prev) => Array.from(new Set([...prev, clean])));
    setEventForm((prev) => ({ ...prev, attendeesText: '' }));
    setShowAttendeeSuggestions(false);
    setAttendeeActiveIndex(-1);
  };

  const handleRemoveAttendee = (name) => {
    setAttendeeNames((prev) => prev.filter((item) => item !== name));
  };

  const filteredAttendeeSuggestions = useMemo(() => {
    const q = String(eventForm.attendeesText || '').trim().toLowerCase();
    return attendeeSuggestions
      .filter((item) => !attendeeNames.includes(item.label))
      .filter((item) => {
        if (!q) return true;
        return `${item.label} ${item.sub || ''}`.toLowerCase().includes(q);
      })
      .slice(0, 8);
  }, [attendeeSuggestions, attendeeNames, eventForm.attendeesText]);

  const loadAttendeeSuggestions = useCallback(async () => {
    try {
      const [friendsRes, membersRes] = await Promise.all([
        friendService.getFriends().catch(() => null),
        organizationId ? organizationAPI.getMembers(organizationId).catch(() => null) : Promise.resolve(null),
      ]);
      const rawFriends = friendsRes?.data?.friends ?? friendsRes?.data?.data?.friends ?? friendsRes?.data ?? [];
      const friendRows = (Array.isArray(rawFriends) ? rawFriends : [])
        .map((item) => item?.friendId || item)
        .filter(Boolean)
        .map((u) => ({
          id: String(u?._id || u?.id || u?.userId || ''),
          label: String(u?.displayName || u?.fullName || u?.username || u?.email || '').trim(),
          sub: String(u?.email || u?.phone || u?.phoneNumber || '').trim(),
        }))
        .filter((row) => row.id && row.label);

      const rawMembers = membersRes?.data?.data ?? membersRes?.data ?? [];
      const memberRows = (Array.isArray(rawMembers) ? rawMembers : [])
        .map((item) => item?.user || item)
        .filter(Boolean)
        .map((u) => ({
          id: String(u?._id || u?.id || u?.userId || ''),
          label: String(u?.displayName || u?.fullName || u?.username || u?.email || '').trim(),
          sub: String(u?.email || u?.phone || u?.phoneNumber || '').trim(),
        }))
        .filter((row) => row.id && row.label);

      const merged = new Map();
      [...memberRows, ...friendRows].forEach((row) => {
        if (!merged.has(row.id)) merged.set(row.id, row);
      });
      setAttendeeSuggestions(Array.from(merged.values()));
    } catch {
      setAttendeeSuggestions([]);
    }
  }, [organizationId]);

  useEffect(() => {
    if (showCreateEventModal) loadAttendeeSuggestions();
  }, [showCreateEventModal, loadAttendeeSuggestions]);

  const persistLocalList = useCallback((updater) => {
    try {
      let list = [];
      const raw = localStorage.getItem(CALENDAR_LOCAL_KEY) || localStorage.getItem('calendar:events');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) list = p;
      }
      const next = typeof updater === 'function' ? updater(list) : updater;
      localStorage.setItem(CALENDAR_LOCAL_KEY, JSON.stringify(next));
      reloadLocal();
      return true;
    } catch {
      toast.error(t('calendar.toastLocalSaveFail'));
      return false;
    }
  }, [reloadLocal, t]);

  const closeCreateModal = () => {
    setShowCreateEventModal(false);
    resetEventForm();
    setDmPeerFriendId('');
    setDmPeerFriendName('');
  };

  const handleCreateModalClose = () => {
    if (showAttendeeSuggestions && filteredAttendeeSuggestions.length > 0) {
      setShowAttendeeSuggestions(false);
      setAttendeeActiveIndex(-1);
      return;
    }
    closeCreateModal();
  };

  const handleSaveEvent = () => {
    const title = String(eventForm.title || '').trim();
    const date = String(eventForm.date || '').trim();
    const timeRaw = String(eventForm.time || '').trim();

    if (!title || !date || !timeRaw) {
      toast.error(t('calendar.toastFillRequired'));
      return;
    }

    const colorByType = {
      meeting: 'from-blue-500 to-cyan-500',
      deadline: 'from-red-500 to-orange-500',
      reminder: 'from-cyan-600 to-teal-600',
    };

    const timeLabel = parseTimeInputToDisplay(timeRaw) || timeRaw;
    let startAt = null;
    try {
      startAt = new Date(`${date}T${timeRaw}`);
      if (Number.isNaN(startAt.getTime())) startAt = null;
    } catch {
      startAt = null;
    }

    const peerId = String(dmPeerFriendId || '').trim();
    const peerName = String(dmPeerFriendName || '').trim();
    const nextEvent = {
      id: editingEventId || `local:${Date.now()}`,
      kind: 'local',
      source: 'local',
      title,
      date,
      time: timeLabel,
      timeInput: timeRaw,
      duration:
        createType === 'meeting'
          ? durationLabelForMinutes(normalizeDurationMinutes(eventForm.duration), t)
          : '',
      type: createType,
      attendees: createType === 'meeting' ? attendeeNames.length : 0,
      attendeeNames: createType === 'meeting' ? attendeeNames : [],
      location: eventForm.location || '',
      description: eventForm.description || '',
      priority: createType === 'deadline' ? 'high' : undefined,
      color: colorByType[createType] || colorByType.reminder,
      startAt: startAt ? startAt.toISOString() : null,
      ...(peerId
        ? {
            friendId: peerId,
            friendName: peerName || undefined,
          }
        : {}),
    };

    const saved = editingEventId
      ? persistLocalList((list) =>
        list.map((item) => (String(item.id) === String(editingEventId) ? nextEvent : item))
      )
      : persistLocalList((list) => [nextEvent, ...list]);
    if (!saved) return;

    toast.success(editingEventId ? t('calendar.toastUpdated') : t('calendar.toastCreated'));
    closeCreateModal();
  };

  const handleDeleteEvent = (eventId, source) => {
    if (!eventId) return;
    if (source === 'api') {
      toast(t('calendar.toastDeleteTaskVoice'));
      return;
    }
    setDeleteConfirmEventId(eventId);
  };

  const confirmDeleteLocalEvent = () => {
    const eventId = deleteConfirmEventId;
    if (!eventId) return;
    const deleted = persistLocalList((list) => list.filter((item) => String(item.id) !== String(eventId)));
    if (!deleted) return;
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(null);
    }
    toast.success(t('calendar.toastDeleted'));
  };

  const handleJoinEvent = (eventData) => {
    if (!eventData) return;
    if (eventData.kind === 'meeting' && eventData.meetingId && eventData.raw) {
      const st = getMeetingJoinState(eventData.raw, new Date());
      if (!st.joinEligible) {
        if (st.disabledReason === 'too_early') {
          toast.error(t('calendar.toastJoinWindow'));
        } else if (st.disabledReason === 'ended') {
          toast.error(t('calendar.toastMeetingEnded'));
        } else {
          toast.error(t('calendar.toastJoinFail'));
        }
        return;
      }
      navigate(`/voice/${encodeURIComponent(eventData.meetingId)}`);
      toast.success(t('calendar.toastJoining'));
      return;
    }
    if (eventData.type === 'meeting' && eventData.source === 'local') {
      toast(t('calendar.toastLocalEvent'));
      return;
    }
    if (eventData.kind === 'task' || eventData.kind === 'work' || eventData.type === 'deadline' || eventData.type === 'work') {
      const projectId = String(eventData.projectId || eventData.raw?.projectId || '').trim();
      const boardId = String(eventData.boardId || eventData.raw?.boardId || '').trim();
      const orgId = String(
        eventData.organizationId || eventData.raw?.organizationId || organizationId || ''
      ).trim();
      if (projectId) {
        navigate(
          buildCollaborateProjectHubPath(projectId, {
            organizationId: orgId,
            boardId,
          })
        );
        return;
      }
      toast(t('calendar.toastOpenTasks'));
      return;
    }
    toast(t('calendar.toastDetail'));
  };

  const renderModalCard = (children) => (
    <div className={FIGMA_PAGE_CARD_PAD}>{children}</div>
  );
  const modalHeading = 'mb-3 flex items-center gap-2 text-sm font-semibold text-foreground';
  const modalBody = 'space-y-2 text-sm text-muted-foreground';
  const modalInfoRow = 'flex items-center gap-2';
  const modalIcon = 'shrink-0 text-muted-foreground';
  const formInput = adminInputClass('text-foreground placeholder:text-muted-foreground');
  const formDateInput = adminInputClass('text-foreground [color-scheme:light] dark:[color-scheme:dark]');
  const formLabel = adminLabelClass();
  const isMeetingType = createType === 'meeting';
  const attendeeListboxId = fieldId('attendee-listbox');
  const attendeeOptionId = (index) => fieldId(`attendee-option-${index}`);
  const isAttendeeListOpen = showAttendeeSuggestions && filteredAttendeeSuggestions.length > 0;

  const handleCalendarRefresh = async () => {
    reloadLocal();
    const result = await refetch();
    if (result?.isError) {
      toast.error(resolveApiErrorMessage(result.error, { t, fallback: t('calendar.toastRefreshFail') }));
      return;
    }
    toast.success(t('calendar.toastRefreshed'));
  };

  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
    toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }));
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
    toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }));
  };

  const handleToday = () => {
    setSelectedDate(new Date());
    toast(t('calendar.toastBackToday'));
  };

  const handleEventTypeKeyDown = (e, index) => {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = EVENT_TYPE_OPTIONS[(index + delta + EVENT_TYPE_OPTIONS.length) % EVENT_TYPE_OPTIONS.length];
    setCreateType(next.id);
    document.getElementById(fieldId(`type-${next.id}`))?.focus();
  };

  const handleAttendeeKeyDown = (e) => {
    const count = filteredAttendeeSuggestions.length;
    const isOpen = showAttendeeSuggestions && count > 0;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!count) return;
      e.preventDefault();
      if (!showAttendeeSuggestions) setShowAttendeeSuggestions(true);
      setAttendeeActiveIndex((prev) => resolveMentionNavIndex(prev, e.key, count));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen) {
        const pick = filteredAttendeeSuggestions[attendeeActiveIndex >= 0 ? attendeeActiveIndex : 0];
        addAttendeeName(pick.label);
        return;
      }
      if (String(eventForm.attendeesText || '').trim()) handleAddAttendees();
      return;
    }
    if (e.key === 'Escape' && showAttendeeSuggestions) {
      setShowAttendeeSuggestions(false);
      setAttendeeActiveIndex(-1);
    }
  };

  const handleUpcomingClick = (ev, date) => {
    setSelectedDate(date);
    setSelectedEvent(ev);
  };

  const calendarFigmaView = (
    <CalendarFigmaView
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      events={events}
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      selectedEvent={selectedEvent}
      onSelectEvent={setSelectedEvent}
      locale={locale}
      t={t}
      onPrevMonth={handlePrevMonth}
      onNextMonth={handleNextMonth}
      onToday={handleToday}
      onOpenCreate={() => openCreateModal()}
      calendarWriteEnabled={CALENDAR_WRITE_ENABLED}
      onRefresh={handleCalendarRefresh}
      onJoinEvent={handleJoinEvent}
      selectedDateEvents={selectedDateEvents}
      upcomingMonthEvents={upcomingMonthEvents}
      onUpcomingClick={handleUpcomingClick}
      loading={feedLoading}
      error={feedError}
      onRetry={refetch}
    />
  );

  return (
    <>
      <div className={`${FIGMA_PAGE_SHELL} h-full overflow-hidden`}>{calendarFigmaView}</div>

      <Modal
        isOpen={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title}
        size="lg"
      >
        {selectedEvent && (
          <div className="space-y-4">
            <div aria-hidden="true" className={`h-2 w-full rounded-full bg-gradient-to-r ${selectedEvent.color}`} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderModalCard(
                <>
                  <h4 className={modalHeading}>
                    <Clock size={16} aria-hidden="true" className={modalIcon} />
                    {t('calendar.sectionTime')}
                  </h4>
                  <div className={modalBody}>
                    <div className={modalInfoRow}>
                      <CalendarDays size={14} aria-hidden="true" className={modalIcon} />
                      {selectedEvent.date}
                    </div>
                    <div className={modalInfoRow}>
                      <AlarmClock size={14} aria-hidden="true" className={modalIcon} />
                      {selectedEvent.time}
                    </div>
                    {selectedEvent.duration && (
                      <div className={modalInfoRow}>
                        <Timer size={14} aria-hidden="true" className={modalIcon} />
                        {selectedEvent.duration}
                      </div>
                    )}
                  </div>
                </>
              )}

              {renderModalCard(
                <>
                  <h4 className={modalHeading}>
                    <Info size={16} aria-hidden="true" className={modalIcon} />
                    {t('calendar.sectionDetailBlock')}
                  </h4>
                  <div className={modalBody}>
                    <div className={modalInfoRow}>
                      <Pin size={14} aria-hidden="true" className={modalIcon} />
                      {selectedEvent.kind === 'task'
                        ? t('calendar.kindTaskDeadline')
                        : selectedEvent.type === 'meeting'
                          ? t('calendar.kindMeeting')
                          : t('calendar.eventOrMeeting')}
                    </div>
                    {selectedEvent.location && (
                      <div className={modalInfoRow}>
                        <MapPin size={14} aria-hidden="true" className={modalIcon} />
                        {selectedEvent.location}
                      </div>
                    )}
                    {selectedEvent.attendees > 0 && (
                      <div className={modalInfoRow}>
                        <Users size={14} aria-hidden="true" className={modalIcon} />
                        {t('calendar.peopleCount', { n: selectedEvent.attendees })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {selectedEvent.type === 'meeting' &&
              Array.isArray(selectedEvent.attendeeNames) &&
              selectedEvent.attendeeNames.length > 0 &&
              renderModalCard(
                <>
                  <h4 className={modalHeading}>
                    <Users size={16} aria-hidden="true" className={modalIcon} />
                    {t('calendar.attendeesSection', { n: selectedEvent.attendeeNames.length })}
                  </h4>
                  <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 sm:grid-cols-2">
                    {selectedEvent.attendeeNames.map((name) => (
                      <li key={name} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                        <UserAvatar name={name} size="xs" />
                        <span className="truncate text-sm font-semibold text-foreground">{name}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

            {renderModalCard(
              <>
                <h4 className={modalHeading}>
                  <FileText size={16} aria-hidden="true" className={modalIcon} />
                  {t('calendar.sectionDescription')}
                </h4>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {selectedEvent.description ||
                    selectedEvent.raw?.description ||
                    (selectedEvent.type === 'meeting' ? t('calendar.meetingHint') : t('calendar.taskHint'))}
                </p>
              </>
            )}

            <div className="flex flex-wrap gap-3">
              {selectedEvent.type === 'meeting' && (() => {
                const mj =
                  selectedEvent.kind === 'meeting' && selectedEvent.raw
                    ? getMeetingJoinState(selectedEvent.raw)
                    : null;
                const joinDisabled = Boolean(mj && !mj.joinEligible);
                return (
                  <GradientButton
                    variant="primary"
                    disabled={joinDisabled}
                    onClick={() => {
                      handleJoinEvent(selectedEvent);
                      setSelectedEvent(null);
                    }}
                    className="min-w-[140px] flex-1"
                  >
                    {joinDisabled ? t('calendar.joinClosedBtn') : t('calendar.joinNow')}
                  </GradientButton>
                );
              })()}
              {selectedEvent.source !== 'api' && (
                <GradientButton
                  variant="secondary"
                  onClick={() => {
                    setSelectedEvent(null);
                    openEditModal(selectedEvent);
                  }}
                  className="min-w-[140px] flex-1"
                >
                  {t('calendar.editEventBtn')}
                </GradientButton>
              )}
              {selectedEvent.source !== 'api' && (
                <button
                  type="button"
                  onClick={() => handleDeleteEvent(selectedEvent?.id, selectedEvent?.source)}
                  className={adminDangerBtnClass('px-6 py-3')}
                >
                  {t('calendar.deleteEventBtn')}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showCreateEventModal}
        onClose={handleCreateModalClose}
        title={editingEventId ? t('calendar.modalEditTitle') : t('calendar.modalCreateTitle')}
        size="lg"
      >
        <div className="space-y-4 text-foreground">
          <div>
            <label htmlFor={fieldId('title')} className={formLabel}>
              {t('calendar.labelEventTitle')}
            </label>
            <input
              id={fieldId('title')}
              type="text"
              placeholder={t('calendar.phTitle')}
              value={eventForm.title}
              maxLength={EVENT_TITLE_MAX_LENGTH}
              required
              onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
              className={formInput}
            />
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={formLabel}>{t('calendar.formTypeLegend')}</legend>
            <div role="radiogroup" aria-label={t('calendar.formTypeLegend')} className="grid grid-cols-3 gap-2 sm:gap-3">
              {EVENT_TYPE_OPTIONS.map(({ id, labelKey, Icon }, index) => {
                const active = createType === id;
                return (
                  <button
                    key={id}
                    id={fieldId(`type-${id}`)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => setCreateType(id)}
                    onKeyDown={(e) => handleEventTypeKeyDown(e, index)}
                    className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none sm:flex-row sm:gap-2 ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon size={18} aria-hidden="true" />
                    <span>{t(labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={fieldId('date')} className={formLabel}>
                {t('calendar.labelDate')}
              </label>
              <input
                id={fieldId('date')}
                type="date"
                value={eventForm.date}
                required
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
                className={formDateInput}
              />
            </div>
            <div>
              <label htmlFor={fieldId('time')} className={formLabel}>
                {t('calendar.labelTime')}
              </label>
              <input
                id={fieldId('time')}
                type="time"
                value={eventForm.time}
                required
                onChange={(e) => setEventForm((prev) => ({ ...prev, time: e.target.value }))}
                className={formDateInput}
              />
            </div>
          </div>

          {isMeetingType && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 motion-safe:animate-fade-in-fast">
              <div>
                <label htmlFor={fieldId('duration')} className={formLabel}>
                  {t('calendar.labelDuration')}
                </label>
                <select
                  id={fieldId('duration')}
                  value={eventForm.duration}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, duration: e.target.value }))}
                  className={formInput}
                >
                  {DURATION_MINUTE_OPTIONS.map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {durationLabelForMinutes(minutes, t)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={fieldId('location')} className={formLabel}>
                  {t('calendar.labelLocation')}
                </label>
                <input
                  id={fieldId('location')}
                  type="text"
                  placeholder={t('calendar.phVoice')}
                  value={eventForm.location}
                  maxLength={EVENT_LOCATION_MAX_LENGTH}
                  onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
                  className={formInput}
                />
              </div>
            </div>
          )}

          <div>
            <label htmlFor={fieldId('description')} className={formLabel}>
              {t('calendar.labelDesc')}
            </label>
            <textarea
              id={fieldId('description')}
              rows={4}
              placeholder={t('calendar.phDesc')}
              value={eventForm.description}
              maxLength={EVENT_DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
              className={`${formInput} resize-none`}
            />
          </div>

          {isMeetingType && (
            <div className="motion-safe:animate-fade-in-fast">
              <label htmlFor={fieldId('attendees')} className={formLabel}>
                {t('calendar.labelAttendees')}
              </label>
              <div className="relative flex gap-2">
                <input
                  id={fieldId('attendees')}
                  type="text"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={isAttendeeListOpen}
                  aria-controls={attendeeListboxId}
                  aria-activedescendant={
                    isAttendeeListOpen && attendeeActiveIndex >= 0 ? attendeeOptionId(attendeeActiveIndex) : undefined
                  }
                  aria-label={t('calendar.attendeeSearchAria')}
                  placeholder={t('calendar.phAttendees')}
                  value={eventForm.attendeesText}
                  maxLength={ATTENDEE_QUERY_MAX_LENGTH}
                  onFocus={() => setShowAttendeeSuggestions(true)}
                  onBlur={() => {
                    setShowAttendeeSuggestions(false);
                    setAttendeeActiveIndex(-1);
                  }}
                  onChange={(e) => {
                    setEventForm((prev) => ({ ...prev, attendeesText: e.target.value }));
                    setShowAttendeeSuggestions(true);
                    setAttendeeActiveIndex(-1);
                  }}
                  onKeyDown={handleAttendeeKeyDown}
                  className={`flex-1 ${formInput}`}
                />
                <button type="button" className={adminSecondaryBtnClass('shrink-0')} onClick={handleAddAttendees}>
                  {t('calendar.addAttendeeBtn')}
                </button>
                <ul
                  id={attendeeListboxId}
                  role="listbox"
                  aria-label={t('calendar.attendeeSuggestionsAria')}
                  hidden={!isAttendeeListOpen}
                  className="absolute left-0 right-[6.5rem] top-[calc(100%+0.35rem)] z-20 m-0 max-h-52 list-none overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg motion-safe:animate-fade-in-fast"
                >
                  {filteredAttendeeSuggestions.map((item, index) => {
                    const active = index === attendeeActiveIndex;
                    return (
                      <li
                        key={item.id}
                        id={attendeeOptionId(index)}
                        role="option"
                        aria-selected={active}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addAttendeeName(item.label)}
                        className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm text-foreground ${
                          active ? 'bg-muted' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="ml-2 truncate text-xs text-muted-foreground">{item.sub || ''}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
              {attendeeNames.length > 0 && (
                <ul className="m-0 mt-3 flex list-none flex-wrap gap-2 p-0">
                  {attendeeNames.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttendee(name)}
                        aria-label={t('calendar.attendeeRemoveAria', { name })}
                        className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors duration-150 hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                      >
                        {name}
                        <X size={12} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <GradientButton variant="primary" onClick={handleSaveEvent} className="flex-1">
              {editingEventId ? t('calendar.saveEvent') : t('calendar.createEvent')}
            </GradientButton>
            <button type="button" onClick={closeCreateModal} className={adminSecondaryBtnClass('shrink-0 px-4 py-3')}>
              {t('calendar.cancelBtn')}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={deleteConfirmEventId != null}
        onClose={() => setDeleteConfirmEventId(null)}
        onConfirm={confirmDeleteLocalEvent}
        title={t('calendar.confirmDeleteTitle')}
        message={t('calendar.confirmDeleteMsg')}
        confirmText={t('calendar.confirmDeleteOk')}
        cancelText={t('calendar.cancelBtn')}
        variant="danger"
      />
    </>
  );
}

export default CalendarPage;

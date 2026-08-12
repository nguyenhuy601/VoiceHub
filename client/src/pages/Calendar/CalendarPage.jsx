import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import { ConfirmDialog, GradientButton, Modal } from '../../components/Shared';
import { useCalendarFeed } from '../../hooks/useCalendarFeed';
import { useTaskDueAlerts } from '../../hooks/useTaskDueAlerts';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import UserAvatar from '../../components/Shared/UserAvatar';
import {
  getMeetingJoinState,
  getMonthGridCells,
  toDateKey,
} from '../../utils/calendarUtils';
import { useAppStrings } from '../../locales/appStrings';
import { useLocale } from '../../context/LocaleContext';
import { LOCAL_CUSTOM_KEY } from '../../utils/dmCalendarReminders';
import {
  FIGMA_PAGE_CARD_PAD,
  FIGMA_PAGE_SHELL,
} from '../../components/Layout/figmaPageClasses';
import CalendarFigmaView from '../../components/Calendar/CalendarFigmaView';
import { hasBackendCapability } from '../../config/backendCapabilities';

const CALENDAR_WRITE_ENABLED = hasBackendCapability('calendarEventService');

const CALENDAR_LOCAL_KEY = LOCAL_CUSTOM_KEY;
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

function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const organizationId = searchParams.get('organizationId') || '';
  const { isDarkMode } = useTheme();
  const { t } = useAppStrings();
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
  const [deleteConfirmEventId, setDeleteConfirmEventId] = useState(null);
  const [eventSearchQuery, setEventSearchQuery] = useState('');
  /** all | meeting | deadline | local */
  const [calendarKindFilter, setCalendarKindFilter] = useState('all');
  /** month | week | list — Figma suite layout */
  const [viewMode, setViewMode] = useState('month');
  const jumpDateInputRef = useRef(null);

  const {
    events,
    tasksForAlerts,
    reloadLocal,
    refetch,
  } = useCalendarFeed(selectedDate, organizationId);

  useTaskDueAlerts(tasksForAlerts, {
    enabled: true,
    onAlert: ({ title }) => {
      toast(t('calendar.toastDeadlineAlert', { title }), { icon: '⏰' });
    },
  });

  const eventsByKind = useMemo(() => {
    if (calendarKindFilter === 'all') return events;
    return events.filter((e) => {
      if (calendarKindFilter === 'meeting') return e.kind === 'meeting' || e.type === 'meeting';
      if (calendarKindFilter === 'deadline') return e.kind === 'task' || e.type === 'deadline';
      if (calendarKindFilter === 'local') return e.kind === 'local' || e.source === 'local';
      return true;
    });
  }, [events, calendarKindFilter]);

  const calendarKindOptions = useMemo(
    () => [
      { id: 'all', label: t('calendar.kindAll'), icon: '📋' },
      { id: 'meeting', label: t('calendar.kindMeetings'), icon: '🎤' },
      { id: 'deadline', label: t('calendar.kindDeadlines'), icon: '⏰' },
      { id: 'local', label: t('calendar.kindLocal'), icon: '📝' },
    ],
    [t]
  );

  const eventsForDisplay = useMemo(() => {
    const q = eventSearchQuery.trim().toLowerCase();
    if (!q) return eventsByKind;
    return eventsByKind.filter((e) => {
      const hay = [e.title, e.date, e.time, e.location, e.description, e.duration, e.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [eventsByKind, eventSearchQuery]);

  const todayEvents = useMemo(() => {
    const k = toDateKey(new Date());
    return eventsForDisplay.filter((e) => e.date === k);
  }, [eventsForDisplay]);

  const upcomingEvents = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return eventsForDisplay
      .filter((e) => {
        if (!e.date) return false;
        const d = new Date(`${e.date}T12:00:00`);
        return d > start;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [eventsForDisplay]);

  const selectedDateEvents = useMemo(() => {
    const key = toDateKey(selectedDate);
    return eventsForDisplay
      .filter((e) => e.date === key)
      .sort((a, b) => new Date(a.startAt || 0).getTime() - new Date(b.startAt || 0).getTime());
  }, [eventsForDisplay, selectedDate]);

  const monthCells = useMemo(() => getMonthGridCells(selectedDate), [selectedDate]);

  const upcomingMonthEvents = useMemo(() => {
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth();
    return eventsForDisplay.filter((e) => {
      if (!e.date) return false;
      const d = new Date(`${e.date}T12:00:00`);
      if (Number.isNaN(d.getTime())) return false;
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [eventsForDisplay, selectedDate]);

  const resetEventForm = () => {
    setEditingEventId(null);
    setCreateType('meeting');
    setAttendeeNames([]);
    setShowAttendeeSuggestions(false);
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
      toast(t('calendar.toastEditElsewhere'), { icon: 'ℹ️' });
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
    } catch {
      toast.error(t('calendar.toastLocalSaveFail'));
    }
  }, [reloadLocal, t]);

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

    if (editingEventId) {
      persistLocalList((list) =>
        list.map((item) => (String(item.id) === String(editingEventId) ? nextEvent : item))
      );
      toast.success(t('calendar.toastUpdated'));
    } else {
      persistLocalList((list) => [nextEvent, ...list]);
      toast.success(t('calendar.toastCreated'));
    }

    setShowCreateEventModal(false);
    resetEventForm();
    setDmPeerFriendId('');
    setDmPeerFriendName('');
  };

  const handleDeleteEvent = (eventId, source) => {
    if (!eventId) return;
    if (source === 'api') {
      toast(t('calendar.toastDeleteTaskVoice'), { icon: 'ℹ️' });
      return;
    }
    setDeleteConfirmEventId(eventId);
  };

  const confirmDeleteLocalEvent = () => {
    const eventId = deleteConfirmEventId;
    if (!eventId) return;
    persistLocalList((list) => list.filter((item) => String(item.id) !== String(eventId)));
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
      toast(t('calendar.toastLocalEvent'), { icon: 'ℹ️' });
      return;
    }
    if (eventData.kind === 'task' || eventData.type === 'deadline') {
      toast(t('calendar.toastOpenTasks'), { icon: 'ℹ️' });
      return;
    }
    toast(t('calendar.toastDetail'), { icon: 'ℹ️' });
  };

  const renderModalCard = (children) => (
    <div className={FIGMA_PAGE_CARD_PAD}>{children}</div>
  );
  const modalHeading = isDarkMode ? 'font-bold text-white' : 'font-bold text-slate-900';
  const modalBody = isDarkMode ? 'text-sm text-gray-300' : 'text-sm text-slate-600';
  const modalDestructive = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-6 py-3 font-semibold text-red-400 transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-6 py-3 font-semibold text-red-600 shadow-sm transition-all hover:bg-slate-50';
  const attendeeRow = isDarkMode
    ? 'flex items-center gap-2 rounded-lg border border-slate-800 bg-[#040f2a] p-2'
    : 'flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 shadow-sm';
  const formShell = isDarkMode ? 'text-slate-100' : 'text-slate-900';
  const formLabel = isDarkMode ? 'mb-2 block text-sm font-semibold text-slate-300' : 'mb-2 block text-sm font-semibold text-slate-700';
  const formInput = isDarkMode
    ? 'w-full rounded-xl border border-slate-600/80 bg-[#0a1628] px-4 py-3 text-white outline-none transition-all placeholder:text-slate-500 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50'
    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/25';
  const formSelect = isDarkMode
    ? 'w-full rounded-xl border border-slate-600/80 bg-[#0a1628] px-4 py-3 text-white outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/40'
    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none focus:border-cyan-500';
  const formBtnSecondary = isDarkMode
    ? 'shrink-0 rounded-xl border border-slate-600 bg-[#0a1628] px-4 py-3 font-semibold text-white transition-all hover:bg-slate-700/80'
    : 'shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const formTypeInactive = isDarkMode
    ? 'rounded-xl border border-slate-600 bg-[#0a1628] px-3 py-3 text-sm font-semibold text-slate-100 transition-all hover:border-slate-500 hover:bg-slate-800/90 sm:flex-row'
    : 'rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-white sm:flex-row';

  const handleJumpDateChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    setSelectedDate(new Date(`${v}T12:00:00`));
    toast.success(t('calendar.toastGoto', { v }));
    e.target.value = '';
  };

  const handleCalendarRefresh = async () => {
    reloadLocal();
    await refetch();
    toast.success(t('calendar.toastRefreshed'));
  };

  const handlePrevMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setSelectedDate(newDate);
    toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }), { icon: '📅' });
  };

  const handleNextMonth = () => {
    const newDate = new Date(selectedDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setSelectedDate(newDate);
    toast(t('calendar.toastMonthNav', { m: newDate.getMonth() + 1, y: newDate.getFullYear() }), { icon: '📅' });
  };

  const handleToday = () => {
    setSelectedDate(new Date());
    toast(t('calendar.toastBackToday'), { icon: '📅' });
  };

  const handleUpcomingClick = (ev, date) => {
    setSelectedDate(date);
    setSelectedEvent(ev);
  };

  const calendarFigmaView = (
    <CalendarFigmaView
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      events={eventsForDisplay}
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
    />
  );

  return (
    <>
      <div className={`${FIGMA_PAGE_SHELL} h-full overflow-hidden`}>{calendarFigmaView}</div>

    {/* Event Detail Modal */}
    <Modal 
      isOpen={selectedEvent !== null} 
      onClose={() => setSelectedEvent(null)}
      title={selectedEvent?.title}
      size="lg"
    >
      {selectedEvent && (
        <div className="space-y-4">
          {/* Event Header */}
          <div className={`w-full h-2 rounded-full bg-gradient-to-r ${selectedEvent.color}`}></div>
          
          {/* Event Info */}
          <div className="grid grid-cols-2 gap-4">
            {renderModalCard(
              <>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>🕐</span> {t('calendar.sectionTime')}
              </h4>
              <div className={`space-y-2 ${modalBody}`}>
                <div>📅 {selectedEvent.date}</div>
                <div>⏰ {selectedEvent.time}</div>
                {selectedEvent.duration && <div>⌛ {selectedEvent.duration}</div>}
              </div>
              </>
            )}

            {renderModalCard(
              <>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>ℹ️</span> {t('calendar.sectionDetailBlock')}
              </h4>
              <div className={`space-y-2 ${modalBody}`}>
                <div>
                  📌{' '}
                  {selectedEvent.kind === 'task'
                    ? t('calendar.kindTaskDeadline')
                    : selectedEvent.type === 'meeting'
                      ? t('calendar.kindMeeting')
                      : t('calendar.eventOrMeeting')}
                </div>
                {selectedEvent.location && <div>📍 {selectedEvent.location}</div>}
                {selectedEvent.attendees && (
                  <div>👥 {t('calendar.peopleCount', { n: selectedEvent.attendees })}</div>
                )}
              </div>
              </>
            )}
          </div>

          {/* Attendees List — chỉ danh sách tên khi sự kiện local có attendeeNames */}
          {selectedEvent.type === 'meeting' &&
            Array.isArray(selectedEvent.attendeeNames) &&
            selectedEvent.attendeeNames.length > 0 && (
            renderModalCard(
              <>
              <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
                <span>👥</span> {t('calendar.attendeesSection', { n: selectedEvent.attendeeNames.length })}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {selectedEvent.attendeeNames.map((name, idx) => (
                  <div key={name} className={attendeeRow}>
                    <UserAvatar name={name} size="xs" />
                    <div className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{name}</div>
                  </div>
                ))}
              </div>
              </>
            )
          )}

          {renderModalCard(
            <>
            <h4 className={`mb-3 flex items-center gap-2 ${modalHeading}`}>
              <span>📝</span> {t('calendar.sectionDescription')}
            </h4>
            <p className={`whitespace-pre-wrap text-sm ${isDarkMode ? 'text-gray-300' : 'text-slate-600'}`}>
              {selectedEvent.description ||
                (selectedEvent.raw?.description) ||
                (selectedEvent.type === 'meeting' ? t('calendar.meetingHint') : t('calendar.taskHint'))}
            </p>
            </>
          )}

          {/* Action Buttons */}
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
                className="flex-1 min-w-[140px]"
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
              className="flex-1 min-w-[140px]"
            >
              {t('calendar.editEventBtn')}
            </GradientButton>
            )}
            {selectedEvent.source !== 'api' && (
            <button 
              type="button"
              onClick={() => {
                handleDeleteEvent(selectedEvent?.id, selectedEvent?.source);
              }}
            className={modalDestructive}
            >
              {t('calendar.deleteEventBtn')}
            </button>
            )}
          </div>
        </div>
      )}
    </Modal>

    {/* Create Event Modal */}
    <Modal 
      isOpen={showCreateEventModal} 
      onClose={() => setShowCreateEventModal(false)}
      title={editingEventId ? t('calendar.modalEditTitle') : t('calendar.modalCreateTitle')}
      size="lg"
    >
      <div className={`space-y-4 ${formShell}`}>
        {/* Event Title */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelEventTitle')}
          </label>
          <input 
            type="text"
            placeholder={t('calendar.phTitle')}
            value={eventForm.title}
            onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
            className={formInput}
          />
        </div>

        {/* Event Type — chữ sáng + nền tách khỏi glass modal */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelEventType')}
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { id: 'meeting', label: t('calendar.kindMeeting'), icon: '🎤' },
              { id: 'deadline', label: t('calendar.typeDeadline'), icon: '⏰' },
              { id: 'reminder', label: t('calendar.tabReminder'), icon: '🔔' },
            ].map((type) => {
              const active = createType === type.id;
              return (
              <button
                key={type.id}
                type="button"
                onClick={() => setCreateType(type.id)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border px-3 py-3 text-sm font-semibold transition-all sm:flex-row sm:gap-2 ${
                  active
                    ? 'border-cyan-400 bg-cyan-600/35 text-white shadow-[inset_0_0_0_1px_rgba(34,211,238,0.45)]'
                    : formTypeInactive
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>{type.icon}</span>
                <span className={active ? 'text-white' : isDarkMode ? 'text-slate-100' : 'text-slate-800'}>{type.label}</span>
              </button>
              );
            })}
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={formLabel}>
              {t('calendar.labelDate')}
            </label>
            <input 
              type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
              className={`${formInput} ${isDarkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
            />
          </div>
          <div>
            <label className={formLabel}>
              {t('calendar.labelTime')}
            </label>
            <input 
              type="time"
                value={eventForm.time}
                onChange={(e) => setEventForm((prev) => ({ ...prev, time: e.target.value }))}
              className={`${formInput} ${isDarkMode ? '[color-scheme:dark]' : '[color-scheme:light]'}`}
            />
          </div>
        </div>

        {/* Duration & Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={formLabel}>
              {t('calendar.labelDuration')}
            </label>
            <select
              value={eventForm.duration}
              onChange={(e) => setEventForm((prev) => ({ ...prev, duration: e.target.value }))}
              className={formSelect}
            >
              {DURATION_MINUTE_OPTIONS.map((minutes) => (
                <option
                  key={minutes}
                  value={minutes}
                  className={isDarkMode ? 'bg-slate-900 text-white' : 'bg-white text-slate-800'}
                >
                  {durationLabelForMinutes(minutes, t)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={formLabel}>
              {t('calendar.labelLocation')}
            </label>
            <input 
              type="text"
              placeholder={t('calendar.phVoice')}
              value={eventForm.location}
              onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
              className={formInput}
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelDesc')}
          </label>
          <textarea 
            rows={4}
            placeholder={t('calendar.phDesc')}
            value={eventForm.description}
            onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
            className={`${formInput} resize-none`}
          ></textarea>
        </div>

        {/* Attendees */}
        <div>
          <label className={formLabel}>
            {t('calendar.labelAttendees')}
          </label>
          <div className="relative flex gap-2">
            <input 
              type="text"
              placeholder={t('calendar.phAttendees')}
              value={eventForm.attendeesText}
              onFocus={() => setShowAttendeeSuggestions(true)}
              onChange={(e) => {
                setEventForm((prev) => ({ ...prev, attendeesText: e.target.value }));
                setShowAttendeeSuggestions(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredAttendeeSuggestions.length > 0) {
                  e.preventDefault();
                  addAttendeeName(filteredAttendeeSuggestions[0].label);
                }
              }}
              className={`flex-1 ${formInput}`}
            />
            <button
              type="button"
              className={formBtnSecondary}
              onClick={handleAddAttendees}
            >
              {t('calendar.addAttendeeBtn')}
            </button>
            {showAttendeeSuggestions && filteredAttendeeSuggestions.length > 0 && (
              <div
                className={`absolute left-0 right-[6.5rem] top-[calc(100%+0.35rem)] z-20 max-h-52 overflow-y-auto rounded-xl border p-1 ${
                  isDarkMode ? 'border-slate-700 bg-[#0a1628]' : 'border-slate-200 bg-white'
                }`}
              >
                {filteredAttendeeSuggestions.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addAttendeeName(item.label)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm ${
                      isDarkMode ? 'hover:bg-slate-800/80 text-slate-100' : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <span className="truncate">{item.label}</span>
                    <span className={`ml-2 truncate text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{item.sub || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {attendeeNames.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attendeeNames.map((name) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => handleRemoveAttendee(name)}
                  className="px-3 py-1.5 rounded-full text-xs bg-indigo-500/20 border border-indigo-400/40 text-indigo-200 hover:bg-indigo-500/30 transition-all"
                >
                  {name} ✕
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <GradientButton 
            variant="primary" 
            onClick={handleSaveEvent}
            className="flex-1"
          >
            {editingEventId ? t('calendar.saveEvent') : t('calendar.createEvent')}
          </GradientButton>
          <button 
            type="button"
            onClick={() => setShowCreateEventModal(false)}
            className={formBtnSecondary}
          >
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
    />
    </>
  );
}

export default CalendarPage;

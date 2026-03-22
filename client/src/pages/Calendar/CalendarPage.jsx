import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';
import { useCalendarFeed } from '../../hooks/useCalendarFeed';
import { useTaskDueAlerts } from '../../hooks/useTaskDueAlerts';
import {
  getMeetingJoinState,
  getMonthGridCells,
  toDateKey,
} from '../../utils/calendarUtils';

const LOCAL_CUSTOM_KEY = 'voicehub:calendar:localCustom';

function parseTimeInputToDisplay(hhmm) {
  if (!hhmm || !String(hhmm).includes(':')) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return '';
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function CalendarPage() {
  const navigate = useNavigate();
  const [view, setView] = useState('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [editingEventId, setEditingEventId] = useState(null);
  const [createType, setCreateType] = useState('meeting');
  const [eventForm, setEventForm] = useState({
    title: '',
    date: '',
    time: '',
    duration: '30 phút',
    location: '',
    description: '',
    attendeesText: '',
  });
  const [attendeeNames, setAttendeeNames] = useState([]);
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const {
    events,
    loading,
    error,
    tasksForAlerts,
    reloadLocal,
  } = useCalendarFeed(selectedDate);

  useTaskDueAlerts(tasksForAlerts, {
    enabled: true,
    onAlert: ({ title }) => {
      showToast(`Deadline: ${title}`, 'info');
    },
  });

  const todayEvents = useMemo(() => {
    const k = toDateKey(new Date());
    return events.filter((e) => e.date === k);
  }, [events]);

  const upcomingEvents = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return events
      .filter((e) => {
        if (!e.date) return false;
        const d = new Date(`${e.date}T12:00:00`);
        return d > t;
      })
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [events]);

  const monthCells = useMemo(() => getMonthGridCells(selectedDate), [selectedDate]);

  const resetEventForm = () => {
    setEditingEventId(null);
    setCreateType('meeting');
    setAttendeeNames([]);
    setEventForm({
      title: '',
      date: '',
      time: '',
      duration: '30 phút',
      location: '',
      description: '',
      attendeesText: '',
    });
  };

  const openCreateModal = () => {
    resetEventForm();
    setShowCreateEventModal(true);
  };

  const openEditModal = (eventData) => {
    if (!eventData) return;
    if (eventData.source === 'api') {
      showToast('Chỉnh sửa task/meeting trên Task hoặc Voice', 'info');
      return;
    }
    setEditingEventId(eventData.id);
    setCreateType(eventData.type || 'meeting');
    setEventForm({
      title: eventData.title || '',
      date: eventData.date || '',
      time: eventData.timeInput || eventData.time || '',
      duration: eventData.duration || '30 phút',
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
      showToast('Vui lòng nhập tên người tham gia', 'error');
      return;
    }

    const parsed = raw
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);

    if (parsed.length === 0) {
      showToast('Vui lòng nhập tên hợp lệ', 'error');
      return;
    }

    setAttendeeNames((prev) => Array.from(new Set([...prev, ...parsed])));
    setEventForm((prev) => ({ ...prev, attendeesText: '' }));
    showToast('Đã thêm người tham gia', 'success');
  };

  const handleRemoveAttendee = (name) => {
    setAttendeeNames((prev) => prev.filter((item) => item !== name));
  };

  const persistLocalList = useCallback((updater) => {
    try {
      let list = [];
      const raw = localStorage.getItem(LOCAL_CUSTOM_KEY) || localStorage.getItem('calendar:events');
      if (raw) {
        const p = JSON.parse(raw);
        if (Array.isArray(p)) list = p;
      }
      const next = typeof updater === 'function' ? updater(list) : updater;
      localStorage.setItem(LOCAL_CUSTOM_KEY, JSON.stringify(next));
      reloadLocal();
    } catch {
      showToast('Không lưu được dữ liệu local', 'error');
    }
  }, [reloadLocal, showToast]);

  const handleSaveEvent = () => {
    const title = String(eventForm.title || '').trim();
    const date = String(eventForm.date || '').trim();
    const timeRaw = String(eventForm.time || '').trim();

    if (!title || !date || !timeRaw) {
      showToast('Vui lòng nhập tiêu đề, ngày và giờ', 'error');
      return;
    }

    const colorByType = {
      meeting: 'from-blue-500 to-cyan-500',
      deadline: 'from-red-500 to-orange-500',
      reminder: 'from-purple-600 to-pink-600',
    };

    const timeLabel = parseTimeInputToDisplay(timeRaw) || timeRaw;
    let startAt = null;
    try {
      startAt = new Date(`${date}T${timeRaw}`);
      if (Number.isNaN(startAt.getTime())) startAt = null;
    } catch {
      startAt = null;
    }

    const nextEvent = {
      id: editingEventId || `local:${Date.now()}`,
      kind: 'local',
      source: 'local',
      title,
      date,
      time: timeLabel,
      timeInput: timeRaw,
      duration: createType === 'meeting' ? eventForm.duration : '',
      type: createType,
      attendees: createType === 'meeting' ? attendeeNames.length : 0,
      attendeeNames: createType === 'meeting' ? attendeeNames : [],
      location: eventForm.location || '',
      description: eventForm.description || '',
      priority: createType === 'deadline' ? 'high' : undefined,
      color: colorByType[createType] || colorByType.reminder,
      startAt: startAt ? startAt.toISOString() : null,
    };

    if (editingEventId) {
      persistLocalList((list) =>
        list.map((item) => (String(item.id) === String(editingEventId) ? nextEvent : item))
      );
      showToast('Đã cập nhật sự kiện', 'success');
    } else {
      persistLocalList((list) => [nextEvent, ...list]);
      showToast('Đã tạo sự kiện mới', 'success');
    }

    setShowCreateEventModal(false);
    resetEventForm();
  };

  const handleDeleteEvent = (eventId, source) => {
    if (!eventId) return;
    if (source === 'api') {
      showToast('Xóa task/meeting trong màn Task hoặc Voice', 'info');
      return;
    }
    if (!window.confirm('Xóa sự kiện này?')) return;

    persistLocalList((list) => list.filter((item) => String(item.id) !== String(eventId)));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(null);
    }
    showToast('Đã xóa sự kiện', 'success');
  };

  const handleJoinEvent = (eventData) => {
    if (!eventData) return;
    if (eventData.kind === 'meeting' && eventData.meetingId && eventData.raw) {
      const st = getMeetingJoinState(eventData.raw, new Date());
      if (!st.joinEligible) {
        if (st.disabledReason === 'too_early') {
          showToast('Có thể vào phòng từ 30 phút trước giờ họp', 'error');
        } else if (st.disabledReason === 'ended') {
          showToast('Meeting đã kết thúc', 'error');
        } else {
          showToast('Chưa thể tham gia meeting lúc này', 'error');
        }
        return;
      }
      navigate(`/voice/${encodeURIComponent(eventData.meetingId)}`);
      showToast('Đang vào phòng họp…', 'success');
      return;
    }
    if (eventData.type === 'meeting' && eventData.source === 'local') {
      showToast('Sự kiện local — tạo meeting trên Voice để có phòng', 'info');
      return;
    }
    if (eventData.kind === 'task' || eventData.type === 'deadline') {
      showToast('Mở Task để xem deadline (trang Tasks)', 'info');
      return;
    }
    showToast('Đã mở chi tiết', 'info');
  };

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="flex flex-col h-full bg-[#020817] text-slate-100">
        {/* Header gọn — lịch là trọng tâm */}
        <div className="shrink-0 border-b border-slate-800 bg-slate-900/40 px-3 py-2.5 sm:px-4 sm:py-3">
          <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
            <div className="min-w-0 flex flex-wrap items-end gap-x-4 gap-y-2">
              <div>
                <h1 className="text-xl font-extrabold text-white sm:text-2xl">Lịch và Sự Kiện</h1>
                <p className="text-[11px] text-gray-500 sm:text-xs">
                  Meetings · Deadlines · Sự kiện
                  {loading && ' · Đang tải…'}
                  {error && ` · ${error}`}
                </p>
              </div>
              {/* Thống kê dạng chip nhỏ — không dùng GlassCard p-6 */}
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                {[
                  { icon: '📅', value: todayEvents.length, label: 'Hôm nay' },
                  { icon: '🔜', value: upcomingEvents.length, label: 'Sắp tới' },
                  { icon: '🎤', value: events.filter((e) => e.type === 'meeting').length, label: 'Meetings' },
                  { icon: '⏰', value: events.filter((e) => e.type === 'deadline').length, label: 'Deadlines' },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/50 bg-[#0a1322]/90 px-2 py-1 sm:px-2.5"
                    title={s.label}
                  >
                    <span className="text-sm sm:text-base leading-none" aria-hidden>
                      {s.icon}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-white leading-none">{s.value}</span>
                    <span className="hidden text-[10px] text-gray-500 sm:inline">{s.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              <div className="flex gap-1">
                {['day', 'week', 'month'].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all sm:px-3 sm:text-sm ${
                      view === v
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'border border-slate-800 bg-[#040f2a] text-gray-400 hover:bg-slate-800/70'
                    }`}
                  >
                    {v === 'day' ? 'Ngày' : v === 'week' ? 'Tuần' : 'Tháng'}
                  </button>
                ))}
              </div>
              <GradientButton variant="primary" className="!px-3 !py-2 text-sm" onClick={openCreateModal}>
                <span className="mr-1 text-base">➕</span> Tạo
              </GradientButton>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 grid grid-cols-1 gap-4 p-3 sm:p-4 lg:grid-cols-3 lg:gap-5 lg:p-5">
          {/* Calendar View — khung riêng, 2/3 chiều ngang trên desktop */}
          <div className="flex min-h-[38vh] lg:min-h-0 lg:col-span-2">
            <div className="flex w-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-600/60 bg-gradient-to-b from-[#0a1224] via-[#060d1c] to-[#030a14] shadow-[0_4px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.04]">
              <div className="shrink-0 border-b border-slate-700/70 bg-slate-950/40 px-4 py-3 sm:px-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Lịch tháng</p>
                    <h2 className="text-xl font-bold text-white sm:text-2xl">
                      Tháng {selectedDate.getMonth() + 1}, {selectedDate.getFullYear()}
                    </h2>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setMonth(newDate.getMonth() - 1);
                        setSelectedDate(newDate);
                        showToast(`Chuyển sang ${newDate.getMonth() + 1}/${newDate.getFullYear()}`, 'info');
                      }}
                      className="rounded-lg border border-slate-700 bg-[#0c1629] px-3 py-2 text-sm text-white transition hover:bg-slate-800/80"
                    >
                      ◀
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDate(new Date());
                        showToast('Quay về hôm nay', 'info');
                      }}
                      className="rounded-lg border border-slate-700 bg-[#0c1629] px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800/80 sm:px-4"
                    >
                      Hôm nay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const newDate = new Date(selectedDate);
                        newDate.setMonth(newDate.getMonth() + 1);
                        setSelectedDate(newDate);
                        showToast(`Chuyển sang ${newDate.getMonth() + 1}/${newDate.getFullYear()}`, 'info');
                      }}
                      className="rounded-lg border border-slate-700 bg-[#0c1629] px-3 py-2 text-sm text-white transition hover:bg-slate-800/80"
                    >
                      ▶
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                  <div key={day} className="text-center text-sm font-bold text-gray-400 py-2">{day}</div>
                ))}
                {monthCells.map((cell) => {
                  if (cell.type === 'empty') {
                    return <div key={cell.key} className="aspect-square opacity-20" />;
                  }
                  const { date, day } = cell;
                  const key = toDateKey(date);
                  const isToday = key === toDateKey(new Date());
                  const dayEvents = events.filter((e) => e.date === key);
                  const hasEvent = dayEvents.length > 0;
                  return (
                    <div
                      key={cell.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedDate(date);
                        if (dayEvents.length > 0) {
                          showToast(`${dayEvents.length} sự kiện ngày ${day}/${date.getMonth() + 1}/${date.getFullYear()}`, 'info');
                        }
                      }}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter' || ev.key === ' ') {
                          ev.preventDefault();
                          setSelectedDate(date);
                        }
                      }}
                      className={`aspect-square bg-[#040f2a] border border-slate-800 rounded-lg p-2 cursor-pointer transition-all hover:scale-105 ${
                        isToday ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white' :
                        hasEvent ? 'hover:bg-white/10 border border-purple-500/50' :
                        'hover:bg-slate-800/70'
                      }`}
                    >
                      <div className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-300'}`}>{day}</div>
                      {hasEvent && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {dayEvents.slice(0, 3).map((e) => (
                            <div key={e.id} className="w-1 h-1 rounded-full bg-purple-400" />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              </div>
            </div>
          </div>

          {/* Events Sidebar — 1/3 */}
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1 scrollbar-overlay lg:col-span-1 lg:max-h-[calc(100vh-8rem)]">
            {/* Today's Events */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>📅</span> Hôm Nay - {todayEvents.length} sự kiện
              </h3>
              <div className="space-y-3">
                {todayEvents.map((event, idx) => {
                  const meetingJoin =
                    event.kind === 'meeting' && event.raw ? getMeetingJoinState(event.raw) : null;
                  const joinLabel =
                    event.type === 'meeting'
                      ? meetingJoin && !meetingJoin.joinEligible
                        ? 'Chưa mở (30 phút trước giờ)'
                        : 'Tham gia'
                      : 'Xem chi tiết';
                  return (
                  <GlassCard
                    key={event.id} 
                    hover 
                    className="animate-slideUp cursor-pointer border border-slate-800 bg-slate-900/60"
                    style={{animationDelay: `${idx * 0.1}s`}}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className={`w-full h-1 rounded-full bg-gradient-to-r ${event.color} mb-3`}></div>
                    <h4 className="font-bold text-white mb-2">{event.title}</h4>
                    <div className="space-y-1 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <span>🕐</span>
                        <span>{event.time}</span>
                        {event.duration && <span>({event.duration})</span>}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <span>📍</span>
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.attendees ? (
                        <div className="flex items-center gap-2">
                          <span>👥</span>
                          <span>{event.attendees} người</span>
                        </div>
                      ) : null}
                    </div>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinEvent(event);
                      }}
                      disabled={Boolean(
                        event.type === 'meeting' && meetingJoin && !meetingJoin.joinEligible
                      )}
                      className="w-full mt-3 py-2 bg-[#040f2a] border border-slate-800 rounded-lg hover:bg-slate-800/70 transition-all text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {joinLabel}
                    </button>
                  </GlassCard>
                  );
                })}
              </div>
            </div>

            {/* Upcoming Events */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>🔜</span> Sắp Tới
              </h3>
              <div className="space-y-2">
                {upcomingEvents.slice(0, 4).map((event, idx) => (
                  <GlassCard
                    key={event.id} 
                    hover 
                    className="p-3 cursor-pointer border border-slate-800 bg-slate-900/60"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center text-xl flex-shrink-0`}>
                        {event.type === 'meeting' ? '🎤' : '⏰'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{event.title}</div>
                        <div className="text-xs text-gray-400">{event.date} • {event.time}</div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
        }
      />

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
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>🕐</span> Thời Gian
              </h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div>📅 {selectedEvent.date}</div>
                <div>⏰ {selectedEvent.time}</div>
                {selectedEvent.duration && <div>⌛ {selectedEvent.duration}</div>}
              </div>
            </GlassCard>

            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>ℹ️</span> Chi Tiết
              </h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div>
                  📌{' '}
                  {selectedEvent.kind === 'task'
                    ? 'Task / Deadline'
                    : selectedEvent.type === 'meeting'
                      ? 'Meeting'
                      : 'Sự kiện'}
                </div>
                {selectedEvent.location && <div>📍 {selectedEvent.location}</div>}
                {selectedEvent.attendees && <div>👥 {selectedEvent.attendees} người</div>}
              </div>
            </GlassCard>
          </div>

          {/* Attendees List — chỉ danh sách tên khi sự kiện local có attendeeNames */}
          {selectedEvent.type === 'meeting' &&
            Array.isArray(selectedEvent.attendeeNames) &&
            selectedEvent.attendeeNames.length > 0 && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>👥</span> Người tham gia ({selectedEvent.attendeeNames.length})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {selectedEvent.attendeeNames.map((name, idx) => (
                  <div key={name} className="flex items-center gap-2 p-2 bg-[#040f2a] border border-slate-800 rounded-lg">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${['from-purple-600 to-pink-600', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500', 'from-orange-500 to-red-500'][idx % 4]} flex items-center justify-center text-xs font-bold`}>
                      {String(name).split(' ').map((n) => n[0]).join('')}
                    </div>
                    <div className="text-sm font-semibold text-white">{name}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Description */}
          <GlassCard className="border border-slate-800 bg-slate-900/60">
            <h4 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>📝</span> Mô Tả
            </h4>
            <p className="text-gray-300 text-sm whitespace-pre-wrap">
              {selectedEvent.description ||
                (selectedEvent.raw?.description) ||
                (selectedEvent.type === 'meeting'
                  ? 'Meeting từ hệ thống — bấm Tham gia khi trong cửa sổ 30 phút trước giờ họp.'
                  : 'Task từ hệ thống — xem chi tiết trong màn Task.')}
            </p>
          </GlassCard>

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
                {joinDisabled ? '🎤 Chưa mở cửa phòng' : '🎤 Tham Gia Ngay'}
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
              ✏️ Chỉnh Sửa
            </GradientButton>
            )}
            {selectedEvent.source !== 'api' && (
            <button 
              type="button"
              onClick={() => {
                handleDeleteEvent(selectedEvent?.id, selectedEvent?.source);
              }}
            className="bg-[#040f2a] border border-slate-800 px-6 py-3 rounded-xl hover:bg-slate-800/70 transition-all font-semibold text-red-400"
            >
              🗑️ Xóa
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
      title={editingEventId ? 'Chỉnh Sửa Sự Kiện' : 'Tạo Sự Kiện Mới'}
      size="lg"
    >
      <div className="space-y-4 text-slate-100">
        {/* Event Title */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Tiêu Đề Sự Kiện
          </label>
          <input 
            type="text"
            placeholder="Nhập tiêu đề..."
            value={eventForm.title}
            onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/50 text-white placeholder:text-slate-500 transition-all"
          />
        </div>

        {/* Event Type — chữ sáng + nền tách khỏi glass modal */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Loại Sự Kiện
          </label>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[
              { id: 'meeting', label: 'Meeting', icon: '🎤' },
              { id: 'deadline', label: 'Deadline', icon: '⏰' },
              { id: 'reminder', label: 'Nhắc Nhở', icon: '🔔' }
            ].map(type => {
              const active = createType === type.id;
              return (
              <button
                key={type.id}
                type="button"
                onClick={() => setCreateType(type.id)}
                className={`rounded-xl px-3 py-3 text-sm font-semibold transition-all flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 border ${
                  active
                    ? 'bg-violet-600/35 border-violet-400 text-white shadow-[inset_0_0_0_1px_rgba(167,139,250,0.5)]'
                    : 'bg-[#0a1628] border-slate-600 text-slate-100 hover:bg-slate-800/90 hover:border-slate-500'
                }`}
              >
                <span className="text-lg leading-none" aria-hidden>{type.icon}</span>
                <span className="text-white">{type.label}</span>
              </button>
              );
            })}
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Ngày
            </label>
            <input 
              type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none text-white [color-scheme:dark] transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Giờ
            </label>
            <input 
              type="time"
                value={eventForm.time}
                onChange={(e) => setEventForm((prev) => ({ ...prev, time: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none text-white [color-scheme:dark] transition-all"
            />
          </div>
        </div>

        {/* Duration & Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Thời Lượng
            </label>
            <select
              value={eventForm.duration}
              onChange={(e) => setEventForm((prev) => ({ ...prev, duration: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 text-white focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
            >
              <option className="bg-slate-900 text-white">15 phút</option>
              <option className="bg-slate-900 text-white">30 phút</option>
              <option className="bg-slate-900 text-white">45 phút</option>
              <option className="bg-slate-900 text-white">1 giờ</option>
              <option className="bg-slate-900 text-white">1.5 giờ</option>
              <option className="bg-slate-900 text-white">2 giờ</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-300 mb-2">
              Địa Điểm
            </label>
            <input 
              type="text"
              placeholder="Voice Room hoặc link..."
              value={eventForm.location}
              onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none text-white placeholder:text-slate-500 transition-all"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Mô Tả
          </label>
          <textarea 
            rows={4}
            placeholder="Nhập mô tả chi tiết..."
            value={eventForm.description}
            onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none text-white placeholder:text-slate-500 transition-all resize-none"
          ></textarea>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            Người Tham Gia
          </label>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder="Thêm người tham gia..."
              value={eventForm.attendeesText}
              onChange={(e) => setEventForm((prev) => ({ ...prev, attendeesText: e.target.value }))}
              className="flex-1 px-4 py-3 rounded-xl bg-[#0a1628] border border-slate-600/80 focus:border-violet-500 focus:outline-none text-white placeholder:text-slate-500 transition-all"
            />
            <button
              type="button"
              className="shrink-0 border border-slate-600 bg-[#0a1628] px-4 py-3 rounded-xl hover:bg-slate-700/80 transition-all font-semibold text-white"
              onClick={handleAddAttendees}
            >
              ➕ Thêm
            </button>
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
            {editingEventId ? '✅ Lưu Cập Nhật' : '✅ Tạo Sự Kiện'}
          </GradientButton>
          <button 
            type="button"
            onClick={() => setShowCreateEventModal(false)}
            className="border border-slate-600 bg-[#0a1628] px-6 py-3 rounded-xl hover:bg-slate-700/80 transition-all font-semibold text-white"
          >
            Hủy
          </button>
        </div>
      </div>
    </Modal>

    {/* Toast */}
    {toast && (
      <Toast 
        message={toast.message} 
        type={toast.type}
        onClose={() => setToast(null)}
      />
    )}
    </>
  );
}

// ============= ANALYTICS PAGE =============

export default CalendarPage;

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ThreeFrameLayout from '../../components/Layout/ThreeFrameLayout';
import { GlassCard, GradientButton, Modal, Toast } from '../../components/Shared';

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

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const [events, setEvents] = useState([
    { id: 1, title: 'Họp Nhóm Hàng Ngày', date: '2026-01-18', time: '10:00 AM', duration: '30 phút', type: 'meeting', attendees: 8, location: 'Voice Room 1', color: 'from-blue-500 to-cyan-500' },
    { id: 2, title: 'Demo Khách Hàng', date: '2026-01-18', time: '2:30 PM', duration: '1 giờ', type: 'meeting', attendees: 5, location: 'Voice Room 2', color: 'from-purple-600 to-pink-600' },
    { id: 3, title: 'Deadline: Thiết kế Landing Page', date: '2026-01-18', time: '5:00 PM', duration: '', type: 'deadline', priority: 'high', color: 'from-red-500 to-orange-500' },
    { id: 4, title: 'Đánh Giá Thiết Kế', date: '2026-01-19', time: '4:00 PM', duration: '45 phút', type: 'meeting', attendees: 4, location: 'Voice Room 3', color: 'from-green-500 to-emerald-500' },
    { id: 5, title: 'Sprint Planning', date: '2026-01-20', time: '9:00 AM', duration: '2 giờ', type: 'meeting', attendees: 12, location: 'Voice Room 1', color: 'from-blue-500 to-cyan-500' },
    { id: 6, title: 'Deadline: Review Code', date: '2026-01-21', time: '6:00 PM', duration: '', type: 'deadline', priority: 'medium', color: 'from-orange-500 to-yellow-500' },
    { id: 7, title: '1-1 với Mike', date: '2026-01-22', time: '3:00 PM', duration: '30 phút', type: 'meeting', attendees: 2, location: 'Direct Call', color: 'from-purple-600 to-pink-600' }
  ]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('calendar:events');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setEvents(parsed);
      }
    } catch (error) {
      // Ignore corrupted local data
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('calendar:events', JSON.stringify(events));
    } catch (error) {
      // Ignore storage write errors
    }
  }, [events]);

  const todayEvents = useMemo(() => events.filter(e => e.date === '2026-01-18'), [events]);
  const upcomingEvents = useMemo(() => events.filter(e => new Date(e.date) > new Date('2026-01-18')), [events]);

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
    setEditingEventId(eventData.id);
    setCreateType(eventData.type || 'meeting');
    setEventForm({
      title: eventData.title || '',
      date: eventData.date || '',
      time: eventData.time || '',
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

  const handleSaveEvent = () => {
    const title = String(eventForm.title || '').trim();
    const date = String(eventForm.date || '').trim();
    const time = String(eventForm.time || '').trim();

    if (!title || !date || !time) {
      showToast('Vui lòng nhập tiêu đề, ngày và giờ', 'error');
      return;
    }

    const colorByType = {
      meeting: 'from-blue-500 to-cyan-500',
      deadline: 'from-red-500 to-orange-500',
      reminder: 'from-purple-600 to-pink-600',
    };

    const nextEvent = {
      id: editingEventId || Date.now(),
      title,
      date,
      time,
      duration: createType === 'meeting' ? eventForm.duration : '',
      type: createType,
      attendees: createType === 'meeting' ? attendeeNames.length : 0,
      attendeeNames: createType === 'meeting' ? attendeeNames : [],
      location: eventForm.location || '',
      description: eventForm.description || '',
      priority: createType === 'deadline' ? 'high' : undefined,
      color: colorByType[createType] || colorByType.reminder,
    };

    if (editingEventId) {
      setEvents((prev) => prev.map((item) => (item.id === editingEventId ? nextEvent : item)));
      showToast('Đã cập nhật sự kiện', 'success');
    } else {
      setEvents((prev) => [nextEvent, ...prev]);
      showToast('Đã tạo sự kiện mới', 'success');
    }

    setShowCreateEventModal(false);
    resetEventForm();
  };

  const handleDeleteEvent = (eventId) => {
    if (!eventId) return;
    if (!window.confirm('Xóa sự kiện này?')) return;

    setEvents((prev) => prev.filter((item) => item.id !== eventId));
    if (selectedEvent?.id === eventId) {
      setSelectedEvent(null);
    }
    showToast('Đã xóa sự kiện', 'success');
  };

  const handleJoinEvent = (eventData) => {
    if (!eventData) return;
    if (eventData.type === 'meeting') {
      navigate('/voice');
      showToast('Đang chuyển sang Voice Room', 'success');
      return;
    }
    showToast('Đã mở chi tiết deadline', 'info');
  };

  return (
    <>
      <ThreeFrameLayout
        center={
          <div className="flex flex-col h-full bg-[#020817] text-slate-100">
        {/* Header */}
        <div className="p-5 lg:p-6 bg-slate-900/60 border-b border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-1">Lịch và Sự Kiện</h1>
              <p className="text-sm text-gray-400">Quản lý meetings, deadlines và sự kiện</p>
            </div>
            <div className="flex gap-3">
              <div className="flex gap-2">
                {['day', 'week', 'month'].map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                      view === v
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70 text-gray-400'
                    }`}
                  >
                    {v === 'day' ? 'Ngày' : v === 'week' ? 'Tuần' : 'Tháng'}
                  </button>
                ))}
              </div>
              <GradientButton 
                variant="primary"
                onClick={openCreateModal}
              >
                <span className="text-xl mr-2">➕</span> Tạo Sự Kiện
              </GradientButton>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <GlassCard hover className="border border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="text-3xl">📅</div>
                <div>
                  <div className="text-2xl font-black text-white">{todayEvents.length}</div>
                  <div className="text-xs text-gray-400">Hôm nay</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover className="border border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🔜</div>
                <div>
                  <div className="text-2xl font-black text-white">{upcomingEvents.length}</div>
                  <div className="text-xs text-gray-400">Sắp tới</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover className="border border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🎤</div>
                <div>
                  <div className="text-2xl font-black text-white">{events.filter(e => e.type === 'meeting').length}</div>
                  <div className="text-xs text-gray-400">Meetings</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover className="border border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-3">
                <div className="text-3xl">⏰</div>
                <div>
                  <div className="text-2xl font-black text-white">{events.filter(e => e.type === 'deadline').length}</div>
                  <div className="text-xs text-gray-400">Deadlines</div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="flex-1 p-5 lg:p-6 grid grid-cols-3 gap-6">
          {/* Calendar View */}
          <div className="col-span-2">
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">Tháng {selectedDate.getMonth() + 1}, {selectedDate.getFullYear()}</h2>
                <div className="flex gap-2">
                  <button 
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setMonth(newDate.getMonth() - 1);
                      setSelectedDate(newDate);
                      showToast(`Chuyển sang ${newDate.getMonth() + 1}/${newDate.getFullYear()}`, "info");
                    }}
                    className="bg-[#040f2a] border border-slate-800 px-3 py-2 rounded-lg hover:bg-slate-800/70 transition-all"
                  >◀</button>
                  <button 
                    onClick={() => {
                      setSelectedDate(new Date());
                      showToast("Quay về hôm nay", "info");
                    }}
                    className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-lg hover:bg-slate-800/70 transition-all font-semibold"
                  >Hôm nay</button>
                  <button 
                    onClick={() => {
                      const newDate = new Date(selectedDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setSelectedDate(newDate);
                      showToast(`Chuyển sang ${newDate.getMonth() + 1}/${newDate.getFullYear()}`, "info");
                    }}
                    className="bg-[#040f2a] border border-slate-800 px-3 py-2 rounded-lg hover:bg-slate-800/70 transition-all"
                  >▶</button>
                </div>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-2">
                {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'].map(day => (
                  <div key={day} className="text-center text-sm font-bold text-gray-400 py-2">{day}</div>
                ))}
                {Array.from({length: 35}, (_, i) => {
                  const dayNum = i - 2; // Start from day 1 on Wednesday
                  const isToday = dayNum === 18;
                  const hasEvent = events.some(e => parseInt(e.date.split('-')[2]) === dayNum);
                  return (
                    <div
                      key={i}
                      onClick={() => {
                        if (dayNum > 0 && dayNum <= 31) {
                          const newDate = new Date(2026, 0, dayNum);
                          setSelectedDate(newDate);
                          const dayEvents = events.filter(e => parseInt(e.date.split('-')[2]) === dayNum);
                          if (dayEvents.length > 0) {
                            showToast(`${dayEvents.length} sự kiện vào ngày ${dayNum}/1/2026`, "info");
                          }
                        }
                      }}
                      className={`aspect-square bg-[#040f2a] border border-slate-800 rounded-lg p-2 cursor-pointer transition-all hover:scale-105 ${
                        isToday ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white' :
                        hasEvent ? 'hover:bg-white/10 border border-purple-500/50' :
                        'hover:bg-slate-800/70'
                      } ${dayNum < 1 || dayNum > 31 ? 'opacity-30 cursor-default' : ''}`}
                    >
                      {dayNum > 0 && dayNum <= 31 && (
                        <>
                          <div className={`text-sm font-bold ${isToday ? 'text-white' : 'text-gray-300'}`}>{dayNum}</div>
                          {hasEvent && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {events.filter(e => parseInt(e.date.split('-')[2]) === dayNum).slice(0, 2).map(e => (
                                <div key={e.id} className="w-1 h-1 rounded-full bg-purple-400"></div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          </div>

          {/* Events Sidebar */}
          <div className="space-y-6">
            {/* Today's Events */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>📅</span> Hôm Nay - {todayEvents.length} sự kiện
              </h3>
              <div className="space-y-3">
                {todayEvents.map((event, idx) => (
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
                      {event.attendees && (
                        <div className="flex items-center gap-2">
                          <span>👥</span>
                          <span>{event.attendees} người</span>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleJoinEvent(event);
                      }}
                      className="w-full mt-3 py-2 bg-[#040f2a] border border-slate-800 rounded-lg hover:bg-slate-800/70 transition-all text-sm font-semibold"
                    >
                      {event.type === 'meeting' ? 'Tham Gia' : 'Xem Chi Tiết'}
                    </button>
                  </GlassCard>
                ))}
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
                <div>📌 {selectedEvent.type === 'meeting' ? 'Meeting' : 'Deadline'}</div>
                {selectedEvent.location && <div>📍 {selectedEvent.location}</div>}
                {selectedEvent.attendees && <div>👥 {selectedEvent.attendees} người</div>}
              </div>
            </GlassCard>
          </div>

          {/* Attendees List */}
          {selectedEvent.attendees && selectedEvent.type === 'meeting' && (
            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>👥</span> Người Tham Gia ({selectedEvent.attendees})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {['Sarah Chen', 'Mike Ross', 'Emma Wilson', 'David Kim', 'Lisa Park', 'Tom Zhang', 'Anna Lee', 'John Doe'].slice(0, selectedEvent.attendees).map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-[#040f2a] border border-slate-800 rounded-lg">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${['from-purple-600 to-pink-600', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500', 'from-orange-500 to-red-500'][idx % 4]} flex items-center justify-center text-xs font-bold`}>
                      {name.split(' ').map(n => n[0]).join('')}
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
            <p className="text-gray-300 text-sm">
              {selectedEvent.type === 'meeting' 
                ? 'Cuộc họp để thảo luận về tiến độ dự án và các vấn đề cần giải quyết. Vui lòng chuẩn bị báo cáo tiến độ và danh sách câu hỏi.'
                : 'Hoàn thành và submit tất cả deliverables trước deadline. Đảm bảo đã review và test kỹ lưỡng.'}
            </p>
          </GlassCard>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {selectedEvent.type === 'meeting' && (
              <GradientButton 
                variant="primary" 
                onClick={() => {
                  handleJoinEvent(selectedEvent);
                  setSelectedEvent(null);
                }}
                className="flex-1"
              >
                🎤 Tham Gia Ngay
              </GradientButton>
            )}
            <GradientButton 
              variant="secondary" 
              onClick={() => {
                setSelectedEvent(null);
                openEditModal(selectedEvent);
              }}
              className="flex-1"
            >
              ✏️ Chỉnh Sửa
            </GradientButton>
            <button 
              onClick={() => {
                handleDeleteEvent(selectedEvent?.id);
              }}
            className="bg-[#040f2a] border border-slate-800 px-6 py-3 rounded-xl hover:bg-slate-800/70 transition-all font-semibold text-red-400"
            >
              🗑️ Xóa
            </button>
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
      <div className="space-y-4">
        {/* Event Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            Tiêu Đề Sự Kiện
          </label>
          <input 
            type="text"
            placeholder="Nhập tiêu đề..."
            value={eventForm.title}
            onChange={(e) => setEventForm((prev) => ({ ...prev, title: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500 transition-all"
          />
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            Loại Sự Kiện
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'meeting', label: 'Meeting', icon: '🎤' },
              { id: 'deadline', label: 'Deadline', icon: '⏰' },
              { id: 'reminder', label: 'Nhắc Nhở', icon: '🔔' }
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setCreateType(type.id)}
                className="bg-[#040f2a] border border-slate-800 px-4 py-3 rounded-xl hover:bg-slate-800/70 transition-all font-semibold flex items-center justify-center gap-2"
                style={{
                  borderColor: createType === type.id ? '#7c3aed' : undefined,
                  boxShadow: createType === type.id ? '0 0 0 1px #7c3aed inset' : undefined,
                }}
              >
                <span>{type.icon}</span>
                <span>{type.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date & Time */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Ngày
            </label>
            <input 
              type="date"
                value={eventForm.date}
                onChange={(e) => setEventForm((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Giờ
            </label>
            <input 
              type="time"
                value={eventForm.time}
                onChange={(e) => setEventForm((prev) => ({ ...prev, time: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white transition-all"
            />
          </div>
        </div>

        {/* Duration & Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Thời Lượng
            </label>
            <select
              value={eventForm.duration}
              onChange={(e) => setEventForm((prev) => ({ ...prev, duration: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 text-white"
            >
              <option>15 phút</option>
              <option>30 phút</option>
              <option>45 phút</option>
              <option>1 giờ</option>
              <option>1.5 giờ</option>
              <option>2 giờ</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Địa Điểm
            </label>
            <input 
              type="text"
              placeholder="Voice Room hoặc link..."
              value={eventForm.location}
              onChange={(e) => setEventForm((prev) => ({ ...prev, location: e.target.value }))}
              className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500 transition-all"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            Mô Tả
          </label>
          <textarea 
            rows={4}
            placeholder="Nhập mô tả chi tiết..."
            value={eventForm.description}
            onChange={(e) => setEventForm((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500 transition-all resize-none"
          ></textarea>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            Người Tham Gia
          </label>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder="Thêm người tham gia..."
              value={eventForm.attendeesText}
              onChange={(e) => setEventForm((prev) => ({ ...prev, attendeesText: e.target.value }))}
              className="flex-1 px-4 py-3 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 focus:outline-none text-white placeholder-gray-500 transition-all"
            />
            <button
              className="bg-[#040f2a] border border-slate-800 px-4 py-3 rounded-xl hover:bg-slate-800/70 transition-all font-semibold"
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
            onClick={() => setShowCreateEventModal(false)}
            className="bg-[#040f2a] border border-slate-800 px-6 py-3 rounded-xl hover:bg-slate-800/70 transition-all font-semibold"
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

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GlassCard, Modal, Dropdown, Toast, ConfirmDialog, GradientButton, StatusIndicator } from '../../components/Shared';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';

function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="text-8xl mb-6 animate-float">ðŸš€</div>
        <h1 className="text-6xl font-black text-gradient mb-4">404</h1>
        <p className="text-2xl text-gray-400 mb-8">Lost in space?</p>
        <Link to="/">
          <GradientButton variant="primary">Go Home</GradientButton>
        </Link>
      </div>
    </div>
  );
}

// ============= NOTIFICATIONS PAGE =============

function NotificationsPage() {
  const [filter, setFilter] = useState('all');
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'task', icon: 'âœ…', title: 'Task Ä‘Æ°á»£c gÃ¡n', message: 'Sarah Chen Ä‘Ã£ gÃ¡n báº¡n vÃ o task "Thiáº¿t káº¿ Landing Page"', time: '5 phÃºt trÆ°á»›c', read: false, priority: 'high', action: 'Xem Task' },
    { id: 2, type: 'mention', icon: 'ðŸ’¬', title: '@mentions trong chat', message: 'Mike Ross Ä‘Ã£ nháº¯c Ä‘áº¿n báº¡n trong #general', time: '15 phÃºt trÆ°á»›c', read: false, priority: 'medium', action: 'Xem Chat' },
    { id: 3, type: 'deadline', icon: 'â°', title: 'Deadline sáº¯p Ä‘áº¿n', message: 'Task "Review Pull Request" sáº½ Ä‘áº¿n háº¡n trong 2 giá»', time: '30 phÃºt trÆ°á»›c', read: false, priority: 'high', action: 'Cáº­p Nháº­t' },
    { id: 4, type: 'meeting', icon: 'ðŸ“…', title: 'Meeting sáº¯p diá»…n ra', message: 'Há»p nhÃ³m hÃ ng ngÃ y báº¯t Ä‘áº§u lÃºc 10:00 AM', time: '1 giá» trÆ°á»›c', read: true, priority: 'medium', action: 'Tham Gia' },
    { id: 5, type: 'file', icon: 'ðŸ“', title: 'File má»›i Ä‘Æ°á»£c chia sáº»', message: 'Emma Wilson Ä‘Ã£ upload "BaoCaoQ4.pdf" vÃ o Documents', time: '2 giá» trÆ°á»›c', read: true, priority: 'low', action: 'Xem File' },
    { id: 6, type: 'friend', icon: 'ðŸ‘¥', title: 'YÃªu cáº§u káº¿t báº¡n', message: 'Anna Lee Ä‘Ã£ gá»­i lá»i má»i káº¿t báº¡n', time: '3 giá» trÆ°á»›c', read: false, priority: 'low', action: 'Xem Profile' },
    { id: 7, type: 'task', icon: 'âœ…', title: 'Task hoÃ n thÃ nh', message: 'David Kim Ä‘Ã£ hoÃ n thÃ nh task "Setup CI/CD Pipeline"', time: '5 giá» trÆ°á»›c', read: true, priority: 'low', action: 'Xem Chi Tiáº¿t' },
    { id: 8, type: 'system', icon: 'ðŸ””', title: 'Cáº­p nháº­t há»‡ thá»‘ng', message: 'VoiceHub Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t lÃªn phiÃªn báº£n 2.1.0', time: '1 ngÃ y trÆ°á»›c', read: true, priority: 'low', action: 'Xem Changelog' }
  ]);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMarkAsRead = (id) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
    showToast("ÄÃ£ Ä‘Ã¡nh dáº¥u Ä‘Ã£ Ä‘á»c", "success");
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    showToast("ÄÃ£ Ä‘Ã¡nh dáº¥u táº¥t cáº£ Ä‘Ã£ Ä‘á»c", "success");
  };

  const handleDeleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id));
    showToast("ÄÃ£ xÃ³a thÃ´ng bÃ¡o", "success");
  };

  const filteredNotifications = filter === 'all' 
    ? notifications 
    : filter === 'unread' 
      ? notifications.filter(n => !n.read)
      : notifications.filter(n => n.type === filter);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <>
      <div className="min-h-screen flex">
        <NavigationSidebar currentPage="ThÃ´ng BÃ¡o" />
        <div className="flex-1 p-6 overflow-auto scrollbar-gradient">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">Trung TÃ¢m ThÃ´ng BÃ¡o</h1>
            <p className="text-gray-400">Theo dÃµi táº¥t cáº£ hoáº¡t Ä‘á»™ng vÃ  cáº­p nháº­t quan trá»ng</p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => showToast("CÃ i Ä‘áº·t thÃ´ng bÃ¡o", "info")}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              âš™ï¸ CÃ i Äáº·t ThÃ´ng BÃ¡o
            </button>
            <button 
              onClick={handleMarkAllAsRead}
              className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold"
            >
              âœ“ ÄÃ¡nh Dáº¥u ÄÃ£ Äá»c Táº¥t Cáº£
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-2xl">
                ðŸ””
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.length}</div>
                <div className="text-xs text-gray-400">Tá»•ng thÃ´ng bÃ¡o</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-2xl">
                â­
              </div>
              <div>
                <div className="text-2xl font-black text-white">{unreadCount}</div>
                <div className="text-xs text-gray-400">ChÆ°a Ä‘á»c</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-2xl">
                âœ…
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.filter(n => n.type === 'task').length}</div>
                <div className="text-xs text-gray-400">CÃ´ng viá»‡c</div>
              </div>
            </div>
          </GlassCard>
          <GlassCard hover>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500 flex items-center justify-center text-2xl">
                ðŸ’¬
              </div>
              <div>
                <div className="text-2xl font-black text-white">{notifications.filter(n => n.type === 'mention').length}</div>
                <div className="text-xs text-gray-400">Mentions</div>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6">
          {[
            { id: 'all', label: 'Táº¥t Cáº£', icon: 'ðŸ“‹' },
            { id: 'unread', label: 'ChÆ°a Äá»c', icon: 'â­' },
            { id: 'task', label: 'CÃ´ng Viá»‡c', icon: 'âœ…' },
            { id: 'mention', label: 'Mentions', icon: 'ðŸ’¬' },
            { id: 'deadline', label: 'Deadline', icon: 'â°' },
            { id: 'meeting', label: 'Meetings', icon: 'ðŸ“…' }
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                filter === f.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'glass hover:bg-white/10 text-gray-400'
              }`}
            >
              <span className="mr-2">{f.icon}</span>
              {f.label}
            </button>
          ))}
        </div>

        {/* Notifications List */}
        <div className="space-y-3">
          {filteredNotifications.map((notif, idx) => (
            <GlassCard key={notif.id} hover className={`animate-slideUp ${!notif.read ? 'border-l-4 border-purple-500' : ''}`} style={{animationDelay: `${idx * 0.05}s`}}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                  notif.priority === 'high' ? 'from-red-500 to-orange-500' :
                  notif.priority === 'medium' ? 'from-blue-500 to-cyan-500' :
                  'from-green-500 to-emerald-500'
                } flex items-center justify-center text-2xl flex-shrink-0`}>
                  {notif.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-white">{notif.title}</h3>
                    {!notif.read && (
                      <span className="px-2 py-0.5 rounded-full bg-purple-600 text-xs font-bold">Má»šI</span>
                    )}
                    {notif.priority === 'high' && (
                      <span className="px-2 py-0.5 rounded-full bg-red-600 text-xs font-bold">QUAN TRá»ŒNG</span>
                    )}
                  </div>
                  <p className="text-gray-300 text-sm mb-2">{notif.message}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>ðŸ• {notif.time}</span>
                    <span>â€¢</span>
                    <span className="capitalize">{notif.type}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => showToast(`Äang má»Ÿ ${notif.action}...`, "info")}
                    className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm font-semibold whitespace-nowrap"
                  >
                    {notif.action}
                  </button>
                  {!notif.read && (
                    <button 
                      onClick={() => handleMarkAsRead(notif.id)}
                      className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-xs text-gray-400 hover:text-white"
                    >
                      ÄÃ¡nh dáº¥u Ä‘Ã£ Ä‘á»c
                    </button>
                  )}
                  <button 
                    onClick={() => {
                      if (confirm('XÃ³a thÃ´ng bÃ¡o nÃ y?')) {
                        handleDeleteNotification(notif.id);
                      }
                    }}
                    className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-xs text-red-400 hover:text-red-300"
                  >
                    ðŸ—‘ï¸ XÃ³a
                  </button>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>

        {filteredNotifications.length === 0 && (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">ðŸŽ‰</div>
            <p className="text-xl text-gray-400">KhÃ´ng cÃ³ thÃ´ng bÃ¡o nÃ o!</p>
          </div>
        )}
      </div>
    </div>

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

// ============= CALENDAR PAGE =============

function CalendarPage() {
  const [view, setView] = useState('month');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const events = [
    { id: 1, title: 'Há»p NhÃ³m HÃ ng NgÃ y', date: '2026-01-18', time: '10:00 AM', duration: '30 phÃºt', type: 'meeting', attendees: 8, location: 'Voice Room 1', color: 'from-blue-500 to-cyan-500' },
    { id: 2, title: 'Demo KhÃ¡ch HÃ ng', date: '2026-01-18', time: '2:30 PM', duration: '1 giá»', type: 'meeting', attendees: 5, location: 'Voice Room 2', color: 'from-purple-600 to-pink-600' },
    { id: 3, title: 'Deadline: Thiáº¿t káº¿ Landing Page', date: '2026-01-18', time: '5:00 PM', duration: '', type: 'deadline', priority: 'high', color: 'from-red-500 to-orange-500' },
    { id: 4, title: 'ÄÃ¡nh GiÃ¡ Thiáº¿t Káº¿', date: '2026-01-19', time: '4:00 PM', duration: '45 phÃºt', type: 'meeting', attendees: 4, location: 'Voice Room 3', color: 'from-green-500 to-emerald-500' },
    { id: 5, title: 'Sprint Planning', date: '2026-01-20', time: '9:00 AM', duration: '2 giá»', type: 'meeting', attendees: 12, location: 'Voice Room 1', color: 'from-blue-500 to-cyan-500' },
    { id: 6, title: 'Deadline: Review Code', date: '2026-01-21', time: '6:00 PM', duration: '', type: 'deadline', priority: 'medium', color: 'from-orange-500 to-yellow-500' },
    { id: 7, title: '1-1 vá»›i Mike', date: '2026-01-22', time: '3:00 PM', duration: '30 phÃºt', type: 'meeting', attendees: 2, location: 'Direct Call', color: 'from-purple-600 to-pink-600' }
  ];

  const todayEvents = events.filter(e => e.date === '2026-01-18');
  const upcomingEvents = events.filter(e => new Date(e.date) > new Date('2026-01-18'));

  return (
    <>
      <div className="min-h-screen flex">
        <NavigationSidebar currentPage="Lá»‹ch" />
        <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="p-6 glass-strong border-b border-white/10">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-4xl font-black text-gradient mb-2">Lá»‹ch vÃ  Sá»± Kiá»‡n</h1>
              <p className="text-gray-400">Quáº£n lÃ½ meetings, deadlines vÃ  sá»± kiá»‡n</p>
            </div>
            <div className="flex gap-3">
              <div className="flex gap-2">
                {['day', 'week', 'month'].map(v => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                      view === v
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                        : 'glass hover:bg-white/10 text-gray-400'
                    }`}
                  >
                    {v === 'day' ? 'NgÃ y' : v === 'week' ? 'Tuáº§n' : 'ThÃ¡ng'}
                  </button>
                ))}
              </div>
              <GradientButton 
                variant="primary"
                onClick={() => setShowCreateEventModal(true)}
              >
                <span className="text-xl mr-2">âž•</span> Táº¡o Sá»± Kiá»‡n
              </GradientButton>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-4 gap-4">
            <GlassCard hover>
              <div className="flex items-center gap-3">
                <div className="text-3xl">ðŸ“…</div>
                <div>
                  <div className="text-2xl font-black text-white">{todayEvents.length}</div>
                  <div className="text-xs text-gray-400">HÃ´m nay</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover>
              <div className="flex items-center gap-3">
                <div className="text-3xl">ðŸ”œ</div>
                <div>
                  <div className="text-2xl font-black text-white">{upcomingEvents.length}</div>
                  <div className="text-xs text-gray-400">Sáº¯p tá»›i</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover>
              <div className="flex items-center gap-3">
                <div className="text-3xl">ðŸŽ¤</div>
                <div>
                  <div className="text-2xl font-black text-white">{events.filter(e => e.type === 'meeting').length}</div>
                  <div className="text-xs text-gray-400">Meetings</div>
                </div>
              </div>
            </GlassCard>
            <GlassCard hover>
              <div className="flex items-center gap-3">
                <div className="text-3xl">â°</div>
                <div>
                  <div className="text-2xl font-black text-white">{events.filter(e => e.type === 'deadline').length}</div>
                  <div className="text-xs text-gray-400">Deadlines</div>
                </div>
              </div>
            </GlassCard>
          </div>
        </div>

        <div className="flex-1 p-6 overflow-auto scrollbar-gradient grid grid-cols-3 gap-6">
          {/* Calendar View */}
          <div className="col-span-2">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-white">ThÃ¡ng 1, 2026</h2>
                <div className="flex gap-2">
                  <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all">â—€</button>
                  <button className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all font-semibold">HÃ´m nay</button>
                  <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all">â–¶</button>
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
                      className={`aspect-square glass rounded-lg p-2 cursor-pointer transition-all ${
                        isToday ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white' :
                        hasEvent ? 'hover:bg-white/10 border border-purple-500/50' :
                        'hover:bg-white/5'
                      } ${dayNum < 1 || dayNum > 31 ? 'opacity-30' : ''}`}
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
                <span>ðŸ“…</span> HÃ´m Nay - {todayEvents.length} sá»± kiá»‡n
              </h3>
              <div className="space-y-3">
                {todayEvents.map((event, idx) => (
                  <GlassCard 
                    key={event.id} 
                    hover 
                    className="animate-slideUp cursor-pointer" 
                    style={{animationDelay: `${idx * 0.1}s`}}
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className={`w-full h-1 rounded-full bg-gradient-to-r ${event.color} mb-3`}></div>
                    <h4 className="font-bold text-white mb-2">{event.title}</h4>
                    <div className="space-y-1 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <span>ðŸ•</span>
                        <span>{event.time}</span>
                        {event.duration && <span>({event.duration})</span>}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2">
                          <span>ðŸ“</span>
                          <span>{event.location}</span>
                        </div>
                      )}
                      {event.attendees && (
                        <div className="flex items-center gap-2">
                          <span>ðŸ‘¥</span>
                          <span>{event.attendees} ngÆ°á»i</span>
                        </div>
                      )}
                    </div>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        showToast(event.type === 'meeting' ? 'Äang tham gia...' : 'Má»Ÿ chi tiáº¿t...', 'info');
                      }}
                      className="w-full mt-3 py-2 glass rounded-lg hover:bg-white/10 transition-all text-sm font-semibold"
                    >
                      {event.type === 'meeting' ? 'Tham Gia' : 'Xem Chi Tiáº¿t'}
                    </button>
                  </GlassCard>
                ))}
              </div>
            </div>

            {/* Upcoming Events */}
            <div>
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <span>ðŸ”œ</span> Sáº¯p Tá»›i
              </h3>
              <div className="space-y-2">
                {upcomingEvents.slice(0, 4).map((event, idx) => (
                  <GlassCard 
                    key={event.id} 
                    hover 
                    className="p-3 cursor-pointer"
                    onClick={() => setSelectedEvent(event)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${event.color} flex items-center justify-center text-xl flex-shrink-0`}>
                        {event.type === 'meeting' ? 'ðŸŽ¤' : 'â°'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{event.title}</div>
                        <div className="text-xs text-gray-400">{event.date} â€¢ {event.time}</div>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

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
            <GlassCard>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>ðŸ•</span> Thá»i Gian
              </h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div>ðŸ“… {selectedEvent.date}</div>
                <div>â° {selectedEvent.time}</div>
                {selectedEvent.duration && <div>âŒ› {selectedEvent.duration}</div>}
              </div>
            </GlassCard>

            <GlassCard>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>â„¹ï¸</span> Chi Tiáº¿t
              </h4>
              <div className="space-y-2 text-sm text-gray-300">
                <div>ðŸ“Œ {selectedEvent.type === 'meeting' ? 'Meeting' : 'Deadline'}</div>
                {selectedEvent.location && <div>ðŸ“ {selectedEvent.location}</div>}
                {selectedEvent.attendees && <div>ðŸ‘¥ {selectedEvent.attendees} ngÆ°á»i</div>}
              </div>
            </GlassCard>
          </div>

          {/* Attendees List */}
          {selectedEvent.attendees && selectedEvent.type === 'meeting' && (
            <GlassCard>
              <h4 className="font-bold text-white mb-3 flex items-center gap-2">
                <span>ðŸ‘¥</span> NgÆ°á»i Tham Gia ({selectedEvent.attendees})
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {['Sarah Chen', 'Mike Ross', 'Emma Wilson', 'David Kim', 'Lisa Park', 'Tom Zhang', 'Anna Lee', 'John Doe'].slice(0, selectedEvent.attendees).map((name, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 glass rounded-lg">
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
          <GlassCard>
            <h4 className="font-bold text-white mb-3 flex items-center gap-2">
              <span>ðŸ“</span> MÃ´ Táº£
            </h4>
            <p className="text-gray-300 text-sm">
              {selectedEvent.type === 'meeting' 
                ? 'Cuá»™c há»p Ä‘á»ƒ tháº£o luáº­n vá» tiáº¿n Ä‘á»™ dá»± Ã¡n vÃ  cÃ¡c váº¥n Ä‘á» cáº§n giáº£i quyáº¿t. Vui lÃ²ng chuáº©n bá»‹ bÃ¡o cÃ¡o tiáº¿n Ä‘á»™ vÃ  danh sÃ¡ch cÃ¢u há»i.'
                : 'HoÃ n thÃ nh vÃ  submit táº¥t cáº£ deliverables trÆ°á»›c deadline. Äáº£m báº£o Ä‘Ã£ review vÃ  test ká»¹ lÆ°á»¡ng.'}
            </p>
          </GlassCard>

          {/* Action Buttons */}
          <div className="flex gap-3">
            {selectedEvent.type === 'meeting' && (
              <GradientButton 
                variant="primary" 
                onClick={() => {
                  showToast("Äang tham gia meeting...", "success");
                  setSelectedEvent(null);
                }}
                className="flex-1"
              >
                ðŸŽ¤ Tham Gia Ngay
              </GradientButton>
            )}
            <GradientButton 
              variant="secondary" 
              onClick={() => {
                showToast("ÄÃ£ chá»‰nh sá»­a sá»± kiá»‡n", "success");
                setSelectedEvent(null);
              }}
              className="flex-1"
            >
              âœï¸ Chá»‰nh Sá»­a
            </GradientButton>
            <button 
              onClick={() => {
                if (confirm('XÃ³a sá»± kiá»‡n nÃ y?')) {
                  showToast("ÄÃ£ xÃ³a sá»± kiá»‡n", "success");
                  setSelectedEvent(null);
                }
              }}
              className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold text-red-400"
            >
              ðŸ—‘ï¸ XÃ³a
            </button>
          </div>
        </div>
      )}
    </Modal>

    {/* Create Event Modal */}
    <Modal 
      isOpen={showCreateEventModal} 
      onClose={() => setShowCreateEventModal(false)}
      title="Táº¡o Sá»± Kiá»‡n Má»›i"
      size="lg"
    >
      <div className="space-y-4">
        {/* Event Title */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            TiÃªu Äá» Sá»± Kiá»‡n
          </label>
          <input 
            type="text"
            placeholder="Nháº­p tiÃªu Ä‘á»..."
            className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
          />
        </div>

        {/* Event Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            Loáº¡i Sá»± Kiá»‡n
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'meeting', label: 'Meeting', icon: 'ðŸŽ¤' },
              { id: 'deadline', label: 'Deadline', icon: 'â°' },
              { id: 'reminder', label: 'Nháº¯c Nhá»Ÿ', icon: 'ðŸ””' }
            ].map(type => (
              <button
                key={type.id}
                className="glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold flex items-center justify-center gap-2"
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
              NgÃ y
            </label>
            <input 
              type="date"
              className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Giá»
            </label>
            <input 
              type="time"
              className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white transition-all"
            />
          </div>
        </div>

        {/* Duration & Location */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Thá»i LÆ°á»£ng
            </label>
            <select className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white">
              <option>15 phÃºt</option>
              <option>30 phÃºt</option>
              <option>45 phÃºt</option>
              <option>1 giá»</option>
              <option>1.5 giá»</option>
              <option>2 giá»</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-400 mb-2">
              Äá»‹a Äiá»ƒm
            </label>
            <input 
              type="text"
              placeholder="Voice Room hoáº·c link..."
              className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
            />
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            MÃ´ Táº£
          </label>
          <textarea 
            rows={4}
            placeholder="Nháº­p mÃ´ táº£ chi tiáº¿t..."
            className="w-full glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all resize-none"
          ></textarea>
        </div>

        {/* Attendees */}
        <div>
          <label className="block text-sm font-semibold text-gray-400 mb-2">
            NgÆ°á»i Tham Gia
          </label>
          <div className="flex gap-2">
            <input 
              type="text"
              placeholder="ThÃªm ngÆ°á»i tham gia..."
              className="flex-1 glass px-4 py-3 rounded-xl bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-white placeholder-gray-500 transition-all"
            />
            <button className="glass px-4 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold">
              âž• ThÃªm
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <GradientButton 
            variant="primary" 
            onClick={() => {
              showToast("ÄÃ£ táº¡o sá»± kiá»‡n má»›i!", "success");
              setShowCreateEventModal(false);
            }}
            className="flex-1"
          >
            âœ… Táº¡o Sá»± Kiá»‡n
          </GradientButton>
          <button 
            onClick={() => setShowCreateEventModal(false)}
            className="glass px-6 py-3 rounded-xl hover:bg-white/10 transition-all font-semibold"
          >
            Há»§y
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

function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState('week');

  return (
    <div className="min-h-screen flex">
      <NavigationSidebar currentPage="PhÃ¢n TÃ­ch" />
      <div className="flex-1 p-6 overflow-auto scrollbar-gradient">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-black text-gradient mb-2">PhÃ¢n TÃ­ch vÃ  BÃ¡o CÃ¡o</h1>
            <p className="text-gray-400">Theo dÃµi hiá»‡u suáº¥t vÃ  xu hÆ°á»›ng tá»• chá»©c</p>
          </div>
          <div className="flex gap-3">
            <div className="flex gap-2">
              {[
                { id: 'day', label: 'NgÃ y' },
                { id: 'week', label: 'Tuáº§n' },
                { id: 'month', label: 'ThÃ¡ng' },
                { id: 'year', label: 'NÄƒm' }
              ].map(r => (
                <button
                  key={r.id}
                  onClick={() => setTimeRange(r.id)}
                  className={`px-4 py-2 rounded-xl font-semibold transition-all ${
                    timeRange === r.id
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                      : 'glass hover:bg-white/10 text-gray-400'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold flex items-center gap-2">
              ðŸ“Š Xuáº¥t BÃ¡o CÃ¡o
            </button>
          </div>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {[
            { icon: 'ðŸ“ˆ', label: 'TÄƒng TrÆ°á»Ÿng', value: '+24.5%', trend: 'up', color: 'from-green-500 to-emerald-500', detail: 'So vá»›i tuáº§n trÆ°á»›c' },
            { icon: 'ðŸ‘¥', label: 'NgÆ°á»i DÃ¹ng Hoáº¡t Äá»™ng', value: '1,245', trend: 'up', color: 'from-blue-500 to-cyan-500', detail: '+12% so vá»›i trÆ°á»›c' },
            { icon: 'ðŸ’¬', label: 'Tin Nháº¯n', value: '45.2K', trend: 'up', color: 'from-purple-600 to-pink-600', detail: '+8% so vá»›i trÆ°á»›c' },
            { icon: 'âœ…', label: 'Completion Rate', value: '89%', trend: 'up', color: 'from-orange-500 to-yellow-500', detail: '+5% so vá»›i trÆ°á»›c' }
          ].map((stat, idx) => (
            <GlassCard key={idx} hover glow className="animate-slideUp" style={{animationDelay: `${idx * 0.1}s`}}>
              <div className="flex items-start justify-between mb-4">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center text-3xl shadow-lg`}>
                  {stat.icon}
                </div>
                <div className={`px-2 py-1 rounded-lg ${stat.trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} text-xs font-bold`}>
                  {stat.trend === 'up' ? 'â†—' : 'â†˜'} {stat.value}
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
              <div className="text-xs text-gray-600">{stat.detail}</div>
            </GlassCard>
          ))}
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Task Completion Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>âœ…</span> HoÃ n ThÃ nh CÃ´ng Viá»‡c
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[85, 92, 78, 95, 88, 91, 89].map((value, idx) => (
                <div key={idx} className="flex flex-col items-center justify-end">
                  <div className="text-xs font-bold text-white mb-2">{value}%</div>
                  <div 
                    className="w-full bg-gradient-to-t from-green-500 to-emerald-500 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                    style={{height: `${value}%`}}
                  ></div>
                  <div className="text-xs text-gray-500 mt-2">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">Trung bÃ¬nh tuáº§n: 88.3%</span>
              <span className="text-green-400 font-bold">+2.5% so vá»›i trÆ°á»›c</span>
            </div>
          </GlassCard>

          {/* Active Users Chart */}
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>ðŸ‘¥</span> NgÆ°á»i DÃ¹ng Hoáº¡t Äá»™ng
            </h3>
            <div className="grid grid-cols-7 gap-2 h-48">
              {[1120, 1245, 1089, 1356, 1278, 1401, 1245].map((value, idx) => {
                const maxValue = 1500;
                const percentage = (value / maxValue) * 100;
                return (
                  <div key={idx} className="flex flex-col items-center justify-end">
                    <div className="text-xs font-bold text-white mb-2">{value}</div>
                    <div 
                      className="w-full bg-gradient-to-t from-blue-500 to-cyan-500 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                      style={{height: `${percentage}%`}}
                    ></div>
                    <div className="text-xs text-gray-500 mt-2">
                      {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between text-sm">
              <span className="text-gray-400">Trung bÃ¬nh: 1,248 users/ngÃ y</span>
              <span className="text-blue-400 font-bold">+12% so vá»›i trÆ°á»›c</span>
            </div>
          </GlassCard>
        </div>

        {/* Department Performance */}
        <GlassCard className="mb-8">
          <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <span>ðŸ¢</span> Hiá»‡u Suáº¥t Theo PhÃ²ng Ban
          </h3>
          <div className="space-y-4">
            {[
              { name: 'Ká»¹ Thuáº­t', tasks: 45, completed: 38, members: 18, progress: 84, color: 'from-purple-600 to-pink-600' },
              { name: 'Thiáº¿t Káº¿', tasks: 32, completed: 30, members: 12, progress: 94, color: 'from-blue-500 to-cyan-500' },
              { name: 'Marketing', tasks: 28, completed: 24, members: 8, progress: 86, color: 'from-green-500 to-emerald-500' },
              { name: 'Sáº£n Pháº©m', tasks: 35, completed: 29, members: 7, progress: 83, color: 'from-orange-500 to-yellow-500' }
            ].map((dept, idx) => (
              <div key={idx} className="glass-strong p-4 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${dept.color} flex items-center justify-center text-xl`}>
                      {['âš™ï¸', 'ðŸŽ¨', 'ðŸ“¢', 'ðŸ“±'][idx]}
                    </div>
                    <div>
                      <div className="font-bold text-white">{dept.name}</div>
                      <div className="text-xs text-gray-500">{dept.members} thÃ nh viÃªn</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <div className="text-white font-bold">{dept.completed}/{dept.tasks}</div>
                      <div className="text-gray-500 text-xs">CÃ´ng viá»‡c</div>
                    </div>
                    <div className="text-center">
                      <div className="text-green-400 font-bold">{dept.progress}%</div>
                      <div className="text-gray-500 text-xs">HoÃ n thÃ nh</div>
                    </div>
                  </div>
                </div>
                <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                  <div 
                    className={`h-full bg-gradient-to-r ${dept.color} transition-all`}
                    style={{width: `${dept.progress}%`}}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>

        {/* Top Contributors */}
        <div className="grid grid-cols-2 gap-6">
          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>ðŸ†</span> Top Contributors
            </h3>
            <div className="space-y-3">
              {[
                { name: 'Sarah Chen', avatar: 'ðŸ‘©â€ðŸ’¼', tasks: 45, points: 1250, trend: '+15%' },
                { name: 'Mike Ross', avatar: 'ðŸ‘¨â€ðŸ’»', tasks: 42, points: 1180, trend: '+12%' },
                { name: 'Emma Wilson', avatar: 'ðŸ‘©â€ðŸŽ¨', tasks: 38, points: 1050, trend: '+8%' },
                { name: 'David Kim', avatar: 'ðŸ‘¨â€ðŸ”¬', tasks: 35, points: 980, trend: '+10%' }
              ].map((user, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 glass-strong rounded-xl">
                  <div className="text-2xl font-black text-gradient">#{idx + 1}</div>
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-xl">
                    {user.avatar}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{user.name}</div>
                    <div className="text-xs text-gray-400">{user.tasks} tasks â€¢ {user.points} Ä‘iá»ƒm</div>
                  </div>
                  <div className="text-green-400 text-sm font-bold">{user.trend}</div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
              <span>ðŸ“Š</span> Hoáº¡t Äá»™ng Gáº§n ÄÃ¢y
            </h3>
            <div className="space-y-3">
              {[
                { action: 'Task hoÃ n thÃ nh', detail: '38 tasks trong tuáº§n nÃ y', icon: 'âœ…', color: 'from-green-500 to-emerald-500' },
                { action: 'Meetings', detail: '24 cuá»™c há»p Ä‘Ã£ diá»…n ra', icon: 'ðŸŽ¤', color: 'from-blue-500 to-cyan-500' },
                { action: 'Files uploaded', detail: '156 tÃ i liá»‡u má»›i', icon: 'ðŸ“', color: 'from-purple-600 to-pink-600' },
                { action: 'ThÃ nh viÃªn má»›i', detail: '+12 ngÆ°á»i tham gia', icon: 'ðŸ‘¥', color: 'from-orange-500 to-yellow-500' }
              ].map((activity, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 glass-strong rounded-xl">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${activity.color} flex items-center justify-center text-xl`}>
                    {activity.icon}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-white">{activity.action}</div>
                    <div className="text-xs text-gray-400">{activity.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

// ============= SETTINGS PAGE =============

function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  const [toast, setToast] = useState(null);
  const [userRole, setUserRole] = useState('admin'); // 'admin', 'manager', 'user'

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Tabs dÃ nh cho Admin
  const adminTabs = [
    { id: 'general', label: 'Tá»•ng Quan', icon: 'âš™ï¸' },
    { id: 'roles', label: 'Vai TrÃ² & Quyá»n', icon: 'ðŸ”' },
    { id: 'security', label: 'Báº£o Máº­t', icon: 'ðŸ›¡ï¸' },
    { id: 'integrations', label: 'TÃ­ch Há»£p', icon: 'ðŸ”—' },
    { id: 'billing', label: 'Thanh ToÃ¡n', icon: 'ðŸ’³' },
    { id: 'audit', label: 'Nháº­t KÃ½', icon: 'ðŸ“œ' }
  ];

  // Tabs dÃ nh cho User (NhÃ¢n viÃªn/Quáº£n lÃ½)
  const userTabs = [
    { id: 'profile', label: 'Há»“ SÆ¡ CÃ¡ NhÃ¢n', icon: 'ðŸ‘¤' },
    { id: 'notifications', label: 'ThÃ´ng BÃ¡o', icon: 'ðŸ””' },
    { id: 'privacy', label: 'Quyá»n RiÃªng TÆ°', icon: 'ðŸ”’' },
    { id: 'appearance', label: 'Giao Diá»‡n', icon: 'ðŸŽ¨' }
  ];

  const currentTabs = userRole === 'admin' ? adminTabs : userTabs;

  return (
    <>
      <div className="min-h-screen flex">
        <NavigationSidebar currentPage="CÃ i Äáº·t" />
        <div className="flex-1 p-6 overflow-auto scrollbar-gradient">
        {/* Role Switcher for demo */}
        <div className="mb-6 glass-strong p-4 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Cháº¿ Ä‘á»™ cÃ i Ä‘áº·t</h2>
              <p className="text-sm text-gray-400">Demo: Chá»n vai trÃ² Ä‘á»ƒ xem cÃ i Ä‘áº·t tÆ°Æ¡ng á»©ng</p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={() => setUserRole('admin')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'admin'
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                ðŸ‘‘ Quáº£n Trá»‹ ViÃªn
              </button>
              <button 
                onClick={() => setUserRole('manager')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'manager'
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                ðŸ‘” TrÆ°á»Ÿng PhÃ²ng
              </button>
              <button 
                onClick={() => setUserRole('user')}
                className={`px-4 py-2 rounded-lg font-semibold transition-all ${
                  userRole === 'user'
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                    : 'glass hover:bg-white/10 text-gray-400'
                }`}
              >
                ðŸ‘· NhÃ¢n ViÃªn
              </button>
            </div>
          </div>
        </div>

        <h1 className="text-4xl font-black text-gradient mb-2">
          {userRole === 'admin' ? 'CÃ i Äáº·t Tá»• Chá»©c' : 'CÃ i Äáº·t CÃ¡ NhÃ¢n'}
        </h1>
        <p className="text-gray-400 mb-8">
          {userRole === 'admin' 
            ? 'Quáº£n lÃ½ cáº¥u hÃ¬nh vÃ  chÃ­nh sÃ¡ch toÃ n tá»• chá»©c' 
            : 'TÃ¹y chá»‰nh tráº£i nghiá»‡m cÃ¡ nhÃ¢n cá»§a báº¡n'}
        </p>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto scrollbar-gradient">
          {currentTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-semibold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                  : 'glass hover:bg-white/10 text-gray-400'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Admin Tabs Content */}
        {userRole === 'admin' && (
        <>
        {/* General Tab */}
        {activeTab === 'general' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">ThÃ´ng Tin Tá»• Chá»©c</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">TÃªn Tá»• Chá»©c</label>
                  <input type="text" defaultValue="VoiceHub Tech" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">MÃ´ Táº£</label>
                  <textarea className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" rows="3" defaultValue="CÃ´ng ty cÃ´ng nghá»‡ hÃ ng Ä‘áº§u chuyÃªn vá» giáº£i phÃ¡p truyá»n thÃ´ng"></textarea>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Website</label>
                    <input type="url" defaultValue="https://voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Email LiÃªn Há»‡</label>
                    <input type="email" defaultValue="contact@voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("ÄÃ£ lÆ°u thÃ´ng tin tá»• chá»©c!", "success")}
                >
                  ðŸ’¾ LÆ°u Thay Äá»•i
                </GradientButton>
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Quota & Giá»›i Háº¡n</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Sá»‘ lÆ°á»£ng thÃ nh viÃªn</span>
                    <span className="text-sm font-bold text-white">45 / 100</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600" style={{width: '45%'}}></div>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-gray-400">Dung lÆ°á»£ng lÆ°u trá»¯</span>
                    <span className="text-sm font-bold text-white">45.8 GB / 100 GB</span>
                  </div>
                  <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-500" style={{width: '45.8%'}}></div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Roles Tab */}
        {activeTab === 'roles' && (
          <div className="max-w-4xl">
            <GlassCard className="mb-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Quáº£n LÃ½ Vai TrÃ² (RBAC)</h3>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("Má»Ÿ modal táº¡o vai trÃ²...", "info")}
                >
                  âž• Táº¡o Vai TrÃ² Má»›i
                </GradientButton>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'Quáº£n Trá»‹ ViÃªn', members: 3, permissions: 'ToÃ n quyá»n', color: 'from-red-500 to-orange-500' },
                  { name: 'TrÆ°á»Ÿng PhÃ²ng', members: 4, permissions: 'Quáº£n lÃ½ phÃ²ng ban', color: 'from-purple-600 to-pink-600' },
                  { name: 'TrÆ°á»Ÿng NhÃ³m', members: 8, permissions: 'Quáº£n lÃ½ nhÃ³m', color: 'from-blue-500 to-cyan-500' },
                  { name: 'NhÃ¢n ViÃªn', members: 30, permissions: 'CÆ¡ báº£n', color: 'from-green-500 to-emerald-500' }
                ].map((role, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${role.color} flex items-center justify-center text-2xl`}>
                        {['ðŸ‘‘', 'ðŸ‘”', 'ðŸ‘¨â€ðŸ’¼', 'ðŸ‘·'][idx]}
                      </div>
                      <div>
                        <div className="font-bold text-white">{role.name}</div>
                        <div className="text-sm text-gray-400">{role.members} thÃ nh viÃªn â€¢ {role.permissions}</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm">Sá»­a</button>
                      <button className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-sm text-red-400">XÃ³a</button>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Security Tab */}
        {activeTab === 'security' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">ChÃ­nh SÃ¡ch Báº£o Máº­t</h3>
              <div className="space-y-4">
                {[
                  { label: 'Báº¯t buá»™c 2FA cho táº¥t cáº£ thÃ nh viÃªn', checked: true },
                  { label: 'YÃªu cáº§u máº­t kháº©u máº¡nh (8+ kÃ½ tá»±, chá»¯ hoa, sá»‘, kÃ½ tá»± Ä‘áº·c biá»‡t)', checked: true },
                  { label: 'Tá»± Ä‘á»™ng Ä‘Äƒng xuáº¥t sau 30 phÃºt khÃ´ng hoáº¡t Ä‘á»™ng', checked: false },
                  { label: 'Cháº·n Ä‘Äƒng nháº­p tá»« IP láº¡', checked: false },
                  { label: 'Gá»­i email thÃ´ng bÃ¡o khi Ä‘Äƒng nháº­p thiáº¿t bá»‹ má»›i', checked: true }
                ].map((setting, idx) => (
                  <label key={idx} className="flex items-center justify-between p-4 glass-strong rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                    <span className="text-white">{setting.label}</span>
                    <input type="checkbox" defaultChecked={setting.checked} className="w-5 h-5 rounded" />
                  </label>
                ))}
              </div>
            </GlassCard>

            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">API Keys</h3>
              <p className="text-gray-400 mb-4">Quáº£n lÃ½ API keys cho tÃ­ch há»£p bÃªn ngoÃ i</p>
              <div className="space-y-3 mb-4">
                {[
                  { name: 'Production API Key', created: '15/12/2025', lastUsed: '2 giá» trÆ°á»›c' },
                  { name: 'Development API Key', created: '10/01/2026', lastUsed: '1 ngÃ y trÆ°á»›c' }
                ].map((key, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <div className="font-bold text-white">{key.name}</div>
                      <div className="text-sm text-gray-400">Táº¡o: {key.created} â€¢ Sá»­ dá»¥ng: {key.lastUsed}</div>
                    </div>
                    <div className="flex gap-2">
                      <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm">Copy</button>
                      <button className="glass px-3 py-2 rounded-lg hover:bg-white/10 transition-all text-sm text-red-400">XÃ³a</button>
                    </div>
                  </div>
                ))}
              </div>
              <GradientButton variant="secondary">ðŸ”‘ Táº¡o API Key Má»›i</GradientButton>
            </GlassCard>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="max-w-4xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-6">TÃ­ch Há»£p BÃªn NgoÃ i</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { name: 'Slack', icon: 'ðŸ’¬', status: 'ÄÃ£ káº¿t ná»‘i', color: 'from-purple-600 to-pink-600' },
                  { name: 'Google Drive', icon: 'ðŸ“', status: 'ChÆ°a káº¿t ná»‘i', color: 'from-blue-500 to-cyan-500' },
                  { name: 'GitHub', icon: 'ðŸ™', status: 'ÄÃ£ káº¿t ná»‘i', color: 'from-green-500 to-emerald-500' },
                  { name: 'Jira', icon: 'ðŸ“Š', status: 'ChÆ°a káº¿t ná»‘i', color: 'from-orange-500 to-yellow-500' }
                ].map((integration, idx) => (
                  <GlassCard key={idx} hover>
                    <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${integration.color} flex items-center justify-center text-3xl mb-3`}>
                      {integration.icon}
                    </div>
                    <h4 className="font-bold text-white mb-1">{integration.name}</h4>
                    <p className="text-sm text-gray-400 mb-3">{integration.status}</p>
                    <button className={`w-full py-2 rounded-lg transition-all text-sm font-semibold ${
                      integration.status === 'ÄÃ£ káº¿t ná»‘i' 
                        ? 'glass hover:bg-white/10' 
                        : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
                    }`}>
                      {integration.status === 'ÄÃ£ káº¿t ná»‘i' ? 'Ngáº¯t Káº¿t Ná»‘i' : 'Káº¿t Ná»‘i'}
                    </button>
                  </GlassCard>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Audit Log Tab */}
        {activeTab === 'audit' && (
          <div className="max-w-4xl">
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Nháº­t KÃ½ Hoáº¡t Äá»™ng (Audit Log)</h3>
                <button className="glass px-4 py-2 rounded-xl hover:bg-white/10 transition-all font-semibold">
                  ðŸ“¥ Xuáº¥t Log
                </button>
              </div>
              <div className="space-y-2">
                {[
                  { user: 'Admin', action: 'Táº¡o vai trÃ² "TrÆ°á»Ÿng NhÃ³m Má»›i"', time: '5 phÃºt trÆ°á»›c', type: 'create' },
                  { user: 'Sarah Chen', action: 'Cáº­p nháº­t thÃ´ng tin tá»• chá»©c', time: '1 giá» trÆ°á»›c', type: 'update' },
                  { user: 'Mike Ross', action: 'Má»i thÃ nh viÃªn má»›i: anna@voicehub.com', time: '3 giá» trÆ°á»›c', type: 'invite' },
                  { user: 'Admin', action: 'Báº­t 2FA báº¯t buá»™c', time: '1 ngÃ y trÆ°á»›c', type: 'security' },
                  { user: 'Emma Wilson', action: 'XÃ³a API key "Test Key"', time: '2 ngÃ y trÆ°á»›c', type: 'delete' }
                ].map((log, idx) => (
                  <div key={idx} className="glass-strong p-4 rounded-xl flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                      log.type === 'create' ? 'bg-green-500/20' :
                      log.type === 'update' ? 'bg-blue-500/20' :
                      log.type === 'delete' ? 'bg-red-500/20' :
                      log.type === 'security' ? 'bg-orange-500/20' :
                      'bg-purple-500/20'
                    }`}>
                      {log.type === 'create' ? 'âž•' :
                       log.type === 'update' ? 'âœï¸' :
                       log.type === 'delete' ? 'ðŸ—‘ï¸' :
                       log.type === 'security' ? 'ðŸ”’' : 'ðŸ“§'}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-white">
                        <span className="text-purple-400">{log.user}</span> {log.action}
                      </div>
                      <div className="text-xs text-gray-500">ðŸ• {log.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}

        {/* User/Manager Tabs Content */}
        {(userRole === 'user' || userRole === 'manager') && (
        <>
        {/* Profile Tab */}
        {activeTab === 'profile' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">ThÃ´ng Tin CÃ¡ NhÃ¢n</h3>
              <div className="flex items-center gap-6 mb-6">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-5xl">
                  ðŸ‘¤
                </div>
                <GradientButton variant="secondary">ðŸ“· Thay Äá»•i Avatar</GradientButton>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Há» vÃ  TÃªn</label>
                  <input type="text" defaultValue="Nguyá»…n VÄƒn Danh" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Email</label>
                    <input type="email" defaultValue="danh@voicehub.com" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" disabled />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold mb-2 text-gray-300">Sá»‘ Ä‘iá»‡n thoáº¡i</label>
                    <input type="tel" defaultValue="+84 123 456 789" className="w-full px-4 py-3 rounded-xl glass border border-white/20 focus:border-purple-500 outline-none text-white" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Chá»©c vá»¥</label>
                  <input type="text" defaultValue={userRole === 'manager' ? 'TrÆ°á»Ÿng PhÃ²ng' : 'NhÃ¢n ViÃªn'} className="w-full px-4 py-3 rounded-xl glass border border-white/20 bg-white/5 text-gray-400" disabled />
                </div>
                <GradientButton 
                  variant="primary"
                  onClick={() => showToast("ÄÃ£ cáº­p nháº­t thÃ´ng tin!", "success")}
                >
                  ðŸ’¾ LÆ°u Thay Äá»•i
                </GradientButton>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Notifications Tab */}
        {activeTab === 'notifications' && (
          <div className="max-w-3xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">CÃ i Äáº·t ThÃ´ng BÃ¡o</h3>
              <div className="space-y-4">
                {[
                  { label: 'ThÃ´ng bÃ¡o tin nháº¯n má»›i', checked: true },
                  { label: 'ThÃ´ng bÃ¡o khi Ä‘Æ°á»£c mention', checked: true },
                  { label: 'ThÃ´ng bÃ¡o cÃ´ng viá»‡c má»›i', checked: true },
                  { label: 'ThÃ´ng bÃ¡o deadline sáº¯p Ä‘áº¿n', checked: true },
                  { label: 'ThÃ´ng bÃ¡o qua email', checked: false },
                  { label: 'ThÃ´ng bÃ¡o push trÃªn mobile', checked: true }
                ].map((setting, idx) => (
                  <label key={idx} className="flex items-center justify-between p-4 glass-strong rounded-xl cursor-pointer hover:bg-white/5 transition-all">
                    <span className="text-white">{setting.label}</span>
                    <input type="checkbox" defaultChecked={setting.checked} className="w-5 h-5 rounded" />
                  </label>
                ))}
              </div>
            </GlassCard>
          </div>
        )}

        {/* Privacy Tab */}
        {activeTab === 'privacy' && (
          <div className="max-w-3xl space-y-6">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Quyá»n RiÃªng TÆ°</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Hiá»ƒn thá»‹ tráº¡ng thÃ¡i online</label>
                  <select className="w-full px-4 py-3 rounded-xl glass border border-white/20 text-white">
                    <option>Má»i ngÆ°á»i</option>
                    <option>Chá»‰ Ä‘á»“ng nghiá»‡p</option>
                    <option>KhÃ´ng ai</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Ai cÃ³ thá»ƒ nháº¯n tin cho tÃ´i</label>
                  <select className="w-full px-4 py-3 rounded-xl glass border border-white/20 text-white">
                    <option>Má»i ngÆ°á»i</option>
                    <option>Chá»‰ Ä‘á»“ng nghiá»‡p</option>
                  </select>
                </div>
              </div>
            </GlassCard>
          </div>
        )}

        {/* Appearance Tab */}
        {activeTab === 'appearance' && (
          <div className="max-w-3xl">
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-4">Giao Diá»‡n</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold mb-2 text-gray-300">Chá»§ Ä‘á»</label>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { name: 'Tá»‘i', icon: 'ðŸŒ™', active: true },
                      { name: 'SÃ¡ng', icon: 'â˜€ï¸', active: false }
                    ].map((theme, idx) => (
                      <div key={idx} className={`p-6 rounded-xl cursor-pointer transition-all ${
                        theme.active ? 'bg-gradient-to-br from-purple-600 to-pink-600' : 'glass hover:bg-white/10'
                      }`}>
                        <div className="text-4xl mb-2">{theme.icon}</div>
                        <div className="font-bold text-white">{theme.name}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </GlassCard>
          </div>
        )}
        </>
        )}
      </div>
    </div>

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

// ============= APP ROUTES =============

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<DashboardPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/organizations" element={<OrganizationsPage />} />
      <Route path="/organizations/:id" element={<OrganizationDetailPage />} />
      <Route path="/chat" element={<ChatPage />} />
      <Route path="/chat/:channelId" element={<ChatPage />} />
      <Route path="/voice/:roomId" element={<VoiceRoomPage />} />
      <Route path="/tasks" element={<TasksPage />} />
      <Route path="/friends" element={<FriendsPage />} />
      <Route path="/documents" element={<DocumentsPage />} />
      <Route path="/notifications" element={<NotificationsPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;

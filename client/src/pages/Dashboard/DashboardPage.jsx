import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import { Dropdown, GlassCard, GradientButton, Modal, StatusIndicator, Toast } from '../../components/Shared';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import api from '../../services/api';
import friendService from '../../services/friendService';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import { meetingAPI } from '../../services/api/meetingAPI';

function DashboardPage() {
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStat, setSelectedStat] = useState(null);
  const [showActivityDetail, setShowActivityDetail] = useState(null);
  const [toast, setToast] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [metrics, setMetrics] = useState({
    loading: true,
    orgCount: null,
    friendsTotal: null,
    pendingCount: 0,
    unread: 0,
    taskDone: null,
  });
  /** Bạn bè cho khung Trạng thái nhóm (từ GET /api/friends) */
  const [presenceFriends, setPresenceFriends] = useState([]);
  /** Cuộc họp sắp tới (từ GET /api/meetings + startFrom/startTo) */
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const { user } = useAuth();
  const { onlineUsers } = useSocket();
  const navigate = useNavigate();

  const displayName =
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    'bạn';

  const getGreeting = () => {
    const now = new Date();
    const hour = now.getHours();
    if (hour >= 5 && hour < 11) return `Chào buổi Sáng, ${displayName}!`;
    if (hour >= 11 && hour < 13) return `Chào buổi Trưa, ${displayName}!`;
    if (hour >= 13 && hour < 17) return `Chào buổi Chiều, ${displayName}!`;
    if (hour >= 17 && hour < 22) return `Chào buổi Tối, ${displayName}!`;
    return `Khuya rồi, ${displayName}!`;
  };

  useEffect(() => {
    // Chỉ hiển thị modal chào khi vừa đăng nhập / lần đầu vào web trong phiên này
    const seen = localStorage.getItem('vh_seen_welcome');
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem('vh_seen_welcome', '1');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const orgPayload = await organizationAPI.getOrganizations().catch(() => null);
        let orgList = [];
        if (orgPayload && Array.isArray(orgPayload.data)) {
          orgList = orgPayload.data;
        } else if (Array.isArray(orgPayload)) {
          orgList = orgPayload;
        }
        const orgCount = orgList.length;
        const rawOrgId = orgList[0]?._id ?? orgList[0]?.id;
        const firstOrgId = rawOrgId != null ? String(rawOrgId) : null;

        let taskDone = null;
        if (firstOrgId) {
          const ts = await taskAPI.getStatistics(firstOrgId).catch(() => null);
          const stat = ts?.data ?? ts;
          const formatted = stat?.data ?? stat;
          if (formatted && typeof formatted === 'object') {
            taskDone = formatted.done ?? null;
          }
        }

        const fr = await friendService.getFriends().catch(() => null);
        let friendsTotal = null;
        let friendsRaw = [];
        if (fr) {
          const inner = fr.data ?? fr;
          const list = inner?.friends ?? inner?.data?.friends;
          if (Array.isArray(list)) {
            friendsRaw = list;
            friendsTotal = list.length;
          }
        }

        const presence = friendsRaw.slice(0, 12).map((row) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : null;
          const name =
            u?.displayName || u?.username || (u?.email ? String(u.email).split('@')[0] : null) || 'Bạn bè';
          const st = String(u?.status || 'offline').toLowerCase();
          return {
            id: u?._id || u?.userId || row.friendId,
            name,
            avatarUrl: u?.avatar || null,
            status: ['online', 'away', 'busy', 'offline'].includes(st) ? st : 'offline',
          };
        });
        setPresenceFriends(presence);

        const startFrom = new Date();
        const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
        const meetingRes = await meetingAPI
          .getMeetings({
            startFrom: startFrom.toISOString(),
            startTo: startTo.toISOString(),
            limit: 8,
          })
          .catch(() => null);
        let meetingsUi = [];
        if (meetingRes) {
          const body = meetingRes?.data ?? meetingRes;
          const inner = body?.data ?? body;
          const meetings = inner?.meetings ?? inner?.data?.meetings;
          if (Array.isArray(meetings)) {
            meetingsUi = meetings.slice(0, 5).map((m) => {
              const t = m.startTime ? new Date(m.startTime) : null;
              const timeStr =
                t && !Number.isNaN(t.getTime())
                  ? t.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
                  : '—';
              const parts = Array.isArray(m.participants) ? m.participants.length : 0;
              return {
                id: m._id,
                title: m.title || 'Cuộc họp',
                time: timeStr,
                attendees: parts || 1,
                startTime: m.startTime,
              };
            });
          }
        }
        setUpcomingMeetings(meetingsUi);

        const pend = await friendService.getPendingRequests().catch(() => null);
        let pendingCount = 0;
        if (pend) {
          const raw = pend.data ?? pend;
          const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          pendingCount = arr.length;
        }

        const notif = await api.get('/notifications', { params: { limit: 1 } }).catch(() => null);
        let unread = 0;
        if (notif) {
          const nd = notif.data?.data ?? notif.data ?? notif;
          unread = Number(nd?.unreadCount) || 0;
        }

        if (!cancelled) {
          setMetrics({
            loading: false,
            orgCount,
            friendsTotal,
            pendingCount,
            unread,
            taskDone,
          });
        }
      } catch {
        if (!cancelled) {
          setMetrics((m) => ({ ...m, loading: false }));
          setPresenceFriends([]);
          setUpcomingMeetings([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
  };

  /** Merge socket onlineUsers (Redis-backed trên server) với status từ API */
  const displayPresenceFriends = useMemo(() => {
    const set = new Set((onlineUsers || []).map(String));
    return presenceFriends.map((p) => ({
      ...p,
      status: set.has(String(p.id)) ? 'online' : p.status,
    }));
  }, [presenceFriends, onlineUsers]);

  const onlineFriendCount = useMemo(
    () => displayPresenceFriends.filter((p) => p.status === 'online').length,
    [displayPresenceFriends]
  );

  const stats = useMemo(() => {
    const fmt = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      return String(n);
    };
    return [
      {
        icon: '📊',
        label: 'Tổ chức',
        value: fmt(metrics.orgCount),
        change: '',
        color: 'from-purple-600 to-pink-600',
        trend: 'up',
        detail: metrics.loading ? 'Đang tải...' : `${metrics.orgCount ?? 0} tổ chức`,
        drilldown: {
          nguon: 'GET /api/organizations/my',
          soToChuc: metrics.orgCount ?? '—',
        },
      },
      {
        icon: '✅',
        label: 'Công việc (done)',
        value: fmt(metrics.taskDone),
        change: '',
        color: 'from-blue-500 to-cyan-500',
        trend: 'up',
        detail: metrics.loading
          ? 'Đang tải...'
          : 'Theo tổ chức đầu tiên trong danh sách của bạn',
        drilldown: {
          nguon: 'GET /api/tasks/statistics?organizationId=…',
          done: metrics.taskDone ?? '—',
        },
      },
      {
        icon: '👥',
        label: 'Bạn bè',
        value: fmt(metrics.friendsTotal),
        change: '',
        color: 'from-green-500 to-emerald-500',
        trend: 'up',
        detail: metrics.loading
          ? 'Đang tải...'
          : `${metrics.pendingCount} lời mời đang chờ`,
        drilldown: {
          nguon: 'GET /api/friends, /api/friends/pending',
          soBan: metrics.friendsTotal ?? '—',
          loiMoiCho: metrics.pendingCount,
        },
      },
      {
        icon: '🔔',
        label: 'Thông báo chưa đọc',
        value: fmt(metrics.unread),
        change: '',
        color: 'from-orange-500 to-red-500',
        trend: 'up',
        detail: metrics.loading ? 'Đang tải...' : 'Theo notification-service',
        drilldown: {
          nguon: 'GET /api/notifications',
          chuaDoc: metrics.unread,
        },
      },
    ];
  }, [metrics]);

  const activities = [
    { user: "Sarah Chen", action: "hoàn thành", item: "Đánh giá thiết kế UI", time: "2 phút trước", avatar: "👩‍💼", type: "task", color: "from-green-500 to-emerald-500", detail: { project: "VoiceHub Enterprise", duration: "2 giờ", tags: ["Thiết Kế", "Đánh Giá"] } },
    { user: "Mike Ross", action: "tải lên", item: "BaoCaoQ4.pdf", time: "15 phút trước", avatar: "👨‍💻", type: "file", color: "from-blue-500 to-cyan-500", detail: { size: "2.4 MB", folder: "Tài Liệu/Báo Cáo", downloads: 5 } },
    { user: "Emma Wilson", action: "tạo kênh", item: "#y-tuong-marketing", time: "1 giờ trước", avatar: "👩‍🎨", type: "message", color: "from-purple-600 to-pink-600", detail: { members: 8, category: "Marketing", description: "Tổng kết ý tưởng chiến dịch" } },
    { user: "David Kim", action: "tham gia", item: "Họp Nhóm Hàng Ngày", time: "2 giờ trước", avatar: "👨‍🔬", type: "task", color: "from-orange-500 to-red-500", detail: { duration: "30 phút", participants: 12, recording: true } },
    { user: "Lisa Park", action: "comment", item: "Dự án Website mới", time: "3 giờ trước", avatar: "👩‍💼", type: "message", color: "from-pink-500 to-rose-500", detail: { comments: 3, mentions: ["@Mike", "@Sarah"], project: "Thiết Kế Lại Website" } }
  ];

  const filteredActivities = activeFilter === 'all' 
    ? activities 
    : activities.filter(a => 
        activeFilter === 'tasks' ? a.type === 'task' :
        activeFilter === 'messages' ? a.type === 'message' :
        activeFilter === 'files' ? a.type === 'file' : true
      );

  return (
    <>
    {/* Bố cục chuẩn 3 khung: cùng độ dài với sidebar, mỗi khung thanh trượt riêng */}
    <div className="h-screen flex overflow-hidden bg-[#020817]">
      {/* Khung 1: Sidebar nav (icon only) */}
      <NavigationSidebar />

      {/* Khung 2: Trung tâm điều khiển - cuộn riêng */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 p-5 lg:p-6 overflow-y-auto overflow-x-visible scrollbar-overlay">
          {/* Header with Search */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-1">Trung Tâm Điều Khiển</h1>
              <p className="text-sm text-gray-400">Giám sát không gian làm việc thời gian thực</p>
            </div>
            <div className="flex gap-3">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm kiếm..."
                  className="pl-9 pr-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white w-56"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">🔍</span>
              </div>
              <Dropdown
                trigger={
                  <button className="bg-[#040f2a] border border-slate-800 px-3.5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all">
                    <span className="text-base">⚙️</span>
                  </button>
                }
                align="right"
              >
                <div className="p-2">
                  <button className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Tùy Chỉnh Dashboard</button>
                  <button className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Xuất Báo Cáo</button>
                  <button className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Chia Sẻ</button>
                  <div className="h-px bg-white/10 my-2"></div>
                  <button className="w-full text-left px-4 py-2 rounded-lg hover:bg-white/10 transition-all text-white">Cài Đặt</button>
                </div>
              </Dropdown>
            </div>
          </div>

          {/* Enhanced Stats Grid with Click to Drilldown */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {stats.map((stat, idx) => (
              <GlassCard 
                key={idx} 
                hover 
                onClick={() => setSelectedStat(stat)}
                className="animate-slideUp relative overflow-hidden group cursor-pointer border border-slate-800 bg-slate-900/60" 
                style={{animationDelay: `${idx * 0.1}s`}}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-2.5">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${stat.color} flex items-center justify-center text-xl shadow-lg`}>
                      {stat.icon}
                    </div>
                    {stat.change ? (
                      <div className={`flex items-center gap-1 text-xs font-bold ${stat.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        <span>{stat.trend === 'up' ? '↗' : '↘'}</span>
                        <span>{stat.change}</span>
                      </div>
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Live</span>
                    )}
                  </div>
                  <div className="text-2xl font-extrabold text-white mb-1">{stat.value}</div>
                  <div className="text-gray-400 text-xs mb-2">{stat.label}</div>
                  <div className="text-xs text-gray-500">{stat.detail}</div>
                  <div className="mt-2 text-[11px] text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity">
                    Click để xem chi tiết →
                  </div>
                </div>
              </GlassCard>
            ))}
          </div>

          {/* Activity Feed with Filters */}
          <GlassCard className="mb-6 border border-slate-800 bg-slate-900/60">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-xl font-bold text-white">Hoạt Động Gần Đây</h2>
                <p className="text-xs text-gray-500 mt-1">Minh họa — feed thật sẽ nối sau</p>
              </div>
              <div className="flex gap-2">
                {['all', 'tasks', 'messages', 'files'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeFilter === filter
                        ? 'bg-gradient-to-r from-violet-500 to-indigo-500 text-white'
                        : 'bg-[#040f2a] border border-slate-800 hover:bg-slate-800/70 text-gray-400'
                    }`}
                  >
                    {filter === 'all' ? 'Tất cả' : filter === 'tasks' ? 'Công việc' : filter === 'messages' ? 'Tin nhắn' : 'Tệp'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="space-y-3">
              {filteredActivities.map((activity, idx) => (
                <div
                  key={idx} 
                  onClick={() => setShowActivityDetail(activity)}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all cursor-pointer group"
                >
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${activity.color} flex items-center justify-center text-xl shadow-lg relative`}>
                    {activity.avatar}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 rounded-full border-2 border-[#0a0118]"></div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white mb-1">
                      <span className="font-bold">{activity.user}</span>
                      <span className="text-gray-400"> {activity.action} </span>
                      <span className="text-indigo-400 font-semibold">{activity.item}</span>
                    </p>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-sm">{activity.time}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full bg-gradient-to-r ${activity.color} text-white`}>
                        {activity.type === 'task' ? 'Công việc' : activity.type === 'file' ? 'Tệp' : 'Tin nhắn'}
                      </span>
                    </div>
                  </div>
                  <button className="opacity-0 group-hover:opacity-100 transition-opacity bg-[#040f2a] border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
                    Chi tiết
                  </button>
                </div>
              ))}
            </div>

            <button className="w-full mt-3 py-2.5 bg-[#040f2a] border border-slate-800 rounded-xl hover:bg-slate-800/70 transition-all text-sm text-gray-400 hover:text-white">
              Xem tất cả hoạt động →
            </button>
          </GlassCard>

          {/* Quick Actions Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { icon: "➕", label: "Dự Án Mới", color: "from-purple-600 to-pink-600", action: () => setShowNewProjectModal(true) },
              { icon: "📊", label: "Phân Tích", color: "from-blue-500 to-cyan-500", action: () => showToast("Chuyển đến trang phân tích", "info") },
              { icon: "👥", label: "Mời Thành Viên", color: "from-green-500 to-emerald-500", action: () => showToast("Gửi lời mời thành công", "success") },
              { icon: "📁", label: "Tải Lên", color: "from-orange-500 to-red-500", action: () => showToast("Chọn tệp để tải lên", "info") }
            ].map((action, idx) => (
              <button
                key={idx}
                onClick={action.action}
                className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl hover:bg-slate-800/70 transition-all group animate-scaleIn"
                style={{animationDelay: `${(idx + 4) * 0.1}s`}}
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${action.color} flex items-center justify-center text-xl mb-2 mx-auto group-hover:scale-110 transition-transform`}>
                  {action.icon}
                </div>
                <div className="text-xs font-semibold text-gray-400 group-hover:text-white transition-colors">
                  {action.label}
                </div>
              </button>
            ))}
          </div>

          {/* Performance Chart Preview */}
          <GlassCard className="border border-slate-800 bg-slate-900/60">
            <h3 className="text-lg font-bold text-white mb-3">Hiệu Suất Tuần Này</h3>
            <div className="grid grid-cols-7 gap-2 h-40">
              {[65, 80, 55, 90, 75, 85, 70].map((height, idx) => (
                <div key={idx} className="flex flex-col items-center justify-end group">
                  <div className="relative">
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity glass px-2 py-1 rounded text-xs whitespace-nowrap">
                      {Math.floor(height * 5)} tasks
                    </div>
                  </div>
                  <div 
                    className="w-full bg-gradient-to-t from-purple-600 to-pink-600 rounded-t-lg transition-all hover:scale-105 cursor-pointer"
                    style={{height: `${height}%`}}
                  ></div>
                  <div className="text-xs text-gray-500 mt-2">
                    {['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][idx]}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-gray-400">Tổng: 500 công việc</span>
              <span className="text-green-400 font-bold">+15% so với tuần trước</span>
            </div>
          </GlassCard>
        </div>
        </div>

      {/* Khung 3: Trạng thái nhóm - cùng độ cao, thanh trượt riêng */}
      <div className="w-72 shrink-0 h-full flex flex-col overflow-hidden bg-slate-900/60 border-l border-slate-800">
        <div className="flex-1 min-h-0 p-4 overflow-y-auto overflow-x-visible scrollbar-overlay">
        <h2 className="text-lg font-bold mb-5 text-white flex items-center gap-2">
          <span>👥</span> Trạng Thái Nhóm
        </h2>
        
        {/* Online Members — dữ liệu từ /api/friends */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-400">
              {metrics.loading
                ? 'Đang tải…'
                : `ĐANG ONLINE — ${onlineFriendCount} / ${displayPresenceFriends.length} bạn`}
            </h3>
            <button
              type="button"
              className="text-xs text-purple-400 hover:text-pink-400 transition-colors"
              onClick={() => navigate('/chat/friends')}
            >
              Xem tất cả
            </button>
          </div>
          <div className="space-y-2">
            {!metrics.loading && displayPresenceFriends.length === 0 && (
              <p className="text-sm text-gray-500 py-2">
                Chưa có bạn bè trong danh sách. Thêm bạn tại mục Tin nhắn.
              </p>
            )}
            {displayPresenceFriends.map((pf, idx) => (
              <div
                key={pf.id != null ? String(pf.id) : idx}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5 transition-all cursor-pointer group"
              >
                <div className="relative">
                  <div
                    className={`w-9 h-9 rounded-full bg-gradient-to-br ${
                      ['from-purple-600 to-pink-600', 'from-blue-500 to-cyan-500', 'from-green-500 to-emerald-500'][idx % 3]
                    } flex items-center justify-center text-base overflow-hidden`}
                  >
                    {pf.avatarUrl ? (
                      <img src={pf.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-white">{pf.name.charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <StatusIndicator status={pf.status} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium text-sm truncate">{pf.name}</div>
                  <div className="text-gray-500 text-xs capitalize">
                    {pf.status === 'online'
                      ? 'Đang hoạt động'
                      : pf.status === 'away'
                        ? 'Vắng'
                        : pf.status === 'busy'
                          ? 'Bận'
                          : 'Offline'}
                  </div>
                </div>
                <button
                  type="button"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-lg"
                  aria-label="Chat"
                  onClick={() => navigate('/chat/friends')}
                >
                  💬
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events — /api/meetings (7 ngày tới) */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-gray-400 mb-4">SỰ KIỆN SẮP TỚI</h3>
          <div className="space-y-3">
            {!metrics.loading && upcomingMeetings.length === 0 && (
              <p className="text-sm text-gray-500">Không có cuộc họp trong 7 ngày tới.</p>
            )}
            {upcomingMeetings.map((event, idx) => {
              const colors = [
                'from-blue-500 to-cyan-500',
                'from-purple-600 to-pink-600',
                'from-green-500 to-emerald-500',
              ];
              const color = colors[idx % colors.length];
              return (
                <GlassCard
                  key={event.id != null ? String(event.id) : idx}
                  hover
                  className="p-3 relative overflow-hidden group cursor-pointer border border-slate-800 bg-slate-900/60"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-0 group-hover:opacity-10 transition-opacity`}></div>
                  <div className="relative z-10">
                    <div className="flex items-start gap-3">
                      <div
                        className={`w-9 h-9 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center text-base flex-shrink-0`}
                      >
                        📅
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-white font-semibold text-sm mb-1 truncate">{event.title}</div>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-gray-400">{event.time}</span>
                          <span className="text-gray-600">•</span>
                          <span className="text-gray-400">{event.attendees} người</span>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="mt-2 w-full py-1.5 bg-[#040f2a] border border-slate-800 rounded-lg text-xs font-semibold hover:bg-slate-800/70 transition-all"
                      onClick={() => navigate('/calendar')}
                    >
                      Lịch
                    </button>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </div>

        {/* Quick Stats */}
        <div className="bg-[#040f2a] border border-slate-800 rounded-xl p-3.5">
          <h3 className="text-sm font-semibold text-gray-400 mb-3">THỐNG KÊ NHANH</h3>
          <div className="space-y-3">
            {[
              {
                label: 'Thông báo chưa đọc',
                value: metrics.loading ? '…' : String(metrics.unread),
                icon: '🔔',
              },
              {
                label: 'Lời mời kết bạn',
                value: metrics.loading ? '…' : String(metrics.pendingCount),
                icon: '👋',
              },
              {
                label: 'Bạn bè',
                value: metrics.loading ? '…' : metrics.friendsTotal == null ? '—' : String(metrics.friendsTotal),
                icon: '👥',
              },
            ].map((stat, idx) => (
              <div key={idx} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{stat.icon}</span>
                  <span className="text-sm text-gray-400">{stat.label}</span>
                </div>
                <span className="text-sm font-bold text-indigo-300">{stat.value}</span>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </div>

    {/* Welcome Greeting Modal (hiển thị 1 lần sau khi đăng nhập / vào web) */}
    <Modal
      isOpen={showWelcome}
      onClose={() => setShowWelcome(false)}
      title="Xin chào"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-base font-semibold text-white">{getGreeting()}</p>
        <p className="text-sm text-gray-400">
          Chúc {displayName} có một ngày làm việc hiệu quả cùng <span className="font-semibold text-gradient">VoiceHub</span>.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            className="bg-[#040f2a] border border-slate-800 px-4 py-2 rounded-xl text-sm hover:bg-slate-800/70 transition-all"
            onClick={() => setShowWelcome(false)}
          >
            Đóng
          </button>
          <GradientButton
            variant="primary"
            onClick={() => setShowWelcome(false)}
            className="px-4 py-2 text-sm"
          >
            Bắt đầu làm việc
          </GradientButton>
        </div>
      </div>
    </Modal>

    {/* Stat Detail Modal */}
    <Modal
      isOpen={selectedStat !== null}
      onClose={() => setSelectedStat(null)}
      title={selectedStat?.label || "Chi Tiết"}
      size="lg"
    >
        {selectedStat && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedStat.color} flex items-center justify-center text-3xl mb-4 mx-auto`}>
                  {selectedStat.icon}
                </div>
                <div className="text-4xl font-black text-white text-center mb-2">{selectedStat.value}</div>
                <div className="text-gray-400 text-center">{selectedStat.label}</div>
              </GlassCard>
              
              <GlassCard className="border border-slate-800 bg-slate-900/60">
                <h4 className="font-bold text-white mb-4">Thống Kê Chi Tiết</h4>
                <div className="space-y-3">
                  {Object.entries(selectedStat.drilldown).filter(([key]) => !['projects', 'nguoiDongGopNhieuNhat', 'roles', 'channels'].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-gray-400 capitalize">{key}:</span>
                      <span className="text-white font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {selectedStat.drilldown.projects && (
              <div>
                <h4 className="font-bold text-white mb-4">Dự Án Đang Hoạt Động</h4>
                <div className="space-y-3">
                  {selectedStat.drilldown.projects.map((project, idx) => (
                    <GlassCard key={idx} hover className="border border-slate-800 bg-slate-900/60">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-bold text-white">{project.name}</h5>
                        <span className="text-sm text-gray-400">Còn {project.deadline}</span>
                      </div>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex-1">
                          <div className="w-full h-2 glass-strong rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-600 to-pink-600" style={{width: `${project.progress}%`}}></div>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-white">{project.progress}%</span>
                      </div>
                      <div className="text-xs text-gray-400">👥 {project.members} thành viên</div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.nguoiDongGopNhieuNhat && (
              <div>
                <h4 className="font-bold text-white mb-4">Người Đóng Góp Nhiều Nhất</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.nguoiDongGopNhieuNhat.map((user, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[#040f2a] border border-slate-800 rounded-xl">
                      <div className="text-2xl">{user.avatar}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-white">{user.name}</div>
                        <div className="text-xs text-gray-400">{user.tasks} công việc</div>
                      </div>
                      <div className="text-green-400 font-bold">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.roles && (
              <div>
                <h4 className="font-bold text-white mb-4">Phân Bổ Theo Vai Trò</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.roles.map((role, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-3 bg-[#040f2a] border border-slate-800 rounded-xl">
                      <div className="flex-1">
                        <div className="font-semibold text-white">{role.name}</div>
                        <div className="text-xs text-gray-400">{role.online}/{role.count} online</div>
                      </div>
                      <div className="w-24 h-2 glass-strong rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-green-500 to-emerald-500" style={{width: `${(role.online / role.count) * 100}%`}}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedStat.drilldown.channels && (
              <div>
                <h4 className="font-bold text-white mb-4">Kênh Hoạt Động</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.channels.map((channel, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-[#040f2a] border border-slate-800 rounded-xl hover:bg-slate-800/60 cursor-pointer transition-all">
                      <div>
                        <div className="font-semibold text-white">{channel.name}</div>
                        <div className="text-xs text-gray-400">{channel.messages} tin nhắn</div>
                      </div>
                      {channel.unread > 0 && (
                        <div className="px-2 py-1 rounded-full bg-red-500 text-xs font-bold">{channel.unread}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
    </Modal>

    {/* Activity Detail Modal */}
    <Modal
        isOpen={showActivityDetail !== null}
        onClose={() => setShowActivityDetail(null)}
        title="Chi Tiết Hoạt Động"
        size="md"
      >
        {showActivityDetail && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-[#040f2a] border border-slate-800 rounded-xl">
              <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${showActivityDetail.color} flex items-center justify-center text-2xl`}>
                {showActivityDetail.avatar}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{showActivityDetail.user}</h3>
                <p className="text-sm text-gray-400">{showActivityDetail.action} {showActivityDetail.item}</p>
                <p className="text-sm text-gray-500">{showActivityDetail.time}</p>
              </div>
            </div>

            <GlassCard className="border border-slate-800 bg-slate-900/60">
              <h4 className="font-bold text-white mb-3">Thông Tin</h4>
              <div className="space-y-2">
                {Object.entries(showActivityDetail.detail).map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between py-2 border-b border-white/5">
                    <span className="text-gray-400 capitalize">{key}:</span>
                    <span className="text-white font-semibold">{Array.isArray(value) ? value.join(', ') : value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton 
                variant="primary" 
                className="flex-1 text-sm"
                onClick={() => {
                  setShowActivityDetail(false);
                  showToast('Đang chuyển đến chi tiết...');
                }}
              >
                Xem Chi Tiết
              </GradientButton>
              <button 
                onClick={() => showToast('Đã chia sẻ hoạt động')}
                className="flex-1 bg-[#040f2a] border border-slate-800 px-5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all text-sm font-semibold"
              >
                Chia Sẻ
              </button>
            </div>
          </div>
        )}
    </Modal>

    {/* New Project Modal */}
    <Modal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        title="Tạo Dự Án Mới"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Tên Dự Án</label>
            <input 
              type="text" 
              placeholder="Nhập tên dự án..."
              className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Mô Tả</label>
            <textarea 
              placeholder="Mô tả dự án..."
              rows="4"
              className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
            ></textarea>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Ngày Bắt Đầu</label>
              <input 
                type="date"
                className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-300">Deadline</label>
              <input 
                type="date"
                className="w-full px-4 py-2.5 rounded-xl bg-[#040f2a] border border-slate-800 focus:border-indigo-500 outline-none text-sm text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold mb-2 text-gray-300">Thành Viên</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {['👩‍💼 Sarah', '👨‍💻 Mike', '👩‍🎨 Emma', '👨‍🔬 David'].map((member, idx) => (
                <button key={idx} className="bg-[#040f2a] border border-slate-800 px-3 py-2 rounded-lg text-sm hover:bg-slate-800/70 transition-all">
                  {member}
                </button>
              ))}
            </div>
            <button className="text-indigo-400 text-sm hover:text-indigo-300 transition-colors">+ Thêm thành viên</button>
          </div>

          <div className="flex gap-3 pt-4">
            <GradientButton 
              variant="primary" 
              className="flex-1 text-sm"
              onClick={() => {
                showToast("Tạo dự án thành công!", "success");
                setShowNewProjectModal(false);
              }}
            >
              Tạo Dự Án
            </GradientButton>
            <button 
              onClick={() => setShowNewProjectModal(false)}
              className="flex-1 bg-[#040f2a] border border-slate-800 px-5 py-2.5 rounded-xl hover:bg-slate-800/70 transition-all text-sm font-semibold"
            >
              Hủy
            </button>
          </div>
        </div>
    </Modal>

    {/* Toast Notifications */}
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

export default DashboardPage;

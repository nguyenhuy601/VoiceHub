import {
  Bell,
  Bot,
  Building2,
  Calendar,
  CheckCircle2,
  FileText,
  Flame,
  MessageCircle,
  Mic,
  Settings,
  Timer,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import { AppSearchField } from '../../features/search';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import AddFriendModal from '../../components/Friends/AddFriendModal';
import NavigationSidebar from '../../components/Layout/NavigationSidebar';
import ShellWaveBackdrop from '../../components/Layout/ShellWaveBackdrop';
import { GlassCard, GradientButton, Modal } from '../../components/Shared';
import DashboardFigmaView from '../../components/Dashboard/DashboardFigmaView';
import {
  buildProductivity30D,
  buildProductivityTrends,
  getInitials,
  hashColorForSeed,
  METRIC_COLOR_MAP,
  METRIC_ICON_MAP,
} from '../../components/Dashboard/dashboardUiUtils';
import { useAuth } from '../../context/AuthContext';
import useUiRole from '../../hooks/useUiRole';
import { useSocket } from '../../context/SocketContext';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { meetingAPI } from '../../services/api/meetingAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { taskAPI } from '../../services/api/taskAPI';
import {
  useDashboardSummary,
  useFriendPending,
  useFriendsList,
  useNotificationsPreview,
  useOrganizationsMy,
} from '../../hooks/queries';
import { appShellBg } from '../../theme/shellTheme';
import { useLandingSafeNavigate } from '../../hooks/useLandingSafeNavigate';
import { useLocation } from 'react-router-dom';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { useLocale } from '../../context/LocaleContext';
import {
  buildCollaborateTasksPath,
  buildCommunicateChannelsPath,
} from '../../utils/suitePathUtils';
import DashboardGlobalSearchModal from '../../components/Dashboard/DashboardGlobalSearchModal';
import { NOTIFICATIONS_REFRESH_EVENT } from '../../services/notificationSync';
import { LOCAL_CUSTOM_KEY } from '../../utils/dmCalendarReminders';
import { formatMessagePreview } from '../../features/search/formatMessagePreview';
import { parseMessageListPage } from '../../lib/parseMessageListPage';
import { readSingleOrgModeFlag } from '../../utils/singleCompanyMode';
import { useWorkspace } from '../../context/WorkspaceContext';

function truncateText(value, maxLength = 56) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function isValidObjectId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

function loadLocalCalendarEventsForRange({ start, end }) {
  try {
    const raw = localStorage.getItem(LOCAL_CUSTOM_KEY) || localStorage.getItem('calendar:events');
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const startTs = start.getTime();
    const endTs = end.getTime();
    return parsed
      .map((item) => {
        const dateKey = String(item?.date || '').trim();
        const title = String(item?.title || '').trim();
        if (!dateKey || !title) return null;
        const d = new Date(`${dateKey}T12:00:00`);
        if (Number.isNaN(d.getTime())) return null;
        const ts = d.getTime();
        if (ts < startTs || ts > endTs) return null;
        return {
          id: item?.id || `local-${dateKey}-${title}`,
          title,
          time: String(item?.time || '').trim() || '—',
          attendees: Number(item?.attendees) || 1,
          startTime: item?.startAt || `${dateKey}T09:00:00`,
          source: 'local',
          type: item?.type || 'reminder',
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  } catch {
    return [];
  }
}

/** Chuẩn hóa yyyy-mm-dd theo giờ local */
function dayKeyFromDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Tổng task done trong org — đã dùng ở thẻ chỉ số (từng org gọi GET /statistics). */
async function sumTaskDoneAcrossOrgs(orgIds) {
  if (!Array.isArray(orgIds) || orgIds.length === 0) {
    return { total: 0, allFailed: false };
  }
  let total = 0;
  let failures = 0;
  await Promise.all(
    orgIds.map(async (oid) => {
      const raw = await taskAPI.getStatistics(oid).catch(() => null);
      if (!raw) {
        failures += 1;
        return;
      }
      const stats = raw?.data?.data ?? raw?.data ?? raw;
      const done = Number(stats?.done);
      if (!Number.isFinite(done)) failures += 1;
      else total += done;
    })
  );
  return { total, allFailed: failures === orgIds.length };
}

async function fetchMessagesForDashboardPaged(api, { maxPages = 3, limit = 50 } = {}) {
  const rows = [];
  let pageToken;
  for (let i = 0; i < maxPages; i += 1) {
    const params = { limit, fields: 'summary' };
    if (pageToken) params.pageToken = pageToken;
    const msgRes = await api.get('/messages', { params, skipGlobalErrorHandling: true }).catch(() => null);
    if (!msgRes) break;
    const page = parseMessageListPage(msgRes);
    const batch = page.messages || [];
    if (!batch.length) break;
    rows.push(...batch);
    if (!page.hasMore || !page.nextPageToken) break;
    pageToken = page.nextPageToken;
  }
  return rows;
}

async function fetchTasksForDashboardPaged({ maxPages = 3, limit = 50 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const res = await taskAPI.getTasks({ limit, page }).catch(() => null);
    if (!res) break;
    const body = res?.data?.data ?? res?.data ?? res;
    const batch = Array.isArray(body?.tasks) ? body.tasks : [];
    if (!batch.length) break;
    rows.push(...batch);
    if (batch.length < limit) break;
  }
  return rows;
}

/**
 * Lưới đóng góp kiểu GitHub: mỗi cột một tuần (Chủ nhật trên → Thứ bảy dưới).
 * Ngày ngoài năm chọn được render trong lưới nhưng inYear=false (ô trong suốt).
 */
function buildGithubYearGrid(year, dailyMap, locale) {
  const localeTag = String(locale || '').toLowerCase() === 'en' ? 'en-US' : 'vi-VN';
  const yearStart = new Date(year, 0, 1);
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date(year, 11, 31);
  yearEnd.setHours(23, 59, 59, 999);

  const jan1 = new Date(year, 0, 1);
  jan1.setHours(0, 0, 0, 0);
  const startDow = jan1.getDay();
  const gridStart = new Date(jan1);
  gridStart.setDate(jan1.getDate() - startDow);

  const dec31 = new Date(year, 11, 31);
  dec31.setHours(0, 0, 0, 0);
  const endDow = dec31.getDay();
  const gridEnd = new Date(dec31);
  gridEnd.setDate(dec31.getDate() + (6 - endDow));

  const msPerDay = 86400000;
  const totalDays = Math.round((gridEnd.getTime() - gridStart.getTime()) / msPerDay) + 1;
  const numWeeks = totalDays / 7;

  const weeks = [];
  for (let w = 0; w < numWeeks; w += 1) {
    const col = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(gridStart.getTime() + (w * 7 + d) * msPerDay);
      date.setHours(12, 0, 0, 0);
      const key = dayKeyFromDate(date);
      const t = date.getTime();
      const inYear = t >= yearStart.getTime() && t <= yearEnd.getTime();
      let tasks = 0;
      let messages = 0;
      if (inYear && dailyMap && typeof dailyMap === 'object') {
        const bucket = dailyMap[key];
        tasks = bucket?.tasks || 0;
        messages = bucket?.messages || 0;
      }
      col.push({
        key,
        date,
        inYear,
        tasks,
        messages,
        total: tasks + messages,
      });
    }
    weeks.push(col);
  }

  const monthLocale = localeTag;
  const monthLabels = [];
  let lastMonth = -1;
  for (let w = 0; w < numWeeks; w += 1) {
    let label = '';
    for (let d = 0; d < 7; d += 1) {
      const cell = weeks[w][d];
      if (cell.inYear) {
        const m = cell.date.getMonth();
        if (m !== lastMonth) {
          label = cell.date.toLocaleDateString(monthLocale, { month: 'short' });
          lastMonth = m;
        }
        break;
      }
    }
    monthLabels.push(label);
  }

  return { weeks, monthLabels, numWeeks };
}

function githubContributionCellClass(total, isDarkMode) {
  const n = Math.max(0, Number(total) || 0);
  if (isDarkMode) {
    if (n === 0) return 'bg-[#161b22] border border-[#30363d]/60';
    if (n === 1) return 'bg-[#0e4429] border border-[#30363d]/40';
    if (n <= 3) return 'bg-[#006d32] border border-[#30363d]/35';
    if (n <= 6) return 'bg-[#26a641] border border-[#30363d]/25';
    return 'bg-[#39d353] border border-[#30363d]/20';
  }
  if (n === 0) return 'bg-slate-100 border border-slate-200/90';
  if (n === 1) return 'bg-emerald-200 border border-emerald-300/70';
  if (n <= 3) return 'bg-emerald-300 border border-emerald-400/70';
  if (n <= 6) return 'bg-emerald-400 border border-emerald-500/70';
  return 'bg-emerald-500 border border-emerald-600/80';
}

function DashboardPage({
  landingDemo = false,
  demoVariant = 'default',
  suiteLayout = false,
  suiteScope = 'me',
} = {}) {
  const [activeFilter, setActiveFilter] = useState(() =>
    landingDemo && demoVariant === 'tasks' ? 'tasks' : 'all',
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatKey, setSelectedStatKey] = useState(null);
  const [showActivityDetail, setShowActivityDetail] = useState(null);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  /** Tăng khi đổi danh sách bạn / lời mời để refetch metrics */
  const [metricsTick, setMetricsTick] = useState(0);
  const [metrics, setMetrics] = useState({
    loading: !landingDemo,
    orgCount: null,
    friendsTotal: null,
    pendingCount: 0,
    unread: 0,
    taskDone: null,
    activeVoiceMeetings: null,
    pendingApprovals: null,
    communicationCount: null,
    totalMembers: null,
    onTimeRate: null,
    avgResponseMinutes: null,
  });
  /** Bạn bè cho khung Trạng thái nhóm (từ GET /api/friends) */
  const [presenceFriends, setPresenceFriends] = useState([]);
  /** Cuộc họp sắp tới (từ GET /api/meetings + startFrom/startTo) */
  const [upcomingMeetings, setUpcomingMeetings] = useState([]);
  const [workspaceEntries, setWorkspaceEntries] = useState([]);
  /** Map yyyy-mm-dd -> { tasks, messages } để heatmap đóng góp theo năm */
  const [activityDailyMap, setActivityDailyMap] = useState({});
  const [activityYear, setActivityYear] = useState(() => new Date().getFullYear());
  const [weeklyActivityDays, setWeeklyActivityDays] = useState([]);
  const [, setWeeklyActivityNotes] = useState([]);
  const [weeklyDayModal, setWeeklyDayModal] = useState(null);
  const [recentDmContacts, setRecentDmContacts] = useState([]);
  const [recentNotifications, setRecentNotifications] = useState([]);
  const { user } = useAuth();
  const { role, isGuest, isPersonal, isManagerOrAbove, meta } = useUiRole();
  const { singleOrgMode, company } = useWorkspace();
  const isSingleCompany = singleOrgMode || readSingleOrgModeFlag();
  const { onlineUsers, connected: socketConnected, on, off } = useSocket();
  const navigate = useLandingSafeNavigate(landingDemo);
  const location = useLocation();
  const { t } = useAppStrings();
  const { locale } = useLocale();
  const currentUserKey = String(user?.userId || user?._id || user?.id || '').trim();
  const isSuiteOverview =
    suiteLayout && ['communicate', 'collaborate', 'me'].includes(String(suiteScope || '').toLowerCase());
  const showEnterpriseSections = isSuiteOverview ? !isGuest && !isPersonal : isManagerOrAbove;

  const orgsQuery = useOrganizationsMy({ enabled: !landingDemo });
  const summaryQuery = useDashboardSummary({ enabled: !landingDemo });
  const friendsQuery = useFriendsList({ enabled: !landingDemo });
  const pendingQuery = useFriendPending({ enabled: !landingDemo });
  const notificationsQuery = useNotificationsPreview({ limit: 8, enabled: !landingDemo });
  const refetchSummary = summaryQuery.refetch;
  const refetchFriends = friendsQuery.refetch;
  const refetchPending = pendingQuery.refetch;
  const refetchNotifications = notificationsQuery.refetch;

  const dashboardQueryErrorNotifiedRef = useRef(false);
  useEffect(() => {
    if (landingDemo) return;
    const failedQuery =
      (summaryQuery.isError && summaryQuery.error) ||
      (orgsQuery.isError && orgsQuery.error) ||
      (friendsQuery.isError && friendsQuery.error);
    if (!failedQuery) {
      dashboardQueryErrorNotifiedRef.current = false;
      return;
    }
    if (dashboardQueryErrorNotifiedRef.current) return;
    dashboardQueryErrorNotifiedRef.current = true;
    const err = summaryQuery.error || orgsQuery.error || friendsQuery.error;
    toast.error(resolveApiErrorMessage(err, { t, fallback: t('errors.generic') }));
  }, [
    landingDemo,
    summaryQuery.isError,
    summaryQuery.error,
    orgsQuery.isError,
    orgsQuery.error,
    friendsQuery.isError,
    friendsQuery.error,
    t,
  ]);

  useEffect(() => {
    if (!suiteLayout || landingDemo) return;
    const overviewPaths = new Set([
      '/app/communicate/overview',
      '/app/collaborate/overview',
      '/app/me/dashboard',
    ]);
    if (!overviewPaths.has(location.pathname)) return;
    const root = document.querySelector(`[aria-label="${t('dashboard.ariaOverview')}"]`);
    if (root) {
      root.scrollIntoView({ block: 'start', behavior: 'instant' in window ? 'instant' : 'auto' });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location.pathname, suiteLayout, landingDemo, t]);

  useEffect(() => {
    if (landingDemo) return undefined;

    const hardRefreshMetrics = () => {
      refetchSummary?.();
      refetchFriends?.();
      refetchPending?.();
      refetchNotifications?.();
      setMetricsTick((v) => v + 1);
    };

    const handleUnreadUpdated = (payload = {}) => {
      const scope = String(payload.scope || 'personal').toLowerCase();
      const next = Number(payload.count);
      if (scope === 'personal' && Number.isFinite(next)) {
        setMetrics((prev) => ({ ...prev, unread: Math.max(0, next) }));
      }
      hardRefreshMetrics();
    };

    const notificationEvents = [
      'notification:new',
      'notification:bulk_new',
      'notification:read',
      'notification:read_many',
      'notification:read_all',
      'notification:deleted',
      'notification:deleted_read_all',
    ];
    const friendEvents = [
      'friend:request_received',
      'friend:request_sent',
      'friend:request_accepted',
      'friend:request_rejected',
      'friend:blocked',
      'friend:unblocked',
    ];

    notificationEvents.forEach((ev) => on(ev, hardRefreshMetrics));
    friendEvents.forEach((ev) => on(ev, hardRefreshMetrics));
    on('notification:unread_updated', handleUnreadUpdated);
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, hardRefreshMetrics);

    return () => {
      notificationEvents.forEach((ev) => off(ev, hardRefreshMetrics));
      friendEvents.forEach((ev) => off(ev, hardRefreshMetrics));
      off('notification:unread_updated', handleUnreadUpdated);
      window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, hardRefreshMetrics);
    };
  }, [
    landingDemo,
    on,
    off,
    refetchSummary,
    refetchFriends,
    refetchPending,
    refetchNotifications,
  ]);

  const displayName =
    user?.fullName ||
    user?.name ||
    user?.displayName ||
    user?.email?.split('@')[0] ||
    t('dashboard.greetingNameFallback');

  const getGreeting = () => {
    const now = new Date();
    const hour = now.getHours();
    const name = displayName;
    if (hour >= 5 && hour < 11) return t('dashboard.greetingMorning', { name });
    if (hour >= 11 && hour < 13) return t('dashboard.greetingNoon', { name });
    if (hour >= 13 && hour < 17) return t('dashboard.greetingAfternoon', { name });
    if (hour >= 17 && hour < 22) return t('dashboard.greetingEvening', { name });
    return t('dashboard.greetingLate', { name });
  };

  useEffect(() => {
    if (landingDemo) return;
    // Chỉ hiển thị modal chào khi vừa đăng nhập / lần đầu vào web trong phiên này
    const seen = localStorage.getItem('vh_seen_welcome');
    if (!seen) {
      setShowWelcome(true);
      localStorage.setItem('vh_seen_welcome', '1');
    }
  }, [landingDemo]);

  useEffect(() => {
    if (landingDemo && demoVariant === 'tasks') {
      setActiveFilter('tasks');
    }
  }, [landingDemo, demoVariant]);

  useEffect(() => {
    if (landingDemo) {
      setMetrics({
        loading: false,
        orgCount: 0,
        friendsTotal: 0,
        pendingCount: 0,
        unread: 0,
        taskDone: 0,
        activeVoiceMeetings: 0,
        pendingApprovals: 0,
        communicationCount: 0,
        totalMembers: 0,
        onTimeRate: 0,
        avgResponseMinutes: 0,
      });
      setPresenceFriends([]);
      setUpcomingMeetings([]);
      setWorkspaceEntries([]);
      setActivityDailyMap({});
      setWeeklyActivityDays([]);
      setWeeklyActivityNotes([]);
      setRecentDmContacts([]);
      setRecentNotifications([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const orgList = Array.isArray(orgsQuery.data) ? orgsQuery.data : [];
        setWorkspaceEntries(
          orgList.slice(0, 6).map((org) => ({
            id: org?._id || org?.id,
            name: org?.name || t('dashboard.orgFallback'),
            slug: org?.slug || '',
            myRole: org?.myRole || org?.role || 'member',
          }))
        );
        const orgSlugById = new Map(
          orgList.map((org) => [String(org?._id || org?.id || ''), String(org?.slug || '')])
        );
        const summary = summaryQuery.data;
        const orgCount = summary?.orgCount ?? orgList.length;
        const orgIds = orgList
          .map((org) => String(org?._id || org?.id || '').trim())
          .filter(isValidObjectId);

        let taskDone = summary?.taskDone ?? null;
        if (taskDone == null && orgIds.length === 0) {
          taskDone = 0;
        } else if (taskDone == null && orgIds.length > 0) {
          const taskStats = await sumTaskDoneAcrossOrgs(orgIds);
          taskDone = taskStats.allFailed ? null : taskStats.total;
        }

        const friendsRaw = Array.isArray(friendsQuery.data) ? friendsQuery.data : [];
        const friendsTotal =
          summary?.friendsTotal ??
          (friendsQuery.isLoading && friendsQuery.data === undefined ? null : friendsRaw.length);
        const totalMembersFromOrgs = orgList.reduce((sum, org) => {
          const direct =
            org?.memberCount ??
            org?.membersCount ??
            org?.totalMembers ??
            org?.stats?.memberCount ??
            org?.stats?.members;
          if (Number.isFinite(Number(direct))) return sum + Number(direct);
          if (Array.isArray(org?.members)) return sum + org.members.length;
          return sum;
        }, 0);
        const totalMembers =
          summary?.totalMembers ??
          summary?.membersTotal ??
          summary?.activeMembersTotal ??
          (totalMembersFromOrgs > 0 ? totalMembersFromOrgs : friendsTotal);

        const presence = friendsRaw.slice(0, 12).map((row) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : null;
          const name =
            u?.displayName || u?.username || (u?.email ? String(u.email).split('@')[0] : null) ||
            t('dashboard.quickNavFriends');
          const st = String(u?.status || 'offline').toLowerCase();
          return {
            id: u?._id || u?.userId || row.friendId,
            name,
            avatarUrl: u?.avatar || null,
            status: ['online', 'away', 'busy', 'offline'].includes(st) ? st : 'offline',
          };
        });
        setPresenceFriends(presence);

        let activeVoiceMeetings = summary?.activeVoiceMeetings ?? null;
        if (activeVoiceMeetings == null) {
          const activeMeetingRes = await meetingAPI
            .getMeetings({ status: 'active', limit: 50 })
            .catch(() => null);
          const activeBody = activeMeetingRes?.data ?? activeMeetingRes;
          const activeInner = activeBody?.data ?? activeBody;
          const activeRows = activeInner?.meetings ?? activeInner?.data?.meetings ?? activeInner?.items;
          activeVoiceMeetings = Array.isArray(activeRows) ? activeRows.length : 0;
        }

        let meetingsUi = [];
        const summaryMeetings = Array.isArray(summary?.upcomingMeetings)
          ? summary.upcomingMeetings
          : [];
        if (summaryMeetings.length > 0) {
          meetingsUi = summaryMeetings.map((m) => {
            const startDt = m.startTime ? new Date(m.startTime) : null;
            const timeStr =
              startDt && !Number.isNaN(startDt.getTime())
                ? startDt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '—';
            return {
              id: m.id || m._id,
              title: m.title || t('dashboard.meetingFallback'),
              time: timeStr,
              attendees: Number(m.participants) || 1,
              startTime: m.startTime,
            };
          });
        } else {
          const startFrom = new Date();
          const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
          const meetingRes = await meetingAPI
            .getMeetings({
              startFrom: startFrom.toISOString(),
              startTo: startTo.toISOString(),
              limit: 8,
            })
            .catch(() => null);
          if (meetingRes) {
            const body = meetingRes?.data ?? meetingRes;
            const inner = body?.data ?? body;
            const meetings = inner?.meetings ?? inner?.data?.meetings;
            if (Array.isArray(meetings)) {
              meetingsUi = meetings.slice(0, 5).map((m) => {
                const startDt = m.startTime ? new Date(m.startTime) : null;
                const timeStr =
                  startDt && !Number.isNaN(startDt.getTime())
                    ? startDt.toLocaleTimeString(locale === 'en' ? 'en-US' : 'vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : '—';
                const parts = Array.isArray(m.participants) ? m.participants.length : 0;
                return {
                  id: m._id,
                  title: m.title || t('dashboard.meetingFallback'),
                  time: timeStr,
                  attendees: parts || 1,
                  startTime: m.startTime,
                };
              });
            }
          }
        }
        const startFrom = new Date();
        startFrom.setHours(0, 0, 0, 0);
        const startTo = new Date(startFrom.getTime() + 7 * 24 * 60 * 60 * 1000);
        const localUpcoming = loadLocalCalendarEventsForRange({ start: startFrom, end: startTo });
        const mergedUpcoming = [...meetingsUi, ...localUpcoming]
          .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
          .slice(0, 8);
        setUpcomingMeetings(mergedUpcoming);

        const pendingCount = summary?.pendingCount ?? pendingQuery.pendingCount ?? 0;
        let pendingApprovals = summary?.pendingApprovals ?? null;
        if (pendingApprovals == null) {
          const [myJoinAppsRes, reviewAppsRes] = await Promise.all([
            organizationAPI.getMyPendingJoinApplications().catch(() => null),
            organizationAPI.getJoinApplicationsToReview().catch(() => null),
          ]);
          const readCount = (payload) => {
            const body = payload?.data ?? payload;
            const inner = body?.data ?? body;
            const rows =
              inner?.applications ||
              inner?.joinApplications ||
              inner?.pendingApplications ||
              inner?.items ||
              inner;
            return Array.isArray(rows) ? rows.length : 0;
          };
          pendingApprovals = pendingCount + readCount(myJoinAppsRes) + readCount(reviewAppsRes);
        }
        const unread =
          summary?.unread ?? (Number(notificationsQuery.data?.unreadCount) || 0);
        const notifRows = Array.isArray(notificationsQuery.data?.notifications)
          ? notificationsQuery.data.notifications
          : [];
        const nowTs = Date.now();
        const relTime = (value) => {
          const ts = value ? new Date(value).getTime() : NaN;
          if (!Number.isFinite(ts)) return t('time.justNow');
          const diffMin = Math.max(1, Math.floor((nowTs - ts) / 60000));
          if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
          const diffHours = Math.floor(diffMin / 60);
          if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
          const diffDays = Math.floor(diffHours / 24);
          return t('time.daysAgo', { n: diffDays });
        };
        const dashboardRecentNotifications = notifRows.slice(0, 3).map((row, idx) => ({
          id: row?._id || row?.id || `nt-${idx}`,
          title: row?.title || t('dashboard.notificationFallback'),
          preview: row?.content || row?.message || '',
          time: relTime(row?.createdAt),
        }));

        const dayKey = dayKeyFromDate;
        const getRowId = (value) => String(value?._id || value?.id || value || '').trim();
        const resolveWeeklyPath = ({ kind, organizationId }) => {
          const orgId = String(organizationId || '').trim();
          if (orgId) {
            return kind === 'task'
              ? buildCollaborateTasksPath(orgId)
              : `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(orgId)}`;
          }
          return kind === 'task' ? '/app/collaborate/tasks' : '/app/communicate/chat/friends';
        };
        const weekDayLabels = [
          t('dashboard.weekDaySun'),
          t('dashboard.weekDayMon'),
          t('dashboard.weekDayTue'),
          t('dashboard.weekDayWed'),
          t('dashboard.weekDayThu'),
          t('dashboard.weekDayFri'),
          t('dashboard.weekDaySat'),
        ];
        const daily = {};
        const taskRows = await fetchTasksForDashboardPaged({ maxPages: 25, limit: 100 }).catch(() => []);
        let tasksWithDueAndCompletion = 0;
        let tasksCompletedOnTime = 0;
        taskRows.forEach((task) => {
          const status = String(task.status || task.state || '').toLowerCase();
          const completedAtRaw = task.completedAt || task.completed_at || task.doneAt || task.updatedAt;
          const dueAtRaw = task.dueDate || task.dueAt || task.deadline || task.endDate;
          const isCompleted =
            Boolean(task.completedAt || task.doneAt) ||
            ['done', 'completed', 'complete', 'closed'].includes(status);
          const completedTs = completedAtRaw ? new Date(completedAtRaw).getTime() : NaN;
          const dueTs = dueAtRaw ? new Date(dueAtRaw).getTime() : NaN;
          if (isCompleted && Number.isFinite(completedTs) && Number.isFinite(dueTs)) {
            tasksWithDueAndCompletion += 1;
            if (completedTs <= dueTs) tasksCompletedOnTime += 1;
          }
        });
        const onTimeRate =
          tasksWithDueAndCompletion > 0
            ? Math.round((tasksCompletedOnTime / tasksWithDueAndCompletion) * 100)
            : null;
        const weeklyDayMap = new Map();
        const weekStart = new Date();
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - 6);
        const weekStartTs = weekStart.getTime();
        Array.from({ length: 7 }, (_, index) => {
          const dayDate = new Date(weekStart);
          dayDate.setDate(weekStart.getDate() + index);
          const key = dayKey(dayDate);
          const weekday = dayDate.getDay();
          const entry = {
            key,
            dayLabel: weekDayLabels[weekday] || '',
            date: dayDate,
            tasks: 0,
            messages: 0,
            total: 0,
            items: [],
          };
          weeklyDayMap.set(key, entry);
          return entry;
        });
        const registerWeekItem = ({ when, kind, icon, title, detail, path }) => {
          const ts = new Date(when).getTime();
          if (!Number.isFinite(ts) || ts < weekStartTs) return;
          const key = dayKey(when);
          const day = weeklyDayMap.get(key);
          if (!day) return;
          if (kind === 'task') day.tasks += 1;
          else day.messages += 1;
          day.total += 1;
          day.items.push({
            key: `${kind}:${ts}:${title}`,
            ts,
            icon,
            title,
            detail,
            path,
            kind,
          });
        };
        taskRows.forEach((task) => {
          const taskMatchesUser =
            !currentUserKey ||
            [task.createdBy, task.assigneeId, task.completedBy].some((value) => getRowId(value) === currentUserKey);
          if (!taskMatchesUser) return;
          const key = dayKey(task.completedAt || task.updatedAt || task.createdAt);
          if (key) daily[key] = { tasks: (daily[key]?.tasks || 0) + 1, messages: daily[key]?.messages || 0 };
          const title = truncateText(task.title || task.name || t('dashboard.taskFallback') || 'Task', 40);
          const status = String(task.status || '').toLowerCase();
          const note = task.completedAt
            ? t('dashboard.taskCompletedNote', { title })
            : status && status !== 'todo'
              ? t('dashboard.taskUpdatedNote', { title })
              : t('dashboard.taskCreatedNote', { title });
          const when = task.completedAt || task.updatedAt || task.createdAt;
          const taskOrgId = getRowId(task.organizationId);
          if (when) {
            registerWeekItem({
              when,
              kind: 'task',
              icon: task.completedAt ? '✅' : '📝',
              title,
              detail: note,
              path: resolveWeeklyPath({ kind: 'task', organizationId: taskOrgId }),
            });
          }
        });
        const msgRows = await fetchMessagesForDashboardPaged(api, { maxPages: 3, limit: 50 }).catch(() => []);
        msgRows.forEach((msg) => {
          const senderId = getRowId(msg.senderId);
          if (currentUserKey && senderId !== currentUserKey) return;
          const key = dayKey(msg.createdAt);
          if (key) daily[key] = { tasks: daily[key]?.tasks || 0, messages: (daily[key]?.messages || 0) + 1 };
          const messageType = String(msg.messageType || 'text');
          const previewText = truncateText(
            formatMessagePreview(msg, t, { currentUserId: currentUserKey }) || t('dashboard.messageFallback'),
            48
          );
          const detail =
            messageType === 'file'
              ? t('dashboard.msgSentFile', { preview: previewText })
              : messageType === 'image'
                ? t('dashboard.msgSentImage', { preview: previewText })
                : messageType === 'business_card'
                  ? t('dashboard.msgSharedCard', { preview: previewText })
                  : messageType === 'call_log'
                    ? previewText
                    : t('dashboard.msgSent', { preview: previewText });
          if (msg.createdAt) {
            const msgOrgId = getRowId(msg.organizationId);
            registerWeekItem({
              when: msg.createdAt,
              kind: 'message',
              icon:
                messageType === 'file'
                  ? '📎'
                  : messageType === 'image'
                    ? '🖼️'
                    : messageType === 'call_log'
                      ? '📞'
                      : '💬',
              title: previewText,
              detail,
              path: resolveWeeklyPath({ kind: 'message', organizationId: msgOrgId }),
            });
          }
        });
        const responseDiffs = [];
        const dmMessagesByPeer = new Map();
        msgRows.forEach((msg) => {
          if (msg?.roomId || !currentUserKey) return;
          const senderId = getRowId(msg?.senderId);
          const receiverId = getRowId(msg?.receiverId);
          const ts = msg?.createdAt ? new Date(msg.createdAt).getTime() : NaN;
          if (!senderId || !receiverId || !Number.isFinite(ts)) return;
          if (senderId !== currentUserKey && receiverId !== currentUserKey) return;
          const peerId = senderId === currentUserKey ? receiverId : senderId;
          if (!peerId) return;
          const rows = dmMessagesByPeer.get(peerId) || [];
          rows.push({ senderId, ts });
          dmMessagesByPeer.set(peerId, rows);
        });
        dmMessagesByPeer.forEach((rows) => {
          const ordered = [...rows].sort((a, b) => a.ts - b.ts);
          let lastPeerTs = null;
          ordered.forEach((row) => {
            if (row.senderId === currentUserKey) {
              if (lastPeerTs != null && row.ts >= lastPeerTs) {
                const diffMin = (row.ts - lastPeerTs) / 60000;
                if (diffMin >= 0 && diffMin <= 7 * 24 * 60) responseDiffs.push(diffMin);
                lastPeerTs = null;
              }
            } else {
              lastPeerTs = row.ts;
            }
          });
        });
        const avgResponseMinutes =
          responseDiffs.length > 0
            ? Math.round((responseDiffs.reduce((sum, n) => sum + n, 0) / responseDiffs.length) * 10) / 10
            : null;
        const communicationCount = msgRows.length + notifRows.length + mergedUpcoming.length;

        const friendNameById = new Map();
        friendsRaw.forEach((row) => {
          const u = row.friendId && typeof row.friendId === 'object' ? row.friendId : null;
          const fid = String(u?._id || u?.id || u?.userId || row.friendId || '').trim();
          if (!fid) return;
          const n =
            u?.displayName ||
            u?.name ||
            u?.username ||
            (u?.email ? String(u.email).split('@')[0] : '') ||
            t('dashboard.friendFallback');
          friendNameById.set(fid, n);
        });

        const dmLatestByPeer = new Map();
        const makePreview = (msg) =>
          formatMessagePreview(msg, t, { currentUserId: currentUserKey }) || t('dashboard.newMessageFallback');
        msgRows.forEach((msg) => {
          if (msg?.roomId) return;
          const senderId = getRowId(msg?.senderId);
          const receiverId = getRowId(msg?.receiverId);
          if (!senderId || !receiverId || !currentUserKey) return;
          const mySide = String(currentUserKey);
          if (senderId !== mySide && receiverId !== mySide) return;
          const peerId = senderId === mySide ? receiverId : senderId;
          if (!peerId) return;
          const ts = new Date(msg?.createdAt).getTime();
          if (!Number.isFinite(ts)) return;
          const prev = dmLatestByPeer.get(peerId);
          if (!prev || ts > prev.ts) {
            const senderObj = msg?.senderId && typeof msg.senderId === 'object' ? msg.senderId : null;
            const receiverObj = msg?.receiverId && typeof msg.receiverId === 'object' ? msg.receiverId : null;
            const peerObj = senderId === mySide ? receiverObj : senderObj;
            const peerName =
              friendNameById.get(peerId) ||
              peerObj?.displayName ||
              peerObj?.name ||
              peerObj?.username ||
              t('dashboard.friendFallback');
            dmLatestByPeer.set(peerId, {
              id: peerId,
              name: peerName,
              preview: makePreview(msg),
              ts,
            });
          }
        });
        const relDmTime = (ts) => {
          const now = Date.now();
          const diffMin = Math.max(1, Math.floor((now - ts) / 60000));
          if (diffMin < 60) return t('time.minutesAgo', { n: diffMin });
          const diffHours = Math.floor(diffMin / 60);
          if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
          const diffDays = Math.floor(diffHours / 24);
          return t('time.daysAgo', { n: diffDays });
        };
        const dashboardRecentDms = Array.from(dmLatestByPeer.values())
          .sort((a, b) => b.ts - a.ts)
          .slice(0, 3)
          .map((row) => ({ ...row, time: relDmTime(row.ts) }));

        const weekActivityGrid = Array.from(weeklyDayMap.values()).map((day) => ({
          ...day,
          items: [...(day.items || [])].sort((a, b) => b.ts - a.ts),
        }));

        if (!cancelled) {
          setMetrics({
            loading: false,
            orgCount,
            friendsTotal,
            pendingCount,
            unread,
            taskDone,
            activeVoiceMeetings,
            pendingApprovals,
            communicationCount,
            totalMembers,
            onTimeRate,
            avgResponseMinutes,
          });
          setActivityDailyMap({ ...daily });
          setRecentDmContacts(dashboardRecentDms);
          setRecentNotifications(dashboardRecentNotifications);
          setWeeklyActivityDays(weekActivityGrid);
        }
      } catch {
        if (!cancelled) {
          setMetrics((m) => ({ ...m, loading: false }));
          setPresenceFriends([]);
          setWorkspaceEntries([]);
          setUpcomingMeetings([]);
          setWeeklyActivityDays([]);
          setWeeklyActivityNotes([]);
          setActivityDailyMap({});
          setRecentDmContacts([]);
          setRecentNotifications([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    currentUserKey,
    metricsTick,
    landingDemo,
    demoVariant,
    locale,
    t,
    orgsQuery.data,
    summaryQuery.data,
    friendsQuery.data,
    pendingQuery.pendingCount,
    notificationsQuery.data,
  ]);

  /**
   * Presence realtime: khi socket đã kết nối, danh sách `onlineUsers` từ socket-service là nguồn đúng
   * (ai không còn trong danh sách = offline). Không fallback `p.status` từ API khi đã connected — API/DB
   * có thể vẫn là "online" vài giây sau khi peer đã disconnect.
   */
  const displayPresenceFriends = useMemo(() => {
    const set = new Set((onlineUsers || []).map(String));
    return presenceFriends.map((p) => {
      const idStr = String(p?.id ?? '');
      const inLiveList = set.has(idStr);
      if (socketConnected) {
        return { ...p, status: inLiveList ? 'online' : 'offline' };
      }
      return {
        ...p,
        status: inLiveList ? 'online' : p.status,
      };
    });
  }, [presenceFriends, onlineUsers, socketConnected]);

  const onlineFriendCount = useMemo(
    () => displayPresenceFriends.filter((p) => p.status === 'online').length,
    [displayPresenceFriends]
  );

  const { isDarkMode } = useTheme();

  const contributionYearChoices = useMemo(() => {
    const y = new Date().getFullYear();
    return [0, 1, 2, 3, 4].map((i) => y - i);
  }, []);

  const githubGrid = useMemo(
    () => buildGithubYearGrid(activityYear, activityDailyMap, locale),
    [activityYear, activityDailyMap, locale]
  );

  const activityTotalSelectedYear = useMemo(() => {
    if (!activityDailyMap || typeof activityDailyMap !== 'object') return 0;
    const prefix = `${activityYear}-`;
    let sum = 0;
    for (const [k, v] of Object.entries(activityDailyMap)) {
      if (!k.startsWith(prefix)) continue;
      sum += Number(v?.tasks || 0) + Number(v?.messages || 0);
    }
    return sum;
  }, [activityDailyMap, activityYear]);

  const contributionLeftDayMarkers = useMemo(
    () => [
      '',
      t('dashboard.contribMarkerMon'),
      '',
      t('dashboard.contribMarkerWed'),
      '',
      t('dashboard.contribMarkerFri'),
      '',
    ],
    [t]
  );

  const shellBg = appShellBg(isDarkMode);
  const dashHeader = isDarkMode
    ? 'border-b border-white/[0.06] bg-[#0D0D0F]/95 backdrop-blur-md'
    : 'border-b border-sky-200/90 bg-sky-50/95 backdrop-blur-md';
  const dashMain = isDarkMode ? '' : 'bg-gradient-to-b from-sky-50/90 via-transparent to-slate-200/80';
  const dashAside = isDarkMode
    ? 'border-l border-white/[0.06] bg-[#121214]'
    : 'border-l border-sky-200/90 bg-sky-100/85';
  const cardSurface = isDarkMode
    ? 'border border-white/[0.04] bg-[#171a22]'
    : 'border border-slate-200/90 bg-white shadow-sm';
  const inputSurface = isDarkMode
    ? 'border border-white/[0.06] bg-[#1A1A1C] text-white placeholder:text-[#6b7280] focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/25'
    : 'border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/20';
  const textMuted = isDarkMode ? 'text-[#9ca3af]' : 'text-slate-600';
  const textHeading = isDarkMode ? 'text-white' : 'text-slate-900';
  const textSub = isDarkMode ? 'text-[#6b7280]' : 'text-slate-600';
  const accentText = isDarkMode ? 'text-cyan-300' : 'text-cyan-700';
  const modalGlass = isDarkMode
    ? 'border border-slate-800 bg-slate-900/60'
    : 'border border-slate-200 bg-white shadow-sm';
  const modalRow = isDarkMode
    ? 'flex items-center gap-3 rounded-xl border border-slate-800 bg-[#040f2a] p-3'
    : 'flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3';
  const modalRowBetween = isDarkMode
    ? 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-800 bg-[#040f2a] p-3 transition-all hover:bg-slate-800/60'
    : 'flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 transition-all hover:bg-slate-100';
  const modalHeroRow = isDarkMode
    ? 'flex items-center gap-3 rounded-xl border border-slate-800 bg-[#040f2a] p-3.5'
    : 'flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 shadow-sm';
  const modalSecondaryBtn = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const modalSecondaryBtnSm = isDarkMode
    ? 'rounded-xl border border-slate-800 bg-[#040f2a] px-4 py-2 text-sm text-white transition-all hover:bg-slate-800/70'
    : 'rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 shadow-sm transition-all hover:bg-slate-50';
  const modalLabel = isDarkMode ? 'mb-2 block text-sm font-semibold text-gray-300' : 'mb-2 block text-sm font-semibold text-slate-700';
  const modalDetailRowBorder = isDarkMode ? 'border-b border-white/5' : 'border-b border-slate-100';
  const modalChip = isDarkMode
    ? 'rounded-lg border border-slate-800 bg-[#040f2a] px-3 py-2 text-sm text-white transition-all hover:bg-slate-800/70'
    : 'rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-all hover:bg-slate-50';

  const formatWeeklyDayTitle = useCallback(
    (day) => {
      if (!day?.date) return day?.dayLabel || '';
      const dateLocale = String(locale || '').toLowerCase() === 'en' ? 'en-US' : 'vi-VN';
      const long = day.date.toLocaleDateString(dateLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      return `${day.dayLabel} · ${long}`;
    },
    [locale]
  );

  const stats = useMemo(() => {
    const fmt = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      return String(n);
    };
    const loadingDetail = t('dashboard.loading');
    return [
      ...(isSingleCompany
        ? []
        : [
            {
              key: 'org',
              icon: '📊',
              label: t('dashboard.statOrg'),
              value: fmt(metrics.orgCount),
              change: '+1',
              color: 'from-cyan-600 to-teal-600',
              iconBg: 'from-[#0891b2] to-[#0d9488]',
              sparkClass: 'text-emerald-400',
              trend: 'up',
              detail: metrics.loading ? loadingDetail : t('dashboard.detailOrg'),
              drilldown: {
                nguon: t('dashboard.drilldownSourceOrgApi'),
                soToChuc: metrics.orgCount ?? '—',
              },
            },
          ]),
      ...(isSingleCompany && meta.canManageMembers
        ? [
            {
              key: 'approvals',
              icon: '📋',
              label: t('companyAdmin.pendingJoin'),
              value: fmt(metrics.pendingApprovals),
              change: '—',
              color: 'from-amber-500 to-orange-600',
              iconBg: 'from-[#F59E0B] to-[#ea580c]',
              sparkClass: 'text-amber-400',
              trend: 'up',
              detail: metrics.loading ? loadingDetail : t('companyAdmin.overviewHint'),
              drilldown: {
                nguon: t('dashboard.drilldownSourceOrgApi'),
                choDuyet: metrics.pendingApprovals ?? '—',
              },
            },
          ]
        : []),
      {
        key: 'tasks',
        icon: '✅',
        label: t('dashboard.statTaskDone'),
        value: fmt(metrics.taskDone),
        change: '-4',
        color: 'from-blue-500 to-cyan-500',
        iconBg: 'from-[#3B82F6] to-[#06b6d4]',
        sparkClass: 'text-rose-400',
        trend: 'down',
        detail: metrics.loading ? loadingDetail : t('dashboard.detailTask'),
        drilldown: {
          nguon: t('dashboard.drilldownSourceTasksApi'),
          done: metrics.taskDone ?? '—',
          soToChuc: metrics.orgCount ?? '—',
        },
      },
      {
        key: 'friends',
        icon: '👥',
        label: t('dashboard.statFriends'),
        value: fmt(metrics.friendsTotal),
        change: '+1',
        color: 'from-emerald-500 to-teal-500',
        iconBg: 'from-[#10B981] to-[#14b8a6]',
        sparkClass: 'text-emerald-400',
        trend: 'up',
        detail: metrics.loading
          ? loadingDetail
          : t('dashboard.detailFriends', { count: metrics.pendingCount }),
        drilldown: {
          nguon: t('dashboard.drilldownSourceFriendsApi'),
          soBan: metrics.friendsTotal ?? '—',
          loiMoiCho: metrics.pendingCount,
        },
      },
      {
        key: 'notify',
        icon: '🔔',
        label: t('dashboard.statNotify'),
        value: fmt(metrics.unread),
        change: '+2',
        color: 'from-amber-500 to-orange-600',
        iconBg: 'from-[#F59E0B] to-[#ea580c]',
        sparkClass: 'text-emerald-400',
        trend: 'up',
        detail: metrics.loading ? loadingDetail : t('dashboard.detailUnread'),
        drilldown: {
          nguon: t('dashboard.drilldownSourceNotifyApi'),
          chuaDoc: metrics.unread,
        },
      },
    ];
  }, [metrics, t, isSingleCompany, meta.canManageMembers]);

  const enterpriseStats = useMemo(() => {
    const fmtNumber = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      const num = Number(n);
      if (!Number.isFinite(num)) return String(n);
      return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(num);
    };
    const fmtPercent = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      const num = Number(n);
      return Number.isFinite(num) ? `${Math.round(num)}%` : '—';
    };
    const fmtMinutes = (n) => {
      if (metrics.loading) return '…';
      if (n == null || n === '') return '—';
      const num = Number(n);
      if (!Number.isFinite(num)) return '—';
      if (num < 1) return `${Math.max(1, Math.round(num * 60))}s`;
      return `${num % 1 === 0 ? num.toFixed(0) : num.toFixed(1)}m`;
    };
    const lastDaysTotal = (daysBackStart, daysBackEnd) => {
      let total = 0;
      for (let i = daysBackStart; i <= daysBackEnd; i += 1) {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() - i);
        const key = dayKeyFromDate(d);
        const bucket = activityDailyMap?.[key] || {};
        total += Number(bucket.messages || 0) + Number(bucket.meetings || 0);
      }
      return total;
    };
    const recentComms = lastDaysTotal(0, 6);
    const previousComms = lastDaysTotal(7, 13);
    const commTrend =
      previousComms > 0
        ? `${Math.round(((recentComms - previousComms) / previousComms) * 100)}%`
        : recentComms > 0
          ? '100%'
          : '';
    const activeCount = Math.max(Number(onlineFriendCount) || 0, Number(metrics.activeMembers) || 0);
    const totalMembers = Number(metrics.totalMembers ?? metrics.friendsTotal ?? displayPresenceFriends.length) || 0;
    const avgResponse = Number(metrics.avgResponseMinutes);
    const responseDelta =
      Number.isFinite(avgResponse) ? Math.round((avgResponse - 5) * 10) / 10 : null;
    return [
      {
        key: 'comms',
        label: t('dashboard.statComms'),
        value: fmtNumber(metrics.communicationCount),
        change: commTrend ? `${commTrend}` : '',
        trend: commTrend ? (String(commTrend).startsWith('-') ? 'down' : 'up') : null,
        detail: t('dashboard.detailVsPrevWeek'),
        icon: MessageCircle,
        color: '#2563EB',
        bg: 'rgba(37,99,235,0.08)',
      },
      {
        key: 'personnel',
        label: t('dashboard.statActivePersonnel'),
        value: fmtNumber(totalMembers || activeCount),
        change: activeCount > 0 ? `${fmtNumber(activeCount)} ${t('dashboard.onlineSuffix')}` : '',
        trend: activeCount > 0 ? 'up' : null,
        detail: totalMembers ? t('dashboard.ofTotalPeople', { n: fmtNumber(totalMembers) }) : '',
        icon: Users,
        color: '#10B981',
        bg: 'rgba(16,185,129,0.08)',
      },
      {
        key: 'ontime',
        label: t('dashboard.statOnTimeRate'),
        value: fmtPercent(metrics.onTimeRate),
        change: '',
        trend: null,
        detail:
          metrics.onTimeRate == null ? t('dashboard.notEnoughDueTasks') : t('dashboard.fromDueDateTasks'),
        icon: CheckCircle2,
        color: '#F97316',
        bg: 'rgba(249,115,22,0.08)',
      },
      {
        key: 'response',
        label: t('dashboard.statAvgResponse'),
        value: fmtMinutes(metrics.avgResponseMinutes),
        change: responseDelta == null ? '' : `${responseDelta > 0 ? '+' : ''}${responseDelta}m`,
        trend: responseDelta == null ? null : responseDelta <= 0 ? 'up' : 'down',
        detail: t('dashboard.slaTarget'),
        icon: Timer,
        color: '#06B6D4',
        bg: 'rgba(6,182,212,0.08)',
      },
    ];
  }, [activityDailyMap, displayPresenceFriends.length, locale, metrics, onlineFriendCount, t]);

  const selectedStat = useMemo(() => {
    if (!selectedStatKey) return null;
    return stats.find((stat) => stat.key === selectedStatKey) || null;
  }, [selectedStatKey, stats]);

  const drilldownLabel = useCallback(
    (key) => {
      const map = {
        nguon: 'dashboard.drilldownSource',
        done: 'dashboard.drilldownDone',
        soToChuc: 'dashboard.drilldownOrgCount',
        soBan: 'dashboard.drilldownFriends',
        loiMoiCho: 'dashboard.drilldownPending',
        chuaDoc: 'dashboard.drilldownUnread',
      };
      const path = map[key];
      return path ? t(path) : key;
    },
    [t]
  );

  const activities = useMemo(() => [], []);

  const filteredActivities =
    activeFilter === 'all'
      ? activities
      : activities.filter((a) =>
          activeFilter === 'tasks'
            ? a.type === 'task'
            : activeFilter === 'messages'
              ? a.type === 'message'
              : activeFilter === 'files'
                ? a.type === 'file'
                : true
        );

  const myOverviewItems = useMemo(
    () =>
      workspaceEntries
        .filter((row) => row?.slug)
        .map((row) => ({
          id: String(row.id || row.slug),
          organizationId: String(row.id || row._id || ''),
          title: String(row.myRole || 'member').toUpperCase(),
          detail: t('dashboard.detailTask'),
          workspaceName: row.name,
          workspaceSlug: row.slug,
          route: '/app/collaborate/workspaces',
        })),
    [workspaceEntries, t]
  );

  const activityTypeLabel = (type) =>
    type === 'task'
      ? t('dashboard.activityTypeTask')
      : type === 'file'
        ? t('dashboard.activityTypeFile')
        : type === 'message'
          ? t('dashboard.activityTypeMessage')
          : t('dashboard.activityTypeDefault');

  const hour = new Date().getHours();
  const greetingShort =
    hour < 12
      ? t('dashboard.greetingShortMorning')
      : hour < 18
        ? t('dashboard.greetingShortAfternoon')
        : t('dashboard.greetingShortEvening');

  const meetingsDailyMap = useMemo(() => {
    const map = {};
    upcomingMeetings.forEach((m) => {
      const key = dayKeyFromDate(m.startTime || m.startAt || m.date);
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [upcomingMeetings]);

  const productivity30d = useMemo(
    () => buildProductivity30D(activityDailyMap, locale, meetingsDailyMap),
    [activityDailyMap, locale, meetingsDailyMap]
  );

  const productivityTrends = useMemo(
    () => buildProductivityTrends(productivity30d),
    [productivity30d]
  );

  const performanceStats = useMemo(() => {
    const weekTasks = weeklyActivityDays.reduce((sum, d) => sum + (d.tasks || 0), 0);
    const weekTotal = weeklyActivityDays.reduce((sum, d) => sum + (d.total || 0), 0);
    const onTimePct =
      weekTotal > 0 ? Math.min(100, Math.round((weekTasks / Math.max(1, weekTotal)) * 100)) : 0;
    return [
      {
        label: t('dashboard.perfTasksWeek'),
        value: weekTasks,
        target: Math.max(weekTasks, 10),
        color: '#10B981',
        icon: CheckCircle2,
      },
      {
        label: t('dashboard.perfOnTimeRate'),
        value: onTimePct,
        target: 100,
        unit: '%',
        color: '#2563EB',
        icon: Timer,
      },
      {
        label: t('dashboard.perfSprintVelocity'),
        value: metrics.taskDone == null ? 0 : Number(metrics.taskDone) || 0,
        target: Math.max(Number(metrics.taskDone) || 0, 20),
        unit: ' pts',
        color: '#06B6D4',
        icon: TrendingUp,
      },
    ];
  }, [weeklyActivityDays, metrics.taskDone, t]);

  const twoWaySyncFeed = useMemo(() => {
    const rows = [];
    weeklyActivityDays.forEach((day) => {
      (day.items || []).forEach((item) => {
        const relTime = day.dayLabel || '';
        rows.push({
          icon: item.kind === 'task' ? CheckCircle2 : item.icon === '🤖' ? Bot : MessageCircle,
          color: item.kind === 'task' ? '#10B981' : '#6366F1',
          user: t('dashboard.syncYou'),
          action: item.kind === 'task' ? t('dashboard.syncCompleted') : t('dashboard.syncSent'),
          item: `"${item.title}"`,
          workspace: item.channelName ? `#${item.channelName}` : '',
          time: relTime,
          path: item.path,
        });
      });
    });
    return rows.slice(0, 5);
  }, [t, weeklyActivityDays]);

  const aiInsights = useMemo(() => {
    const lines = [];
    if (metrics.pendingApprovals > 0) {
      lines.push(t('dashboard.insightPendingApprovals', { n: metrics.pendingApprovals }));
    }
    if (metrics.pendingCount > 0) {
      lines.push(t('dashboard.insightPendingFriends', { n: metrics.pendingCount }));
    }
    if (metrics.unread > 0) {
      lines.push(t('dashboard.insightUnread', { n: metrics.unread }));
    }
    if (upcomingMeetings.length > 0) {
      lines.push(t('dashboard.insightUpcomingMeeting', { title: upcomingMeetings[0].title }));
    }
    if (metrics.taskDone != null && metrics.taskDone > 0) {
      lines.push(t('dashboard.insightTasksDone', { n: metrics.taskDone }));
    }
    if (onlineFriendCount > 0) {
      lines.push(t('dashboard.insightOnlineFriends', { n: onlineFriendCount }));
    }
    if (!lines.length) {
      lines.push(t('dashboard.insightNoAlerts'));
    }
    return lines;
  }, [
    metrics.pendingApprovals,
    metrics.pendingCount,
    metrics.unread,
    metrics.taskDone,
    upcomingMeetings,
    onlineFriendCount,
    t,
  ]);

  const heroStats = useMemo(() => {
    const weekTotal = weeklyActivityDays.reduce((sum, d) => sum + (d.total || 0), 0);
    const productivity = Math.min(99, Math.max(12, Math.round((weekTotal / 35) * 100)));
    const responseRate = Math.min(99, Math.max(20, 100 - Math.min(80, Number(metrics.unread) || 0) * 3));
    const tasksDonePct =
      metrics.taskDone == null
        ? '—'
        : `${Math.min(99, Math.max(5, Math.round((Number(metrics.taskDone) / Math.max(1, Number(metrics.orgCount) || 1)) * 10)))}%`;
    return [
      { label: t('dashboard.heroProductivity'), value: `${productivity}%`, icon: TrendingUp, color: '#10B981' },
      { label: t('dashboard.heroResponseRate'), value: `${responseRate}%`, icon: Zap, color: '#2563EB' },
      { label: t('dashboard.heroTasksDone'), value: tasksDonePct, icon: Flame, color: '#F97316' },
    ];
  }, [weeklyActivityDays, metrics.unread, metrics.taskDone, metrics.orgCount, t]);

  const quickNavItems = useMemo(
    () => [
      {
        label: t('dashboard.quickNavCommunicate'),
        icon: MessageCircle,
        path: '/app/communicate/chat/friends',
        color: '#2563EB',
        desc: t('dashboard.quickNavDescUnread', {
          n: pendingQuery.pendingCount || metrics.pendingCount || 0,
        }),
      },
      {
        label: isSingleCompany ? t('nav.companyWorkspaces') : t('dashboard.quickNavOrg'),
        icon: Building2,
        path: isSingleCompany ? '/app/collaborate/workspaces' : '/app/collaborate/workspaces',
        color: '#06B6D4',
        desc: isSingleCompany
          ? t('dashboard.quickNavDescCompany')
          : t('dashboard.quickNavDescOrgs', { n: metrics.orgCount ?? 0 }),
      },
      {
        label: t('dashboard.quickNavMeetings'),
        icon: Mic,
        path: '/app/communicate/voice',
        color: '#F59E0B',
        desc: t('dashboard.quickNavDescLiveRooms', {
          n: upcomingMeetings.filter((m) => m.soon).length || upcomingMeetings.length,
        }),
      },
      {
        label: t('dashboard.quickNavCalendar'),
        icon: Calendar,
        path: '/app/me/calendar',
        color: '#10B981',
        desc: t('dashboard.quickNavDescMeetingsToday', { n: upcomingMeetings.length }),
      },
      {
        label: t('dashboard.quickNavDocuments'),
        icon: FileText,
        path: '/app/collaborate/documents',
        color: '#8B5CF6',
        desc: t('dashboard.quickNavDescFiles'),
      },
      {
        label: t('dashboard.quickNavNotifications'),
        icon: Bell,
        path: '/app/communicate/notifications',
        color: '#EF4444',
        desc: t('dashboard.quickNavDescPending', { n: metrics.unread || 0 }),
      },
      {
        label: isSingleCompany && meta.canManageMembers ? t('nav.companyAdmin') : t('dashboard.quickNavAdmin'),
        icon: Settings,
        path:
          isSingleCompany && meta.canManageMembers
            ? '/app/admin'
            : '/app/me/settings',
        color: '#64748B',
        desc:
          isSingleCompany && meta.canManageMembers
            ? t('companyAdmin.overviewHint')
            : t('dashboard.quickNavDescSystemSettings'),
      },
    ],
    [t, metrics.unread, metrics.orgCount, upcomingMeetings, pendingQuery.pendingCount, metrics.pendingCount, isSingleCompany, meta.canManageMembers]
  );

  const filteredQuickNav = useMemo(() => {
    if (isGuest) {
      return quickNavItems.filter((item) =>
        ['/app/communicate/chat/friends', '/app/communicate/notifications', '/app/me/calendar', '/app/me/settings'].includes(
          item.path
        )
      );
    }
    if (isPersonal) {
      return quickNavItems.filter((item) =>
        [
          '/app/communicate/chat/friends',
          '/app/communicate/notifications',
          '/app/me/calendar',
          '/app/collaborate/documents',
          '/app/me/settings',
        ].includes(item.path)
      );
    }
    return quickNavItems;
  }, [quickNavItems, isGuest, isPersonal]);

  const quickNavCols = isGuest || isPersonal ? 4 : 7;

  const recentMessagesUi = useMemo(
    () =>
      recentDmContacts.map((row) => {
        const color = hashColorForSeed(row.name);
        return {
          id: row.id,
          name: row.name,
          avatar: getInitials(row.name),
          msg: row.preview,
          time: row.time,
          unread: 0,
          color,
          type: 'dm',
        };
      }),
    [recentDmContacts]
  );

  const upcomingMeetingsUi = useMemo(() => {
    const now = Date.now();
    return upcomingMeetings.slice(0, 3).map((m, idx) => {
      const startTs = m.startTime ? new Date(m.startTime).getTime() : NaN;
      const soon = Number.isFinite(startTs) && startTs - now < 2 * 60 * 60 * 1000 && startTs >= now - 15 * 60 * 1000;
      const palette = ['#2563EB', '#06B6D4', '#10B981'];
      return {
        id: m.id,
        title: m.title,
        time: m.time,
        attendees: m.attendees,
        color: palette[idx % palette.length],
        soon,
      };
    });
  }, [upcomingMeetings]);

  const workspacesUi = useMemo(
    () =>
      workspaceEntries.map((ws) => {
        const color = hashColorForSeed(ws.name);
        return {
          id: ws.id,
          name: ws.name,
          slug: ws.slug,
          members: metrics.friendsTotal ?? 0,
          channels: 0,
          unread: 0,
          color,
          initial: getInitials(ws.name).slice(0, 1),
          desc: t('dashboard.workspaceRoleDesc', {
            role: String(ws.myRole || 'member').toUpperCase(),
          }),
        };
      }),
    [workspaceEntries, metrics.friendsTotal]
  );

  const metricCardsUi = useMemo(() => {
    const source = suiteLayout ? enterpriseStats : stats;
    return source.map((stat) => {
      const palette = METRIC_COLOR_MAP[stat.key] || METRIC_COLOR_MAP.org;
      const Icon = stat.icon || METRIC_ICON_MAP[stat.key] || Building2;
      return {
        ...stat,
        icon: Icon,
        color: stat.color || palette.color,
        bg: stat.bg || palette.bg,
        trend: stat.change,
        trendUp: stat.trend === 'up',
        sub: stat.detail,
        preview: false,
      };
    });
  }, [suiteLayout, enterpriseStats, stats]);

  /** Navigation from the stats modal — matches `stats[].key` */
  const getStatDetailRoute = (key) => {
    switch (key) {
      case 'org':
        return { path: '/organizations', cta: t('dashboard.statOpenOrg') };
      case 'tasks':
        return { path: '/tasks', cta: t('dashboard.statOpenTasks') };
      case 'friends':
        return { path: '/app/communicate/chat/friends', cta: t('dashboard.statOpenFriends') };
      case 'notify':
        return { path: '/app/communicate/notifications', cta: t('dashboard.statOpenNotify') };
      default:
        return null;
    }
  };

  const navigateFromActivityType = (type) => {
    if (type === 'task') navigate('/app/collaborate/tasks');
    else if (type === 'file') navigate('/app/collaborate/documents');
    else if (type === 'message') navigate('/app/communicate/chat/friends');
    else navigate('/app/communicate/notifications');
  };
  const performanceMiniStats = useMemo(
    () => [
      {
        label: t('dashboard.miniActiveMembers'),
        value: `${onlineFriendCount}/${displayPresenceFriends.length || 0}`,
        color: '#2563EB',
      },
      {
        label: t('dashboard.miniAvgTasksDay'),
        value: (weeklyActivityDays.reduce((sum, d) => sum + d.tasks, 0) / 7).toFixed(1),
        color: '#10B981',
      },
      {
        label: t('dashboard.miniPending'),
        value: String(metrics.pendingCount || 0),
        color: '#EF4444',
      },
    ],
    [t, onlineFriendCount, displayPresenceFriends.length, weeklyActivityDays, metrics.pendingCount]
  );

  const shellH = landingDemo ? 'min-h-[760px] h-[760px]' : 'h-screen';

  const dashboardBody = (
    <DashboardFigmaView
      isGuest={isGuest}
      isPersonal={isPersonal}
      isManagerOrAbove={showEnterpriseSections}
      locale={locale}
      greetingShort={greetingShort}
      displayName={displayName}
      aiInsights={aiInsights}
      priorityDm={pendingQuery.pendingCount || metrics.pendingCount || recentDmContacts.length}
      priorityMeetings={Math.min(upcomingMeetings.length, 3)}
      pendingApprovals={metrics.pendingApprovals || 0}
      heroStats={heroStats}
      hideRoleBanner={suiteLayout}
      insightPreview={false}
      syncFeedPreview={false}
      metricCards={metricCardsUi}
      onMetricCardClick={suiteLayout ? undefined : setSelectedStatKey}
      productivity30d={productivity30d}
      productivityTrends={productivityTrends}
      performanceStats={performanceStats}
      performanceMiniStats={performanceMiniStats}
      syncFeed={twoWaySyncFeed}
      onSyncItemClick={(item) => item.path && navigate(item.path)}
      quickNavItems={filteredQuickNav}
      quickNavCols={quickNavCols}
      onNavigate={navigate}
      pendingBannerLabel={
        !metrics.loading && metrics.pendingCount > 0
          ? t('dashboard.pendingInvites', { n: metrics.pendingCount })
          : ''
      }
      onPendingClick={() => navigate('/app/communicate/chat/friends?tab=requests')}
      recentMessages={recentMessagesUi}
      upcomingMeetings={upcomingMeetingsUi}
      meetingsEmptyLabel={t('dashboard.noMeetingsWeek')}
      workspaces={workspacesUi}
      addFriendLabel={t('dashboard.addFriend')}
      onCreateRoom={() => {
        toast.success(t('dashboard.toastCreatingRoom'));
        setTimeout(() => navigate('/app/communicate/voice'), 600);
      }}
      onCreateWorkspace={() => {
        toast.success(t('dashboard.toastGotoWorkspace'));
        navigate('/app/collaborate/workspaces');
      }}
      onAddFriend={() => setShowAddFriendModal(true)}
      onWorkspaceClick={(ws) =>
        navigate(
          ws.slug
            ? `${buildCommunicateChannelsPath()}?organizationId=${encodeURIComponent(ws.id)}`
            : '/app/collaborate/workspaces'
        )
      }
    />
  );

  return (
    <>
    <div className={suiteLayout ? 'h-full overflow-hidden' : `relative flex ${shellH} overflow-hidden ${shellBg}`}>
      {!suiteLayout && <ShellWaveBackdrop />}
      {!suiteLayout && (
        <div className="h-full shrink-0">
          <NavigationSidebar landingDemo={landingDemo} />
        </div>
      )}

      <div className={`relative z-[1] flex min-w-0 flex-1 flex-col overflow-hidden ${suiteLayout ? 'h-full' : ''}`}>
        {!suiteLayout && (
          <header className={`flex shrink-0 flex-wrap items-center gap-3 px-4 py-3 md:gap-4 md:px-6 ${dashHeader}`}>
            <p className={`max-w-[40%] truncate text-sm font-medium md:max-w-none md:text-[15px] ${isDarkMode ? 'text-white/90' : 'text-slate-800'}`}>{getGreeting()}</p>
            <div className="min-w-0 flex-1 md:mx-auto md:max-w-xl">
              <AppSearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder={t('dashboard.searchPlaceholder')}
                isDarkMode={isDarkMode}
                id="dashboard-header-search"
                aria-label={t('dashboard.ariaSearch')}
                size="lg"
                onFocus={() => setQuickNavOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    setQuickNavOpen(true);
                  }
                }}
              />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => navigate('/app/communicate/notifications')} className={`relative rounded-xl p-2.5 transition ${isDarkMode ? 'text-[#9ca3af] hover:bg-white/[0.06] hover:text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`} aria-label={t('dashboard.ariaNotifications')}>
                <Bell className="h-5 w-5" strokeWidth={2} />
                {(metrics.unread > 0 || metrics.pendingCount > 0) && (
                  <span className={`absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ${isDarkMode ? 'ring-[#0D0D0F]' : 'ring-white'}`} />
                )}
              </button>
            </div>
          </header>
        )}

        {suiteLayout ? dashboardBody : (
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
            {dashboardBody}
          </div>
        )}
      </div>
    </div>

    <AddFriendModal
      isOpen={showAddFriendModal}
      onClose={() => setShowAddFriendModal(false)}
      onFriendlistChanged={() => setMetricsTick((t) => t + 1)}
    />

    {/* Welcome Greeting Modal (hiển thị 1 lần sau khi đăng nhập / vào web) */}
    <Modal
      isOpen={showWelcome}
      onClose={() => setShowWelcome(false)}
      title={t('dashboard.welcomeTitle')}
      size="sm"
    >
      <div className="space-y-4">
        <p className={`text-base font-semibold ${textHeading}`}>{getGreeting()}</p>
        <p className={`text-sm ${textMuted}`}>{t('dashboard.welcomeBody', { name: displayName })}</p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={modalSecondaryBtnSm} onClick={() => setShowWelcome(false)}>
            {t('dashboard.close')}
          </button>
          <GradientButton
            variant="primary"
            onClick={() => setShowWelcome(false)}
            className="px-4 py-2 text-sm"
          >
            {t('dashboard.startWork')}
          </GradientButton>
        </div>
      </div>
    </Modal>

    <Modal
      isOpen={weeklyDayModal !== null}
      onClose={() => setWeeklyDayModal(null)}
      title={weeklyDayModal ? formatWeeklyDayTitle(weeklyDayModal) : ''}
      size="md"
    >
      {weeklyDayModal && (
        <div className="space-y-3">
          <p className={`text-sm ${textMuted}`}>
            {weeklyDayModal.total > 0
              ? t('dashboard.weeklyDaySummary', {
                  total: weeklyDayModal.total,
                  tasks: weeklyDayModal.tasks,
                  messages: weeklyDayModal.messages,
                })
              : t('dashboard.weeklyDayEmpty')}
          </p>
          {weeklyDayModal.items?.length > 0 ? (
            <ul className="max-h-[min(360px,55vh)] space-y-2 overflow-y-auto scrollbar-overlay pr-1">
              {weeklyDayModal.items.map((item) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => {
                      if (item.path) {
                        navigate(item.path);
                        setWeeklyDayModal(null);
                      }
                    }}
                    className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
                      isDarkMode
                        ? 'border-emerald-500/20 bg-emerald-500/[0.06] hover:border-emerald-500/35 hover:bg-emerald-500/10'
                        : 'border-emerald-200 bg-emerald-50/80 hover:border-emerald-300 hover:bg-emerald-50'
                    }`}
                  >
                    <span className="mt-0.5 text-base">{item.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm font-semibold ${textHeading}`}>{item.title}</div>
                      <div className={`mt-0.5 text-xs leading-snug ${textMuted}`}>{item.detail}</div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </Modal>

    {/* Stat Detail Modal */}
    <Modal
      isOpen={selectedStat !== null}
      onClose={() => setSelectedStatKey(null)}
      title={selectedStat?.label || t('dashboard.statModalTitle')}
      size="lg"
    >
        {selectedStat && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <GlassCard className={modalGlass}>
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedStat.color} flex items-center justify-center text-3xl mb-4 mx-auto`}>
                  {selectedStat.icon}
                </div>
                <div className={`text-4xl font-black text-center mb-2 ${textHeading}`}>{selectedStat.value}</div>
                <div className={`${textMuted} text-center`}>{selectedStat.label}</div>
              </GlassCard>

              <GlassCard className={modalGlass}>
                <h4 className={`font-bold mb-4 ${textHeading}`}>{t('dashboard.modalStatsTitle')}</h4>
                <div className="space-y-3">

                  {Object.entries(selectedStat.drilldown || {}).filter(([key]) => !['projects', 'nguoiDongGopNhieuNhat', 'roles', 'channels'].includes(key)).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className={`${textMuted} capitalize`}>{key}:</span>
                      <span className={`font-bold ${textHeading}`}>{value}</span>

                    </div>
                  ))}
                </div>
              </GlassCard>
            </div>

            {selectedStat.key && getStatDetailRoute(selectedStat.key) && (
              <div className="flex flex-wrap justify-center gap-2">
                <GradientButton
                  variant="primary"
                  className="px-6 py-2.5 text-sm"
                  onClick={() => {
                    const link = getStatDetailRoute(selectedStat.key);
                    if (link) {
                      navigate(link.path);
                      setSelectedStatKey(null);
                    }
                  }}
                >
                  {getStatDetailRoute(selectedStat.key).cta}
                </GradientButton>
              </div>
            )}

            {Array.isArray(selectedStat.drilldown?.projects) && selectedStat.drilldown.projects.length > 0 && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.modalProjectsTitle')}</h4>
                <div className="space-y-3">
                  {selectedStat.drilldown.projects.map((project, idx) => (
                    <GlassCard key={idx} hover className={modalGlass}>
                      <div className="mb-3 flex items-center justify-between">
                        <h5 className={`font-bold ${textHeading}`}>{project.name}</h5>
                        <span className={`text-sm ${textMuted}`}>
                          {t('dashboard.deadlineLeft', { deadline: project.deadline })}
                        </span>
                      </div>
                      <div className="mb-2 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="h-2 w-full overflow-hidden rounded-full glass-strong">
                            <div className="h-full bg-gradient-to-r from-cyan-600 to-teal-600" style={{ width: `${project.progress}%` }} />
                          </div>
                        </div>
                        <span className={`text-sm font-bold ${textHeading}`}>{project.progress}%</span>
                      </div>
                      <div className={`text-xs ${textMuted}`}>
                        {t('dashboard.membersCount', { n: project.members })}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(selectedStat.drilldown?.nguoiDongGopNhieuNhat) && selectedStat.drilldown.nguoiDongGopNhieuNhat.length > 0 && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.topContributors')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.nguoiDongGopNhieuNhat.map((user, idx) => (
                    <div key={idx} className={modalRow}>
                      <div className="text-2xl">{user.avatar}</div>
                      <div className="flex-1">
                        <div className={`font-semibold ${textHeading}`}>{user.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {t('dashboard.tasksCount', { n: user.tasks })}
                        </div>
                      </div>
                      <div className="font-bold text-emerald-600 dark:text-green-400">#{idx + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(selectedStat.drilldown?.roles) && selectedStat.drilldown.roles.length > 0 && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.roleDistribution')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.roles.map((role, idx) => (
                    <div key={idx} className={modalRow}>
                      <div className="flex-1">
                        <div className={`font-semibold ${textHeading}`}>{role.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {t('dashboard.roleOnlineCount', { online: role.online, count: role.count })}
                        </div>
                      </div>
                      <div className="h-2 w-24 overflow-hidden rounded-full glass-strong">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-emerald-500"
                          style={{ width: `${(role.online / role.count) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(selectedStat.drilldown?.channels) && selectedStat.drilldown.channels.length > 0 && (
              <div>
                <h4 className={`mb-4 font-bold ${textHeading}`}>{t('dashboard.activeChannels')}</h4>
                <div className="space-y-2">
                  {selectedStat.drilldown.channels.map((channel, idx) => (
                    <div key={idx} className={modalRowBetween}>
                      <div>
                        <div className={`font-semibold ${textHeading}`}>{channel.name}</div>
                        <div className={`text-xs ${textMuted}`}>
                          {t('dashboard.messagesCount', { n: channel.messages })}
                        </div>
                      </div>
                      {channel.unread > 0 && (
                        <div className="rounded-full bg-red-500 px-2 py-1 text-xs font-bold text-white">{channel.unread}</div>
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
        title={t('dashboard.activityDetailTitle')}
        size="md"
      >
        {showActivityDetail && (
          <div className="space-y-4">
            <div className={modalHeroRow}>
              <div className={`flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br text-2xl ${showActivityDetail.color}`}>
                {showActivityDetail.avatar}
              </div>
              <div>
                <h3 className={`text-lg font-bold ${textHeading}`}>{showActivityDetail.user}</h3>
                <p className={`text-sm ${textMuted}`}>
                  {showActivityDetail.action} {showActivityDetail.item}
                </p>
                <p className={`text-sm ${textSub}`}>{showActivityDetail.time}</p>
              </div>
            </div>

            <GlassCard className={modalGlass}>
              <h4 className={`mb-3 font-bold ${textHeading}`}>{t('dashboard.info')}</h4>
              <div className="space-y-2">
                {(showActivityDetail.detailEntries || []).map((row, i) => (
                  <div key={i} className={`flex items-center justify-between py-2 ${modalDetailRowBorder}`}>
                    <span className={textMuted}>{row.label}</span>
                    <span className={`font-semibold ${textHeading}`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <div className="flex gap-3">
              <GradientButton
                variant="primary"
                className="flex-1 text-sm"
                onClick={() => {
                  const act = showActivityDetail;
                  setShowActivityDetail(null);
                  navigateFromActivityType(act.type);
                }}
              >
                {t('dashboard.viewDetail')}
              </GradientButton>
              <button
                type="button"
                onClick={async () => {
                  const line = `${showActivityDetail.user} ${showActivityDetail.action} ${showActivityDetail.item}`;
                  try {
                    await navigator.clipboard.writeText(line);
                    toast.success(t('dashboard.copyOk'));
                  } catch {
                    toast(line, { icon: '📋' });
                  }
                }}
                className={`flex-1 ${modalSecondaryBtn}`}
              >
                {t('dashboard.share')}
              </button>
            </div>
          </div>
        )}
    </Modal>

    {/* New Project Modal */}
    <Modal
        isOpen={showNewProjectModal}
        onClose={() => setShowNewProjectModal(false)}
        title={t('dashboard.newProjectTitle')}
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <label className={modalLabel}>{t('dashboard.projectName')}</label>
            <input
              type="text"
              placeholder={t('dashboard.projectNamePh')}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`}
            />
          </div>

          <div>
            <label className={modalLabel}>{t('dashboard.projectDescLabel')}</label>
            <textarea
              placeholder={t('dashboard.projectDescPh')}
              rows={4}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={modalLabel}>{t('dashboard.projectStartDate')}</label>
              <input type="date" className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`} />
            </div>
            <div>
              <label className={modalLabel}>{t('dashboard.projectDeadline')}</label>
              <input type="date" className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${inputSurface}`} />
            </div>
          </div>

          <div>
            <label className={modalLabel}>{t('dashboard.membersSection')}</label>
            <button
              type="button"
              className={`text-sm transition-colors ${accentText} hover:underline`}
              onClick={() => toast(t('dashboard.toastInviteLater'), { icon: 'ℹ️' })}
            >
              {t('dashboard.addMemberBtn')}
            </button>
          </div>

          <div className="flex gap-3 pt-4">
            <GradientButton
              variant="primary"
              className="flex-1 text-sm"
              onClick={() => {
                toast.success(t('dashboard.projectCreated'));
                setShowNewProjectModal(false);
              }}
            >
              {t('dashboard.createProjectBtn')}
            </GradientButton>
            <button type="button" onClick={() => setShowNewProjectModal(false)} className={`flex-1 ${modalSecondaryBtn}`}>
              {t('nav.cancel')}
            </button>
          </div>
        </div>
    </Modal>

    {!suiteLayout && (
    <DashboardGlobalSearchModal
      isOpen={quickNavOpen}
      onClose={() => setQuickNavOpen(false)}
      layer1Query={searchQuery}
    />
    )}

  </>
  );
}

export default DashboardPage;

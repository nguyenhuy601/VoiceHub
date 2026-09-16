import { useAppStrings } from '../../locales/appStrings';
import NotificationsPage from '../../pages/Notifications/NotificationsPage';

/**
 * Thông báo tổ chức trong workspace — cùng Inbox gold với Communicate / company route.
 * Dữ liệu thật qua NotificationsPage (scope organization).
 */
export default function OrganizationNotificationsWorkspacePanel({
  organizationId,
  organizationSlug: _organizationSlug = '',
  isDarkMode: _isDarkMode,
  fetchEnabled = true,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const { isAuthenticated, loading: authLoading } = useAuth();
  const hasToken = Boolean(getToken());
  const [filter, setFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [notifications, setNotifications] = useState([]);

  const notifInfiniteQuery = useNotificationsInfinite({
    scope: 'organization',
    organizationId,
    enabled:
      fetchEnabled &&
      !authLoading &&
      isAuthenticated &&
      hasToken &&
      Boolean(organizationId),
  });

  const getRelativeTime = (input) => {
    if (!input) return t('time.justNow');
    const target = new Date(input).getTime();
    if (!Number.isFinite(target)) return t('time.justNow');
    const diffMinutes = Math.max(1, Math.floor((Date.now() - target) / 60000));
    if (diffMinutes < 60) return t('time.minutesAgo', { n: diffMinutes });
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
    const diffDays = Math.floor(diffHours / 24);
    return t('time.daysAgo', { n: diffDays });
  };

  const iconByType = {
    task: '✅',
    task_assigned: '✅',
    task_completed: '✅',
    mention: '💬',
    message: '💬',
    deadline: '⏰',
    meeting: '📅',
    file: '📁',
    document: '📁',
    friend: '👥',
    system: '🔔',
    org_join_application: '🏢',
  };

  const toViewNotification = useCallback(
    (item) => {
      const data = parseNotificationDataField(item?.data);
      const id = item?._id || item?.id;
      const rawType = String(item?.type || 'system');
      const type = mapNotificationUiType(rawType, data?.kind);
      return {
        id,
        type,
        rawType,
        icon: iconByType[type] || iconByType[rawType] || '🔔',
        title: item?.title || t('notifications.defaultTitle'),
        message: item?.content || item?.message || '',
        time: getRelativeTime(item?.createdAt),
        read: Boolean(item?.isRead),
        createdAt: item?.createdAt,
        actionUrl: String(item?.actionUrl || '').trim(),
        organizationSlug:
          data?.workspaceSlug || data?.organizationSlug || organizationSlug || '',
        organizationId:
          data?.workspaceId || data?.organizationId || organizationId || '',
        data,
      };
    },
    [t, organizationId, organizationSlug]
  );

  useEffect(() => {
    const pages = notifInfiniteQuery.data?.pages || [];
    const list = pages.flatMap((p) => (Array.isArray(p?.notifications) ? p.notifications : []));
    setNotifications(list.map(toViewNotification));
  }, [notifInfiniteQuery.data, toViewNotification]);

  const notifFilterOptions = useMemo(
    () => [
      { id: 'all', label: t('notifications.filterAll'), icon: '📋' },
      { id: 'unread', label: t('notifications.filterUnread'), icon: '⭐' },
      { id: 'task', label: t('notifications.filterTasks'), icon: '✅' },
      { id: 'deadline', label: t('notifications.filterDeadline'), icon: '⏰' },
      { id: 'mention', label: t('common.mentions'), icon: '💬' },
    ],
    [t]
  );

  const filteredNotifications = useMemo(() => {
    let list =
      filter === 'all'
        ? notifications
        : filter === 'unread'
          ? notifications.filter((n) => !n.read)
          : notifications.filter((n) => n.type === filter);
    const q = notifSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) =>
      `${n.title || ''} ${n.message || ''} ${n.type || ''}`.toLowerCase().includes(q)
    );
  }, [notifications, filter, notifSearch]);

  const selected = useMemo(
    () => filteredNotifications.find((n) => n.id === selectedId) || null,
    [filteredNotifications, selectedId]
  );

  const muted = isDarkMode ? 'text-[#8e9297]' : 'text-slate-500';
  const title = isDarkMode ? 'text-white' : 'text-slate-900';
  const listBorder = isDarkMode ? 'border-white/[0.06]' : 'border-slate-200/80';
  const listItemActive = isDarkMode
    ? 'bg-cyan-500/15 border-cyan-500/40 text-white'
    : 'bg-cyan-50 border-cyan-300 text-slate-900';
  const listItemIdle = isDarkMode
    ? 'border-transparent hover:bg-white/[0.05] text-slate-200'
    : 'border-transparent hover:bg-slate-50 text-slate-800';

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('notifications.markReadErr') }));
    }
  };

  const handleOpenTarget = (notif) => {
    if (!notif) return;
    if (!notif.read) handleMarkAsRead(notif.id);

    if (isVoiceRoomInviteNotification(notif)) {
      const invitePath = resolveVoiceRoomInvitePath(notif);
      navigate(invitePath || '/app/communicate/voice');
      return;
    }

    const appPath = resolveNotificationAppPath(notif);
    if (appPath) {
      navigate(appPath);
      return;
    }

    const orgId = String(notif.organizationId || organizationId || '').trim();
    if (orgId) {
      switch (notif.type) {
        case 'task':
        case 'deadline':
          navigate(buildCollaborateTasksPath(orgId));
          break;
        case 'file':
          navigate(buildCollaborateDocumentsPath(orgId));
          break;
        default:
          navigate(buildCommunicateChannelsPath());
          break;
      }
      return;
    }
    navigate('/app/collaborate/workspaces');
  };

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <NotificationsPage
        orgScope
        embedded
        organizationIdOverride={orgId}
        fetchEnabled={fetchEnabled && Boolean(orgId)}
        pageTitle={t('notifications.titleOrganization')}
      />
    </div>
  );
}

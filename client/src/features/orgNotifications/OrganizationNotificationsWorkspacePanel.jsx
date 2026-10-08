import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Calendar,
  CheckSquare,
  ClipboardList,
  FileText,
  Folder,
  ListChecks,
  MessageCircle,
  Star,
  Users,
} from 'lucide-react';
import {
  buildCollaborateDocumentsPath,
  buildCollaborateTasksPath,
  buildCommunicateChannelsPath,
} from '../../utils/suitePathUtils';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { PageSearchToolbar, SearchFilterChips } from '../search';
import { useNotificationsInfinite } from '../../hooks/queries';
import { getToken } from '../../utils/tokenStorage';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { queryKeys } from '../../lib/queryKeys';
import {
  resolveVoiceRoomInvitePath,
  isVoiceRoomInviteNotification,
  resolveNotificationAppPath,
} from '../../utils/notificationNavigation';
import { mapNotificationUiType } from '../../utils/notificationP0Policy';
import {
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';

function parseNotificationDataField(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

const ICON_BY_TYPE = {
  task: CheckSquare,
  task_assigned: CheckSquare,
  task_completed: CheckSquare,
  mention: MessageCircle,
  message: MessageCircle,
  deadline: Calendar,
  meeting: Calendar,
  file: Folder,
  document: FileText,
  friend: Users,
  system: Bell,
  org_join_application: Users,
};

function NotificationTypeIcon({ type, rawType, size = 18, className = '' }) {
  const Icon = ICON_BY_TYPE[type] || ICON_BY_TYPE[rawType] || Bell;
  return <Icon size={size} className={className} aria-hidden="true" />;
}

/**
 * Thông báo tổ chức trong khung giữa workspace — danh sách trái, chi tiết phải.
 */
export default function OrganizationNotificationsWorkspacePanel({
  organizationId,
  organizationSlug = '',
  isDarkMode,
  fetchEnabled = true,
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
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

  const getRelativeTime = useCallback(
    (input) => {
      if (!input) return t('time.justNow');
      const target = new Date(input).getTime();
      if (!Number.isFinite(target)) return t('time.justNow');
      const diffMinutes = Math.max(1, Math.floor((Date.now() - target) / 60000));
      if (diffMinutes < 60) return t('time.minutesAgo', { n: diffMinutes });
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return t('time.hoursAgo', { n: diffHours });
      const diffDays = Math.floor(diffHours / 24);
      return t('time.daysAgo', { n: diffDays });
    },
    [t]
  );

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
        title: item?.title || t('notifications.defaultTitle'),
        message: item?.content || item?.message || '',
        time: getRelativeTime(item?.createdAt),
        read: Boolean(item?.isRead),
        createdAt: item?.createdAt,
        actionUrl: String(item?.actionUrl || '').trim(),
        organizationSlug:
          data?.workspaceSlug || data?.organizationSlug || organizationSlug || '',
        organizationId: data?.workspaceId || data?.organizationId || organizationId || '',
        data,
      };
    },
    [t, organizationId, organizationSlug, getRelativeTime]
  );

  useEffect(() => {
    const pages = notifInfiniteQuery.data?.pages || [];
    const list = pages.flatMap((p) => (Array.isArray(p?.notifications) ? p.notifications : []));
    setNotifications(list.map(toViewNotification));
  }, [notifInfiniteQuery.data, toViewNotification]);

  const notifFilterOptions = useMemo(
    () => [
      {
        id: 'all',
        label: t('notifications.filterAll'),
        icon: <ClipboardList size={12} aria-hidden="true" className="inline" />,
      },
      {
        id: 'unread',
        label: t('notifications.filterUnread'),
        icon: <Star size={12} aria-hidden="true" className="inline" />,
      },
      {
        id: 'task',
        label: t('notifications.filterTasks'),
        icon: <ListChecks size={12} aria-hidden="true" className="inline" />,
      },
      {
        id: 'deadline',
        label: t('notifications.filterDeadline'),
        icon: <Calendar size={12} aria-hidden="true" className="inline" />,
      },
      {
        id: 'mention',
        label: t('common.mentions'),
        icon: <MessageCircle size={12} aria-hidden="true" className="inline" />,
      },
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

  const invalidateNotificationCaches = useCallback(async () => {
    const orgId = String(organizationId || '').trim();
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.infinite('organization', orgId),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.badge('organization', orgId),
      }),
    ]);
  }, [organizationId, queryClient]);

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      await invalidateNotificationCaches();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('notifications.markReadErr') }));
    }
  };

  const handleOpenTarget = async (notif) => {
    if (!notif) return;
    if (!notif.read) await handleMarkAsRead(notif.id);

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

  const showSkeleton =
    fetchEnabled && notifInfiniteQuery.isLoading && notifications.length === 0;
  const showError = fetchEnabled && notifInfiniteQuery.isError && notifications.length === 0;
  const showEmpty =
    fetchEnabled && !showSkeleton && !showError && filteredNotifications.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col px-3 py-3 text-foreground">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-foreground">{t('notifications.titleOrganization')}</h3>
        <p className="text-[11px] text-muted-foreground">{t('notifications.scopeOrganizationHint')}</p>
      </div>

      <PageSearchToolbar
        className="mb-3"
        value={notifSearch}
        onChange={setNotifSearch}
        placeholder={t('notifications.searchPlaceholder')}
        isDarkMode={isDarkMode}
        id="workspace-org-notifications-search"
        aria-label={t('searchUi.searchAria')}
      >
        <SearchFilterChips
          aria-label={t('notifications.filtersAria')}
          options={notifFilterOptions}
          value={filter}
          onChange={setFilter}
          isDarkMode={isDarkMode}
          size="sm"
          className="motion-safe:[&_button]:transition-colors motion-reduce:[&_button]:transition-none"
        />
      </PageSearchToolbar>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex w-[min(100%,300px)] shrink-0 flex-col border-r border-border bg-muted/40">
          <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto p-2">
            {!fetchEnabled ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t('notifications.loading')}</p>
            ) : showSkeleton ? (
              <div className="space-y-2" role="status" aria-live="polite">
                <span className="sr-only">{t('notifications.loading')}</span>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 rounded-lg bg-muted motion-safe:animate-pulse motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : showError ? (
              <div role="alert" className="rounded-lg border border-border px-3 py-6 text-center">
                <p className="mb-3 text-xs text-muted-foreground">
                  {resolveApiErrorMessage(notifInfiniteQuery.error, {
                    t,
                    fallback: t('notifications.loadFail'),
                  })}
                </p>
                <button
                  type="button"
                  className={adminSecondaryBtnClass('text-xs')}
                  onClick={() => notifInfiniteQuery.refetch()}
                >
                  {t('common.retry')}
                </button>
              </div>
            ) : showEmpty ? (
              <p className="py-8 text-center text-xs text-muted-foreground">{t('notifications.emptyOrg')}</p>
            ) : (
              <>
                <ul className="space-y-1">
                  {filteredNotifications.map((notif) => {
                    const active = selectedId === notif.id;
                    return (
                      <li key={notif.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(notif.id)}
                          aria-current={active ? 'true' : undefined}
                          className={`flex w-full items-start gap-2 rounded-lg border px-2 py-2 text-left motion-safe:transition-colors motion-reduce:transition-none ${
                            active
                              ? 'border-primary/40 bg-primary/10 text-foreground'
                              : 'border-transparent text-foreground hover:bg-muted'
                          }`}
                        >
                          <NotificationTypeIcon type={notif.type} rawType={notif.rawType} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 truncate text-xs font-semibold text-foreground">
                              {notif.title}
                              {!notif.read ? (
                                <span
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                                  aria-hidden="true"
                                />
                              ) : null}
                            </span>
                            <span className="line-clamp-2 text-[10px] text-muted-foreground">
                              {notif.message}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-muted-foreground">
                              {notif.time}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {notifInfiniteQuery.hasNextPage ? (
                  <div className="mt-2 px-1 pb-1">
                    <button
                      type="button"
                      className={adminSecondaryBtnClass('w-full text-xs')}
                      aria-busy={notifInfiniteQuery.isFetchingNextPage}
                      disabled={notifInfiniteQuery.isFetchingNextPage}
                      onClick={() => notifInfiniteQuery.fetchNextPage()}
                    >
                      {notifInfiniteQuery.isFetchingNextPage
                        ? t('common.loading')
                        : t('notifications.loadMore')}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-card p-4">
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Bell size={36} className="mb-3 opacity-50" aria-hidden="true" />
              <p className="text-sm font-medium">{t('notifications.orgPickHint')}</p>
            </div>
          ) : (
            <div className="mx-auto max-w-lg motion-safe:animate-fade-in-fast">
              <div className="mb-3 flex items-start gap-3">
                <NotificationTypeIcon type={selected.type} rawType={selected.rawType} size={28} />
                <div className="min-w-0 flex-1">
                  <h4 className="text-base font-bold text-foreground">{selected.title}</h4>
                  <p className="mt-1 text-xs text-muted-foreground">{selected.time}</p>
                </div>
                {!selected.read ? (
                  <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                    {t('common.newBadge')}
                  </span>
                ) : null}
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                {selected.message || '—'}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenTarget(selected)}
                  className={adminPrimaryBtnClass('text-xs')}
                >
                  {t('notifications.actionOpen')}
                </button>
                {!selected.read ? (
                  <button
                    type="button"
                    onClick={() => handleMarkAsRead(selected.id)}
                    className={adminSecondaryBtnClass('text-xs')}
                  >
                    {t('notifications.markRead')}
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

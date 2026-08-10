import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/Shared';
import { useSocket } from '../../context/SocketContext';
import { useWorkspace } from '../../context/WorkspaceContext';
import { useAppStrings } from '../../locales/appStrings';
import api from '../../services/api';
import friendService from '../../services/friendService';
import NotificationsFigmaView from '../../components/Notifications/NotificationsFigmaView';
import {
  NOTIFICATIONS_REFRESH_EVENT,
  markFriendNotificationsResolved,
  markVoiceRoomJoinRequestNotificationsResolved,
} from '../../services/notificationSync';
import { useFriendPending, useNotificationsInfinite, useOrganizationsMy } from '../../hooks/queries';
import { useOrgShell } from '../../hooks/queries/useOrgShell';
import { queryKeys } from '../../lib/queryKeys';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { findOrgBySlug, orgRecordId } from '../../utils/orgListUtils';
import {
  buildCollaborateDocumentsPath,
  buildCollaborateTasksPath,
  buildCommunicateChannelsPath,
} from '../../utils/suitePathUtils';
import {
  isVoiceRoomInviteNotification,
  resolveVoiceRoomInvitePath,
} from '../../utils/notificationNavigation';
import { isP0Notification } from '../../utils/notificationP0Policy';

function getNotificationTimeGroup(createdAt) {
  if (!createdAt) return 'earlier';
  const target = new Date(createdAt);
  if (!Number.isFinite(target.getTime())) return 'earlier';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const t0 = startOf(target);
  const now = new Date();
  const today0 = startOf(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (t0 === today0) return 'today';
  if (t0 === startOf(yesterday)) return 'yesterday';
  return 'earlier';
}

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

function rawNotificationHasOrgScope(item) {
  const data = parseNotificationDataField(item?.data);
  const orgId = data?.organizationId || data?.workspaceId || '';
  return Boolean(String(orgId).trim());
}

const ORG_NOTIFICATIONS_PATH = '/notifications/organization';
const COLLABORATE_NOTIFICATIONS_PATH = '/app/collaborate/notifications';

function unwrapApiBody(res) {
  const body = res?.data;
  if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return body.data;
  }
  return body ?? null;
}

function resolveNotificationOrgId(notif, { organizations = [], organizationIdFilter = '' } = {}) {
  const data = notif?.data && typeof notif.data === 'object' ? notif.data : {};
  const direct = String(
    notif?.organizationId ||
      data?.organizationId ||
      data?.workspaceId ||
      ''
  ).trim();
  if (direct) return direct;

  const slug = String(notif?.organizationSlug || data?.organizationSlug || data?.workspaceSlug || '').trim();
  if (slug) {
    const matched = findOrgBySlug(organizations, slug);
    const id = orgRecordId(matched);
    if (id) return String(id);
  }

  return String(organizationIdFilter || '').trim();
}

function getNotifActionKind(notif) {
  if (!notif || notif.read || notif.data?.resolved) return 'none';
  if (notif.data?.kind === 'voice_room_join_request') return 'voice_join';
  if (isVoiceRoomInviteNotification(notif)) return 'voice_invite';
  if (notif.rawType === 'friend_request') return 'friend_request';
  return 'navigate';
}

function NotificationsPage({ orgScope = false } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t } = useAppStrings();
  const { activeWorkspace } = useWorkspace();
  const isOrgNotificationsPage =
    orgScope ||
    location.pathname.startsWith(COLLABORATE_NOTIFICATIONS_PATH) ||
    location.pathname.startsWith(ORG_NOTIFICATIONS_PATH);
  const notificationScope = isOrgNotificationsPage ? 'organization' : 'personal';
  const organizationIdFilter = useMemo(() => {
    const fromQuery = String(searchParams.get('organizationId') || searchParams.get('orgId') || '').trim();
    if (fromQuery) return fromQuery;
    if (!isOrgNotificationsPage) return '';
    return (
      activeWorkspace?._id ||
      activeWorkspace?.id ||
      activeWorkspace?.organizationId ||
      ''
    );
  }, [
    searchParams,
    isOrgNotificationsPage,
    activeWorkspace?._id,
    activeWorkspace?.id,
    activeWorkspace?.organizationId,
  ]);

  const orgsQuery = useOrganizationsMy();

  /** URL cũ ?scope=organization → trang org riêng */
  useEffect(() => {
    const legacyScope = String(searchParams.get('scope') || '').trim().toLowerCase();
    if (location.pathname !== '/notifications' || legacyScope !== 'organization') return;
    const params = new URLSearchParams(searchParams);
    params.delete('scope');
    const qs = params.toString();
    navigate(`${COLLABORATE_NOTIFICATIONS_PATH}${qs ? `?${qs}` : ''}`, { replace: true });
  }, [location.pathname, navigate, searchParams]);

  const [filter, setFilter] = useState('all');
  const [notifSearch, setNotifSearch] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [deleteNotifConfirmId, setDeleteNotifConfirmId] = useState(null);
  const [actingNotifId, setActingNotifId] = useState('');
  const { on, off } = useSocket();
  const queryClient = useQueryClient();

  const notifInfiniteQuery = useNotificationsInfinite({
    scope: notificationScope,
    organizationId: organizationIdFilter,
  });

  const { pendingCount: friendPendingCount } = useFriendPending({
    enabled: !isOrgNotificationsPage,
  });

  const { data: orgShellForBadge } = useOrgShell(organizationIdFilter, {
    enabled: isOrgNotificationsPage && Boolean(organizationIdFilter),
  });

  useEffect(() => {
    if (!isOrgNotificationsPage || !organizationIdFilter || !orgShellForBadge) return;
    const unread = Number(orgShellForBadge?.badges?.notificationsUnreadOrg);
    if (!Number.isFinite(unread)) return;
    queryClient.setQueryData(
      queryKeys.notifications.badge('organization', organizationIdFilter),
      { unreadCount: Math.max(0, unread) },
      { updatedAt: Date.now() }
    );
  }, [isOrgNotificationsPage, organizationIdFilter, orgShellForBadge, queryClient]);

  const notificationsLoading = notifInfiniteQuery.isLoading;

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

  const parseNotificationData = (item) => parseNotificationDataField(item?.data);

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

  const getActionLabel = (rawType, mappedType) => {
    const r = String(rawType || '');
    if (r === 'task' || r === 'task_assigned' || r === 'task_completed') return t('notifications.actionTask');
    if (r === 'mention' || r === 'message') return t('notifications.actionChat');
    if (r === 'deadline') return t('notifications.actionUpdate');
    if (r === 'meeting') return t('notifications.actionJoin');
    if (r === 'file' || r === 'document') return t('notifications.actionFile');
    if (r === 'friend' || r === 'friend_request' || r === 'friend_accepted') return t('notifications.actionFriend');
    if (r === 'org_join_application') return t('notifications.actionJoinApp');
    if (r === 'system') return t('notifications.actionDetail');
    const m = String(mappedType || '');
    if (m === 'task') return t('notifications.actionTask');
    if (m === 'mention') return t('notifications.actionChat');
    if (m === 'friend') return t('notifications.actionFriend');
    return t('notifications.actionDetail');
  };

  const toViewNotification = (item) => {
    const data = parseNotificationData(item);
    const id = item?._id || item?.id;
    const rawType = String(item?.type || 'system');
    const type =
      rawType === 'friend_request' || rawType === 'friend_accepted'
        ? 'friend'
        : rawType === 'task_assigned' || rawType === 'task_completed'
          ? 'task'
          : rawType === 'document'
            ? 'file'
            : rawType === 'message'
              ? 'mention'
              : rawType === 'org_join_application'
                ? 'system'
                : rawType;
    const orgLabel =
      data?.workspaceName ||
      data?.organizationName ||
      data?.companyName ||
      item?.workspaceName ||
      item?.organizationName ||
      item?.companyName ||
      '';
    const orgSlug =
      data?.workspaceSlug ||
      data?.organizationSlug ||
      item?.workspaceSlug ||
      item?.organizationSlug ||
      '';
    const orgId =
      data?.workspaceId ||
      data?.organizationId ||
      item?.workspaceId ||
      item?.organizationId ||
      '';
    const actionUrl = String(item?.actionUrl || '').trim();
    return {
      id,
      type,
      rawType,
      icon: iconByType[rawType] || iconByType[type] || '🔔',
      title: item?.title || t('notifications.defaultTitle'),
      message: item?.content || item?.message || '',
      time: getRelativeTime(item?.createdAt),
      read: Boolean(item?.isRead),
      priority: data?.priority || 'low',
      action: getActionLabel(rawType, type),
      actionUrl,
      data,
      organizationLabel: orgLabel,
      organizationName: orgLabel,
      organizationSlug: orgSlug,
      organizationId: orgId,
      createdAt: item?.createdAt || null,
      timeGroup: getNotificationTimeGroup(item?.createdAt),
      /** Chuông + badge đỏ giống sidebar (chủ yếu lời mời kết bạn) */
      useBellCard: rawType === 'friend_request' || type === 'friend',
    };
  };

  useEffect(() => {
    const pages = notifInfiniteQuery.data?.pages || [];
    const list = pages.flatMap((p) => (Array.isArray(p?.notifications) ? p.notifications : []));
    setNotifications(list.map(toViewNotification));
  }, [notifInfiniteQuery.data]);

  useEffect(() => {
    if (notifInfiniteQuery.isError) {
      const err = notifInfiniteQuery.error;
      const msg = resolveApiErrorMessage(err, { t, fallback: t('notifications.loadFail') });
      toast.error(msg);
    }
  }, [notifInfiniteQuery.isError, notifInfiniteQuery.error, t]);

  const reloadNotifications = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.notifications.infinite(notificationScope, organizationIdFilter),
    });
  }, [queryClient, notificationScope, organizationIdFilter]);

  /** Đồng bộ sau accept/reject kết bạn (cùng tab hoặc sau markFriendNotificationsResolved) */
  useEffect(() => {
    const onRefresh = () => reloadNotifications();
    window.addEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(NOTIFICATIONS_REFRESH_EVENT, onRefresh);
  }, [reloadNotifications]);

  useEffect(() => {
    if (!on || !off) return;

    const upsertNotification = (raw) => {
      const inOrg = rawNotificationHasOrgScope(raw);
      if (notificationScope === 'organization' && !inOrg) return;
      if (notificationScope === 'personal' && inOrg) return;
      if (notificationScope === 'organization' && organizationIdFilter) {
        const data = parseNotificationDataField(raw?.data);
        const oid = String(data?.organizationId || data?.workspaceId || '').trim();
        if (oid && oid !== organizationIdFilter) return;
      }
      const item = toViewNotification(raw);
      setNotifications((prev) => {
        if (!item?.id) return prev;
        const exists = prev.some((n) => n.id === item.id);
        if (exists) {
          return prev.map((n) => (n.id === item.id ? { ...n, ...item } : n));
        }
        return [item, ...prev];
      });
    };

    const handleNotificationNew = (payload) => {
      if (payload?.notification) {
        upsertNotification(payload.notification);
      }
    };

    const handleNotificationBulk = (payload) => {
      const list = Array.isArray(payload?.notifications) ? payload.notifications : [];
      list.forEach((item) => upsertNotification(item));
    };

    const handleRead = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.map((n) => (String(n.id) === String(targetId) ? { ...n, read: true } : n)));
    };

    const handleReadAll = () => {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    };

    const handleReadMany = (payload) => {
      const ids = new Set((payload?.notificationIds || []).map(String));
      if (ids.size === 0) return;
      setNotifications((prev) =>
        prev.map((n) =>
          ids.has(String(n.id))
            ? { ...n, read: true, data: { ...(n.data || {}), resolved: true } }
            : n
        )
      );
    };

    const handleDeleted = (payload) => {
      const targetId = payload?.notificationId;
      if (!targetId) return;
      setNotifications((prev) => prev.filter((n) => String(n.id) !== String(targetId)));
    };

    const handleDeletedReadAll = () => {
      setNotifications((prev) => prev.filter((n) => !n.read));
    };

    on('notification:new', handleNotificationNew);
    on('notification:bulk_new', handleNotificationBulk);
    on('notification:read', handleRead);
    on('notification:read_many', handleReadMany);
    on('notification:read_all', handleReadAll);
    on('notification:deleted', handleDeleted);
    on('notification:deleted_read_all', handleDeletedReadAll);

    return () => {
      off('notification:new', handleNotificationNew);
      off('notification:bulk_new', handleNotificationBulk);
      off('notification:read', handleRead);
      off('notification:read_many', handleReadMany);
      off('notification:read_all', handleReadAll);
      off('notification:deleted', handleDeleted);
      off('notification:deleted_read_all', handleDeletedReadAll);
    };
  }, [on, off, notificationScope, organizationIdFilter]);

  const markNotifResolvedLocal = useCallback((notifId, patchData = {}) => {
    if (!notifId) return;
    setNotifications((prev) =>
      prev.map((n) =>
        String(n.id) === String(notifId)
          ? {
              ...n,
              read: true,
              data: { ...(n.data || {}), resolved: true, ...patchData },
            }
          : n
      )
    );
  }, []);

  const resolveVoiceJoinRequestId = async (notif) => {
    const roomId = String(notif?.data?.roomId || '').trim();
    let requestId = String(notif?.data?.requestId || '').trim();
    if (requestId || !roomId) return { roomId, requestId };
    const requestUserId = String(notif?.data?.requestUserId || '').trim();
    try {
      const res = await api.get(`/voice/rooms/${encodeURIComponent(roomId)}/join-requests`, {
        skipGlobalErrorHandling: true,
      });
      const rows = unwrapApiBody(res);
      const list = Array.isArray(rows) ? rows : [];
      const match = requestUserId
        ? list.find((r) => String(r.userId) === requestUserId)
        : list[0];
      requestId = match?.id ? String(match.id) : '';
    } catch {
      requestId = '';
    }
    return { roomId, requestId };
  };

  const handleApproveVoiceJoin = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    setActingNotifId(notif.id);
    try {
      const { roomId, requestId } = await resolveVoiceJoinRequestId(notif);
      if (!roomId || !requestId) {
        toast.error(t('notifications.toastVoiceApproveFail'));
        return;
      }
      await api.post(
        `/voice/rooms/${encodeURIComponent(roomId)}/join-requests/${encodeURIComponent(requestId)}/approve`,
        {},
        { skipGlobalErrorHandling: true }
      );
      await markVoiceRoomJoinRequestNotificationsResolved({
        roomId,
        requestId,
        requestUserId: notif.data?.requestUserId,
      });
      markNotifResolvedLocal(notif.id);
      toast.success(t('notifications.toastVoiceApproved'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('notifications.toastVoiceApproveFail') }));
    } finally {
      setActingNotifId('');
    }
  };

  const handleAcceptFriendRequest = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    const counterpartyId = String(notif?.data?.userId || notif?.data?.friendId || '').trim();
    if (!counterpartyId) return;
    setActingNotifId(notif.id);
    try {
      await friendService.acceptFriend(counterpartyId);
      await markFriendNotificationsResolved(counterpartyId);
      markNotifResolvedLocal(notif.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      toast.success(t('notifications.toastFriendAccepted'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('notifications.toastFriendActionFail') }));
    } finally {
      setActingNotifId('');
    }
  };

  const handleRejectFriendRequest = async (notif) => {
    if (!notif?.id || actingNotifId) return;
    const counterpartyId = String(notif?.data?.userId || notif?.data?.friendId || '').trim();
    if (!counterpartyId) return;
    setActingNotifId(notif.id);
    try {
      await friendService.rejectFriend(counterpartyId);
      await markFriendNotificationsResolved(counterpartyId);
      markNotifResolvedLocal(notif.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.friends.all });
      toast.success(t('notifications.toastFriendRejected'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('notifications.toastFriendActionFail') }));
    } finally {
      setActingNotifId('');
    }
  };

  const handleMarkAsRead = async (id) => {
    if (!id) return;
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      toast.success(t('notifications.markRead'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('notifications.markReadErr') }));
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch('/notifications/read-all', {}, { skipGlobalErrorHandling: true });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      toast.success(t('notifications.markAllRead'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('notifications.markAllErr') }));
    }
  };

  const confirmDeleteNotification = async () => {
    const id = deleteNotifConfirmId;
    if (!id) return;
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success(t('notifications.deleted'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('notifications.deleteErr') }));
    }
  };

  const handleOpenNotification = (notif) => {
    if (!notif) return;

    // Mark as read immediately when user opens a notification target
    if (!notif.read) {
      handleMarkAsRead(notif.id);
    }

    const orgId = resolveNotificationOrgId(notif, {
      organizations: orgsQuery.data || [],
      organizationIdFilter,
    });
    const targetWorkspacePath = orgId ? buildCommunicateChannelsPath(orgId) : null;

    if (notif.rawType === 'message') {
      const senderId = String(
        notif.data?.senderId || notif.data?.friendId || ''
      ).trim();
      const fromAction = (() => {
        const url = String(notif.actionUrl || '');
        const m = url.match(/[?&]openDmUserId=([^&]+)/);
        return m ? decodeURIComponent(m[1]) : '';
      })();
      const peerId = senderId || fromAction;
      if (peerId) {
        navigate(`/app/communicate/chat/friends?openDmUserId=${encodeURIComponent(peerId)}`);
      } else {
        navigate('/app/communicate/chat/friends');
      }
      toast(t('notifications.toastOpenFriendChat'), { icon: '💬' });
      return;
    }

    switch (notif.type) {
      case 'mention':
        navigate(targetWorkspacePath || '/app/communicate/channels');
        toast(t('notifications.toastOpenOrgChat'), { icon: '💬' });
        break;
      case 'friend':
        navigate('/app/communicate/chat/friends?tab=requests');
        toast(t('notifications.toastOpenFriendReq'), { icon: '👥' });
        break;
      case 'meeting':
        if (
          isVoiceRoomInviteNotification(notif) ||
          notif.data?.kind === 'voice_room_join_request'
        ) {
          if (isVoiceRoomInviteNotification(notif)) {
            const invitePath = resolveVoiceRoomInvitePath(notif);
            navigate(invitePath || '/app/communicate/voice');
            toast(t('notifications.toastOpenVoiceRoom'), { icon: '🎙️' });
            break;
          }
          const voiceUrl = String(notif.actionUrl || '').trim();
          if (voiceUrl.startsWith('/app/communicate/voice')) {
            navigate(voiceUrl);
          } else if (voiceUrl.startsWith('/voice')) {
            navigate(voiceUrl.replace(/^\/voice/, '/app/communicate/voice'));
          } else if (notif.data?.roomId) {
            navigate(`/app/communicate/voice/${encodeURIComponent(notif.data.roomId)}`);
          } else {
            navigate('/app/communicate/voice');
          }
          toast(t('notifications.toastOpenVoiceRoom'), { icon: '🎙️' });
        } else {
          navigate('/app/me/calendar');
          toast(t('notifications.toastOpenCalendar'), { icon: '📅' });
        }
        break;
      case 'system': {
        const url = String(notif.actionUrl || notif.data?.actionUrl || '').trim();
        if (url.startsWith('/app/')) {
          navigate(url);
        } else {
          navigate(targetWorkspacePath || '/app/me/settings');
        }
        toast(t('notifications.toastOpenSettings'), { icon: '⚙️' });
        break;
      }
      case 'task':
      case 'deadline':
        navigate(
          orgId ? buildCollaborateTasksPath(orgId) : '/app/collaborate/tasks'
        );
        toast(t('notifications.toastOpenTasks'), { icon: '✅' });
        break;
      case 'file':
        navigate(
          orgId ? buildCollaborateDocumentsPath(orgId) : '/app/collaborate/documents'
        );
        toast(t('notifications.toastOpenDocs'), { icon: '📁' });
        break;
      default:
        navigate(targetWorkspacePath || '/app/me/dashboard');
        toast(t('notifications.toastOpenDetail'), { icon: 'ℹ️' });
    }
  };

  const filteredNotifications = useMemo(() => {
    let list =
      filter === 'all'
        ? notifications
        : filter === 'unread'
          ? notifications.filter((n) => !n.read)
          : filter === 'priority'
            ? notifications.filter((n) => isP0Notification(n))
            : filter === 'friend'
              ? notifications.filter((n) => n.type === 'friend')
              : notifications.filter((n) => n.type === filter);
    if (notificationScope === 'organization' && organizationIdFilter) {
      list = list.filter((n) => String(n.organizationId || '').trim() === organizationIdFilter);
    }
    const q = notifSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => {
      const hay = `${n.title || ''} ${n.message || ''} ${n.action || ''} ${n.type || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [notifications, filter, notifSearch, organizationIdFilter, notificationScope]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const figmaFilterOptions = useMemo(
    () => [
      { id: 'all', label: t('notifications.filterAll') },
      { id: 'unread', label: t('notifications.filterUnread') },
      { id: 'priority', label: t('notifications.filterPriority') },
      { id: 'friend', label: t('notifications.filterFriend') },
      { id: 'mention', label: t('common.mentions') },
      { id: 'meeting', label: t('notifications.filterMeetings') },
      { id: 'task', label: t('notifications.filterTasks') },
    ],
    [t]
  );

  const groupedNotifications = useMemo(() => {
    const labels = {
      today: t('notifications.groupToday'),
      yesterday: t('notifications.groupYesterday'),
      earlier: t('notifications.groupEarlier'),
    };
    return ['today', 'yesterday', 'earlier']
      .map((key) => ({
        key,
        label: labels[key],
        items: filteredNotifications.filter((n) => (n.timeGroup || 'earlier') === key),
      }))
      .filter((group) => group.items.length > 0);
  }, [filteredNotifications, t]);

  if (isOrgNotificationsPage && organizationIdFilter) {
    return null;
  }

  return (
    <>
      <NotificationsFigmaView
        title={t('notifications.defaultTitle')}
        unreadCount={unreadCount}
        search={notifSearch}
        onSearchChange={setNotifSearch}
        searchPlaceholder={t('notifications.searchPlaceholder')}
        filter={filter}
        onFilterChange={setFilter}
        filterOptions={figmaFilterOptions}
        groups={groupedNotifications}
        loading={notificationsLoading}
        emptyMessage={t('notifications.emptyNew')}
        emptyHint={
          filter !== 'all'
            ? t('notifications.emptyHintFilter')
            : t('notifications.emptyHintAllRead')
        }
        getActionKind={getNotifActionKind}
        actingNotifId={actingNotifId}
        onOpenNotification={handleOpenNotification}
        onDeleteNotification={(notif) => setDeleteNotifConfirmId(notif.id)}
        onAcceptFriend={handleAcceptFriendRequest}
        onRejectFriend={handleRejectFriendRequest}
        onJoinVoice={handleOpenNotification}
        onMarkAllRead={handleMarkAllRead}
        markAllReadLabel={t('notifications.markAllReadShort')}
        actionLabels={{
          accept: t('notifications.actionAccept'),
          reject: t('notifications.actionReject'),
          joinVoice: t('notifications.actionJoin'),
          delete: t('notifications.deleteBtn'),
        }}
      />

      <ConfirmDialog
        isOpen={deleteNotifConfirmId != null}
        onClose={() => setDeleteNotifConfirmId(null)}
        onConfirm={confirmDeleteNotification}
        title={t('notifications.confirmDeleteTitle')}
        message={t('notifications.confirmDeleteMsg')}
        confirmText={t('common.delete')}
        cancelText={t('nav.cancel')}
      />
    </>
  );
}

export default NotificationsPage;

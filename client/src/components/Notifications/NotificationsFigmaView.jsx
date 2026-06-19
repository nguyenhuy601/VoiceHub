import { Bell, BellOff, CheckCheck, Search, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  FIGMA_NOTIF_CHIP,
  FIGMA_NOTIF_CHIP_ACTIVE,
  FIGMA_NOTIF_HEADER,
  FIGMA_NOTIF_INNER,
  FIGMA_NOTIF_PAGE,
} from './figmaNotificationsClasses';
import NotificationsTimeGroupList from './NotificationsTimeGroupList';
import { useAppStrings } from '../../locales/appStrings';

export default function NotificationsFigmaView({
  title,
  unreadCount = 0,
  search = '',
  onSearchChange,
  searchPlaceholder,
  filter = 'all',
  onFilterChange,
  filterOptions = [],
  groups = [],
  emptyMessage,
  emptyHint,
  loading = false,
  getActionKind,
  actingNotifId = '',
  onOpenNotification,
  onDeleteNotification,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  onMarkAllRead,
  markAllReadLabel,
  actionLabels = {},
}) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const totalVisible = groups.reduce((sum, g) => sum + g.items.length, 0);
  const resolvedTitle = title ?? t('notifications.defaultTitle');
  const resolvedSearchPlaceholder = searchPlaceholder ?? t('notifications.searchPlaceholder');
  const resolvedEmptyMessage = emptyMessage ?? t('notifications.emptyNew');
  const resolvedEmptyHint = emptyHint ?? t('notifications.emptyHintAllRead');
  const resolvedMarkAllReadLabel = markAllReadLabel ?? t('notifications.markAllReadShort');

  return (
    <div className={FIGMA_NOTIF_PAGE}>
      <header className={FIGMA_NOTIF_HEADER}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary/10">
            <Bell className="h-[15px] w-[15px] text-primary" aria-hidden />
          </div>
          <h4 className="m-0 text-sm font-semibold text-foreground">{resolvedTitle}</h4>
          {unreadCount > 0 ? (
            <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-primary px-1.5 text-[0.6875rem] font-bold tabular-nums text-primary-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </div>

        <div className="relative ml-auto max-w-xs flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => onSearchChange?.(e.target.value)}
            placeholder={resolvedSearchPlaceholder}
            className="h-[34px] w-full rounded-lg border border-border bg-input-background py-0 pl-[30px] pr-2.5 text-[0.8125rem] text-foreground outline-none transition-colors focus:border-primary"
          />
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={onMarkAllRead}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-lg border-none bg-muted px-3 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            {resolvedMarkAllReadLabel}
          </button>
          <button
            type="button"
            onClick={() => navigate('/app/me/settings#notifications')}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            title={t('notifications.settingsAria')}
            aria-label={t('notifications.settingsAria')}
          >
            <Settings className="h-[15px] w-[15px]" aria-hidden />
          </button>
        </div>
      </header>

      <div className={`${FIGMA_NOTIF_INNER} pb-10`}>
        <div className="mb-6 flex flex-wrap gap-1.5">
          {filterOptions.map((option) => {
            const active = filter === option.id;
            const count = option.id === 'unread' ? unreadCount : undefined;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onFilterChange?.(option.id)}
                className={`inline-flex h-8 items-center gap-1.5 px-3.5 ${
                  active ? FIGMA_NOTIF_CHIP_ACTIVE : FIGMA_NOTIF_CHIP
                }`}
              >
                {option.label}
                {count != null && count > 0 ? (
                  <span
                    className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.625rem] font-bold text-primary-foreground ${
                      active ? 'bg-white/25' : 'bg-primary'
                    }`}
                  >
                    {count > 99 ? '99+' : count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t('common.loadingEllipsis')}</div>
        ) : null}

        {!loading && totalVisible === 0 ? (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-[14px] bg-muted">
              <BellOff className="h-[26px] w-[26px] text-muted-foreground" aria-hidden />
            </div>
            <p className="mb-1.5 font-semibold text-foreground">{resolvedEmptyMessage}</p>
            <p className="text-sm text-muted-foreground">{resolvedEmptyHint}</p>
          </div>
        ) : null}

        {!loading && totalVisible > 0 ? (
          <NotificationsTimeGroupList
            groups={groups}
            getActionKind={getActionKind}
            actingNotifId={actingNotifId}
            onOpen={onOpenNotification}
            onDelete={onDeleteNotification}
            onAcceptFriend={onAcceptFriend}
            onRejectFriend={onRejectFriend}
            onJoinVoice={onJoinVoice}
            labels={actionLabels}
          />
        ) : null}
      </div>
    </div>
  );
}

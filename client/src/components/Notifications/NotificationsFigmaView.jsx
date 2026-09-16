import { Bell, BellOff, CheckCheck, Keyboard, ListChecks, Search, Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  FIGMA_NOTIF_CHIP,
  FIGMA_NOTIF_HEADER,
  FIGMA_NOTIF_INNER,
  FIGMA_NOTIF_LIST_PANE,
  FIGMA_NOTIF_PAGE,
  FIGMA_NOTIF_PRIMARY_BTN,
  FIGMA_NOTIF_PRIMARY_TRACK,
  FIGMA_NOTIF_SPLIT,
  FIGMA_NOTIF_TYPE_ROW,
} from './figmaNotificationsClasses';
import {
  getPrimaryFilterVisual,
  getTypeFilterVisual,
} from './notificationVisualMeta';
import NotificationsTimeGroupList from './NotificationsTimeGroupList';
import NotificationPreviewPane from './NotificationPreviewPane';
import NotificationBulkBar from './NotificationBulkBar';
import { useAppStrings } from '../../locales/appStrings';

function FilterCountBadge({ count, active, accentClass = 'bg-primary' }) {
  if (count == null || count <= 0) return null;
  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[0.625rem] font-bold tabular-nums text-white ${
        active ? 'bg-white/25' : accentClass
      }`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

export default function NotificationsFigmaView({
  title,
  unreadCount = 0,
  needsActionCount = 0,
  search = '',
  onSearchChange,
  searchPlaceholder,
  primaryFilter = 'needsAction',
  onPrimaryFilterChange,
  primaryFilterOptions = [],
  typeFilter = 'all',
  onTypeFilterChange,
  typeFilterOptions = [],
  groups = [],
  selectedId = null,
  selectedNotification = null,
  bulkMode = false,
  checkedIds,
  checkedCount = 0,
  shortcutHelpOpen = false,
  emptyMessage,
  emptyHint,
  loading = false,
  getActionKind,
  actingNotifId = '',
  onSelectNotification,
  onOpenNotification,
  onMarkReadNotification,
  onClearSelection,
  onDeleteNotification,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  onMarkAllRead,
  onToggleBulkMode,
  onToggleCheck,
  onBulkSelectAll,
  onBulkClear,
  onBulkMarkRead,
  onBulkDelete,
  onToggleShortcutHelp,
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
  const hasSelection = Boolean(selectedNotification) && !bulkMode;
  const selectedActionKind = selectedNotification
    ? getActionKind?.(selectedNotification) || 'none'
    : 'none';

  const resolveOptionCount = (option) => {
    if (option.count != null) return option.count;
    if (option.id === 'unread') return unreadCount;
    if (option.id === 'needsAction') return needsActionCount;
    return undefined;
  };

  return (
    <div className={FIGMA_NOTIF_PAGE}>
      <header className={FIGMA_NOTIF_HEADER}>
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-primary/10 ring-1 ring-primary/20">
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
            onClick={onToggleBulkMode}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-lg border-none px-3 text-[0.8125rem] transition-colors ${
              bulkMode
                ? 'bg-primary/15 text-primary'
                : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary'
            }`}
            aria-pressed={bulkMode}
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">
              {bulkMode ? t('notifications.bulkModeOff') : t('notifications.bulkModeOn')}
            </span>
          </button>
          <button
            type="button"
            onClick={onToggleShortcutHelp}
            className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-muted text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            title={t('notifications.shortcutsAria')}
            aria-label={t('notifications.shortcutsAria')}
            aria-expanded={shortcutHelpOpen}
          >
            <Keyboard className="h-[15px] w-[15px]" aria-hidden />
          </button>
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

      <div className={FIGMA_NOTIF_INNER}>
        <div className={`mb-3 shrink-0 flex-col gap-3 ${hasSelection ? 'hidden lg:flex' : 'flex'}`}>
          {shortcutHelpOpen ? (
            <div className="rounded-xl border border-border bg-muted/50 px-3 py-2 text-[0.75rem] text-muted-foreground">
              <p className="mb-0.5 font-semibold text-foreground">{t('notifications.shortcutHelpTitle')}</p>
              <p className="m-0 leading-relaxed">{t('notifications.shortcutHelpBody')}</p>
            </div>
          ) : null}

          <div
            role="tablist"
            aria-label={t('notifications.primaryFiltersAria')}
            className={FIGMA_NOTIF_PRIMARY_TRACK}
          >
            {primaryFilterOptions.map((option) => {
              const active = primaryFilter === option.id;
              const count = resolveOptionCount(option);
              const visual = getPrimaryFilterVisual(option.id);
              const TabIcon = visual.Icon;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onPrimaryFilterChange?.(option.id)}
                  className={`${FIGMA_NOTIF_PRIMARY_BTN} ${
                    active ? visual.activeBg : `${visual.color} ${visual.activeIdle}`
                  }`}
                >
                  <TabIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                  <span className="truncate">{option.label}</span>
                  <FilterCountBadge count={count} active={active} accentClass={visual.accent} />
                </button>
              );
            })}
          </div>

          {typeFilterOptions.length > 0 ? (
            <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center">
              <span className="shrink-0 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('notifications.typeFilterHeading')}
              </span>
              <div
                role="group"
                aria-label={t('notifications.typeFiltersAria')}
                className={FIGMA_NOTIF_TYPE_ROW}
              >
                {typeFilterOptions.map((option) => {
                  const active = typeFilter === option.id;
                  const visual = getTypeFilterVisual(option.id);
                  const ChipIcon = visual.Icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onTypeFilterChange?.(option.id)}
                      className={`inline-flex h-8 shrink-0 items-center gap-1.5 px-3 transition-[transform,box-shadow,background-color] duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                        active
                          ? `rounded-full ${visual.chipActive}`
                          : `${FIGMA_NOTIF_CHIP} ${visual.color} hover:border-current/20`
                      }`}
                    >
                      <ChipIcon className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {bulkMode ? (
            <NotificationBulkBar
              selectedCount={checkedCount}
              totalVisible={totalVisible}
              onSelectAll={onBulkSelectAll}
              onClear={onBulkClear}
              onMarkRead={onBulkMarkRead}
              onDelete={onBulkDelete}
              labels={{
                regionAria: t('notifications.bulkBarAria'),
                selectedCount: t('notifications.bulkSelectedCount', { n: checkedCount }),
                selectAll: t('notifications.bulkSelectAll'),
                markRead: t('notifications.bulkMarkRead'),
                delete: t('notifications.bulkDelete'),
                clear: t('notifications.bulkClear'),
              }}
            />
          ) : null}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">{t('common.loadingEllipsis')}</div>
        ) : null}

        {!loading && totalVisible === 0 ? (
          <div className="px-6 py-16 text-center">
            {(() => {
              const emptyVisual =
                typeFilter !== 'all'
                  ? getTypeFilterVisual(typeFilter)
                  : getPrimaryFilterVisual(primaryFilter);
              const EmptyIcon = emptyVisual.Icon || BellOff;
              return (
                <div
                  className={`mx-auto mb-4 flex h-[60px] w-[60px] items-center justify-center rounded-[14px] border ${emptyVisual.bg} ${emptyVisual.border}`}
                >
                  <EmptyIcon className={`h-[26px] w-[26px] ${emptyVisual.color}`} aria-hidden />
                </div>
              );
            })()}
            <p className="mb-1.5 font-semibold text-foreground">{resolvedEmptyMessage}</p>
            <p className="text-sm text-muted-foreground">{resolvedEmptyHint}</p>
          </div>
        ) : null}

        {!loading && totalVisible > 0 ? (
          <div className={FIGMA_NOTIF_SPLIT}>
            <div className={`${FIGMA_NOTIF_LIST_PANE} ${hasSelection ? 'hidden lg:block' : 'block'}`}>
              <NotificationsTimeGroupList
                groups={groups}
                selectedId={selectedId}
                bulkMode={bulkMode}
                checkedIds={checkedIds}
                onToggleCheck={onToggleCheck}
                getActionKind={getActionKind}
                actingNotifId={actingNotifId}
                onOpen={onSelectNotification}
                onDelete={onDeleteNotification}
                onAcceptFriend={onAcceptFriend}
                onRejectFriend={onRejectFriend}
                onJoinVoice={onJoinVoice}
                labels={actionLabels}
              />
            </div>

            {!bulkMode ? (
              <div className={hasSelection ? 'block min-h-0' : 'hidden min-h-0 lg:block'}>
                <NotificationPreviewPane
                  notif={selectedNotification}
                  actionKind={selectedActionKind}
                  acting={
                    selectedNotification
                      ? actingNotifId === selectedNotification.id
                      : false
                  }
                  showBack={hasSelection}
                  onBack={onClearSelection}
                  onOpen={onOpenNotification}
                  onMarkRead={onMarkReadNotification}
                  onDelete={onDeleteNotification}
                  onAcceptFriend={onAcceptFriend}
                  onRejectFriend={onRejectFriend}
                  onJoinVoice={onJoinVoice}
                  labels={actionLabels}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

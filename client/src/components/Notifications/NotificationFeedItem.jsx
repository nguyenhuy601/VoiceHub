import { Check, Mic, Trash2, X } from 'lucide-react';
import {
  FIGMA_NOTIF_ITEM,
  FIGMA_NOTIF_ITEM_ICON,
  FIGMA_NOTIF_ITEM_SELECTED,
} from './figmaNotificationsClasses';
import { resolveNotificationVisual } from './notificationVisualMeta';
import { useAppStrings } from '../../locales/appStrings';
import { isVoiceRoomInviteNotification } from '../../utils/notificationNavigation';

export default function NotificationFeedItem({
  notif,
  selected = false,
  bulkMode = false,
  checked = false,
  onToggleCheck,
  actionKind = 'none',
  acting = false,
  onOpen,
  onDelete,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  labels = {},
}) {
  const { t } = useAppStrings();
  const meta = resolveNotificationVisual(notif);
  const Icon = meta.Icon;
  const isAi =
    String(notif?.rawType || '').includes('ai') ||
    String(notif?.title || '').includes('VoiceHubAI') ||
    String(notif?.data?.kind || '') === 'ai_proposal_pending';
  const showFriendActions = !bulkMode && actionKind === 'friend_request';
  const showVoiceAction =
    !bulkMode &&
    (actionKind === 'voice_join' ||
      actionKind === 'voice_invite' ||
      isVoiceRoomInviteNotification(notif));
  const hasInlineActions = showFriendActions || showVoiceAction;
  const unreadTint = !notif.read && !selected ? meta.unreadTint : '';

  return (
    <article
      className={`group relative ${FIGMA_NOTIF_ITEM} ${
        selected ? FIGMA_NOTIF_ITEM_SELECTED : unreadTint
      }`}
      onClick={() => onOpen?.(notif)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(notif);
        }
      }}
      role="button"
      tabIndex={0}
      aria-current={selected ? 'true' : undefined}
      aria-checked={bulkMode ? checked : undefined}
      aria-label={`${notif.title || t('notifications.defaultTitle')}${notif.message ? `. ${notif.message}` : ''}`}
    >
      {!bulkMode && !notif.read ? (
        <span
          className={`absolute bottom-2 left-0 top-2 w-[3px] rounded-r-full ${meta.accent}`}
          aria-hidden
        />
      ) : null}

      {bulkMode ? (
        <label
          className="mt-2.5 flex h-5 w-5 shrink-0 items-center justify-center"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={checked}
            onChange={() => onToggleCheck?.(notif)}
            className="h-4 w-4 cursor-pointer accent-primary"
            aria-label={labels.checkItem || t('notifications.bulkCheckItem')}
          />
        </label>
      ) : !notif.read ? (
        <span className={`mt-3 h-1.5 w-1.5 shrink-0 rounded-full ${meta.accent}`} aria-hidden />
      ) : (
        <span className="mt-3 h-1.5 w-1.5 shrink-0" aria-hidden />
      )}

      <div
        className={`${FIGMA_NOTIF_ITEM_ICON} ${meta.bg} ${meta.border} transition-transform duration-150 group-hover:scale-105`}
      >
        <Icon className={`h-4 w-4 ${meta.color}`} aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span
            className={`min-w-0 flex-1 truncate text-[0.8125rem] leading-5 text-foreground ${
              notif.read ? 'font-medium' : 'font-semibold'
            }`}
          >
            {notif.title}
            {isAi ? (
              <span className="ml-1.5 inline-flex align-middle rounded bg-ai/15 px-1 py-px text-[0.625rem] font-bold tracking-wide text-ai">
                AI
              </span>
            ) : null}
          </span>
          <time className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">
            {notif.time}
          </time>
        </div>

        {notif.message ? (
          <p className="mt-0.5 truncate text-[0.75rem] leading-4 text-muted-foreground">
            {notif.message}
          </p>
        ) : null}

        {hasInlineActions ? (
          <div
            className="mt-1.5 flex flex-wrap items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {showFriendActions ? (
              <>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => onAcceptFriend?.(notif)}
                  className="inline-flex h-8 min-h-8 items-center gap-1 rounded-md border-none bg-success px-2.5 text-xs font-semibold text-white disabled:opacity-60"
                >
                  <Check className="h-3 w-3" aria-hidden />
                  {labels.accept || t('friendChat.invitesAccept')}
                </button>
                <button
                  type="button"
                  disabled={acting}
                  onClick={() => onRejectFriend?.(notif)}
                  className="inline-flex h-8 min-h-8 items-center gap-1 rounded-md border-none bg-muted px-2.5 text-xs text-muted-foreground hover:text-destructive disabled:opacity-60"
                >
                  <X className="h-3 w-3" aria-hidden />
                  {labels.reject || t('friendChat.invitesReject')}
                </button>
              </>
            ) : null}
            {showVoiceAction ? (
              <button
                type="button"
                disabled={acting}
                onClick={() => onJoinVoice?.(notif)}
                className="inline-flex h-8 min-h-8 items-center gap-1 rounded-md border-none bg-warning px-2.5 text-xs font-semibold text-white disabled:opacity-60"
              >
                <Mic className="h-3 w-3" aria-hidden />
                {labels.joinVoice || t('notifications.joinNow')}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(notif);
        }}
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-muted-foreground opacity-100 transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
        aria-label={labels.delete || t('common.delete')}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </article>
  );
}

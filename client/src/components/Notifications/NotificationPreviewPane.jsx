import {
  ArrowLeft,
  Check,
  CheckCheck,
  Inbox,
  Mic,
  Trash2,
  X,
} from 'lucide-react';
import { FIGMA_NOTIF_PREVIEW_PANE } from './figmaNotificationsClasses';
import { resolveNotificationVisual } from './notificationVisualMeta';
import { useAppStrings } from '../../locales/appStrings';
import { isVoiceRoomInviteNotification } from '../../utils/notificationNavigation';

export default function NotificationPreviewPane({
  notif = null,
  actionKind = 'none',
  acting = false,
  showBack = false,
  onBack,
  onOpen,
  onMarkRead,
  onDelete,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  labels = {},
}) {
  const { t } = useAppStrings();

  if (!notif) {
    return (
      <aside
        className={`${FIGMA_NOTIF_PREVIEW_PANE} hidden lg:flex lg:flex-col lg:items-center lg:justify-center`}
        aria-label={t('notifications.previewPaneAria')}
      >
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
          <Inbox className="h-6 w-6 text-primary" aria-hidden />
        </div>
        <p className="max-w-[240px] text-center text-sm text-muted-foreground">
          {t('notifications.orgPickHint')}
        </p>
      </aside>
    );
  }

  const meta = resolveNotificationVisual(notif);
  const Icon = meta.Icon;
  const isAi =
    String(notif?.rawType || '').includes('ai') ||
    String(notif?.title || '').includes('VoiceHubAI') ||
    String(notif?.data?.kind || '') === 'ai_proposal_pending';
  const showFriendActions = actionKind === 'friend_request';
  const showVoiceAction =
    actionKind === 'voice_join' ||
    actionKind === 'voice_invite' ||
    isVoiceRoomInviteNotification(notif);

  return (
    <aside
      className={`${FIGMA_NOTIF_PREVIEW_PANE} relative flex flex-col overflow-hidden`}
      aria-label={t('notifications.previewPaneAria')}
    >
      <div className={`pointer-events-none absolute inset-x-0 top-0 h-1 ${meta.accent}`} aria-hidden />

      {showBack ? (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex h-9 w-fit items-center gap-1.5 rounded-lg border-none bg-muted px-3 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary lg:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {t('notifications.previewBackList')}
        </button>
      ) : null}

      <div className="mb-4 flex items-start gap-3">
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-sm ${meta.bg} ${meta.border}`}
        >
          <Icon className={`h-5 w-5 ${meta.color}`} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="m-0 text-base font-semibold leading-snug text-foreground">
              {notif.title || t('notifications.defaultTitle')}
            </h3>
            {isAi ? (
              <span className="rounded bg-ai/15 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-ai">
                AI
              </span>
            ) : null}
            {!notif.read ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.625rem] font-bold ${meta.bg} ${meta.color}`}
              >
                {t('common.newBadge')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{notif.time}</p>
        </div>
      </div>

      <div className={`mb-5 rounded-xl border p-3.5 ${meta.border} ${meta.bg}`}>
        <p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {notif.message || '—'}
        </p>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => onOpen?.(notif)}
          className={`inline-flex h-9 items-center rounded-lg border-none px-3.5 text-[0.8125rem] font-semibold text-white transition-transform hover:brightness-110 active:scale-[0.98] ${meta.accent}`}
        >
          {labels.open || t('notifications.actionOpen')}
        </button>

        {!notif.read ? (
          <button
            type="button"
            onClick={() => onMarkRead?.(notif.id)}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-transparent px-3.5 text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-muted"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden />
            {labels.markRead || t('notifications.markOneRead')}
          </button>
        ) : null}

        {showFriendActions ? (
          <>
            <button
              type="button"
              disabled={acting}
              onClick={() => onAcceptFriend?.(notif)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border-none bg-success px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-60"
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {labels.accept || t('friendChat.invitesAccept')}
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => onRejectFriend?.(notif)}
              className="inline-flex h-9 items-center gap-1 rounded-lg border-none bg-muted px-3 text-[0.8125rem] text-muted-foreground hover:text-destructive disabled:opacity-60"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
              {labels.reject || t('friendChat.invitesReject')}
            </button>
          </>
        ) : null}

        {showVoiceAction ? (
          <button
            type="button"
            disabled={acting}
            onClick={() => onJoinVoice?.(notif)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border-none bg-warning px-3 text-[0.8125rem] font-semibold text-white disabled:opacity-60"
          >
            <Mic className="h-3.5 w-3.5" aria-hidden />
            {labels.joinVoice || t('notifications.joinNow')}
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => onDelete?.(notif)}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-none bg-transparent px-3 text-[0.8125rem] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={labels.delete || t('common.delete')}
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          {labels.delete || t('common.delete')}
        </button>
      </div>
    </aside>
  );
}

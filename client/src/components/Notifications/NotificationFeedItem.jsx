import {
  AtSign,
  BellOff,
  Calendar,
  Check,
  MessageCircle,
  Mic,
  Sparkles,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import {
  FIGMA_NOTIF_ITEM,
  FIGMA_NOTIF_ITEM_UNREAD,
} from './figmaNotificationsClasses';
import { useAppStrings } from '../../locales/appStrings';
import { isVoiceRoomInviteNotification } from '../../utils/notificationNavigation';

const TYPE_META = {
  friend: { color: 'text-destructive', bg: 'bg-destructive/10', border: 'border-destructive/20', Icon: UserPlus },
  mention: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', Icon: AtSign },
  message: { color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', Icon: MessageCircle },
  meeting: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', Icon: Mic },
  task: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', Icon: Calendar },
  deadline: { color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', Icon: Calendar },
  file: { color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', Icon: Calendar },
  system: { color: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/20', Icon: Sparkles },
};

function resolveMeta(notif) {
  const raw = notif?.rawType || notif?.type || 'system';
  if (raw === 'friend_request' || notif?.type === 'friend') return TYPE_META.friend;
  if (raw === 'voice_room_invite' || raw === 'voice_invite') return TYPE_META.meeting;
  if (raw.includes('ai')) return TYPE_META.system;
  return TYPE_META[notif?.type] || TYPE_META.system;
}

export default function NotificationFeedItem({
  notif,
  actionKind = 'none',
  acting = false,
  onOpen,
  onMarkRead,
  onDelete,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  labels = {},
}) {
  const { t } = useAppStrings();
  const meta = resolveMeta(notif);
  const Icon = meta.Icon;
  const isAi = String(notif?.rawType || '').includes('ai') || String(notif?.title || '').includes('VoiceHubAI');

  return (
    <article
      className={`group relative ${FIGMA_NOTIF_ITEM} ${!notif.read ? FIGMA_NOTIF_ITEM_UNREAD : ''}`}
      onClick={() => onOpen?.(notif)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(notif);
        }
      }}
      role="button"
      tabIndex={0}
    >
      {!notif.read ? (
        <span
          className="absolute left-1.5 top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-primary"
          aria-hidden
        />
      ) : null}

      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border ${meta.bg} ${meta.border}`}
      >
        <Icon className={`h-[18px] w-[18px] ${meta.color}`} aria-hidden />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className={`text-[0.9rem] ${notif.read ? 'font-medium' : 'font-semibold'} text-foreground`}>
            {notif.title}
          </span>
          {isAi ? (
            <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[0.65rem] font-bold tracking-wide text-primary-hover">
              AI
            </span>
          ) : null}
        </div>
        <p className="mb-1.5 truncate text-sm leading-relaxed text-muted-foreground">{notif.message}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-muted-foreground">{notif.time}</span>
          {actionKind === 'friend_request' ? (
            <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <button
                type="button"
                disabled={acting}
                onClick={() => onAcceptFriend?.(notif)}
                className="inline-flex h-[26px] items-center gap-1 rounded-md border-none bg-primary px-2.5 text-xs font-semibold text-primary-foreground"
              >
                <Check className="h-2.5 w-2.5" aria-hidden />
                {labels.accept || t('friendChat.invitesAccept')}
              </button>
              <button
                type="button"
                disabled={acting}
                onClick={() => onRejectFriend?.(notif)}
                className="inline-flex h-[26px] items-center gap-1 rounded-md border-none bg-muted px-2.5 text-xs text-muted-foreground hover:text-destructive"
              >
                <X className="h-2.5 w-2.5" aria-hidden />
                {labels.reject || t('friendChat.invitesReject')}
              </button>
            </div>
          ) : null}
          {actionKind === 'voice_join' ||
          actionKind === 'voice_invite' ||
          isVoiceRoomInviteNotification(notif) ? (
            <button
              type="button"
              disabled={acting}
              onClick={(e) => {
                e.stopPropagation();
                onJoinVoice?.(notif);
              }}
              className="inline-flex h-[26px] items-center gap-1 rounded-md border-none bg-warning px-2.5 text-xs font-semibold text-white"
            >
              <Mic className="h-2.5 w-2.5" aria-hidden />
              {labels.joinVoice || t('notifications.joinNow')}
            </button>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDelete?.(notif);
        }}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-muted-foreground opacity-0 transition-all group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
        aria-label={labels.delete || t('common.delete')}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </article>
  );
}

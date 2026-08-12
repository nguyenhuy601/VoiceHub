import { Clock } from 'lucide-react';
import UserAvatar from '../Shared/UserAvatar';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_CHAT_INVITE_ACCEPT_BTN,
  FIGMA_CHAT_INVITE_ACTIONS,
  FIGMA_CHAT_INVITE_CARD,
  FIGMA_CHAT_INVITE_PENDING_ROW,
  FIGMA_CHAT_INVITE_REJECT_BTN,
  FIGMA_CHAT_INVITE_WITHDRAW_BTN,
  FIGMA_CHAT_INVITES_EMPTY,
  FIGMA_CHAT_INVITES_SCROLL,
  FIGMA_CHAT_INVITES_SECTION_TITLE,
} from './figmaChatClasses';

export default function FriendChatInvitesPanel({
  received = [],
  sent = [],
  loading = false,
  actingKey = '',
  onAccept,
  onReject,
  onWithdraw,
  emptyReceivedTitle,
  emptyReceivedHint,
  pendingHint,
}) {
  const { t } = useAppStrings();
  const emptyTitle = emptyReceivedTitle || t('friendChat.invitesEmptyTitle');
  const emptyHint = emptyReceivedHint || t('friendChat.invitesEmptyHint');
  const pendingText = pendingHint || t('friendChat.invitesPending');
  if (loading) {
    return (
      <div className={`${FIGMA_CHAT_INVITES_SCROLL} text-center text-xs text-muted-foreground`}>
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className={FIGMA_CHAT_INVITES_SCROLL}>
      {received.length > 0 && (
        <div className="mb-4">
          <div className={FIGMA_CHAT_INVITES_SECTION_TITLE}>
            {t('friendChat.invitesReceivedCount', { n: received.length })}
          </div>
          {received.map((item) => {
            const busy = actingKey === item.rowKey;
            return (
              <div key={item.rowKey} className={FIGMA_CHAT_INVITE_CARD}>
                <div className="mb-2.5 flex items-center gap-2.5">
                  <UserAvatar
                    avatar={item.avatar}
                    userId={item.id}
                    name={item.name}
                    size="md"
                    showOnline
                    status={item.status || 'offline'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{item.name}</div>
                    {item.subtitle ? (
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    ) : null}
                  </div>
                </div>
                <div className={FIGMA_CHAT_INVITE_ACTIONS}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAccept?.(item)}
                    className={FIGMA_CHAT_INVITE_ACCEPT_BTN}
                  >
                    {t('friendChat.invitesAccept')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onReject?.(item)}
                    className={FIGMA_CHAT_INVITE_REJECT_BTN}
                  >
                    {t('friendChat.invitesReject')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {received.length === 0 && (
        <div className={FIGMA_CHAT_INVITES_EMPTY}>
          <div className="mb-1.5 text-2xl" aria-hidden>
            🎉
          </div>
          <div className="text-sm font-medium text-foreground">{emptyTitle}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{emptyHint}</div>
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <div className={FIGMA_CHAT_INVITES_SECTION_TITLE}>
            {t('friendChat.invitesSentCount', { n: sent.length })}
          </div>
          {sent.map((item) => {
            const busy = actingKey === item.rowKey;
            return (
              <div key={item.rowKey} className={FIGMA_CHAT_INVITE_CARD}>
                <div className="flex items-center gap-2.5">
                  <UserAvatar
                    avatar={item.avatar}
                    userId={item.id}
                    name={item.name}
                    size="md"
                    showOnline
                    status={item.status || 'offline'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{item.name}</div>
                    {item.subtitle ? (
                      <div className="truncate text-xs text-muted-foreground">{item.subtitle}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onWithdraw?.(item)}
                    className={FIGMA_CHAT_INVITE_WITHDRAW_BTN}
                  >
                    {t('friendChat.invitesWithdraw')}
                  </button>
                </div>
                <div className={FIGMA_CHAT_INVITE_PENDING_ROW}>
                  <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  <span>{pendingText}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

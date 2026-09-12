import Modal from '../Shared/Modal';
import UserAvatar from '../Shared/UserAvatar';
import { looksLikeEmail } from '../../features/search/businessCardDisplay';
import { useAppStrings } from '../../locales/appStrings';

function fieldOrDash(value) {
  const s = String(value || '').trim();
  return s || '—';
}

export default function FriendProfileModal({
  isOpen,
  onClose,
  friend,
  onMessage,
}) {
  const { t } = useAppStrings();
  if (!friend) return null;

  const email = friend.email && looksLikeEmail(friend.email) ? friend.email : '';
  const username = friend.username ? `@${friend.username}` : '';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('friendChat.profileTitle')} size="lg">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <UserAvatar
          avatar={friend.avatar}
          userId={friend.id || friend.userId || friend._id}
          name={friend.name}
          size="xl"
          showOnline
          status={friend.status}
          cacheBust={friend.avatar || undefined}
          ringClassName="ring-4 ring-primary/30 bg-primary/15 text-primary-foreground"
        />
        <div className="min-w-0 flex-1 space-y-3 text-center sm:text-left">
          <div>
            <h3 className="text-xl font-bold text-foreground">{friend.name}</h3>
            {username ? (
              <p className="text-sm text-primary">
                {t('friendChat.profileUsername')}: {username}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-foreground-secondary">
              {friend.status === 'online' ? t('friendChat.online') : t('friendChat.offline')}
            </p>
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {t('friendChat.profilePhone')}
              </dt>
              <dd className="font-medium text-foreground">{fieldOrDash(friend.phone)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-foreground-secondary">
                {t('friendChat.profileEmail')}
              </dt>
              <dd className="break-all font-medium text-foreground">{email || '—'}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => {
              onMessage?.();
              onClose?.();
            }}
            className="rounded-xl bg-gradient-to-r from-primary to-primary-hover px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition hover:brightness-110"
          >
            {t('friendChat.profileMessage')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

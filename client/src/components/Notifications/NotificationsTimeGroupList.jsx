import NotificationFeedItem from './NotificationFeedItem';
import { FIGMA_NOTIF_GROUP_TITLE } from './figmaNotificationsClasses';

export default function NotificationsTimeGroupList({
  groups = [],
  getActionKind,
  actingNotifId = '',
  onOpen,
  onMarkRead,
  onDelete,
  onAcceptFriend,
  onRejectFriend,
  onJoinVoice,
  labels = {},
}) {
  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className="mb-7">
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className={FIGMA_NOTIF_GROUP_TITLE}>{group.label}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="flex flex-col gap-1.5">
            {group.items.map((notif) => (
              <NotificationFeedItem
                key={notif.id}
                notif={notif}
                actionKind={getActionKind?.(notif) || 'none'}
                acting={actingNotifId === notif.id}
                onOpen={onMarkRead}
                onMarkRead={onMarkRead}
                onDelete={onDelete}
                onAcceptFriend={onAcceptFriend}
                onRejectFriend={onRejectFriend}
                onJoinVoice={onJoinVoice}
                labels={labels}
              />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

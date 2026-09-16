import NotificationFeedItem from './NotificationFeedItem';
import {
  FIGMA_NOTIF_GROUP_LIST,
  FIGMA_NOTIF_GROUP_SECTION,
  FIGMA_NOTIF_GROUP_TITLE,
} from './figmaNotificationsClasses';

export default function NotificationsTimeGroupList({
  groups = [],
  selectedId = null,
  bulkMode = false,
  checkedIds,
  onToggleCheck,
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
  const checkedSet = checkedIds instanceof Set ? checkedIds : new Set(checkedIds || []);

  return (
    <>
      {groups.map((group) => (
        <section key={group.key} className={FIGMA_NOTIF_GROUP_SECTION}>
          <div className="mb-1.5 flex items-center gap-2">
            <span className={FIGMA_NOTIF_GROUP_TITLE}>{group.label}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className={FIGMA_NOTIF_GROUP_LIST}>
            {group.items.map((notif) => (
              <NotificationFeedItem
                key={notif.id}
                notif={notif}
                selected={selectedId != null && String(selectedId) === String(notif.id)}
                bulkMode={bulkMode}
                checked={checkedSet.has(String(notif.id))}
                onToggleCheck={onToggleCheck}
                actionKind={getActionKind?.(notif) || 'none'}
                acting={actingNotifId === notif.id}
                onOpen={onOpen}
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

import { UserPlus } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_CHAT_ADD_FRIEND_BTN,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE_ACTIVE,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE_MUTED,
  FIGMA_CHAT_SIDEBAR_TABS_WRAP,
  figmaChatSidebarTab,
} from './figmaChatClasses';

export default function FriendChatSidebarTabs({
  activeTab = 'messages',
  onTabChange,
  messagesBadge = 0,
  invitesBadge = 0,
  onAddFriend,
  addFriendTitle,
}) {
  const { t } = useAppStrings();
  const tabs = [
    { id: 'messages', label: t('friendChat.tabMessages') },
    { id: 'invites', label: t('friendChat.tabInvites') },
  ];
  const addFriendTitleText = addFriendTitle || t('friendChat.addFriendTitle');
  return (
    <div className="flex items-center justify-between gap-2">
      <div className={FIGMA_CHAT_SIDEBAR_TABS_WRAP}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const badge = tab.id === 'messages' ? messagesBadge : invitesBadge;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange?.(tab.id)}
              className={figmaChatSidebarTab(active)}
            >
              {tab.label}
              {badge > 0 ? (
                <span
                  className={`${FIGMA_CHAT_SIDEBAR_TAB_BADGE} ${
                    active ? FIGMA_CHAT_SIDEBAR_TAB_BADGE_ACTIVE : FIGMA_CHAT_SIDEBAR_TAB_BADGE_MUTED
                  }`}
                >
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAddFriend}
        className={FIGMA_CHAT_ADD_FRIEND_BTN}
        title={addFriendTitleText}
        aria-label={addFriendTitleText}
      >
        <UserPlus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

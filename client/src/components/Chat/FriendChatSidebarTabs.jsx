import { MessageSquarePlus } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  FIGMA_CHAT_ADD_FRIEND_BTN,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE_ACTIVE,
  FIGMA_CHAT_SIDEBAR_TAB_BADGE_MUTED,
  FIGMA_CHAT_SIDEBAR_TABS_WRAP,
  figmaChatSidebarTab,
} from './figmaChatClasses';

/**
 * Tabs Hội thoại doanh nghiệp:
 * - Tin nhắn (gần đây)
 * - Đồng nghiệp (danh bạ P1) — khi showColleagues
 * - Lời mời — chỉ khi showInvites (không single-company)
 */
export default function FriendChatSidebarTabs({
  activeTab = 'messages',
  onTabChange,
  messagesBadge = 0,
  invitesBadge = 0,
  onNewMessage,
  newMessageTitle,
  showColleagues = false,
  showInvites = true,
}) {
  const { t } = useAppStrings();
  const tabs = [
    { id: 'messages', label: t('friendChat.tabMessages') },
    ...(showColleagues ? [{ id: 'colleagues', label: t('friendChat.tabColleagues') }] : []),
    ...(showInvites ? [{ id: 'invites', label: t('friendChat.tabInvites') }] : []),
  ];
  const titleText = newMessageTitle || t('friendChat.newDmTitle');

  return (
    <div className="flex items-center justify-between gap-2">
      <div className={FIGMA_CHAT_SIDEBAR_TABS_WRAP}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          const badge = tab.id === 'messages' ? messagesBadge : tab.id === 'invites' ? invitesBadge : 0;
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
        onClick={onNewMessage}
        className={FIGMA_CHAT_ADD_FRIEND_BTN}
        title={titleText}
        aria-label={titleText}
      >
        <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

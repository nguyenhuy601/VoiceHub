import { useState } from 'react';
import OrgChatCatchUpCard from '../Chat/OrgChatCatchUpCard';

/**
 * Bọc vùng chat org + slot OrgChatCatchUpCard phía trên danh sách tin.
 */
export default function OrganizationChatView({
  children,
  scrollRef,
  onScroll,
  unreadCount = 0,
  channelName = '',
  organizationId = '',
  roomId = '',
  currentUserId = '',
  locale = 'vi',
  showCatchUp = true,
  className = '',
}) {
  const [catchUpDismissed, setCatchUpDismissed] = useState(false);
  const showCard = showCatchUp && !catchUpDismissed && Number(unreadCount) > 0;

  return (
    <div className={`flex h-full min-h-0 flex-1 flex-col overflow-hidden ${className}`}>
      {showCard ? (
        <div className="shrink-0 px-5 pt-3">
          <OrgChatCatchUpCard
            unreadCount={unreadCount}
            channelName={channelName}
            organizationId={organizationId}
            roomId={roomId}
            currentUserId={currentUserId}
            locale={locale}
            onDismiss={() => setCatchUpDismissed(true)}
            onViewDetails={() => setCatchUpDismissed(true)}
          />
        </div>
      ) : null}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="scrollbar-chat min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain"
      >
        {children}
      </div>
    </div>
  );
}

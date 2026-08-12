import { FIGMA_DASH_THREE_COL, FIGMA_DASH_TWO_COL } from './figmaDashboardClasses';
import DashboardRecentMessages from './DashboardRecentMessages';
import DashboardUpcomingMeetings from './DashboardUpcomingMeetings';
import DashboardWorkspacesPanel from './DashboardWorkspacesPanel';

export default function DashboardBottomRow({
  messages,
  meetings,
  meetingsEmptyLabel,
  workspaces,
  addFriendLabel,
  hideWorkspacesPanel = false,
  onMessagesViewAll,
  onMessageClick,
  onCalendarClick,
  onMeetingClick,
  onCreateRoom,
  onWorkspacesViewAll,
  onWorkspaceClick,
  onCreateWorkspace,
  onAddFriend,
}) {
  return (
    <div className={hideWorkspacesPanel ? FIGMA_DASH_TWO_COL : FIGMA_DASH_THREE_COL}>
      <DashboardRecentMessages
        messages={messages}
        onViewAll={onMessagesViewAll}
        onMessageClick={onMessageClick}
      />
      <DashboardUpcomingMeetings
        meetings={meetings}
        emptyLabel={meetingsEmptyLabel}
        onViewCalendar={onCalendarClick}
        onMeetingClick={onMeetingClick}
        onCreateRoom={onCreateRoom}
      />
      {!hideWorkspacesPanel && (
        <DashboardWorkspacesPanel
          workspaces={workspaces}
          addFriendLabel={addFriendLabel}
          onViewAll={onWorkspacesViewAll}
          onWorkspaceClick={onWorkspaceClick}
          onCreateWorkspace={onCreateWorkspace}
          onAddFriend={onAddFriend}
        />
      )}
    </div>
  );
}

import DashboardAIHero from './DashboardAIHero';
import DashboardAnalyticsRow from './DashboardAnalyticsRow';
import DashboardBottomRow from './DashboardBottomRow';
import DashboardMetricCards from './DashboardMetricCards';
import DashboardPendingBanner from './DashboardPendingBanner';
import DashboardProductivityChart from './DashboardProductivityChart';
import DashboardQuickNav from './DashboardQuickNav';
import DashboardRoleBanner from './DashboardRoleBanner';
import {
  FIGMA_DASH_INNER,
  FIGMA_DASH_LEVEL_1,
  FIGMA_DASH_LEVEL_2,
  FIGMA_DASH_LEVEL_3,
  FIGMA_DASH_PAGE,
} from './figmaDashboardClasses';
import { useAppStrings } from '../../locales/appStrings';

/**
 * Blueprint 3 cấp theo thiết kế Figma:
 * - Level 1: Role banner + AI Insight Hero
 * - Level 2: 4 thẻ KPI (metric cards)
 * - Level 3: Chart + Analytics + Quick Nav + Pending + 3 cột (Messages/Meetings/Workspaces)
 */
export default function DashboardFigmaView({
  isGuest,
  isPersonal,
  isManagerOrAbove,
  locale = 'vi',
  greetingShort,
  displayName,
  aiInsights,
  priorityDm,
  priorityMeetings,
  pendingApprovals = 0,
  heroStats,
  metricCards,
  onMetricCardClick,
  productivity30d,
  productivityTrends,
  performanceStats,
  performanceMiniStats,
  syncFeed,
  onSyncItemClick,
  quickNavItems,
  quickNavCols,
  hideRoleBanner = false,
  insightPreview = false,
  syncFeedPreview = false,
  onNavigate,
  pendingBannerLabel,
  onPendingClick,
  recentMessages,
  upcomingMeetings,
  meetingsEmptyLabel,
  workspaces,
  addFriendLabel,
  onCreateRoom,
  onCreateWorkspace,
  onAddFriend,
  onWorkspaceClick,
}) {
  const { t } = useAppStrings();

  return (
    <div className={FIGMA_DASH_PAGE}>
      <div className={FIGMA_DASH_INNER}>
        <section className={FIGMA_DASH_LEVEL_1} aria-label={t('dashboard.ariaOverview')}>
          {!hideRoleBanner && (isGuest || isPersonal) && <DashboardRoleBanner isGuest={isGuest} />}
          <DashboardAIHero
            greeting={greetingShort}
            userName={displayName}
            insights={aiInsights}
            priorityDm={priorityDm}
            priorityMeetings={priorityMeetings}
            pendingApprovals={pendingApprovals}
            heroStats={heroStats}
            insightPreview={insightPreview}
          />
        </section>

        <section className={FIGMA_DASH_LEVEL_2} aria-label={t('dashboard.ariaKpi')}>
          <DashboardMetricCards cards={metricCards} onCardClick={onMetricCardClick} />
        </section>

        <section className={FIGMA_DASH_LEVEL_3} aria-label={t('dashboard.ariaAnalytics')}>
          {isManagerOrAbove && (
            <DashboardProductivityChart
              productivity30d={productivity30d}
              productivityTrends={productivityTrends}
            />
          )}

          {isManagerOrAbove && (
            <DashboardAnalyticsRow
              performanceStats={performanceStats}
              miniStats={performanceMiniStats}
              syncFeed={syncFeed}
              onSyncItemClick={onSyncItemClick}
              syncFeedPreview={syncFeedPreview}
            />
          )}

          <DashboardQuickNav items={quickNavItems} columnCount={quickNavCols} onNavigate={onNavigate} />

          <DashboardPendingBanner label={pendingBannerLabel} onClick={onPendingClick} />

          <DashboardBottomRow
            messages={recentMessages}
            meetings={upcomingMeetings}
            meetingsEmptyLabel={meetingsEmptyLabel}
            workspaces={workspaces}
            addFriendLabel={addFriendLabel}
            onMessagesViewAll={() => onNavigate('/app/communicate/chat/friends')}
            onMessageClick={() => onNavigate('/app/communicate/chat/friends')}
            onCalendarClick={() => onNavigate('/app/me/calendar')}
            onMeetingClick={() => onNavigate('/app/communicate/voice')}
            onCreateRoom={onCreateRoom}
            onWorkspacesViewAll={() => onNavigate('/app/collaborate/workspaces')}
            onWorkspaceClick={onWorkspaceClick}
            onCreateWorkspace={onCreateWorkspace}
            onAddFriend={onAddFriend}
          />
        </section>
      </div>
    </div>
  );
}

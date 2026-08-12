import { FIGMA_DASH_SPLIT_GRID } from './figmaDashboardClasses';
import DashboardPerformancePanel from './DashboardPerformancePanel';
import DashboardSyncFeed from './DashboardSyncFeed';

export default function DashboardAnalyticsRow({
  performanceStats,
  miniStats,
  syncFeed,
  onSyncItemClick,
}) {
  return (
    <div className={FIGMA_DASH_SPLIT_GRID}>
      <DashboardPerformancePanel performanceStats={performanceStats} miniStats={miniStats} />
      <DashboardSyncFeed items={syncFeed} onItemClick={onSyncItemClick} />
    </div>
  );
}

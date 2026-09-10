import DashboardPerformancePanel from './DashboardPerformancePanel';

/** Hàng analytics Overview: chỉ panel hiệu suất (bỏ sync Chat↔Task — dư với tin nhắn gần đây). */
export default function DashboardAnalyticsRow({ performanceStats, miniStats }) {
  return <DashboardPerformancePanel performanceStats={performanceStats} miniStats={miniStats} />;
}

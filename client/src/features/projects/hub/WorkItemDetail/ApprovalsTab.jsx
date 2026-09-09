import EntityApprovalTimeline from '../../../../features/approvals/EntityApprovalTimeline';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function ApprovalsTab() {
  const { issueId, isDarkMode, isPlanning } = useWorkItemDetail();
  if (isPlanning || !issueId) return null;
  return (
    <div className="px-1 py-1">
      <EntityApprovalTimeline entityType="task" entityId={issueId} isDarkMode={isDarkMode} />
    </div>
  );
}

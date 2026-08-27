import TaskWorklogPanel from '../../board/TaskWorklogPanel';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function WorklogTab() {
  const { issueId, apiCtx, projectId, isDarkMode, t, canComment, isPlanning } = useWorkItemDetail();
  if (isPlanning || !issueId) return null;
  const organizationId = apiCtx?.organizationId || projectId || '';
  return (
    <div className="px-1 py-1">
      <TaskWorklogPanel
        taskId={issueId}
        organizationId={organizationId}
        isDarkMode={isDarkMode}
        t={t}
        canEdit={canComment}
      />
    </div>
  );
}

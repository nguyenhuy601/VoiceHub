import TaskWorklogPanel from '../../TaskWorklogPanel';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function WorklogTab() {
  const { issueId, apiCtx, isDarkMode, t, canComment, isPlanning } = useWorkItemDetail();
  if (isPlanning || !issueId) return null;
  return (
    <div className="px-1 py-1">
      <TaskWorklogPanel
        taskId={issueId}
        organizationId={apiCtx?.organizationId || ''}
        isDarkMode={isDarkMode}
        t={t}
        canEdit={canComment}
      />
    </div>
  );
}

import ProjectHubChildWorkSection from '../ProjectHubChildWorkSection';
import { useWorkItemDetail } from './WorkItemDetailContext';

export default function ChildrenTab() {
  const {
    workItem,
    boardCards,
    lists,
    workTypeConfig,
    projectCode,
    boardId,
    defaultListId,
    apiCtx,
    canCreateTask,
    canChangeStatus,
    isPlanning,
    t,
    onPatchBoardCards,
    onRefresh,
    onOpenWorkItem,
  } = useWorkItemDetail();

  return (
    <div className="px-1 py-1">
      <ProjectHubChildWorkSection
        issue={workItem}
        boardCards={boardCards}
        lists={lists}
        workTypeConfig={workTypeConfig}
        projectCode={projectCode}
        boardId={boardId}
        defaultListId={defaultListId || workItem?.listId || ''}
        apiCtx={apiCtx}
        canCreate={Boolean(canCreateTask && !isPlanning && boardId && (workItem?.listId || defaultListId))}
        canChangeStatus={Boolean(canChangeStatus && !isPlanning)}
        t={t}
        variant="plain"
        onPatchBoardCards={onPatchBoardCards}
        onRefresh={onRefresh}
        onOpenChild={onOpenWorkItem}
      />
    </div>
  );
}

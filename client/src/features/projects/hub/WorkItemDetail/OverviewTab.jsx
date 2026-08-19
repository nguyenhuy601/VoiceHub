import { CheckCircle2, Circle } from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '../../../../components/Shared/UserAvatar';
import { canSetCardAssignee } from '../../../../utils/goldenAssignPolicy';
import { isTimeTrackingV1Enabled } from '../../../../utils/timeTrackingFlag';
import { TASK_BOARD_LABELS, labelById } from '../../board/taskBoardCardLabels';
import { FIGMA_ORG_TASK_MODAL_INPUT } from '../../../../components/Organization/figmaOrganizationClasses';
import { dueDateTone, formatHubDateShort, listsForStatusSelect } from '../projectHubUtils';
import { listIdToPlanningStatus, planningStatusToListId } from '../planningBoardStatus';
import { normalizePriorityConfig } from '../projectPriorityConfig';
import { useWorkItemDetail } from './WorkItemDetailContext';
import { relId } from './workItemDetailUtils';

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

function actorFromMembers(members, actorId) {
  const id = String(actorId || '');
  const row = (members || []).find((m) => {
    const uid = String(m?.userId || m?.user?._id || m?._id || m?.id || '');
    return uid === id;
  });
  const nested = row?.user && typeof row.user === 'object' ? row.user : null;
  return {
    id,
    displayName:
      row?.displayName ||
      nested?.displayName ||
      row?.fullName ||
      nested?.fullName ||
      row?.name ||
      nested?.name ||
      (id ? id.slice(-6) : '—'),
    avatar: row?.avatar || nested?.avatar || '',
  };
}

export default function OverviewTab() {
  const ctx = useWorkItemDetail();
  const {
    workItem,
    isPlanning,
    boardCards,
    lists,
    epics,
    features,
    sprints,
    locale,
    t,
    canChangeStatus,
    canEstimate,
    saving,
    save,
    assigneeId,
    setAssigneeId,
    labelIds,
    setLabelIds,
    dueDateLocal,
    setDueDateLocal,
    startDateLocal,
    setStartDateLocal,
    estimateHours,
    setEstimateHours,
    assignableMembers,
    loadingMembers,
    projectMembers,
    taskWorkspaceScope,
    onOpenChangeRequest,
    priorityConfig,
  } = ctx;

  const listArr = Array.isArray(lists) ? lists : Object.values(lists || {});
  const listById = new Map(listArr.map((l) => [String(l._id), l]));
  const currentList = listById.get(String(workItem?.listId || ''));
  const epic = (epics || []).find(
    (e) => String(e._id) === relId(workItem?.epicId) || String(e._id) === relId(workItem?.parentId)
  );
  const parentCard = (boardCards || []).find(
    (c) => String(c._id || c.id) === relId(workItem?.parentTaskId)
  );
  const parentFeature = (features || []).find(
    (f) => String(f._id || f.id) === relId(workItem?.featureId)
  );
  const parentPlanning = isPlanning
    ? [...(epics || []), ...(features || [])].find(
        (p) => String(p._id || p.id) === relId(workItem?.parentId)
      )
    : null;
  const parentTitle = parentPlanning?.title || parentCard?.title || parentFeature?.title || '';
  const sprint = (sprints || []).find((s) => String(s._id) === String(workItem?.sprintId || ''));
  const dueTone = dueDateTone(workItem?.dueDate, workItem?.status || currentList);
  const reporterId = workItem?.createdBy || workItem?.reporterId || '';
  const reporter = actorFromMembers(projectMembers, reporterId);
  const isDone = String(workItem?.status || '') === 'done';

  const boardMembers = (assignableMembers || [])
    .map((m) => ({
      id: String(m.userId || ''),
      name: String(m.displayName || m.username || t('common.member')),
      avatar: String(m.displayName || m.username || '??')
        .slice(0, 2)
        .toUpperCase(),
    }))
    .filter((m) => m.id);

  const priorityItems = normalizePriorityConfig(priorityConfig).items;
  const currentPriority = String(workItem?.priority || 'medium').toLowerCase();
  const priorityOptions = priorityItems.some((i) => i.key === currentPriority)
    ? priorityItems
    : [{ key: currentPriority, label: currentPriority }, ...priorityItems];
  const planningListId = isPlanning ? planningStatusToListId(workItem?.status, listArr) : '';
  const statusOptions = listsForStatusSelect(listArr, isPlanning ? planningListId : workItem?.listId);

  const toggleComplete = async () => {
    if (isPlanning || !canChangeStatus) return;
    await save({ status: isDone ? 'todo' : 'done' });
  };

  const toggleLabel = async (id) => {
    if (isPlanning) return;
    const next = labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id];
    setLabelIds(next);
    await save({ tags: next });
  };

  return (
    <div className="space-y-4 px-1 py-1">
      {!isPlanning && canChangeStatus ? (
        <button
          type="button"
          onClick={() => void toggleComplete()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          title={isDone ? t('taskBoard.markUndone') : t('taskBoard.markDone')}
        >
          {isDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" aria-hidden />
          )}
          {isDone ? t('taskBoard.markUndone') : t('taskBoard.markDone')}
        </button>
      ) : null}

      {Array.isArray(workItem?.changeRequests) && workItem.changeRequests.length ? (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('workspace.projectHubWorkLinkedCrs')}
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {workItem.changeRequests.map((cr) => {
              const crId = String(cr._id || cr.id || '');
              const code = cr.code || 'CR';
              return (
                <li key={crId || code}>
                  <button
                    type="button"
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-left text-xs font-semibold text-amber-800 hover:bg-amber-500/20 dark:text-amber-200"
                    onClick={() => onOpenChangeRequest?.(crId)}
                  >
                    <span className="font-mono">{code}</span>
                    {cr.title ? (
                      <span className="truncate font-medium text-foreground/80">{cr.title}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <DetailRow label={t('workspace.projectHubWorkDetailsAssignee')}>
        <div className="space-y-1">
          {loadingMembers ? (
            <p className="text-muted-foreground">{t('taskBoard.loadingBoardMembers')}</p>
          ) : (
            <select
              className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1.5 text-xs`}
              value={assigneeId}
              disabled={saving}
              onChange={async (e) => {
                const next = e.target.value;
                const prev = assigneeId;
                if (!next) {
                  setAssigneeId('');
                  try {
                    await save({ assigneeId: null, assigneeName: '', assignees: [] });
                  } catch {
                    setAssigneeId(prev);
                  }
                  return;
                }
                if (!isPlanning) {
                  const check = canSetCardAssignee(taskWorkspaceScope, workItem?.ownerTeamId);
                  if (!check.ok) {
                    toast.error(t(check.messageKey));
                    return;
                  }
                }
                const m = boardMembers.find((x) => x.id === next);
                setAssigneeId(next);
                try {
                  await save({
                    assigneeId: next,
                    assigneeName: m?.name || '',
                    assignees: [{ userId: next, displayName: m?.name || '', avatar: m?.avatar || '' }],
                  });
                } catch {
                  setAssigneeId(prev);
                }
              }}
            >
              <option value="">{t('workspace.projectHubWorkNone')}</option>
              {boardMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </DetailRow>

      {isPlanning ? (
        <>
          <DetailRow label={t('workspace.projectHubWorkFieldStatus')}>
            {canChangeStatus && statusOptions.length > 0 ? (
              <select
                className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1.5 text-xs`}
                value={planningListId}
                disabled={saving}
                onChange={async (e) => {
                  const next = listIdToPlanningStatus(e.target.value, listArr);
                  if (!next) return;
                  await save({ status: next });
                }}
              >
                {statusOptions.map((list) => (
                  <option key={list._id || list.id} value={String(list._id || list.id)}>
                    {list.title || String(list.statusKey || '')}
                  </option>
                ))}
              </select>
            ) : (
              t('workspace.projectHubWorkNone')
            )}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkFieldPriority')}>
            {canChangeStatus ? (
              <select
                className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1.5 text-xs`}
                value={currentPriority}
                disabled={saving}
                onChange={async (e) => {
                  await save({ priority: e.target.value });
                }}
              >
                {priorityOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label || item.key}
                  </option>
                ))}
              </select>
            ) : (
              t('workspace.projectHubWorkNone')
            )}
          </DetailRow>
        </>
      ) : null}

      <DetailRow label={t('workspace.projectHubWorkDetailsParent')}>
        {parentTitle || t('workspace.projectHubWorkNone')}
      </DetailRow>
      <DetailRow label={t('workspace.projectHubWorkFieldEpic')}>
        {epic?.title || t('workspace.projectHubWorkNone')}
      </DetailRow>
      <DetailRow label={t('workspace.projectHubWorkDetailsSprint')}>
        {sprint?.name || t('workspace.projectHubWorkNone')}
      </DetailRow>

      <DetailRow label={t('workspace.projectHubWorkDetailsLabels')}>
        {isPlanning ? (
          (workItem?.tags || workItem?.labels || []).length
            ? (workItem.tags || workItem.labels).join(', ')
            : t('workspace.projectHubWorkNone')
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {TASK_BOARD_LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                disabled={saving}
                onClick={() => void toggleLabel(l.id)}
                className="h-5 min-w-[2rem] rounded-full border border-border px-2"
                style={{
                  backgroundColor: l.color,
                  opacity: labelIds.includes(l.id) ? 1 : 0.35,
                }}
                title={l.id}
                aria-pressed={labelIds.includes(l.id)}
              />
            ))}
            {labelIds.length
              ? labelIds.map((id) => {
                  const l = labelById(id);
                  return l ? (
                    <span key={`sel-${id}`} className="text-[10px] text-muted-foreground">
                      {id}
                    </span>
                  ) : null;
                })
              : null}
          </div>
        )}
      </DetailRow>

      <DetailRow label={t('workspace.projectHubWorkDetailsStart')}>
        <input
          type="date"
          value={startDateLocal}
          disabled={saving}
          className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1 text-xs`}
          onChange={(e) => setStartDateLocal(e.target.value)}
          onBlur={async () => {
            const prev = toDateInputComparable(workItem?.startDate);
            if (startDateLocal === prev) return;
            await save({ startDate: startDateLocal || null });
          }}
        />
      </DetailRow>

      <DetailRow label={t('workspace.projectHubWorkDetailsDue')}>
        <input
          type="date"
          value={dueDateLocal}
          disabled={saving}
          className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1 text-xs`}
          onChange={(e) => setDueDateLocal(e.target.value)}
          onBlur={async () => {
            const prev = toDateInputComparable(workItem?.dueDate);
            if (dueDateLocal === prev) return;
            await save({ dueDate: dueDateLocal || null });
          }}
        />
      </DetailRow>

      {isTimeTrackingV1Enabled() && canEstimate && !isPlanning ? (
        <DetailRow label={t('taskBoard.estimateHours')}>
          <input
            type="number"
            min={0}
            step={0.25}
            value={estimateHours}
            disabled={saving}
            className={`${FIGMA_ORG_TASK_MODAL_INPUT} w-28 py-1 text-xs`}
            onChange={(e) => setEstimateHours(e.target.value)}
            onBlur={async () => {
              const next =
                estimateHours === '' || estimateHours == null ? null : Number(estimateHours);
              const prev =
                workItem?.estimateHours == null || workItem?.estimateHours === ''
                  ? null
                  : Number(workItem.estimateHours);
              if (next === prev || (Number.isNaN(next) && prev == null)) return;
              await save({ estimateHours: next });
            }}
          />
        </DetailRow>
      ) : null}

      <DetailRow label={t('workspace.projectHubWorkDetailsPoints')}>
        {workItem?.storyPoints != null && workItem?.storyPoints !== ''
          ? String(workItem.storyPoints)
          : t('workspace.projectHubWorkNone')}
      </DetailRow>

      <DetailRow label={t('workspace.projectHubWorkDetailsReporter')}>
        {reporterId ? (
          <span className="inline-flex items-center gap-1">
            <UserAvatar
              avatar={reporter.avatar}
              userId={reporter.id}
              name={reporter.displayName}
              size="sm"
            />
            <span>{reporter.displayName}</span>
          </span>
        ) : (
          t('workspace.projectHubWorkNone')
        )}
      </DetailRow>

      {currentList?.title || ctx.listTitle ? (
        <DetailRow label={t('workspace.projectHubWorkFieldList')}>
          {currentList?.title || ctx.listTitle}
        </DetailRow>
      ) : null}
    </div>
  );
}

function toDateInputComparable(iso) {
  if (!iso) return '';
  const s = String(iso);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

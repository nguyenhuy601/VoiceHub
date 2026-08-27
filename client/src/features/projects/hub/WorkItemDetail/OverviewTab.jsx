import { CheckCircle2, Circle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import UserAvatar from '../../../../components/Shared/UserAvatar';
import { useAuth } from '../../../../context/AuthContext';
import { canSetCardAssignee } from '../../../../utils/goldenAssignPolicy';
import { isTimeTrackingV1Enabled } from '../../../../utils/timeTrackingFlag';
import { projectAPI } from '../../../../services/api/projectAPI';
import { taskAPI } from '../../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import { TASK_BOARD_LABELS } from '../../board/taskBoardCardLabels';
import { FIGMA_ORG_TASK_MODAL_INPUT } from '../../../../components/Organization/figmaOrganizationClasses';
import { dueDateTone, formatHubDateShort, listsForStatusSelect, resolveHubActor } from '../projectHubUtils';
import { listIdToPlanningStatus, planningStatusToListId } from '../planningBoardStatus';
import { normalizePriorityConfig } from '../projectPriorityConfig';
import { useWorkItemDetail } from './WorkItemDetailContext';
import {
  buildWorkItemDatePatch,
  dateInputValueFromIso,
  relId,
  resolveWorkItemDueDate,
  resolveWorkItemStartDate,
} from './workItemDetailUtils';

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

export default function OverviewTab() {
  const ctx = useWorkItemDetail();
  const {
    workItem,
    issueId,
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
    apiCtx,
    patchLocalWorkItem,
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
  const { user: authUser } = useAuth();

  const [estimateHint, setEstimateHint] = useState(null);
  const [hintLoading, setHintLoading] = useState(false);

  const applyEstimateHint = useCallback(async () => {
    const orgId = apiCtx?.organizationId || workItem?.organizationId || '';
    const aid = String(assigneeId || workItem?.assigneeId || '').trim();
    if (!orgId || !aid) {
      toast.error(t('taskBoard.estimateHintNeedAssignee'));
      return;
    }
    setHintLoading(true);
    try {
      const baseline =
        estimateHours === '' || estimateHours == null ? undefined : Number(estimateHours);
      const res = await projectAPI.getEstimateHints(orgId, {
        assigneeId: aid,
        baselineHours: Number.isFinite(baseline) ? baseline : undefined,
        issueType: workItem?.issueType,
      });
      const data = res?.data?.data ?? res?.data ?? res;
      setEstimateHint(data);
      if (data?.calibration?.applied && data.calibration.suggestedHours != null) {
        setEstimateHours(String(data.calibration.suggestedHours));
        toast.success(
          t('taskBoard.estimateHintApplied', {
            hours: data.calibration.suggestedHours,
            accuracy: data.userPerformanceHints?.accuracyPct ?? '—',
          })
        );
      } else {
        toast(
          t('taskBoard.estimateHintSkipped', {
            reason: data?.calibration?.reason || data?.confidence || 'low',
          })
        );
      }
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('taskBoard.estimateHintFail') })
      );
    } finally {
      setHintLoading(false);
    }
  }, [
    apiCtx?.organizationId,
    workItem?.organizationId,
    workItem?.assigneeId,
    workItem?.issueType,
    assigneeId,
    estimateHours,
    setEstimateHours,
    t,
  ]);

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
  const resolvedDueDate = resolveWorkItemDueDate(workItem, { isPlanning });
  const dueTone = dueDateTone(resolvedDueDate, workItem?.status || currentList);
  const reporterMembers = useMemo(() => {
    const byId = new Map();
    for (const m of [...(assignableMembers || []), ...(projectMembers || [])]) {
      const id = String(m?.userId || m?.user?._id || m?.user?.id || m?._id || m?.id || '').trim();
      if (!id || byId.has(id)) continue;
      byId.set(id, m);
    }
    return [...byId.values()];
  }, [assignableMembers, projectMembers]);
  const reporter = useMemo(() => {
    const base = resolveHubActor(workItem, reporterMembers);
    if (!base?.userId) return base;
    const looksLikeIdTail =
      !base.name ||
      base.name === base.userId.slice(-6) ||
      /^[a-f0-9]{24}$/i.test(base.name);
    if (!looksLikeIdTail) return base;
    const authId = String(authUser?._id || authUser?.id || '').trim();
    if (authId && authId === base.userId) {
      const selfName = String(
        authUser?.displayName || authUser?.fullName || authUser?.name || authUser?.username || ''
      ).trim();
      if (selfName) {
        return {
          ...base,
          name: selfName,
          avatar: base.avatar || authUser?.avatar || authUser?.avatarUrl || '',
        };
      }
    }
    return base;
  }, [workItem, reporterMembers, authUser]);
  const reporterId = reporter?.userId || '';
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
            {TASK_BOARD_LABELS.map((l) => {
              const selected = labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  disabled={saving}
                  onClick={() => void toggleLabel(l.id)}
                  className="inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2 text-[10px] font-medium capitalize text-foreground"
                  style={{
                    backgroundColor: selected ? l.color : 'transparent',
                    opacity: selected ? 1 : 0.55,
                  }}
                  title={l.id}
                  aria-pressed={selected}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full border border-border/60"
                    style={{ backgroundColor: l.color }}
                    aria-hidden
                  />
                  {l.id}
                </button>
              );
            })}
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
            const prev = dateInputValueFromIso(resolveWorkItemStartDate(workItem));
            if (startDateLocal === prev) return;
            await save(buildWorkItemDatePatch({ isPlanning, startDate: startDateLocal || null }));
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
            const prev = dateInputValueFromIso(resolvedDueDate);
            if (dueDateLocal === prev) return;
            await save(buildWorkItemDatePatch({ isPlanning, dueDate: dueDateLocal || null }));
          }}
        />
      </DetailRow>

      {isTimeTrackingV1Enabled() && canEstimate && !isPlanning ? (
        <DetailRow label={t('taskBoard.estimateHours')}>
          <div className="flex flex-wrap items-center gap-2">
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
            <button
              type="button"
              disabled={saving || hintLoading || !assigneeId}
              className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted disabled:opacity-50"
              onClick={applyEstimateHint}
            >
              {hintLoading ? t('common.loading') : t('taskBoard.estimateHintApply')}
            </button>
          </div>
          {estimateHint?.userPerformanceHints ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t('taskBoard.estimateHintSummary', {
                accuracy: estimateHint.userPerformanceHints.accuracyPct ?? '—',
                avgEst: estimateHint.userPerformanceHints.avgEstimateHours ?? '—',
                avgAct: estimateHint.userPerformanceHints.avgActualHours ?? '—',
                confidence: estimateHint.confidence || 'low',
              })}
            </p>
          ) : null}
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
              avatar={reporter?.avatar}
              userId={reporterId}
              name={reporter?.name}
              size="sm"
            />
            <span>{reporter?.name || reporterId.slice(-6)}</span>
          </span>
        ) : (
          t('workspace.projectHubWorkNone')
        )}
      </DetailRow>

      {!isPlanning && listArr.length > 0 ? (
        <DetailRow label={t('workspace.projectHubWorkFieldList')}>
          {canChangeStatus ? (
            <select
              className={`${FIGMA_ORG_TASK_MODAL_INPUT} py-1.5 text-xs`}
              value={String(workItem?.listId || '')}
              disabled={saving}
              onChange={async (e) => {
                const nextListId = e.target.value;
                const prevListId = String(workItem?.listId || '');
                if (!nextListId || nextListId === prevListId || !issueId) return;
                try {
                  await taskAPI.moveBoardCard(issueId, { toListId: nextListId }, apiCtx || {});
                  patchLocalWorkItem({ listId: nextListId });
                  toast.success(t('taskBoard.saved'));
                } catch (error) {
                  toast.error(
                    resolveApiErrorMessage(error, { t, fallback: t('taskBoard.saveFail') })
                  );
                }
              }}
            >
              {listArr.map((list) => (
                <option key={list._id || list.id} value={String(list._id || list.id)}>
                  {list.title || String(list.statusKey || '')}
                </option>
              ))}
            </select>
          ) : (
            currentList?.title || ctx.listTitle || t('workspace.projectHubWorkNone')
          )}
        </DetailRow>
      ) : null}
    </div>
  );
}

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import { ConfirmDialog } from '../../Shared';
import ProjectHubBacklogIssueRow from './ProjectHubBacklogIssueRow';
import WorkItemDetail from './WorkItemDetail';
import { childWorkStats } from './projectHubBacklogStats';
import ProjectHubEditSprintModal from './ProjectHubEditSprintModal';
import ProjectHubCompleteSprintModal from './ProjectHubCompleteSprintModal';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import ProjectHubSprintSection from './ProjectHubSprintSection';
import {
  assertCanStartSprint,
  buildSprintMemberIdsBySprintId,
  countIssuesByStatusBucket,
  defaultSprintDateRange,
  formatHubDate,
  mergeIssueWithOverlay,
  unwrapPlanningEntity,
} from './projectHubUtils';
import { visibleCreateMenuTypes, isBoardCreateType, isPlanningCreateType } from './projectWorkTypes';
import { useProjectWorkTypes } from './useProjectWorkTypes';
import { isBacklogLevelTwoIssue, isBoardSprintReady, typesInBand } from './projectHubHierarchy';

const PLAN_VIEWS = [
  { id: 'backlog', labelKey: 'workspace.projectHubTabPlanning' },
  { id: 'releases', labelKey: 'workspace.projectHubPlanRoadmap' },
];

const SPRINT_ORDER = { active: 0, planned: 1, closed: 2 };

function isPlanningFeature(issue) {
  return (
    String(issue?.kind || '') === 'planning' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'feature'
  );
}

function BacklogDropZone({ isOverClass, children }) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'backlog',
    data: { type: 'container', containerId: 'backlog' },
  });
  return (
    <div
      ref={setNodeRef}
      className={`min-w-0 overflow-visible rounded-lg border ${isOver ? isOverClass : 'border-transparent'}`}
    >
      {children}
    </div>
  );
}

function resolveDropContainer(over) {
  if (!over) return null;
  const data = over.data?.current;
  if (data?.containerId) return String(data.containerId);
  const id = String(over.id || '');
  if (id === 'backlog' || id.startsWith('sprint:')) return id;
  return null;
}

/**
 * Backlog Jira Scrum: sprint sections + product backlog + DnD.
 */
export default function ProjectHubPlanningPanel({
  projectId = '',
  canManage = false,
  hubCaps = null,
  isDarkMode = false,
  locale = 'vi',
  boardId = '',
  defaultListId = '',
  apiCtx = null,
  boardCards = [],
  lists = [],
  projectCode = '',
  onRefresh = null,
  onPatchBoardCards = null,
  onPatchPlanningItems = null,
  onReloadPlanning = null,
  onReloadSprints = null,
  planningItems = [],
  planningLoading = false,
  planningError = false,
  sprints = [],
  onOpenBoard = null,
  onOpenChangeRequest = null,
  workTypeConfig: serverWorkTypeConfig = null,
}) {
  const { t } = useAppStrings();
  const [view, setView] = useState('backlog');
  const items = Array.isArray(planningItems) ? planningItems : [];
  const [overlay, setOverlay] = useState({});
  const [sprintOverride, setSprintOverride] = useState({});
  const loading = Boolean(planningLoading);
  const loadError = Boolean(planningError);
  const [search, setSearch] = useState('');
  const [epicFilter, setEpicFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [collapsed, setCollapsed] = useState({});
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState('');
  const [itemType, setItemType] = useState('release');
  const [editSprint, setEditSprint] = useState(null);
  const [completeSprintId, setCompleteSprintId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [detailIssueId, setDetailIssueId] = useState('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const inputCls =
    'mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary';
  const cardCls = 'rounded-xl border border-border bg-surface px-3 py-2.5';

  const canCreateEpic = Boolean(canManage || hubCaps?.canCreateEpic);
  const canDeleteEpic = Boolean(canManage || hubCaps?.canDeleteEpic);
  const canUpdateBacklog = Boolean(canManage || hubCaps?.canUpdateBacklog);
  const canCreateStory = Boolean(canManage || hubCaps?.canCreateStory);
  const canCreateTask = Boolean(canManage || hubCaps?.canCreateTask);
  const canCreateBug = Boolean(canManage || hubCaps?.canCreateBug);
  const canLinkEpic = Boolean(
    canManage || hubCaps?.canUpdateEpic || hubCaps?.canUpdateStory || hubCaps?.canUpdateBacklog
  );
  const canManageSprints = Boolean(canManage || hubCaps?.canManageSprints);
  const hubPerms = Array.isArray(hubCaps?.permissions) ? hubCaps.permissions : [];
  const canDeleteSprint = Boolean(
    canManage ||
      hubCaps?.canDeleteSprint ||
      hubPerms.includes('sprint:delete') ||
      canManageSprints
  );
  const canChangeStatus = Boolean(
    canManage ||
      hubCaps?.canUpdateBacklog ||
      hubCaps?.canCreateTask ||
      hubCaps?.canCreateBug ||
      hubCaps?.canUpdateStory
  );
  const canDeleteIssue = Boolean(canManage || canUpdateBacklog);
  const hasBoardColumn = Boolean(boardId && defaultListId);
  const { config: workTypeConfig } = useProjectWorkTypes(projectId, {
    serverConfig: serverWorkTypeConfig,
  });
  const allowedCreateTypes = useMemo(() => {
    const menu = visibleCreateMenuTypes(workTypeConfig, {
      epic: canCreateEpic,
      feature: Boolean(canManage || canUpdateBacklog),
      story: canCreateStory,
      task: canCreateTask,
      bug: canCreateBug,
      subtask: canCreateTask,
    });
    const band2 = new Set(typesInBand(workTypeConfig, 1));
    return menu.filter((id) => band2.has(id) || id === 'feature');
  }, [
    workTypeConfig,
    canCreateEpic,
    canManage,
    canUpdateBacklog,
    canCreateStory,
    canCreateTask,
    canCreateBug,
  ]);

  const reload = useCallback(() => {
    onReloadPlanning?.();
    onReloadSprints?.();
  }, [onReloadPlanning, onReloadSprints]);

  const epics = useMemo(() => items.filter((i) => i.type === 'epic'), [items]);
  const features = useMemo(() => items.filter((i) => i.type === 'feature'), [items]);
  const epicIdSet = useMemo(
    () => new Set(epics.map((e) => String(e._id || e.id || '')).filter(Boolean)),
    [epics]
  );
  const roadmapItems = useMemo(
    () => items.filter((i) => ['roadmap', 'release', 'milestone', 'feature'].includes(i.type)),
    [items]
  );

  const sortedSprints = useMemo(() => {
    return [...sprints].sort((a, b) => {
      const oa = SPRINT_ORDER[String(a.status || 'planned').toLowerCase()] ?? 9;
      const ob = SPRINT_ORDER[String(b.status || 'planned').toLowerCase()] ?? 9;
      if (oa !== ob) return oa - ob;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }, [sprints]);

  const effectiveSprintId = useCallback(
    (card) => {
      const id = String(card?._id || card?.id || '');
      if (Object.prototype.hasOwnProperty.call(sprintOverride, id)) return sprintOverride[id];
      return card?.sprintId || null;
    },
    [sprintOverride]
  );

  const mergedBoardCards = useMemo(
    () => (boardCards || []).map((c) => mergeIssueWithOverlay(c, overlay)),
    [boardCards, overlay]
  );

  const allIssues = useMemo(() => {
    const map = new Map();
    for (const card of mergedBoardCards) {
      const id = String(card._id || card.id || '');
      if (!id) continue;
      map.set(id, { ...card, sprintId: effectiveSprintId(card) });
    }
    for (const item of items) {
      if (String(item?.type || '').toLowerCase() !== 'feature') continue;
      const id = String(item._id || item.id || '');
      if (!id || map.has(id)) continue;
      map.set(id, {
        ...item,
        issueType: 'feature',
        kind: 'planning',
        epicId: item.parentId || null,
        sprintId: null,
      });
    }
    return [...map.values()];
  }, [mergedBoardCards, effectiveSprintId, items]);

  const matchesFilters = useCallback(
    (issue) => {
      if (epicFilter && String(issue.epicId || '') !== epicFilter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const title = String(issue.title || '').toLowerCase();
      const id = String(issue._id || '').toLowerCase();
      return title.includes(q) || id.includes(q);
    },
    [epicFilter, search]
  );

  const issuesBySprint = useMemo(() => {
    const map = new Map();
    for (const issue of allIssues) {
      if (!isBacklogLevelTwoIssue(issue, workTypeConfig, epicIdSet)) continue;
      const sid = String(issue.sprintId || '');
      if (!sid || !matchesFilters(issue)) continue;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid).push(issue);
    }
    return map;
  }, [allIssues, matchesFilters, workTypeConfig, epicIdSet]);

  const memberIdsBySprintId = useMemo(
    () => buildSprintMemberIdsBySprintId(allIssues),
    [allIssues]
  );

  const productBacklog = useMemo(
    () =>
      allIssues.filter(
        (issue) =>
          !issue.sprintId &&
          matchesFilters(issue) &&
          isBacklogLevelTwoIssue(issue, workTypeConfig, epicIdSet)
      ),
    [allIssues, matchesFilters, workTypeConfig, epicIdSet]
  );

  const backlogCounts = useMemo(
    () => countIssuesByStatusBucket(productBacklog, lists),
    [productBacklog, lists]
  );

  const detailIssue = useMemo(
    () => allIssues.find((row) => String(row._id || row.id) === String(detailIssueId)) || null,
    [allIssues, detailIssueId]
  );

  const toggleSelect = (issueId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  };

  const idsForDrag = (issueId) => {
    if (selectedIds.has(issueId) && selectedIds.size > 1) return [...selectedIds];
    return [issueId];
  };

  const refreshAll = () => {
    reload();
    onRefresh?.();
  };

  const patchCards = (updater) => {
    onPatchBoardCards?.(updater);
  };

  const patchPlanning = (updater) => {
    onPatchPlanningItems?.(updater);
  };

  const moveToSprint = async (cardIds, sprintId) => {
    if (!boardId || !sprintId || !cardIds.length || busy) return;
    const prev = sprintOverride;
    setSprintOverride((o) => {
      const next = { ...o };
      for (const id of cardIds) next[id] = sprintId;
      return next;
    });
    setBusy(true);
    try {
      await taskAPI.assignCardsToSprint(boardId, sprintId, cardIds, apiCtx || {});
      toast.success(t('workspace.projectHubPlanAssignedSprint'));
      patchCards((cards) =>
        cards.map((c) =>
          cardIds.includes(String(c._id || c.id)) ? { ...c, sprintId } : c
        )
      );
    } catch (err) {
      setSprintOverride(prev);
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const moveToBacklog = async (cardIds, fromSprintId) => {
    if (!boardId || !fromSprintId || !cardIds.length || busy) return;
    const prev = sprintOverride;
    setSprintOverride((o) => {
      const next = { ...o };
      for (const id of cardIds) next[id] = null;
      return next;
    });
    setBusy(true);
    try {
      await Promise.all(
        cardIds.map((id) => taskAPI.removeCardFromSprint(boardId, fromSprintId, id, apiCtx || {}))
      );
      toast.success(t('workspace.projectHubBacklogRemovedFromSprint'));
      patchCards((cards) =>
        cards.map((c) =>
          cardIds.includes(String(c._id || c.id)) ? { ...c, sprintId: null } : c
        )
      );
    } catch (err) {
      setSprintOverride(prev);
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const onDragEnd = async (event) => {
    const { active, over } = event;
    if (!over) return;
    const issueId = active.data?.current?.issueId || String(active.id || '').replace(/^issue:/, '');
    const fromContainer = String(active.data?.current?.containerId || '');
    const dest = resolveDropContainer(over);
    if (!issueId || !dest || dest === fromContainer) return;
    const cardIds = idsForDrag(issueId).filter((id) => {
      const issue = allIssues.find((row) => String(row._id || row.id) === String(id));
      return issue && !isPlanningFeature(issue);
    });
    if (!cardIds.length) return;
    if (dest.startsWith('sprint:')) {
      await moveToSprint(cardIds, dest.slice('sprint:'.length));
      return;
    }
    if (dest === 'backlog') {
      const fromSprint = fromContainer.startsWith('sprint:') ? fromContainer.slice('sprint:'.length) : null;
      if (fromSprint) await moveToBacklog(cardIds, fromSprint);
    }
  };

  const createSprint = async () => {
    if (!canManageSprints || busy) return;
    setBusy(true);
    try {
      await projectAPI.createSprint(projectId, {
        name: t('workspace.projectHubBacklogSprintDefaultName', { n: sprints.length + 1 }),
        status: 'planned',
        boardId: boardId || undefined,
      });
      toast.success(t('workspace.projectHubPlanSprintCreated'));
      await onReloadSprints?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const saveSprint = async (patch) => {
    if (!editSprint || busy) return;
    if (patch?.startDate && patch?.endDate) {
      const range = defaultSprintDateRange({
        startDate: patch.startDate,
        endDate: patch.endDate,
      });
      if (range.error) {
        toast.error(t('workspace.projectHubSprintDatesInvalid'));
        return;
      }
    }
    setBusy(true);
    try {
      await projectAPI.patchSprint(projectId, editSprint._id, patch);
      toast.success(t('workspace.projectHubBacklogSprintUpdated'));
      setEditSprint(null);
      await onReloadSprints?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const startSprint = async (sprintId) => {
    if (!canManageSprints || busy || !projectId) return;
    const sprint = sprints.find((row) => String(row._id || row.id) === String(sprintId));
    if (!sprint) {
      toast.error(t('workspace.projectHubPlanSprintFail'));
      return;
    }
    const issueCount = (issuesBySprint.get(String(sprintId)) || []).length;
    const check = assertCanStartSprint({
      sprint,
      sprints,
      issueCount,
      canManage: canManageSprints,
      memberIdsBySprintId,
    });
    if (!check.ok) {
      if (check.errorKey !== 'workspace.projectHubSprintStartNoPermission') {
        toast.error(t(check.errorKey));
      }
      return;
    }
    const dates = defaultSprintDateRange(sprint);
    if (dates.error) {
      toast.error(t('workspace.projectHubSprintDatesInvalid'));
      return;
    }
    setBusy(true);
    try {
      await projectAPI.patchSprint(projectId, sprintId, {
        status: 'active',
        startDate: dates.startDate,
        endDate: dates.endDate,
      });
      toast.success(t('workspace.projectHubPlanSprintStarted'));
      await onReloadSprints?.();
      onReloadPlanning?.();
      onRefresh?.();
      const ready = isBoardSprintReady([
        {
          ...sprint,
          status: 'active',
          startDate: dates.startDate,
          endDate: dates.endDate,
        },
      ]);
      if (ready) onOpenBoard?.();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const openCompleteSprint = (sprintId) => {
    if (!canManageSprints || busy) return;
    setCompleteSprintId(sprintId);
  };

  const deleteSprint = async (sprintId) => {
    if (!canDeleteSprint || busy) return;
    if (!projectId && !boardId) return;
    setBusy(true);
    try {
      if (projectId) {
        await projectAPI.deleteSprint(projectId, sprintId);
      } else {
        await taskAPI.deleteBoardSprint(boardId, sprintId, apiCtx || {});
      }
      toast.success(t('workspace.projectHubBacklogSprintDeleted'));
      refreshAll();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanSprintFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const createIssue = async (issueType, text, sprintId = null) => {
    const typeId = String(issueType || '').toLowerCase();
    if (!text || busy) return;

    if (isPlanningCreateType(typeId)) {
      const allowed = typeId === 'epic' ? canCreateEpic : Boolean(canManage || canUpdateBacklog);
      if (!allowed) return;
      setBusy(true);
      try {
        const res = await projectAPI.createPlanningItem(projectId, {
          type: typeId,
          title: text,
          ...(typeId === 'feature' && epicFilter ? { parentId: epicFilter } : {}),
        });
        const created = unwrapPlanningEntity(res);
        if (created) {
          patchPlanning((prev) => [
            ...prev,
            {
              ...created,
              type: typeId,
              title: text,
              ...(typeId === 'feature' && epicFilter ? { parentId: epicFilter } : {}),
            },
          ]);
        } else reload();
        toast.success(t('workspace.projectHubPlanCreated'));
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!hasBoardColumn) return;

    if (typeId === 'subtask') {
      const parentId = [...selectedIds][0];
      if (!parentId) {
        toast.error(t('workspace.projectHubBacklogSubtaskNeedParent'));
        return;
      }
      setBusy(true);
      try {
        const res = await taskAPI.createBoardCard(
          boardId,
          {
            listId: defaultListId,
            title: text,
            issueType: 'task',
            parentTaskId: parentId,
            ...(epicFilter ? { epicId: epicFilter } : {}),
          },
          apiCtx || {}
        );
        const created = unwrapTaskApiPayload(res) || unwrapPlanningEntity(res);
        const newId = String(created?._id || created?.id || '');
        if (newId) {
          setOverlay((prev) => ({
            ...prev,
            [newId]: { issueType: 'task', epicId: epicFilter || null, estimateHours: null },
          }));
        }
        if (sprintId && newId) {
          await taskAPI.assignCardsToSprint(boardId, sprintId, [newId], apiCtx || {});
          setSprintOverride((o) => ({ ...o, [newId]: sprintId }));
        }
        if (created) {
          patchCards((cards) => {
            const id = String(created._id || created.id || '');
            if (!id || cards.some((c) => String(c._id) === id)) {
              return cards.map((c) =>
                String(c._id) === id ? { ...c, ...created, issueType: 'task', parentTaskId: parentId } : c
              );
            }
            return [
              ...cards,
              {
                ...created,
                title: text,
                issueType: 'task',
                parentTaskId: parentId,
                listId: created.listId || defaultListId,
                ...(sprintId ? { sprintId } : {}),
                ...(epicFilter ? { epicId: epicFilter } : {}),
              },
            ];
          });
        }
        toast.success(t('workspace.projectHubBacklogCreated'));
      } catch (err) {
        toast.error(
          resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (!isBoardCreateType(typeId)) return;
    setBusy(true);
    try {
      const boardIssueType =
        typeId === 'bug' || typeId === 'story' || typeId === 'task' ? typeId : 'task';
      const res = await taskAPI.createBoardCard(
        boardId,
        {
          listId: defaultListId,
          title: text,
          issueType: boardIssueType,
          ...(epicFilter ? { epicId: epicFilter } : {}),
        },
        apiCtx || {}
      );
      const created = unwrapTaskApiPayload(res) || unwrapPlanningEntity(res);
      const newId = String(created?._id || created?.id || '');
      if (newId) {
        setOverlay((prev) => ({
          ...prev,
          [newId]: { issueType: boardIssueType, epicId: epicFilter || null, estimateHours: null },
        }));
      }
      if (sprintId && newId) {
        await taskAPI.assignCardsToSprint(boardId, sprintId, [newId], apiCtx || {});
        setSprintOverride((o) => ({ ...o, [newId]: sprintId }));
      }
      if (created) {
        patchCards((cards) => {
          const id = String(created._id || created.id || '');
          if (!id) return cards;
          if (cards.some((c) => String(c._id) === id)) {
            return cards.map((c) =>
              String(c._id) === id
                ? { ...c, ...created, issueType: created.issueType || boardIssueType }
                : c
            );
          }
          return [
            ...cards,
            {
              ...created,
              title: text,
              issueType: created.issueType || boardIssueType,
              listId: created.listId || defaultListId,
              ...(epicFilter ? { epicId: epicFilter } : {}),
              ...(sprintId ? { sprintId } : {}),
            },
          ];
        });
      }
      toast.success(t('workspace.projectHubBacklogCreated'));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const deleteIssue = async (issueId) => {
    if (!canDeleteIssue || busy) return;
    const issue = allIssues.find((row) => String(row._id || row.id) === String(issueId));
    setBusy(true);
    try {
      if (isPlanningFeature(issue)) {
        await projectAPI.deletePlanningItem(projectId, issueId);
        patchPlanning((prev) => prev.filter((i) => String(i._id || i.id) !== String(issueId)));
      } else {
        await taskAPI.archiveBoardCard(issueId, apiCtx || {});
        patchCards((cards) => cards.filter((c) => String(c._id || c.id) !== String(issueId)));
      }
      toast.success(t('workspace.projectHubBacklogDeleted'));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(issueId);
        return next;
      });
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubBacklogDeleteFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const linkEpic = async (taskId, epicId) => {
    if (!canLinkEpic || busy) return;
    const issue = allIssues.find((row) => String(row._id || row.id) === String(taskId));
    setBusy(true);
    try {
      if (isPlanningFeature(issue)) {
        await projectAPI.patchPlanningItem(projectId, taskId, { parentId: epicId || null });
        patchPlanning((prev) =>
          prev.map((i) =>
            String(i._id || i.id) === String(taskId) ? { ...i, parentId: epicId || null } : i
          )
        );
      } else {
        await projectAPI.linkTaskPlanning(projectId, taskId, { epicId: epicId || null });
        setOverlay((prev) => ({
          ...prev,
          [taskId]: { ...(prev[taskId] || {}), epicId: epicId || null },
        }));
        patchCards((cards) =>
          cards.map((c) =>
            String(c._id || c.id) === String(taskId) ? { ...c, epicId: epicId || null } : c
          )
        );
      }
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanLinkFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (issueId, listId) => {
    const issue = allIssues.find((row) => String(row._id || row.id) === String(issueId));
    if (isPlanningFeature(issue)) return;
    if (!canChangeStatus || !listId || busy) return;
    setBusy(true);
    try {
      await taskAPI.moveBoardCard(issueId, { toListId: listId }, apiCtx || {});
      patchCards((cards) =>
        cards.map((c) =>
          String(c._id || c.id) === String(issueId) ? { ...c, listId } : c
        )
      );
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const createPlanningItem = async () => {
    const typeToCreate = view === 'releases' ? itemType : 'epic';
    const allowed = typeToCreate === 'epic' ? canCreateEpic : canUpdateBacklog;
    if (!allowed || !title.trim() || busy) return;
    const nextTitle = title.trim();
    setBusy(true);
    try {
      const res = await projectAPI.createPlanningItem(projectId, {
        type: typeToCreate,
        title: nextTitle,
      });
      const created = unwrapPlanningEntity(res);
      setTitle('');
      toast.success(t('workspace.projectHubPlanCreated'));
      if (created) patchPlanning((prev) => [...prev, { ...created, type: typeToCreate, title: nextTitle }]);
      else reload();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const removePlanningItem = async (itemId) => {
    const item = items.find((i) => String(i._id) === String(itemId));
    const allowed = String(item?.type || '') === 'epic' ? canDeleteEpic : canUpdateBacklog;
    if (!allowed || busy) return;
    setBusy(true);
    try {
      await projectAPI.deletePlanningItem(projectId, itemId);
      patchPlanning((prev) => prev.filter((i) => String(i._id) !== String(itemId)));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanDeleteFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const renderIssueRow = (issue, containerId) => (
    <ProjectHubBacklogIssueRow
      key={issue._id}
      issue={issue}
      lists={lists}
      epics={epics}
      projectCode={projectCode}
      containerId={containerId}
      selected={selectedIds.has(String(issue._id))}
      onToggleSelect={toggleSelect}
      canDelete={canDeleteIssue}
      canLinkEpic={canLinkEpic}
      canChangeStatus={canChangeStatus && !isPlanningFeature(issue)}
      onDelete={(id, issueTitle) => setConfirm({ kind: 'issue', id, title: issueTitle })}
      onLinkEpic={linkEpic}
      onChangeStatus={changeStatus}
      locale={locale}
      isDarkMode={isDarkMode}
      t={t}
      busy={busy}
      childStats={childWorkStats(mergedBoardCards, issue._id || issue.id, lists)}
      onOpen={setDetailIssueId}
    />
  );

  if (loading) {
    return (
      <div className={`px-4 py-8 text-center text-sm ${muted}`} role="status">
        {t('workspace.projectHubPlanLoading')}
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <p className={`text-sm ${muted}`}>{t('workspace.projectHubPlanLoadFail')}</p>
        <button
          type="button"
          onClick={reload}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
        >
          {t('workspace.projectHubPlanRetry')}
        </button>
      </div>
    );
  }

  const backlogCollapsed = Boolean(collapsed.backlog);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-4 pt-3">
        <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabPlanning')}</h3>
        <p className={`mb-2 text-xs ${muted}`}>{t('workspace.projectHubPlanHint')}</p>
        <div className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label={t('workspace.projectHubTabPlanning')}>
          {PLAN_VIEWS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={view === tab.id}
              onClick={() => setView(tab.id)}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                view === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : isDarkMode
                    ? 'bg-white/5 text-slate-300'
                    : 'bg-muted text-muted-foreground'
              }`}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-overlay min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {view === 'backlog' ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 flex-1">
                <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  className="w-full rounded-lg border border-border bg-background py-2 pl-7 pr-3 text-sm outline-none focus:border-primary"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('workspace.projectHubBacklogSearch')}
                  aria-label={t('workspace.projectHubBacklogSearch')}
                />
              </label>
              <select
                className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold"
                value={epicFilter}
                onChange={(e) => setEpicFilter(e.target.value)}
                aria-label={t('workspace.projectHubPlanFilterEpic')}
              >
                <option value="">{t('workspace.projectHubPlanAllEpics')}</option>
                {epics.map((ep) => (
                  <option key={ep._id} value={String(ep._id)}>
                    {ep.title}
                  </option>
                ))}
              </select>
              {canManageSprints ? (
                <button
                  type="button"
                  onClick={createSprint}
                  disabled={busy}
                  className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                >
                  {t('workspace.projectHubBacklogCreateSprint')}
                </button>
              ) : null}
            </div>

            <div className="space-y-3">
              {sortedSprints.length === 0 ? (
                <p className={`rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm ${muted}`}>
                  {t('workspace.projectHubPlanSprintsEmpty')}
                </p>
              ) : (
                sortedSprints.map((sprint) => {
                  const sid = String(sprint._id);
                  const sprintIssues = issuesBySprint.get(sid) || [];
                  return (
                    <ProjectHubSprintSection
                      key={sprint._id}
                      sprint={sprint}
                      issues={sprintIssues}
                      lists={lists}
                      canManageSprints={canManageSprints}
                      canDeleteSprint={canDeleteSprint}
                      sprints={sprints}
                      memberIdsBySprintId={memberIdsBySprintId}
                      allowedCreateTypes={allowedCreateTypes}
                      depthById={workTypeConfig.depthById}
                      hasBoardColumn={hasBoardColumn}
                      busy={busy}
                      collapsed={Boolean(collapsed[sid])}
                      onToggleCollapse={() =>
                        setCollapsed((c) => ({ ...c, [sid]: !c[sid] }))
                      }
                      onStart={() => startSprint(sid)}
                      onComplete={() => openCompleteSprint(sid)}
                      onEdit={() => setEditSprint(sprint)}
                      onDeleteSprint={() => setConfirm({ kind: 'sprint', id: sid, title: sprint.name })}
                      onCreateIssue={(type, text) => createIssue(type, text, sid)}
                      onOpenBoard={onOpenBoard}
                      t={t}
                      isDarkMode={isDarkMode}
                    >
                      {sprintIssues.map((issue) => renderIssueRow(issue, `sprint:${sid}`))}
                    </ProjectHubSprintSection>
                  );
                })
              )}

              <section className="min-w-0 rounded-xl border border-border bg-surface">
                <header className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, backlog: !c.backlog }))}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label={
                      backlogCollapsed
                        ? t('workspace.projectHubBacklogExpandAria')
                        : t('workspace.projectHubBacklogCollapseAria')
                    }
                  >
                    {backlogCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                  </button>
                  <h4 className="text-sm font-bold text-foreground">{t('workspace.projectHubPlanProductBacklog')}</h4>
                  <span className="text-[11px] text-muted-foreground">
                    ({t('workspace.projectHubBacklogWorkItems', { n: productBacklog.length })})
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded bg-muted px-1 py-0.5 text-[10px] font-bold text-muted-foreground">
                      {backlogCounts.todo}
                    </span>
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded bg-primary/15 px-1 py-0.5 text-[10px] font-bold text-primary">
                      {backlogCounts.progress}
                    </span>
                    <span className="inline-flex min-w-[1.25rem] justify-center rounded bg-primary/25 px-1 py-0.5 text-[10px] font-bold text-primary">
                      {backlogCounts.done}
                    </span>
                  </div>
                </header>
                {backlogCollapsed ? null : (
                  <div className="min-w-0 px-2 pb-2">
                    <BacklogDropZone isOverClass="border-primary bg-primary/5">
                      {productBacklog.length === 0 ? (
                        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                          {t('workspace.projectHubPlanBacklogEmpty')}
                        </p>
                      ) : (
                        productBacklog.map((issue) => renderIssueRow(issue, 'backlog'))
                      )}
                    </BacklogDropZone>
                    <ProjectHubInlineCreateBar
                      allowedTypes={allowedCreateTypes}
                      depthById={workTypeConfig.depthById}
                      hasBoardColumn={hasBoardColumn}
                      busy={busy}
                      onCreate={(type, text) => createIssue(type, text, null)}
                      t={t}
                    />
                  </div>
                )}
              </section>
            </div>
          </DndContext>
        ) : null}

        {view === 'releases' ? (
          <div>
            {canUpdateBacklog ? (
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <select
                  className={`${inputCls} mt-0 sm:max-w-[160px]`}
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                  aria-label={t('workspace.projectHubPlanRoadmap')}
                >
                  <option value="release">release</option>
                  <option value="roadmap">roadmap</option>
                  <option value="milestone">milestone</option>
                  <option value="feature">feature</option>
                </select>
                <input
                  className={`${inputCls} mt-0 min-w-0 flex-1`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('workspace.projectHubPlanItemPh')}
                />
                <button
                  type="button"
                  onClick={createPlanningItem}
                  disabled={busy}
                  className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {t('workspace.projectHubPlanAdd')}
                </button>
              </div>
            ) : null}
            {roadmapItems.length === 0 ? (
              <p className={`rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm ${muted}`}>
                {t('workspace.projectHubPlanRoadmapEmpty')}
              </p>
            ) : (
              <ul className="space-y-2">
                {roadmapItems.map((item) => (
                  <li key={item._id} className={cardCls}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase">
                          {item.type}
                        </span>
                        <span className={`text-sm font-semibold ${titleCls}`}>{item.title}</span>
                        <div className={`mt-0.5 text-[11px] ${muted}`}>
                          {item.status}
                          {item.targetDate ? ` · ${formatHubDate(item.targetDate, locale)}` : ''}
                        </div>
                      </div>
                      {canUpdateBacklog ? (
                        <button
                          type="button"
                          onClick={() => removePlanningItem(item._id)}
                          className="text-[11px] text-destructive"
                        >
                          {t('workspace.projectHubPlanDelete')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>

      <ProjectHubEditSprintModal
        isOpen={Boolean(editSprint)}
        sprint={editSprint}
        busy={busy}
        canDelete={Boolean(
          canDeleteSprint &&
            !['active', 'closed', 'completed', 'done'].includes(
              String(editSprint?.status || editSprint?.state || 'planned').toLowerCase()
            )
        )}
        onClose={() => setEditSprint(null)}
        onSave={saveSprint}
        onDelete={() => {
          const s = editSprint;
          setEditSprint(null);
          if (!s?._id) return;
          setConfirm({ kind: 'sprint', id: String(s._id), title: s.name });
        }}
        t={t}
      />

      <ProjectHubCompleteSprintModal
        isOpen={Boolean(completeSprintId)}
        projectId={projectId}
        sprint={completeSprintId ? sprints.find((s) => String(s._id) === String(completeSprintId)) || null : null}
        canManageSprints={canManageSprints}
        onClose={() => setCompleteSprintId(null)}
        onCompleted={() => {
          toast.success(t('workspace.projectHubPlanSprintClosed'));
          refreshAll();
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title={
          confirm?.kind === 'sprint'
            ? t('workspace.projectHubBacklogDeleteSprintTitle')
            : t('workspace.projectHubBacklogDeleteIssueTitle')
        }
        message={
          confirm?.kind === 'sprint'
            ? t('workspace.projectHubBacklogDeleteSprintMsg', { name: confirm?.title || '' })
            : t('workspace.projectHubBacklogDeleteIssueMsg', { title: confirm?.title || '' })
        }
        confirmText={t('workspace.projectHubBacklogDeleteIssue')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          if (confirm?.kind === 'sprint') return deleteSprint(confirm.id);
          if (confirm?.kind === 'issue') return deleteIssue(confirm.id);
          return undefined;
        }}
      />
    </div>
    {detailIssue ? (
      <WorkItemDetail
        key={String(detailIssue._id || detailIssue.id)}
        open
        chrome="drawer"
        drawerLayout="embedded"
        workItem={detailIssue}
        boardCards={mergedBoardCards}
        lists={lists}
        epics={epics}
        features={features}
        sprints={sprints}
        projectCode={projectCode}
        projectId={projectId}
        boardId={boardId}
        defaultListId={defaultListId}
        apiCtx={apiCtx}
        isDarkMode={isDarkMode}
        locale={locale}
        canCreateTask={canCreateTask && hasBoardColumn}
        canComment={canChangeStatus}
        canChangeStatus={canChangeStatus}
        workTypeConfig={workTypeConfig}
        onClose={() => setDetailIssueId('')}
        onOpenWorkItem={(card) => {
          const id = String(card?._id || card?.id || '');
          if (id) setDetailIssueId(id);
        }}
        onPatchBoardCards={patchCards}
        onOpenChangeRequest={onOpenChangeRequest}
        onUpdateCard={async (cardId, patch) => {
          patchCards((cards) =>
            (cards || []).map((c) =>
              String(c._id || c.id) === String(cardId) ? { ...c, ...patch } : c
            )
          );
          const keys = Object.keys(patch || {}).filter((k) => k !== '__localOnly');
          if (keys.length === 1 && keys[0] === 'comments') return;
          if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
            try {
              await taskAPI.updateBoardCard(cardId, patch, apiCtx || {});
            } catch (err) {
              toast.error(
                resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
              );
              throw err;
            }
          }
        }}
      />
    ) : null}
    </div>
  );
}

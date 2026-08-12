import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../../locales/appStrings';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import ConfirmDialog from '../../Shared/ConfirmDialog';
import TaskBoardCardDetailModal from '../TaskBoardCardDetailModal';
import {
  buildListTree,
  childTypesForParent,
  comparePlanningOrder,
  computeInsertSortOrder,
  isLiveListDragValid,
  isTypePreservingDrop,
  resolveLiveListDragAction,
} from './projectHubHierarchy';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import ProjectHubListBulkBar from './ProjectHubListBulkBar';
import ProjectHubListRow, { LIST_TABLE_GRID } from './ProjectHubListRow';
import { unwrapPlanningEntity } from './projectHubUtils';
import {
  isBoardCreateType,
  isPlanningCreateType,
  depthDeltaFromPointerX,
  visibleCreateMenuTypes,
} from './projectWorkTypes';
import { useProjectWorkTypes } from './useProjectWorkTypes';

function listCollisionDetection(args) {
  const hits = pointerWithin(args);
  if (hits.length > 0) return hits;
  return closestCenter(args);
}

function flattenVisible(nodes, collapsed) {
  const out = [];
  const walk = (list, depth) => {
    for (const node of list || []) {
      out.push({ node, depth });
      if (!collapsed[node.id] && node.children?.length) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

function countRootNodes(nodes) {
  return Array.isArray(nodes) ? nodes.length : 0;
}

function findNodeById(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

function entityId(row) {
  return String(row?._id || row?.id || '');
}

function upsertById(list, row) {
  const id = entityId(row);
  if (!id) return Array.isArray(list) ? list : [];
  const current = Array.isArray(list) ? list : [];
  let found = false;
  const next = current.map((item) => {
    if (entityId(item) !== id) return item;
    found = true;
    return { ...item, ...row };
  });
  if (!found) next.push(row);
  return next;
}

function removeById(list, id) {
  const target = String(id || '');
  return (Array.isArray(list) ? list : []).filter((item) => entityId(item) !== target);
}

/**
 * Tab List — bảng hierarchy kiểu Jira (Work + meta columns).
 */
export default function ProjectHubListPanel({
  projectId = '',
  boardId = '',
  defaultListId = '',
  boardCards = [],
  lists = [],
  projectCode = '',
  hubCaps = null,
  canManage = false,
  apiCtx = null,
  isDarkMode = false,
  locale = 'en',
  workspaceSlug = '',
  onRefresh = null,
  onUpdateCard = null,
  onPatchBoardCards = null,
  onPatchPlanningItems = null,
  onReloadPlanning = null,
  planningItems = [],
  planningLoading = false,
  planningError = false,
  onOpenSettings = null,
  listActive = true,
  membersEpoch = 0,
  workTypeConfig: serverWorkTypeConfig = null,
}) {
  const { t } = useAppStrings();
  const { config: workTypeConfig } = useProjectWorkTypes(projectId, {
    serverConfig: serverWorkTypeConfig,
  });
  const loading = Boolean(planningLoading);
  const loadError = Boolean(planningError);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState({});
  const [creatingUnderId, setCreatingUnderId] = useState('');
  const [rootCreateOpen, setRootCreateOpen] = useState(false);
  const [detailCard, setDetailCard] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [dragSession, setDragSession] = useState(() => ({
    id: '',
    overId: '',
    deltaX: 0,
    deltaY: 0,
  }));
  const activeDragId = dragSession.id;
  const dragDeltaX = dragSession.deltaX;
  const [assignableMembers, setAssignableMembers] = useState([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const canCreateEpic = Boolean(canManage || hubCaps?.canCreateEpic);
  const canDeleteEpic = Boolean(canManage || hubCaps?.canDeleteEpic);
  const canUpdateBacklog = Boolean(canManage || hubCaps?.canUpdateBacklog);
  const canCreateStory = Boolean(canManage || hubCaps?.canCreateStory);
  const canCreateTask = Boolean(canManage || hubCaps?.canCreateTask);
  const canCreateBug = Boolean(canManage || hubCaps?.canCreateBug);
  const canChangeStatus = Boolean(
    canManage || hubCaps?.canUpdateBacklog || hubCaps?.canCreateTask || hubCaps?.canUpdateStory
  );
  const canDeleteIssue = Boolean(canManage || canUpdateBacklog);
  const hasBoardColumn = Boolean(boardId && defaultListId);

  const createCaps = useMemo(
    () => ({
      epic: canCreateEpic,
      feature: Boolean(canManage || canUpdateBacklog),
      story: canCreateStory,
      task: canCreateTask,
      bug: canCreateBug,
      subtask: canCreateTask,
    }),
    [canCreateEpic, canManage, canUpdateBacklog, canCreateStory, canCreateTask, canCreateBug]
  );

  const rootCreateTypes = useMemo(
    () => visibleCreateMenuTypes(workTypeConfig, createCaps).filter((id) => id !== 'subtask'),
    [workTypeConfig, createCaps]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!boardId) {
        setAssignableMembers([]);
        return;
      }
      if (!listActive) return;
      setMembersLoading(true);
      try {
        const res = await taskAPI.getBoardAssignableMembers(boardId, apiCtx || {});
        const payload = unwrapTaskApiPayload(res);
        const rows = Array.isArray(payload?.members) ? payload.members : [];
        if (!cancelled) {
          setAssignableMembers(
            rows
              .map((m) => ({
                id: String(m.userId || m.id || ''),
                name: String(m.displayName || m.username || m.name || '').trim(),
                username: String(m.username || '').trim(),
                avatarUrl: m.avatar || m.avatarUrl || '',
              }))
              .filter((m) => m.id && m.name)
          );
        }
      } catch {
        if (!cancelled) setAssignableMembers([]);
      } finally {
        if (!cancelled) setMembersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, workspaceSlug, listActive, membersEpoch]);

  const epics = useMemo(
    () => planningItems.filter((i) => String(i.type || '').toLowerCase() === 'epic'),
    [planningItems]
  );
  const features = useMemo(
    () => planningItems.filter((i) => String(i.type || '').toLowerCase() === 'feature'),
    [planningItems]
  );

  const tree = useMemo(
    () =>
      buildListTree({
        epics,
        features,
        cards: boardCards,
        config: workTypeConfig,
      }),
    [epics, features, boardCards, workTypeConfig]
  );

  const flatRows = useMemo(() => flattenVisible(tree, collapsed), [tree, collapsed]);
  const rootCount = countRootNodes(tree);
  const activeDragNode = activeDragId ? findNodeById(tree, activeDragId) : null;
  const dragOverNode = dragSession.overId ? findNodeById(tree, dragSession.overId) : null;
  const dragValid = Boolean(
    activeDragNode &&
      isLiveListDragValid({
        activeNode: activeDragNode,
        overNode: dragOverNode,
        deltaX: dragSession.deltaX,
        deltaY: dragSession.deltaY,
        tree,
        flatRows,
        config: workTypeConfig,
      })
  );

  const listMap = useMemo(() => {
    const map = {};
    for (const l of lists || []) {
      const id = String(l._id || l.id || '');
      if (id) map[id] = l;
    }
    return map;
  }, [lists]);

  const allVisibleIds = useMemo(() => flatRows.map(({ node }) => node.id), [flatRows]);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  const refreshAll = () => {
    onReloadPlanning?.();
    onRefresh?.();
  };

  const patchCards = useCallback(
    (updater) => {
      onPatchBoardCards?.(updater);
    },
    [onPatchBoardCards]
  );

  const patchPlanning = useCallback(
    (updater) => {
      onPatchPlanningItems?.(updater);
    },
    [onPatchPlanningItems]
  );

  const applyDrop = async (action, activeNode = null) => {
    if (!action || action.mode === 'noop' || busy) return;
    if (activeNode && !isTypePreservingDrop(activeNode, action)) return;

    const activeKey = String(action.activeId);
    const cardsSnapshot = Array.isArray(boardCards) ? boardCards : [];
    const planningSnapshot = Array.isArray(planningItems) ? planningItems : [];

    let cardPatch = null;
    if (action.kind === 'card') {
      if (action.mode === 'detach-card-epic') {
        cardPatch = { parentTaskId: null, epicId: null };
      } else if (action.mode === 'attach-card-epic') {
        cardPatch = { parentTaskId: null, epicId: action.epicId ?? null };
      } else if (action.mode === 'attach-card-parent' || action.mode === 'align-card-siblings') {
        cardPatch = { parentTaskId: action.parentTaskId ?? null };
        if (action.epicId !== undefined) cardPatch.epicId = action.epicId;
      }
    }

    let planningPatch = null;
    if (action.kind === 'planning' && action.mode === 'reorder-planning') {
      const activeRow = planningSnapshot.find((i) => entityId(i) === activeKey);
      const type = String(activeRow?.type || 'epic').toLowerCase();
      const parentKey = type === 'epic' ? '' : String(activeRow?.parentId || '');
      const siblings = planningSnapshot
        .filter((i) => {
          if (String(i.type || '').toLowerCase() !== type) return false;
          if (type === 'epic') return true;
          return String(i.parentId || '') === parentKey;
        })
        .sort(comparePlanningOrder);
      const sortOrder = computeInsertSortOrder(siblings, action.activeId, action.overId);
      if (sortOrder == null) return;
      planningPatch = { sortOrder };
    } else if (
      action.kind === 'planning' &&
      (action.mode === 'attach-feature-epic' || action.mode === 'align-feature-siblings')
    ) {
      planningPatch = { parentId: action.parentId };
    }

    if (!cardPatch && !planningPatch) return;

    if (cardPatch) {
      patchCards((cards) =>
        (Array.isArray(cards) ? cards : []).map((c) =>
          entityId(c) === activeKey ? { ...c, ...cardPatch } : c
        )
      );
    }
    if (planningPatch) {
      patchPlanning((prev) =>
        (Array.isArray(prev) ? prev : []).map((item) =>
          entityId(item) === activeKey ? { ...item, ...planningPatch } : item
        )
      );
    }

    setBusy(true);
    try {
      if (cardPatch) {
        await taskAPI.updateBoardCard(action.activeId, cardPatch, apiCtx || {});
      } else if (planningPatch) {
        await projectAPI.patchPlanningItem(projectId, action.activeId, planningPatch);
      }
    } catch (err) {
      if (cardPatch) patchCards(() => cardsSnapshot);
      if (planningPatch) patchPlanning(() => planningSnapshot);
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const assignCard = async (node, member) => {
    if (!node || node.kind !== 'card' || busy) return;
    const cardId = String(node.raw?._id || node.raw?.id || '');
    if (!cardId) return;
    setBusy(true);
    try {
      const patch = member
        ? {
            assigneeId: member.id,
            assigneeName: member.name,
            assignees: [
              {
                userId: member.id,
                displayName: member.name,
                avatar: member.avatarUrl || '',
              },
            ],
          }
        : { assigneeId: null, assigneeName: '', assignees: [] };
      if (onUpdateCard) {
        await onUpdateCard(cardId, patch);
      } else {
        await taskAPI.updateBoardCard(cardId, patch, apiCtx || {});
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === cardId ? { ...c, ...patch } : c))
        );
      }
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubListAssigneeFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const createRoot = async (typeId, text) => {
    await createChild(null, typeId, text);
    setRootCreateOpen(false);
  };

  const createChild = async (parentNode, typeId, text) => {
    const type = String(typeId || '').toLowerCase();
    if (!text || busy) return;
    setBusy(true);
    try {
      if (isPlanningCreateType(type)) {
        const parentId =
          parentNode?.kind === 'planning'
            ? String(parentNode.raw?._id || parentNode.raw?.id || '')
            : '';
        const res = await projectAPI.createPlanningItem(projectId, {
          type,
          title: text,
          ...(parentId ? { parentId } : {}),
        });
        const created = unwrapPlanningEntity(res);
        if (created) patchPlanning((prev) => upsertById(prev, { ...created, type, title: text }));
        else onReloadPlanning?.();
        toast.success(t('workspace.projectHubPlanCreated'));
        return;
      }

      if (!hasBoardColumn) {
        toast.error(t('workspace.projectHubPlanNoBoardForStory'));
        return;
      }

      const parentRaw = parentNode?.raw || {};
      const parentEpicId =
        parentNode?.workType === 'epic'
          ? String(parentRaw._id || parentRaw.id || '')
          : parentRaw.epicId
            ? String(parentRaw.epicId)
            : '';

      if (type === 'subtask') {
        if (parentNode?.kind !== 'card') {
          toast.error(t('workspace.projectHubBacklogSubtaskNeedParent'));
          return;
        }
        const res = await taskAPI.createBoardCard(
          boardId,
          {
            listId: defaultListId,
            title: text,
            issueType: 'task',
            parentTaskId: String(parentRaw._id || parentRaw.id),
            ...(parentEpicId ? { epicId: parentEpicId } : {}),
          },
          apiCtx || {}
        );
        const created = unwrapTaskApiPayload(res) || unwrapPlanningEntity(res);
        if (created) {
          patchCards((cards) =>
            upsertById(cards, {
              ...created,
              title: text,
              issueType: created.issueType || 'task',
              parentTaskId: String(parentRaw._id || parentRaw.id),
              listId: created.listId || defaultListId,
              ...(parentEpicId ? { epicId: parentEpicId } : {}),
            })
          );
        } else {
          onRefresh?.();
        }
      } else if (isBoardCreateType(type)) {
        const boardIssueType = type === 'bug' || type === 'story' || type === 'task' ? type : 'task';
        const res = await taskAPI.createBoardCard(
          boardId,
          {
            listId: defaultListId,
            title: text,
            issueType: boardIssueType,
            ...(parentEpicId ? { epicId: parentEpicId } : {}),
          },
          apiCtx || {}
        );
        const created = unwrapTaskApiPayload(res) || unwrapPlanningEntity(res);
        if (created) {
          patchCards((cards) =>
            upsertById(cards, {
              ...created,
              title: text,
              issueType: created.issueType || boardIssueType,
              listId: created.listId || defaultListId,
              ...(parentEpicId ? { epicId: parentEpicId } : {}),
            })
          );
        } else {
          onRefresh?.();
        }
      } else {
        return;
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

  const changeStatus = async (node, listId) => {
    if (!canChangeStatus || !listId || busy || node.kind !== 'card') return;
    const cardId = String(node.raw?._id || node.raw?.id || '');
    if (!cardId) return;
    setBusy(true);
    try {
      const res = await taskAPI.moveBoardCard(cardId, { toListId: listId }, apiCtx || {});
      const moved = unwrapTaskApiPayload(res);
      patchCards((cards) =>
        cards.map((c) =>
          entityId(c) === cardId
            ? { ...c, ...(moved && typeof moved === 'object' ? moved : {}), listId }
            : c
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

  const selectedNodes = useMemo(
    () => [...selectedIds].map((id) => findNodeById(tree, id)).filter(Boolean),
    [selectedIds, tree]
  );

  const canBulkDelete = selectedNodes.some((n) => {
    if (n.kind === 'card') return canDeleteIssue;
    if (n.workType === 'epic') return canDeleteEpic;
    return canUpdateBacklog;
  });

  const bulkChangeStatus = async (listId) => {
    if (!canChangeStatus || !listId || busy) return;
    const cards = selectedNodes.filter((n) => n.kind === 'card');
    if (!cards.length) {
      toast.error(t('workspace.projectHubListBulkStatusNone'));
      return;
    }
    setBusy(true);
    let ok = 0;
    try {
      for (const node of cards) {
        const cardId = String(node.raw?._id || node.raw?.id || '');
        if (!cardId) continue;
        await taskAPI.moveBoardCard(cardId, { toListId: listId }, apiCtx || {});
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === cardId ? { ...c, listId } : c))
        );
        ok += 1;
      }
      toast.success(t('workspace.projectHubListBulkStatusDone', { n: ok }));
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const bulkDelete = async () => {
    if (!canBulkDelete || busy) return;
    setBusy(true);
    let ok = 0;
    try {
      for (const node of selectedNodes) {
        const id = String(node.raw?._id || node.raw?.id || '');
        if (!id) continue;
        if (node.kind === 'card') {
          if (!canDeleteIssue) continue;
          await taskAPI.archiveBoardCard(id, apiCtx || {});
          patchCards((cards) => removeById(cards, id));
        } else if (node.workType === 'epic') {
          if (!canDeleteEpic) continue;
          await projectAPI.deletePlanningItem(projectId, id);
          patchPlanning((prev) => removeById(prev, id));
        } else if (node.kind === 'planning') {
          if (!canUpdateBacklog) continue;
          await projectAPI.deletePlanningItem(projectId, id);
          patchPlanning((prev) => removeById(prev, id));
        } else {
          continue;
        }
        ok += 1;
      }
      toast.success(t('workspace.projectHubListBulkDeleted', { n: ok }));
      setSelectedIds(new Set());
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  const muted = isDarkMode ? 'text-slate-400' : 'text-muted-foreground';
  const titleCls = isDarkMode ? 'text-white' : 'text-foreground';
  const showPlanningRetry = loadError && flatRows.length === 0 && !loading;
  const showPlanningWait = loading && flatRows.length === 0;

  if (showPlanningRetry) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12">
        <p className={`text-sm ${muted}`}>{t('workspace.projectHubListLoadFail')}</p>
        <button
          type="button"
          className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          onClick={() => onReloadPlanning?.()}
        >
          {t('workspace.projectHubListRetry')}
        </button>
      </div>
    );
  }

  const handleDragStart = (event) => {
    setDragSession({
      id: String(event.active?.id || ''),
      overId: '',
      deltaX: 0,
      deltaY: 0,
    });
  };

  const handleDragMove = (event) => {
    setDragSession((prev) => ({
      ...prev,
      deltaX: Number(event.delta?.x) || 0,
      deltaY: Number(event.delta?.y) || 0,
    }));
  };

  const handleDragOver = (event) => {
    const overIdRaw = String(event.over?.id || '');
    const overId = overIdRaw.startsWith('drop:') ? overIdRaw.slice(5) : overIdRaw;
    setDragSession((prev) => (prev.overId === overId ? prev : { ...prev, overId }));
  };

  const handleDragEnd = (event) => {
    const activeId = String(event.active?.id || '');
    const overIdRaw = String(event.over?.id || '');
    const deltaX = Number(event.delta?.x) || 0;
    const deltaY = Number(event.delta?.y) || 0;
    setDragSession({ id: '', overId: '', deltaX: 0, deltaY: 0 });
    if (!activeId) return;

    const activeNode = findNodeById(tree, activeId);
    const overNodeId = overIdRaw.startsWith('drop:') ? overIdRaw.slice(5) : overIdRaw;
    const overNode = overNodeId ? findNodeById(tree, overNodeId) : null;
    const action = resolveLiveListDragAction({
      activeNode,
      overNode,
      deltaX,
      deltaY,
      tree,
      flatRows,
      config: workTypeConfig,
    });
    if (action?.mode === 'noop') return;
    if (action) {
      void applyDrop(action, activeNode);
      return;
    }
    if (overNode || depthDeltaFromPointerX(deltaX)) {
      toast.error(t('workspace.projectHubListDragDenied'));
    }
  };

  const handleDragCancel = () => {
    setDragSession({ id: '', overId: '', deltaX: 0, deltaY: 0 });
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
      aria-busy={loading || undefined}
    >
      <div className="border-b border-border px-4 py-2 sm:px-4">
        <h3 className={`text-sm font-bold ${titleCls}`}>{t('workspace.projectHubTabList')}</h3>
        <p className={`text-xs ${muted}`}>{t('workspace.projectHubListHint')}</p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={listCollisionDetection}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="scrollbar-overlay min-h-0 flex-1 overflow-auto">
          <div role="table" aria-label={t('workspace.projectHubTabList')} className="min-w-0">
            <div
              role="row"
              className={`${LIST_TABLE_GRID} sticky top-0 z-10 border-b border-border bg-surface px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`}
            >
              <div aria-hidden />
              <div className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => {
                    setSelectedIds((prev) => {
                      if (allSelected) return new Set();
                      return new Set(allVisibleIds);
                    });
                  }}
                  aria-label={t('workspace.projectHubListSelectAllAria')}
                  className="size-3.5 rounded border-border"
                />
              </div>
              <div>{t('workspace.projectHubListWorkColumn')}</div>
              <div>{t('workspace.projectHubListAssigneeColumn')}</div>
              <div>{t('workspace.projectHubListReporterColumn')}</div>
              <div>{t('workspace.projectHubListPriorityColumn')}</div>
              <div>{t('workspace.projectHubListStatusColumn')}</div>
              <div>{t('workspace.projectHubListResolutionColumn')}</div>
              <div>{t('workspace.projectHubListCreatedColumn')}</div>
              <div>{t('workspace.projectHubListUpdatedColumn')}</div>
              <div>{t('workspace.projectHubListDueColumn')}</div>
              <div aria-hidden />
            </div>

            {flatRows.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className={`text-sm ${muted}`}>
                  {showPlanningWait ? t('common.loading') : t('workspace.projectHubListEmpty')}
                </p>
              </div>
            ) : (
              flatRows.map(({ node, depth }) => (
                <ProjectHubListRow
                  key={node.id}
                  node={node}
                  projectCode={projectCode}
                  depth={depth}
                  locale={locale}
                  collapsed={Boolean(collapsed[node.id])}
                  selected={selectedIds.has(node.id)}
                  childTypes={childTypesForParent(node.workType, workTypeConfig, createCaps)}
                  lists={lists}
                  listMap={listMap}
                  hasBoardColumn={hasBoardColumn}
                  busy={busy}
                  canChangeStatus={canChangeStatus}
                  canAssign={node.kind === 'card' && Boolean(canCreateTask || canManage)}
                  assignableMembers={assignableMembers}
                  membersLoading={membersLoading}
                  dragDeltaX={activeDragId === node.id ? dragDeltaX : 0}
                  dragValid={activeDragId === node.id ? dragValid : null}
                  dropAllowed={
                    Boolean(activeDragId && activeDragNode) &&
                    isLiveListDragValid({
                      activeNode: activeDragNode,
                      overNode: node,
                      deltaX: 0,
                      deltaY: 40,
                      tree,
                      flatRows,
                      config: workTypeConfig,
                    })
                  }
                  creatingUnderId={creatingUnderId}
                  onToggleSelect={(id) => {
                    setSelectedIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      return next;
                    });
                  }}
                  onToggleCollapse={(id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }))}
                  onStartCreateChild={(n) => {
                    setRootCreateOpen(false);
                    setCreatingUnderId(n.id);
                  }}
                  onCancelCreateChild={() => setCreatingUnderId('')}
                  onCreateChild={createChild}
                  onOpenWorkItem={(n) => {
                    if (n.kind === 'card' && n.raw) setDetailCard(n.raw);
                  }}
                  onChangeStatus={changeStatus}
                  onAssignMember={(n, member) => void assignCard(n, member)}
                  onManageTypes={onOpenSettings}
                  t={t}
                />
              ))
            )}
          </div>
        </div>
      </DndContext>

      <div className="relative border-t border-border bg-surface px-3 py-2">
        {rootCreateOpen ? (
          <div className="mb-2">
            <ProjectHubInlineCreateBar
              allowedTypes={rootCreateTypes}
              hasBoardColumn={hasBoardColumn}
              busy={busy}
              initialOpen
              menuPlacement="up"
              placeholderKey="workspace.projectHubListCreatePh"
              onCreate={createRoot}
              onManageTypes={onOpenSettings}
              t={t}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !rootCreateTypes.length}
            onClick={() => {
              setCreatingUnderId('');
              setRootCreateOpen(true);
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {t('workspace.projectHubBacklogCreate')}
          </button>
          <div className="mx-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t('workspace.projectHubListCount', { n: rootCount, total: rootCount })}</span>
            <button
              type="button"
              className="rounded p-1 hover:bg-muted hover:text-foreground"
              aria-label={t('workspace.projectHubListRefreshAria')}
              onClick={refreshAll}
            >
              <RefreshCw size={12} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      <ProjectHubListBulkBar
        selectedCount={selectedIds.size}
        lists={lists}
        busy={busy}
        canChangeStatus={canChangeStatus}
        canDelete={canBulkDelete}
        t={t}
        onSelectAll={() => setSelectedIds(new Set(allVisibleIds))}
        onClear={() => {
          setSelectedIds(new Set());
          setConfirmDelete(false);
        }}
        onChangeStatus={(listId) => void bulkChangeStatus(listId)}
        onDelete={() => setConfirmDelete(true)}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={bulkDelete}
        title={t('workspace.projectHubListBulkDeleteTitle')}
        message={t('workspace.projectHubListBulkDeleteMsg', { n: selectedIds.size })}
        confirmText={t('workspace.projectHubListBulkDelete')}
        cancelText={t('common.cancel')}
      />

      <TaskBoardCardDetailModal
        isOpen={Boolean(detailCard)}
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        card={detailCard}
        boardId={boardId}
        listTitle={
          detailCard
            ? String(listMap[String(detailCard.listId || '')]?.title || detailCard.status || '')
            : ''
        }
        lists={listMap}
        initialPanel="detail"
        canCreateTask={canCreateTask}
        canEstimate={Boolean(canManage || hubCaps?.canEstimate)}
        onClose={() => setDetailCard(null)}
        onRefresh={refreshAll}
        onUpdateCard={async (cardId, patch) => {
          await onUpdateCard?.(cardId, patch);
          setDetailCard((prev) =>
            prev && String(prev._id) === String(cardId) ? { ...prev, ...patch } : prev
          );
        }}
      />
    </div>
  );
}

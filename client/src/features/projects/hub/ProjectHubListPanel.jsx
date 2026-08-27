import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { taskAPI, unwrapTaskApiPayload, unwrapTaskBoardDetailPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import ConfirmDialog from '../../../components/Shared/ConfirmDialog';
import WorkItemDetail from './WorkItemDetail';
import {
  buildListTree,
  childTypesForParent,
  comparePlanningOrder,
  computeInsertSortOrder,
  isLiveListDragValid,
  isTypePreservingDrop,
  resolveBoardCreateParent,
  resolveLiveListDragAction,
} from './projectHubHierarchy';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import ProjectHubListBulkBar from './ProjectHubListBulkBar';
import ProjectHubListRow, { LIST_TABLE_COLUMNS } from './ProjectHubListRow';
import ResizableTableHeader from './ResizableTableHeader';
import { useResizableTableColumns } from './useResizableTableColumns';
import { childWorkStats } from './projectHubBacklogStats';
import { canExpandListRow, flattenExpandedRows } from './projectHubListLazy';
import { unwrapPlanningEntity, unwrapPlanningList } from './projectHubUtils';
import { listIdToPlanningStatus, planningStatusToListId } from './planningBoardStatus';
import { buildWorkItemDatePatch } from './WorkItemDetail/workItemDetailUtils';
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
  lists = [],
  sprints = [],
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
  onOpenSettings = null,
  listActive = true,
  membersEpoch = 0,
  workTypeConfig: serverWorkTypeConfig = null,
  priorityConfig = null,
  workflowTransitionsByFrom = null,
}) {
  const { t } = useAppStrings();
  const listColumns = useMemo(
    () =>
      LIST_TABLE_COLUMNS.map((col) => ({
        ...col,
        resizeAria: t('workspace.projectHubTableResizeCol'),
      })),
    [t]
  );
  const tableScrollRef = useRef(null);
  const { gridStyle, onResizeStart } = useResizableTableColumns({
    storageKey: 'vh.hub.list.colWidths',
    columns: listColumns,
    containerRef: tableScrollRef,
  });
  const { config: workTypeConfig } = useProjectWorkTypes(projectId, {
    serverConfig: serverWorkTypeConfig,
  });
  const [listPlanningItems, setListPlanningItems] = useState([]);
  const [listCards, setListCards] = useState([]);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [loadedIds, setLoadedIds] = useState(() => new Set());
  const [loadingIds, setLoadingIds] = useState(() => new Set());
  const [expandErrorIds, setExpandErrorIds] = useState(() => new Set());
  const [epicsLoading, setEpicsLoading] = useState(false);
  const [epicsError, setEpicsError] = useState(false);
  const loading = epicsLoading;
  const loadError = epicsError;
  const [busy, setBusy] = useState(false);
  const [creatingUnderId, setCreatingUnderId] = useState('');
  const [rootCreateOpen, setRootCreateOpen] = useState(false);
  const [detailIssueId, setDetailIssueId] = useState('');
  const [detailIssueKind, setDetailIssueKind] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmWg, setConfirmWg] = useState(null);
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
  const epicsLoadedForRef = useRef('');
  const loadedIdsRef = useRef(loadedIds);
  const loadingIdsRef = useRef(loadingIds);
  loadedIdsRef.current = loadedIds;
  loadingIdsRef.current = loadingIds;

  const nestCreateCaps = useMemo(
    () => ({ epic: true, feature: true, story: true, task: true, bug: true, subtask: true }),
    []
  );

  const canCreateEpic = Boolean(canManage || hubCaps?.canCreateEpic);
  const canDeleteEpic = Boolean(canManage || hubCaps?.canDeleteEpic);
  const canUpdateBacklog = Boolean(canManage || hubCaps?.canUpdateBacklog);
  const canCreateStory = Boolean(canManage || hubCaps?.canCreateStory);
  const canCreateTask = Boolean(canManage || hubCaps?.canCreateTask);
  const canCreateBug = Boolean(canManage || hubCaps?.canCreateBug);
  const canChangeStatus = Boolean(
    canManage ||
      hubCaps?.canUpdateBacklog ||
      hubCaps?.canCreateTask ||
      hubCaps?.canUpdateStory ||
      (Array.isArray(hubCaps?.permissions) &&
        (hubCaps.permissions.includes('task:change_status') ||
          hubCaps.permissions.includes('task:update')))
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

  const loadListEpics = useCallback(async (force = false) => {
    if (!projectId || !listActive) return;
    if (!force && epicsLoadedForRef.current === projectId) return;
    setEpicsLoading(true);
    setEpicsError(false);
    try {
      const epicRes = await projectAPI.listPlanningItems(projectId, { type: 'epic' });
      const rows = unwrapPlanningList(epicRes);
      setListPlanningItems(Array.isArray(rows) ? rows : []);
      epicsLoadedForRef.current = projectId;
    } catch {
      setListPlanningItems([]);
      setEpicsError(true);
      epicsLoadedForRef.current = '';
    }

    // Board cards riêng — orphan task hiện root dù không có Epic / epic API lỗi.
    try {
      if (boardId) {
        const boardRes = await taskAPI.getBoardDetail(boardId, {
          ...(apiCtx || {}),
          skipNotFoundToast: true,
        });
        const boardCards = unwrapTaskBoardDetailPayload(boardRes)?.cards;
        setListCards(Array.isArray(boardCards) ? boardCards : []);
      } else {
        setListCards([]);
      }
    } catch {
      setListCards([]);
    } finally {
      setEpicsLoading(false);
      setExpandedIds(new Set());
      setLoadedIds(new Set());
      setLoadingIds(new Set());
      setExpandErrorIds(new Set());
    }
  }, [projectId, listActive, boardId, apiCtx]);

  useEffect(() => {
    void loadListEpics();
  }, [loadListEpics]);

  const epics = useMemo(
    () => listPlanningItems.filter((i) => String(i.type || '').toLowerCase() === 'epic'),
    [listPlanningItems]
  );
  const features = useMemo(
    () => listPlanningItems.filter((i) => String(i.type || '').toLowerCase() === 'feature'),
    [listPlanningItems]
  );

  const tree = useMemo(
    () =>
      buildListTree({
        epics,
        features,
        cards: listCards,
        config: workTypeConfig,
      }),
    [epics, features, listCards, workTypeConfig]
  );

  const flatRows = useMemo(() => flattenExpandedRows(tree, expandedIds), [tree, expandedIds]);
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

  const detailWorkItem = useMemo(() => {
    const id = String(detailIssueId || '');
    if (!id) return null;
    if (detailIssueKind === 'planning') {
      const row = (listPlanningItems || []).find((item) => entityId(item) === id);
      if (!row) return null;
      return {
        ...row,
        kind: 'planning',
        issueType: row.issueType || row.type,
        type: row.type || row.issueType,
      };
    }
    return (listCards || []).find((card) => entityId(card) === id) || null;
  }, [detailIssueId, detailIssueKind, listPlanningItems, listCards]);

  const allVisibleIds = useMemo(() => flatRows.map(({ node }) => node.id), [flatRows]);
  const allSelected =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));

  const refreshAll = () => {
    void loadListEpics(true);
    onReloadPlanning?.();
    onRefresh?.();
  };

  const loadNodeChildren = useCallback(
    async (node) => {
      const id = String(node?.id || '');
      const rawId = String(node?.raw?._id || node?.raw?.id || '');
      if (!id || !rawId || loadedIdsRef.current.has(id) || loadingIdsRef.current.has(id)) return;
      setLoadingIds((prev) => new Set(prev).add(id));
      setExpandErrorIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      try {
        if (node.workType === 'epic') {
          const [featRes, cardRes] = await Promise.all([
            projectAPI.listPlanningItems(projectId, { type: 'feature', parentId: rawId }),
            boardId
              ? taskAPI.getBoardDetail(boardId, { ...(apiCtx || {}), epicId: rawId, skipNotFoundToast: true })
              : Promise.resolve(null),
          ]);
          const feats = unwrapPlanningList(featRes);
          const detail = unwrapTaskBoardDetailPayload(cardRes);
          const cards = Array.isArray(detail?.cards) ? detail.cards : [];
          setListPlanningItems((prev) => {
            let next = prev;
            for (const f of feats) next = upsertById(next, { ...f, type: f.type || 'feature' });
            return next;
          });
          setListCards((prev) => {
            let next = prev;
            for (const c of cards) next = upsertById(next, c);
            return next;
          });
        } else if (node.workType === 'feature') {
          if (!boardId) {
            setLoadedIds((prev) => new Set(prev).add(id));
            return;
          }
          const cardRes = await taskAPI.getBoardDetail(boardId, {
            ...(apiCtx || {}),
            featureId: rawId,
            skipNotFoundToast: true,
          });
          const cards = unwrapTaskBoardDetailPayload(cardRes)?.cards || [];
          setListCards((prev) => {
            let next = prev;
            for (const c of cards) next = upsertById(next, c);
            return next;
          });
        } else if (node.kind === 'card' && boardId) {
          const cardRes = await taskAPI.getBoardDetail(boardId, {
            ...(apiCtx || {}),
            parentTaskId: rawId,
            skipNotFoundToast: true,
          });
          const cards = unwrapTaskBoardDetailPayload(cardRes)?.cards || [];
          setListCards((prev) => {
            let next = prev;
            for (const c of cards) next = upsertById(next, c);
            return next;
          });
        }
        setLoadedIds((prev) => new Set(prev).add(id));
      } catch {
        setExpandErrorIds((prev) => new Set(prev).add(id));
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [apiCtx, boardId, projectId]
  );

  const toggleExpand = useCallback(
    (node) => {
      const id = String(node?.id || '');
      if (!id) return;
      if (expandErrorIds.has(id)) {
        setExpandedIds((prev) => new Set(prev).add(id));
        void loadNodeChildren(node);
        return;
      }
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      if (!expandedIds.has(id)) void loadNodeChildren(node);
    },
    [expandErrorIds, expandedIds, loadNodeChildren]
  );

  const patchCards = useCallback(
    (updater) => {
      setListCards((prev) => updater(Array.isArray(prev) ? prev : []));
      onPatchBoardCards?.(updater);
    },
    [onPatchBoardCards]
  );

  const patchPlanning = useCallback(
    (updater) => {
      setListPlanningItems((prev) => updater(Array.isArray(prev) ? prev : []));
      onPatchPlanningItems?.(updater);
    },
    [onPatchPlanningItems]
  );

  const applyDrop = async (action, activeNode = null, skipWgCheck = false) => {
    if (!action || action.mode === 'noop' || busy) return;
    if (activeNode && !isTypePreservingDrop(activeNode, action)) return;

    if (
      !skipWgCheck &&
      action.kind === 'card' &&
      (action.mode === 'attach-card-parent' || action.mode === 'align-card-siblings') &&
      action.parentTaskId
    ) {
      const parentCard = (Array.isArray(listCards) ? listCards : []).find(
        (c) => String(c._id || c.id) === String(action.parentTaskId)
      );
      const featureId = parentCard?.featureId ? String(parentCard.featureId) : '';
      if (featureId) {
        const featureItem = (Array.isArray(features) ? features : []).find(
          (f) => String(f._id || f.id) === featureId
        );
        if (!featureItem?.workGroupChannelId) {
          const existingCount = listCards.filter(
            (c) => String(c.featureId || '') === featureId && c.isActive !== false
          ).length;
          if (existingCount + 1 >= 3) {
            setConfirmWg({ featureId, dropAction: action, activeNode });
            return;
          }
        }
      }
    }

    const activeKey = String(action.activeId);
    const cardsSnapshot = Array.isArray(listCards) ? listCards : [];
    const planningSnapshot = Array.isArray(listPlanningItems) ? listPlanningItems : [];

    let cardPatch = null;
    if (action.kind === 'card') {
      if (action.mode === 'detach-card-epic') {
        cardPatch = { parentTaskId: null, epicId: null };
      } else if (action.mode === 'attach-card-epic') {
        cardPatch = { parentTaskId: null, epicId: action.epicId ?? null };
      } else if (action.mode === 'attach-card-feature') {
        cardPatch = { parentTaskId: null, featureId: action.featureId ?? null, epicId: action.epicId ?? null };
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

  const assignMember = async (node, member) => {
    if (!node || busy) return;
    const id = String(node.raw?._id || node.raw?.id || '');
    if (!id) return;
    const patch = member
      ? {
          assigneeId: member.id,
          assigneeName: member.name,
          assigneeAvatar: member.avatarUrl || '',
          assignees: [
            {
              userId: member.id,
              displayName: member.name,
              avatar: member.avatarUrl || '',
            },
          ],
        }
      : { assigneeId: null, assigneeName: '', assigneeAvatar: '', assignees: [] };
    setBusy(true);
    try {
      if (node.kind === 'planning') {
        if (!projectId) return;
        await projectAPI.patchPlanningItem(projectId, id, { assigneeId: member?.id || null });
        patchPlanning((items) => items.map((row) => (entityId(row) === id ? { ...row, ...patch } : row)));
      } else if (node.kind === 'card') {
        if (onUpdateCard) {
          await onUpdateCard(id, patch);
        } else {
          await taskAPI.updateBoardCard(id, patch, apiCtx || {});
        }
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === id ? { ...c, ...patch } : c))
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

  const doCreateBoardCard = async (parentNode, type, text, parentPayload) => {
    const boardIssueType =
      type === 'bug' || type === 'story' || type === 'task' ? type : 'task';
    const res = await taskAPI.createBoardCard(
      boardId,
      {
        listId: defaultListId,
        title: text,
        issueType: type === 'subtask' ? 'task' : boardIssueType,
        ...parentPayload,
      },
      apiCtx || {}
    );
    const created = unwrapTaskApiPayload(res) || unwrapPlanningEntity(res);
    if (created) {
      patchCards((cards) =>
        upsertById(cards, {
          ...created,
          title: text,
          issueType: created.issueType || (type === 'subtask' ? 'task' : boardIssueType),
          listId: created.listId || defaultListId,
          ...parentPayload,
        })
      );
    } else {
      onRefresh?.();
    }
    if (parentNode?.id) {
      setExpandedIds((prev) => new Set(prev).add(parentNode.id));
      void loadNodeChildren(parentNode);
    }
  };

  const handleConfirmWorkGroup = async () => {
    if (!confirmWg) return;
    const { featureId } = confirmWg;
    setConfirmWg(null);
    setBusy(true);
    try {
      const wgRes = await taskAPI.createWorkGroup(featureId, apiCtx || {});
      const wgData = wgRes?.data?.data || wgRes?.data || {};
      if (wgData.workGroupChannelId) {
        patchPlanning((prev) =>
          prev.map((p) =>
            String(p._id || p.id) === featureId
              ? { ...p, workGroupChannelId: wgData.workGroupChannelId }
              : p
          )
        );
      }
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') }));
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineWorkGroup = () => {
    setConfirmWg(null);
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
        if (parentNode?.id) {
          setExpandedIds((prev) => new Set(prev).add(parentNode.id));
          void loadNodeChildren(parentNode);
        }
        toast.success(t('workspace.projectHubPlanCreated'));
        return;
      }

      if (!hasBoardColumn) {
        toast.error(t('workspace.projectHubPlanNoBoardForStory'));
        return;
      }

      const parentPayload = resolveBoardCreateParent({
        type,
        parentNode,
        config: workTypeConfig,
      });

      if (type === 'subtask' || isBoardCreateType(type)) {
        if (type === 'subtask' && !parentPayload.parentTaskId) {
          toast.error(t('workspace.projectHubBacklogSubtaskNeedParent'));
          return;
        }

        await doCreateBoardCard(parentNode, type, text, parentPayload);

        const featureId = parentPayload.featureId;
        if (featureId) {
          const featureItem = (Array.isArray(features) ? features : []).find(
            (f) => String(f._id || f.id) === featureId
          );
          if (!featureItem?.workGroupChannelId) {
            const newCount = listCards.filter(
              (c) => String(c.featureId || '') === featureId && c.isActive !== false
            ).length + 1;
            if (newCount >= 3) {
              setConfirmWg({ featureId });
            }
          }
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

  const changePriority = async (node, priority) => {
    if (!canChangeStatus || busy) return;
    const id = String(node.raw?._id || node.raw?.id || '');
    if (!id) return;
    const next = String(priority || 'medium').toLowerCase();
    const patch = { priority: next };
    setBusy(true);
    try {
      if (node.kind === 'planning') {
        if (!projectId) return;
        await projectAPI.patchPlanningItem(projectId, id, patch);
        patchPlanning((items) => items.map((row) => (entityId(row) === id ? { ...row, ...patch } : row)));
      } else if (node.kind === 'card') {
        if (onUpdateCard) {
          await onUpdateCard(id, patch);
        } else {
          await taskAPI.updateBoardCard(id, patch, apiCtx || {});
        }
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === id ? { ...c, priority: next } : c))
        );
      }
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const changePlanningStatus = async (node, listId) => {
    if (!canChangeStatus || busy || node.kind !== 'planning') return;
    const itemId = String(node.raw?._id || node.raw?.id || '');
    if (!itemId || !projectId) return;
    const next = listIdToPlanningStatus(listId, lists) || String(listId || '').trim().toLowerCase();
    if (!next) return;
    setBusy(true);
    try {
      await projectAPI.patchPlanningItem(projectId, itemId, { status: next });
      patchPlanning((items) =>
        items.map((row) => (entityId(row) === itemId ? { ...row, status: next } : row))
      );
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const changeDueDate = async (node, dateValue) => {
    if (!canChangeStatus || busy) return;
    const id = entityId(node.raw);
    if (!id) return;
    const isPlanning = node.kind === 'planning';
    const patch = buildWorkItemDatePatch({ isPlanning, dueDate: dateValue || null });
    setBusy(true);
    try {
      if (node.kind === 'card') {
        if (onUpdateCard) {
          await onUpdateCard(id, patch);
        } else {
          await taskAPI.updateBoardCard(id, patch, apiCtx || {});
        }
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === id ? { ...c, ...patch } : c))
        );
      } else if (isPlanning && projectId) {
        await projectAPI.patchPlanningItem(projectId, id, patch);
        patchPlanning((items) =>
          items.map((row) => (entityId(row) === id ? { ...row, ...patch } : row))
        );
      }
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setBusy(false);
    }
  };

  const changeStartDate = async (node, dateValue) => {
    if (!canChangeStatus || busy) return;
    const id = entityId(node.raw);
    if (!id) return;
    const isPlanning = node.kind === 'planning';
    const patch = buildWorkItemDatePatch({ isPlanning, startDate: dateValue || null });
    setBusy(true);
    try {
      if (node.kind === 'card') {
        if (onUpdateCard) {
          await onUpdateCard(id, patch);
        } else {
          await taskAPI.updateBoardCard(id, patch, apiCtx || {});
        }
        patchCards((cards) =>
          cards.map((c) => (entityId(c) === id ? { ...c, ...patch } : c))
        );
      } else if (isPlanning && projectId) {
        await projectAPI.patchPlanningItem(projectId, id, patch);
        patchPlanning((items) =>
          items.map((row) => (entityId(row) === id ? { ...row, ...patch } : row))
        );
      }
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
          onClick={() => void loadListEpics(true)}
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
        <div ref={tableScrollRef} className="scrollbar-overlay min-h-0 flex-1 overflow-auto">
          <div role="table" aria-label={t('workspace.projectHubTabList')} className="min-w-0">
            <div
              role="row"
              style={gridStyle}
              className="sticky top-0 z-10 border-b border-border bg-surface px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              <div className="border-r border-border" aria-hidden />
              <div className="flex items-center justify-center border-r border-border">
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
              <ResizableTableHeader column={listColumns[2]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListWorkColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[3]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListAssigneeColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[4]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListReporterColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[5]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListPriorityColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[6]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListStatusColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[7]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListResolutionColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[8]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListCreatedColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[9]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListUpdatedColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[10]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListStartColumn')}
              </ResizableTableHeader>
              <ResizableTableHeader column={listColumns[11]} onResizeStart={onResizeStart}>
                {t('workspace.projectHubListDueColumn')}
              </ResizableTableHeader>
              <div className="border-r border-border" aria-hidden />
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
                  expanded={expandedIds.has(node.id)}
                  canExpand={canExpandListRow({
                    childTypes: childTypesForParent(node.workType, workTypeConfig, nestCreateCaps),
                    loaded: loadedIds.has(node.id),
                    loading: loadingIds.has(node.id),
                    hasChildren: Array.isArray(node.children) && node.children.length > 0,
                  })}
                  expandLoading={loadingIds.has(node.id)}
                  expandError={expandErrorIds.has(node.id)}
                  selected={selectedIds.has(node.id)}
                  childTypes={childTypesForParent(node.workType, workTypeConfig, createCaps)}
                  childStats={childWorkStats(
                    listCards,
                    node.raw?._id || node.raw?.id,
                    lists,
                    node.workType
                  )}
                  lists={lists}
                  listMap={listMap}
                  workflowTransitionsByFrom={workflowTransitionsByFrom}
                  priorityConfig={priorityConfig}
                  hasBoardColumn={hasBoardColumn}
                  busy={busy}
                  canChangeStatus={canChangeStatus}
                  canAssign={Boolean(canCreateTask || canManage)}
                  gridStyle={gridStyle}
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
                  onToggleExpand={() => toggleExpand(node)}
                  onRetryExpand={() => void loadNodeChildren(node)}
                  onStartCreateChild={(n) => {
                    setRootCreateOpen(false);
                    setCreatingUnderId(n.id);
                  }}
                  onCancelCreateChild={() => setCreatingUnderId('')}
                  onCreateChild={createChild}
                  onOpenWorkItem={(n) => {
                    if (!n?.raw) return;
                    const id = entityId(n.raw);
                    if (!id) return;
                    setDetailIssueKind(n.kind === 'planning' ? 'planning' : 'card');
                    setDetailIssueId(id);
                  }}
                  onChangeStatus={changeStatus}
                  onChangePriority={changePriority}
                  onChangePlanningStatus={changePlanningStatus}
                  onChangeStartDate={changeStartDate}
                  onChangeDueDate={changeDueDate}
                  onAssignMember={(n, member) => void assignMember(n, member)}
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

      <ConfirmDialog
        isOpen={Boolean(confirmWg)}
        onClose={handleDeclineWorkGroup}
        onConfirm={handleConfirmWorkGroup}
        title={t('workspace.projectHubWorkGroupTitle', { fallback: 'Tạo nhóm làm việc' })}
        message={t('workspace.projectHubWorkGroupMsg', { fallback: 'Tạo nhóm làm việc (work group) cho feature này? Các thành viên được giao task sẽ tự động được thêm vào nhóm chat.' })}
        confirmText={t('workspace.projectHubWorkGroupConfirm', { fallback: 'Tạo nhóm' })}
        cancelText={t('common.cancel')}
      />

      <WorkItemDetail
        key={String(detailWorkItem?._id || detailWorkItem?.id || 'list-detail')}
        open={Boolean(detailWorkItem)}
        chrome="modal"
        isDarkMode={isDarkMode}
        workspaceSlug={workspaceSlug}
        workItem={detailWorkItem}
        boardId={boardId}
        listTitle={
          detailWorkItem
            ? String(
                listMap[String(detailWorkItem.listId || '')]?.title ||
                  listMap[planningStatusToListId(detailWorkItem.status, lists)]?.title ||
                  detailWorkItem.status ||
                  ''
              )
            : ''
        }
        lists={listMap}
        boardCards={listCards}
        epics={epics}
        features={features}
        sprints={sprints}
        workTypeConfig={workTypeConfig}
        priorityConfig={priorityConfig}
        projectCode={projectCode}
        projectId={projectId}
        defaultListId={defaultListId}
        apiCtx={apiCtx}
        initialPanel="detail"
        canCreateTask={canCreateTask}
        canEstimate={Boolean(canManage || hubCaps?.canEstimate)}
        canComment={
          Boolean(canManage) ||
          (Array.isArray(hubCaps?.permissions) && hubCaps.permissions.includes('task:comment'))
        }
        canChangeStatus={canChangeStatus}
        canViewMembers={Boolean(hubCaps?.canViewMembers || canManage)}
        onClose={() => {
          setDetailIssueId('');
          setDetailIssueKind('');
        }}
        onOpenWorkItem={(card) => {
          const id = entityId(card);
          if (!id) return;
          const planning =
            String(card?.kind || '') === 'planning' ||
            String(card?.issueType || card?.type || '').toLowerCase() === 'epic' ||
            String(card?.issueType || card?.type || '').toLowerCase() === 'feature';
          setDetailIssueKind(planning ? 'planning' : 'card');
          setDetailIssueId(id);
        }}
        onRefresh={refreshAll}
        onPatchBoardCards={patchCards}
        onPatchPlanningItems={patchPlanning}
        onUpdateCard={async (cardId, patch) => {
          patchCards((cards) =>
            cards.map((c) => (entityId(c) === String(cardId) ? { ...c, ...patch } : c))
          );
          const keys = Object.keys(patch || {});
          if (!(keys.length === 1 && keys[0] === 'comments')) {
            await onUpdateCard?.(cardId, patch);
          }
        }}
      />
    </div>
  );
}

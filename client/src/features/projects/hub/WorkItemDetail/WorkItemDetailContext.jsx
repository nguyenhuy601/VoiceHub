import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../../services/api/taskAPI';
import { useAppStrings } from '../../../../locales/appStrings';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import {
  buildHoursWarnMessage,
  isHoursSoftWarning,
  readHoursSoftWarningMeta,
} from '../../../../utils/hoursSoftWarning';
import { isTimeTrackingV1Enabled } from '../../../../utils/timeTrackingFlag';
import { parseCardLabelIds } from '../../board/taskBoardCardLabels';
import { unwrapPlanningEntity } from '../projectHubUtils';
import {
  buildTabVisibilityContext,
  listVisibleTabs,
  pickInitialVisibleTab,
  resolveWorkItemType,
} from './workItemDetailTabs';
import {
  dateInputValueFromIso,
  hoursInputValue,
  isPlanningIssue,
  mapInitialPanelToTab,
  relId,
  resolveWorkItemDueDate,
  resolveWorkItemStartDate,
  unwrapList,
} from './workItemDetailUtils';

const WorkItemDetailContext = createContext(null);

/** Tránh `prop = []` tạo reference mới mỗi render → tabCtx đổi → activeTab bị reset. */
const EMPTY_ARRAY = Object.freeze([]);

function stableListProp(prop) {
  if (!Array.isArray(prop) || prop.length === 0) return EMPTY_ARRAY;
  return prop;
}

export function useWorkItemDetail() {
  const ctx = useContext(WorkItemDetailContext);
  if (!ctx) throw new Error('useWorkItemDetail must be used within WorkItemDetailProvider');
  return ctx;
}

export function WorkItemDetailProvider({
  children,
  open = true,
  workItem,
  boardCards: boardCardsProp,
  lists: listsProp,
  epics: epicsProp,
  features: featuresProp,
  sprints: sprintsProp,
  projectCode = '',
  projectId = '',
  boardId = '',
  defaultListId = '',
  apiCtx = null,
  workspaceSlug = '',
  listTitle = '',
  workTypeConfig = null,
  isDarkMode = false,
  locale = 'vi',
  initialPanel = 'detail',
  taskWorkspaceScope = null,
  canCreateTask = false,
  canEstimate = true,
  canComment = true,
  canChangeStatus = true,
  canViewMembers = false,
  onClose,
  onUpdateCard = null,
  onRefresh = null,
  onPatchBoardCards = null,
  onPatchPlanningItems = null,
  onOpenChangeRequest = null,
  onOpenWorkItem = null,
  priorityConfig = null,
}) {
  const boardCards = stableListProp(boardCardsProp);
  const lists = stableListProp(listsProp);
  const epics = stableListProp(epicsProp);
  const features = stableListProp(featuresProp);
  const sprints = stableListProp(sprintsProp);

  const { t } = useAppStrings();
  const boardApiOpts = useMemo(() => {
    if (apiCtx && typeof apiCtx === 'object') return apiCtx;
    return workspaceSlug ? { workspaceSlug } : {};
  }, [apiCtx, workspaceSlug]);

  const issueId = relId(workItem?._id || workItem?.id);
  const isPlanning = isPlanningIssue(workItem);
  const workType = resolveWorkItemType(workItem, boardCards, workTypeConfig);

  const tabCtx = useMemo(
    () =>
      buildTabVisibilityContext({
        workItem,
        workTypeConfig,
        boardCards,
        timeTrackingEnabled: isTimeTrackingV1Enabled(),
        canEstimate,
        canViewHistory: true,
        showApprovals: !isPlanning,
      }),
    [workItem, workTypeConfig, boardCards, canEstimate, isPlanning]
  );

  const visibleTabs = useMemo(() => listVisibleTabs(tabCtx), [tabCtx]);

  const preferredTab = mapInitialPanelToTab(initialPanel);
  const [activeTab, setActiveTab] = useState(() => pickInitialVisibleTab(tabCtx, preferredTab));

  // Chỉ reset khi mở lại / đổi work item / đổi initialPanel.
  // Không phụ thuộc tabCtx: default `[]` hoặc parent tạo mảng mới mỗi render
  // từng làm tabCtx đổi liên tục → nuốt mọi setActiveTab từ click.
  useEffect(() => {
    if (!open) return;
    setActiveTab(pickInitialVisibleTab(tabCtx, mapInitialPanelToTab(initialPanel)));
    // tabCtx lấy bản sau render khi issueId/initialPanel đổi; cố ý không đưa vào deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- xem comment trên
  }, [open, issueId, initialPanel]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [editingDescription, setEditingDescription] = useState(false);
  const [labelIds, setLabelIds] = useState([]);
  const [dueDateLocal, setDueDateLocal] = useState('');
  const [startDateLocal, setStartDateLocal] = useState('');
  const [estimateHours, setEstimateHours] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [checklists, setChecklists] = useState([]);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [hoursWarn, setHoursWarn] = useState(null);
  const [pendingPatch, setPendingPatch] = useState(null);
  const [assignableMembers, setAssignableMembers] = useState([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [projectMembers, setProjectMembers] = useState([]);

  useEffect(() => {
    if (!open || !workItem) return;
    setTitle(String(workItem.title || ''));
    setDescription(String(workItem.description || ''));
    setLabelIds(parseCardLabelIds(workItem.tags || workItem.labels));
    setDueDateLocal(dateInputValueFromIso(resolveWorkItemDueDate(workItem, { isPlanning })));
    setStartDateLocal(dateInputValueFromIso(resolveWorkItemStartDate(workItem)));
    setEstimateHours(hoursInputValue(workItem.estimateHours));
    setAssigneeId(workItem.assigneeId ? String(workItem.assigneeId) : '');
    setAttachments(Array.isArray(workItem.attachments) ? [...workItem.attachments] : []);
    setChecklists(
      Array.isArray(workItem.checklists) ? JSON.parse(JSON.stringify(workItem.checklists)) : []
    );
    setChecklistDraft('');
    setEditingDescription(false);
    setHoursWarn(null);
    setPendingPatch(null);
  }, [open, workItem, issueId]);

  const save = useCallback(
    async (patch) => {
      if (!issueId || saving) return false;
      if (isPlanning) {
        if (!projectId) return false;
        setSaving(true);
        try {
          const body = {};
          if (patch.assigneeId !== undefined) body.assigneeId = patch.assigneeId;
          if (patch.status !== undefined) body.status = patch.status;
          if (patch.priority !== undefined) body.priority = patch.priority;
          if (patch.title !== undefined) body.title = patch.title;
          if (patch.description !== undefined) body.description = patch.description;
          if (patch.targetDate !== undefined) body.targetDate = patch.targetDate;
          if (patch.dueDate !== undefined) body.dueDate = patch.dueDate;
          else if (patch.targetDate !== undefined && body.dueDate === undefined) {
            body.dueDate = patch.targetDate;
          }
          if (patch.startDate !== undefined) body.startDate = patch.startDate;
          const res = await projectAPI.patchPlanningItem(projectId, issueId, body);
          const saved = unwrapPlanningEntity(res) || body;
          const local = { ...patch, ...body, ...saved };
          if (local.targetDate !== undefined && local.dueDate === undefined) {
            local.dueDate = local.targetDate;
          }
          if (local.dueDate !== undefined && local.targetDate === undefined) {
            local.targetDate = local.dueDate;
          }
          onPatchPlanningItems?.((items) =>
            (items || []).map((row) =>
              String(row._id || row.id) === String(issueId) ? { ...row, ...local } : row
            )
          );
          toast.success(t('taskBoard.saved'));
          return true;
        } catch (err) {
          toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.saveFail') }));
          throw err;
        } finally {
          setSaving(false);
        }
      }
      setSaving(true);
      try {
        if (onUpdateCard) {
          await onUpdateCard(issueId, patch);
        } else {
          await taskAPI.updateBoardCard(issueId, patch, boardApiOpts);
        }
        patchLocalWorkItem(patch);
        toast.success(t('taskBoard.saved'));
        setHoursWarn(null);
        setPendingPatch(null);
        return true;
      } catch (err) {
        if (isHoursSoftWarning(err)) {
          setPendingPatch(patch);
          setHoursWarn(readHoursSoftWarningMeta(err));
          return false;
        }
        toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.saveFail') }));
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [issueId, saving, isPlanning, projectId, onPatchPlanningItems, onUpdateCard, t]
  );

  const confirmHoursOverride = useCallback(
    async (rationale) => {
      if (!pendingPatch) return;
      await save({
        ...pendingPatch,
        hoursOverride: true,
        hoursRationale: rationale,
      });
    },
    [pendingPatch, save]
  );

  const loadAssignableMembers = useCallback(async () => {
    if (!boardId) return;
    setLoadingMembers(true);
    try {
      const res = await taskAPI.getBoardAssignableMembers(String(boardId), boardApiOpts);
      const payload = unwrapTaskApiPayload(res);
      setAssignableMembers(Array.isArray(payload?.members) ? payload.members : []);
    } catch {
      setAssignableMembers([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [boardId, boardApiOpts]);

  useEffect(() => {
    if (!open || !boardId) return undefined;
    if (activeTab !== 'overview') return undefined;
    void loadAssignableMembers();
    return undefined;
  }, [open, boardId, activeTab, loadAssignableMembers]);

  useEffect(() => {
    if (!open || !projectId || !canViewMembers) return undefined;
    let cancelled = false;
    projectAPI
      .listMembers(projectId, { skipPermissionDeniedToast: true })
      .then((res) => {
        if (!cancelled) setProjectMembers(unwrapList(res, unwrapTaskApiPayload));
      })
      .catch(() => {
        if (!cancelled) setProjectMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, canViewMembers]);

  const patchLocalWorkItem = useCallback(
    (patch) => {
      if (isPlanning) {
        const nextPatch = { ...patch };
        if (nextPatch.dueDate !== undefined && nextPatch.targetDate === undefined) {
          nextPatch.targetDate = nextPatch.dueDate;
        } else if (nextPatch.targetDate !== undefined && nextPatch.dueDate === undefined) {
          nextPatch.dueDate = nextPatch.targetDate;
        }
        onPatchPlanningItems?.((items) =>
          (items || []).map((row) =>
            String(row._id || row.id) === String(issueId) ? { ...row, ...nextPatch } : row
          )
        );
        return;
      }
      if (onPatchBoardCards) {
        onPatchBoardCards((cards) =>
          (cards || []).map((c) =>
            String(c._id || c.id) === issueId ? { ...c, ...patch } : c
          )
        );
      }
    },
    [onPatchBoardCards, onPatchPlanningItems, issueId, isPlanning]
  );

  const value = useMemo(
    () => ({
      open,
      workItem,
      issueId,
      isPlanning,
      workType,
      tabCtx,
      visibleTabs,
      activeTab,
      setActiveTab,
      boardCards,
      lists,
      epics,
      features,
      sprints,
      projectCode,
      projectId,
      boardId,
      defaultListId: defaultListId || workItem?.listId || '',
      apiCtx: boardApiOpts,
      listTitle,
      workTypeConfig,
      isDarkMode,
      locale,
      t,
      taskWorkspaceScope,
      canCreateTask,
      canEstimate,
      canComment,
      canChangeStatus,
      onClose,
      onRefresh,
      onPatchBoardCards,
      onPatchPlanningItems,
      onOpenChangeRequest,
      onOpenWorkItem,
      onUpdateCard,
      priorityConfig,
      title,
      setTitle,
      description,
      setDescription,
      editingDescription,
      setEditingDescription,
      labelIds,
      setLabelIds,
      dueDateLocal,
      setDueDateLocal,
      startDateLocal,
      setStartDateLocal,
      estimateHours,
      setEstimateHours,
      assigneeId,
      setAssigneeId,
      attachments,
      setAttachments,
      checklists,
      setChecklists,
      checklistDraft,
      setChecklistDraft,
      saving,
      save,
      hoursWarn,
      setHoursWarn,
      pendingPatch,
      setPendingPatch,
      confirmHoursOverride,
      assignableMembers,
      loadingMembers,
      projectMembers,
      patchLocalWorkItem,
      buildHoursWarnMessage,
    }),
    [
      open,
      workItem,
      issueId,
      isPlanning,
      workType,
      tabCtx,
      visibleTabs,
      activeTab,
      boardCards,
      lists,
      epics,
      features,
      sprints,
      projectCode,
      projectId,
      boardId,
      defaultListId,
      boardApiOpts,
      listTitle,
      workTypeConfig,
      isDarkMode,
      locale,
      t,
      taskWorkspaceScope,
      canCreateTask,
      canEstimate,
      canComment,
      canChangeStatus,
      onClose,
      onRefresh,
      onPatchBoardCards,
      onPatchPlanningItems,
      onOpenChangeRequest,
      onOpenWorkItem,
      onUpdateCard,
      priorityConfig,
      title,
      description,
      editingDescription,
      labelIds,
      dueDateLocal,
      startDateLocal,
      estimateHours,
      assigneeId,
      attachments,
      checklists,
      checklistDraft,
      saving,
      save,
      hoursWarn,
      pendingPatch,
      confirmHoursOverride,
      assignableMembers,
      loadingMembers,
      projectMembers,
      patchLocalWorkItem,
    ]
  );

  return (
    <WorkItemDetailContext.Provider value={value}>{children}</WorkItemDetailContext.Provider>
  );
}

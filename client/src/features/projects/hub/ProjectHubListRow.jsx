import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GitFork, GripVertical, Loader2, MoreHorizontal, PanelRight, Plus } from 'lucide-react';
import UserAvatar from '../../Shared/UserAvatar';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import ProjectHubListAssigneeCell from './ProjectHubListAssigneeCell';
import {
  classifyListStatusBucket,
  displayIssueKey,
  formatHubDateTime,
  formatHubDueDate,
  listsForStatusSelect,
  resolveHubActor,
  toDateInputValue,
  HUB_GRID_CELL_BORDER,
} from './projectHubUtils';
import { WORK_TYPE_INDENT_PX, depthDeltaFromPointerX } from './projectWorkTypes';
import { normalizePriorityConfig } from './projectPriorityConfig';

export const LIST_TABLE_COLUMNS = [
  { id: 'drag', minPx: 28, defaultPx: 28, resizable: false },
  { id: 'select', minPx: 32, defaultPx: 32, resizable: false },
  { id: 'work', minPx: 180, defaultPx: 280 },
  { id: 'assignee', minPx: 88, defaultPx: 112 },
  { id: 'reporter', minPx: 88, defaultPx: 112 },
  { id: 'priority', minPx: 72, defaultPx: 96 },
  { id: 'status', minPx: 88, defaultPx: 120 },
  { id: 'resolution', minPx: 72, defaultPx: 88 },
  { id: 'created', minPx: 96, defaultPx: 120 },
  { id: 'updated', minPx: 96, defaultPx: 120 },
  { id: 'due', minPx: 80, defaultPx: 96 },
  { id: 'actions', minPx: 36, defaultPx: 36, resizable: false },
];

export const PLANNING_STATUSES = ['planned', 'active', 'done', 'cancelled'];

const LABEL_KEYS = {
  epic: 'workspace.projectHubIssueTypeEpic',
  feature: 'workspace.projectHubIssueTypeFeature',
  story: 'workspace.projectHubIssueTypeStory',
  task: 'workspace.projectHubIssueTypeTask',
  bug: 'workspace.projectHubIssueTypeBug',
  subtask: 'workspace.projectHubIssueTypeSubtask',
};

function badgeTypeFor(workType) {
  const id = String(workType || '').toLowerCase();
  if (id === 'feature' || id === 'subtask') return id;
  if (id === 'epic' || id === 'story' || id === 'bug' || id === 'task') return id;
  return 'task';
}

function statusBucketLabel(bucket, t) {
  if (bucket === 'done') return t('workspace.projectHubBacklogStatusDone');
  if (bucket === 'progress') return t('workspace.projectHubBacklogStatusProgress');
  return t('workspace.projectHubBacklogStatusTodo');
}

function statusPillClass(bucket) {
  if (bucket === 'done') return 'border-transparent bg-primary text-primary-foreground';
  if (bucket === 'progress') return 'border-transparent bg-primary/80 text-primary-foreground';
  return 'border-border bg-muted text-muted-foreground';
}

function resolveAssignee(raw) {
  const first = raw?.assignees?.[0];
  if (first) {
    return {
      name: String(first.displayName || first.name || '').trim(),
      avatar: first.avatar || first.avatarUrl || '',
      userId: first.userId || first.id || null,
    };
  }
  if (raw?.assigneeName || raw?.assigneeId) {
    return {
      name: String(raw.assigneeName || '').trim(),
      avatar: raw.assigneeAvatar || '',
      userId: raw.assigneeId || null,
    };
  }
  return null;
}

function resolveReporter(raw, members = []) {
  return resolveHubActor(raw, members);
}

function priorityLabel(raw, t, items) {
  const p = String(raw?.priority || '').toLowerCase();
  if (!p || p === 'none' || p === 'null') return t('workspace.projectHubListPriorityNone');
  const hit = (items || []).find((i) => i.key === p);
  if (hit?.label) return hit.label;
  if (p === 'medium') return t('tasks.priorityMedium');
  if (p === 'high' || p === 'urgent') return t('tasks.priorityHigh');
  if (p === 'low') return t('tasks.priorityLow');
  return String(raw.priority);
}

function planningStatusLabel(status, t) {
  const s = String(status || 'planned').toLowerCase();
  const key = `workspace.projectHubPlanningStatus_${s}`;
  const label = t(key);
  return label === key ? s : label;
}

/**
 * Một hàng bảng List (Work + meta + dates) + drag handle.
 */
export default function ProjectHubListRow({
  node,
  projectCode = '',
  depth = 0,
  locale = 'en',
  collapsed = false,
  expanded = false,
  canExpand = false,
  expandLoading = false,
  expandError = false,
  selected = false,
  childTypes = [],
  childStats = null,
  lists = [],
  listMap = {},
  hasBoardColumn = false,
  busy = false,
  canChangeStatus = false,
  canAssign = false,
  canDrag = true,
  assignableMembers = [],
  membersLoading = false,
  gridStyle = null,
  dragDeltaX = 0,
  dragValid = null,
  dropAllowed = false,
  creatingUnderId = '',
  onToggleSelect,
  onToggleCollapse,
  onToggleExpand = null,
  onRetryExpand = null,
  onStartCreateChild,
  onCancelCreateChild,
  onCreateChild,
  onOpenWorkItem,
  onChangeStatus,
  onChangePriority = null,
  onChangePlanningStatus = null,
  onChangeDueDate = null,
  onAssignMember = null,
  priorityConfig = null,
  onManageTypes = null,
  t,
}) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const isExpanded = expanded || (!collapsed && hasChildren && !onToggleExpand);
  const showExpand = Boolean(canExpand || hasChildren || expandLoading);
  const childTotal = Number(childStats?.total) || 0;
  const childDone = Number(childStats?.done) || 0;
  const childLabel =
    childTotal > 0
      ? t('workspace.projectHubBacklogChildrenComplete', { done: childDone, total: childTotal })
      : '';
  const canCreateChild = childTypes.length > 0;
  const isCreating = creatingUnderId === node.id;
  const raw = node.raw || {};
  const rawId = String(raw._id || raw.id || '');
  const keyLabel = displayIssueKey(projectCode, rawId);
  const typeLabel = t(LABEL_KEYS[node.workType] || LABEL_KEYS.task);
  const openable = node.kind === 'card';
  const assignee = resolveAssignee(raw);
  const reporter = resolveReporter(raw, assignableMembers);
  const listMeta = listMap[String(raw.listId || '')] || null;
  const bucket = classifyListStatusBucket(raw.status || listMeta);
  const isDone = bucket === 'done';
  const resolution =
    isDone || String(raw.resolution || '').toLowerCase() === 'done'
      ? t('workspace.projectHubListResolutionDone')
      : t('workspace.projectHubListResolutionOpen');
  const createdLabel = formatHubDateTime(raw.createdAt, locale) || '—';
  const updatedLabel = formatHubDateTime(raw.updatedAt || raw.createdAt, locale) || '—';
  const dueIso = node.kind === 'planning' ? raw.targetDate : raw.dueDate;
  const dueLabel = formatHubDueDate(dueIso, locale) || t('workspace.projectHubListPriorityNone');
  const dueInput = toDateInputValue(dueIso);
  const canEditDue = canChangeStatus && (openable || node.kind === 'planning');
  const priorityItems = normalizePriorityConfig(priorityConfig).items;
  const currentPriority = String(raw.priority || 'medium').toLowerCase();
  const priorityOptions = priorityItems.some((i) => i.key === currentPriority)
    ? priorityItems
    : [{ key: currentPriority, label: currentPriority }, ...priorityItems];

  const indentStep = depthDeltaFromPointerX(dragDeltaX);
  const previewPad = Math.max(0, depth + indentStep) * WORK_TYPE_INDENT_PX;

  const listOptions = useMemo(
    () => listsForStatusSelect(lists, raw.listId),
    [lists, raw.listId]
  );

  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({
    id: node.id,
    data: { node },
    disabled: busy || !canDrag,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop:${node.id}`,
    data: { node },
    disabled: busy,
  });

  const setRowRef = (el) => {
    setDragRef(el);
    setDropRef(el);
  };

  const style = {
    transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
    opacity: isDragging ? 0.9 : undefined,
  };

  const dragRing = isDragging
    ? dragValid
      ? 'ring-2 ring-inset ring-success'
      : 'ring-2 ring-inset ring-destructive'
    : '';
  const dragHandleAria = isDragging
    ? dragValid
      ? t('workspace.projectHubListDragValidAria')
      : t('workspace.projectHubListDragInvalidAria')
    : t('workspace.projectHubListDragAria');

  return (
    <>
      <div
        ref={setRowRef}
        role="row"
        style={{ ...style, ...gridStyle }}
        aria-grabbed={isDragging}
        aria-invalid={isDragging && !dragValid ? true : undefined}
        className={`items-center border-b border-border px-2 py-1.5 ${
          selected ? 'bg-primary/10' : 'hover:bg-muted/40'
        } ${isOver && dropAllowed ? 'border-t-2 border-t-primary' : ''} ${isOver && !dropAllowed ? 'opacity-60' : ''} ${dragRing}`}
      >
        <div className={`flex items-center justify-center ${HUB_GRID_CELL_BORDER}`}>
          <button
            type="button"
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing disabled:opacity-40"
            aria-label={dragHandleAria}
            disabled={busy || !canDrag}
            {...attributes}
            {...listeners}
          >
            <GripVertical size={14} aria-hidden />
          </button>
        </div>
        <div className={`flex items-center justify-center ${HUB_GRID_CELL_BORDER}`}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(node.id)}
            aria-label={t('workspace.projectHubBacklogSelectIssue')}
            className="size-3.5 rounded border-border"
          />
        </div>

        <div className={`group flex min-w-0 items-center gap-1.5 ${HUB_GRID_CELL_BORDER}`} style={{ paddingLeft: previewPad }}>
          {showExpand ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-50"
              aria-expanded={isExpanded}
              aria-label={
                expandError
                  ? t('workspace.projectHubListExpandRetry')
                  : isExpanded
                    ? t('workspace.projectHubWorkTypeCollapseAria')
                    : t('workspace.projectHubWorkTypeExpandAria')
              }
              title={
                expandError
                  ? t('workspace.projectHubListExpandFail')
                  : expandLoading
                    ? t('workspace.projectHubListExpandLoading')
                    : undefined
              }
              aria-busy={expandLoading || undefined}
              disabled={expandLoading}
              onClick={() => {
                if (expandError && onRetryExpand) onRetryExpand(node);
                else if (onToggleExpand) onToggleExpand(node);
                else onToggleCollapse?.(node.id);
              }}
            >
              {expandLoading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              ) : isExpanded ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          ) : (
            <span className="inline-block w-4 shrink-0" aria-hidden />
          )}
          <ProjectHubIssueTypeBadge type={badgeTypeFor(node.workType)} variant="icon" label={typeLabel} />
          <button
            type="button"
            className={`shrink-0 text-left text-xs font-semibold underline-offset-2 ${
              openable ? 'text-primary hover:underline' : 'text-muted-foreground'
            } ${isDone ? 'line-through opacity-70' : ''}`}
            onClick={() => openable && onOpenWorkItem?.(node)}
            disabled={!openable}
            title={openable ? t('workspace.projectHubListOpenWorkItem') : undefined}
          >
            {keyLabel}
          </button>
          <span
            className={`min-w-0 flex-1 truncate text-sm text-foreground ${isDone ? 'line-through opacity-70' : ''}`}
          >
            {node.title || '—'}
          </span>
          {childTotal > 0 ? (
            <button
              type="button"
              className="inline-flex shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={childLabel}
              aria-label={childLabel}
              onClick={() => openable && onOpenWorkItem?.(node)}
            >
              <GitFork size={14} aria-hidden />
            </button>
          ) : null}
          <div className="flex shrink-0 items-center gap-0.5">
            {openable ? (
              <button
                type="button"
                className="rounded p-1 text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={t('workspace.projectHubListOpenWorkItemAria')}
                title={t('workspace.projectHubListOpenWorkItem')}
                onClick={() => onOpenWorkItem?.(node)}
              >
                <PanelRight size={14} aria-hidden />
              </button>
            ) : null}
            {canCreateChild ? (
              <button
                type="button"
                className="rounded p-1 text-primary hover:bg-muted"
                aria-label={t('workspace.projectHubListCreateChildAria')}
                title={t('workspace.projectHubListCreateChild')}
                disabled={busy}
                onClick={() => onStartCreateChild?.(node)}
              >
                <Plus size={14} aria-hidden />
              </button>
            ) : null}
          </div>
        </div>

        <div className={`min-w-0 ${HUB_GRID_CELL_BORDER}`}>
        <ProjectHubListAssigneeCell
          assignee={assignee}
          members={assignableMembers}
          membersLoading={membersLoading}
          canEdit={canAssign}
          busy={busy}
          t={t}
          onAssign={(member) => onAssignMember?.(node, member)}
        />
        </div>

        <div className={`flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground ${HUB_GRID_CELL_BORDER}`}>
          {reporter ? (
            <>
              <UserAvatar avatar={reporter.avatar} userId={reporter.userId} name={reporter.name} size="xs" />
              <span className="truncate">{reporter.name || '—'}</span>
            </>
          ) : (
            <span className="truncate">—</span>
          )}
        </div>

        <div className={`min-w-0 ${HUB_GRID_CELL_BORDER}`}>
          {openable && canChangeStatus ? (
            <select
              className="w-full max-w-[7.5rem] rounded-md border border-border bg-background px-1.5 py-0.5 text-[11px] font-semibold text-foreground"
              value={String(raw.priority || 'medium').toLowerCase()}
              disabled={busy}
              aria-label={t('workspace.projectHubListPriorityColumn')}
              onChange={(e) => onChangePriority?.(node, e.target.value)}
            >
              {priorityOptions.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label || priorityLabel({ priority: item.key }, t, priorityItems)}
                </option>
              ))}
            </select>
          ) : (
            <span className="truncate text-xs text-muted-foreground">
              {openable ? priorityLabel(raw, t, priorityItems) : t('workspace.projectHubListPriorityNone')}
            </span>
          )}
        </div>

        <div className={`min-w-0 ${HUB_GRID_CELL_BORDER}`}>
          {openable && canChangeStatus && listOptions.length > 0 ? (
            <select
              className={`w-full max-w-[9rem] rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${statusPillClass(bucket)}`}
              value={String(raw.listId || '')}
              disabled={busy}
              aria-label={statusBucketLabel(bucket, t)}
              onChange={(e) => onChangeStatus?.(node, e.target.value)}
            >
              {listOptions.map((list) => (
                <option key={list._id || list.id} value={String(list._id || list.id)}>
                  {list.title || statusBucketLabel(classifyListStatusBucket(list), t)}
                </option>
              ))}
            </select>
          ) : node.kind === 'planning' && canChangeStatus ? (
            <select
              className={`w-full max-w-[9rem] rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${statusPillClass(
                String(raw.status) === 'done' ? 'done' : String(raw.status) === 'active' ? 'progress' : 'todo'
              )}`}
              value={String(raw.status || 'planned')}
              disabled={busy}
              aria-label={t('workspace.projectHubListStatusColumn')}
              onChange={(e) => onChangePlanningStatus?.(node, e.target.value)}
            >
              {PLANNING_STATUSES.map((id) => (
                <option key={id} value={id}>
                  {planningStatusLabel(id, t)}
                </option>
              ))}
            </select>
          ) : (
            <span
              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${statusPillClass(bucket)}`}
            >
              {node.kind === 'planning'
                ? planningStatusLabel(raw.status, t)
                : statusBucketLabel(bucket, t)}
            </span>
          )}
        </div>

        <div className={`truncate text-xs text-muted-foreground ${HUB_GRID_CELL_BORDER}`}>{resolution}</div>
        <div className={`truncate text-xs text-muted-foreground ${HUB_GRID_CELL_BORDER}`}>{createdLabel}</div>
        <div className={`truncate text-xs text-muted-foreground ${HUB_GRID_CELL_BORDER}`}>{updatedLabel}</div>
        <div
          className={`min-w-0 ${HUB_GRID_CELL_BORDER}`}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {canEditDue ? (
            <input
              type="date"
              className="w-full max-w-[9.5rem] rounded-md border border-border bg-background px-1 py-0.5 text-[11px] text-foreground"
              value={dueInput}
              disabled={busy}
              aria-label={t('workspace.projectHubListDueColumn')}
              onChange={(e) => onChangeDueDate?.(node, e.target.value)}
            />
          ) : (
            <span className="truncate text-xs text-muted-foreground">{dueLabel}</span>
          )}
        </div>

        <div className={`flex justify-end ${HUB_GRID_CELL_BORDER}`}>
          {openable ? (
            <button
              type="button"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('workspace.projectHubListOpenWorkItemAria')}
              onClick={() => onOpenWorkItem?.(node)}
            >
              <MoreHorizontal size={14} aria-hidden />
            </button>
          ) : (
            <span className="w-5" aria-hidden />
          )}
        </div>
      </div>

      {isCreating ? (
        <div
          className="border-b border-border bg-background px-3 py-2"
          style={{ paddingLeft: 48 + (depth + 1) * WORK_TYPE_INDENT_PX }}
        >
          <ProjectHubInlineCreateBar
            allowedTypes={childTypes}
            hasBoardColumn={hasBoardColumn}
            busy={busy}
            initialOpen
            menuPlacement="down"
            onCreate={(type, text) => {
              onCreateChild?.(node, type, text);
              onCancelCreateChild?.();
            }}
            onManageTypes={onManageTypes}
            t={t}
          />
        </div>
      ) : null}
    </>
  );
}

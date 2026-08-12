import { useMemo } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, GripVertical, MoreHorizontal, PanelRight, Plus } from 'lucide-react';
import UserAvatar from '../../Shared/UserAvatar';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import ProjectHubInlineCreateBar from './ProjectHubInlineCreateBar';
import ProjectHubListAssigneeCell from './ProjectHubListAssigneeCell';
import {
  classifyListStatusBucket,
  displayIssueKey,
  formatHubDateTime,
  formatHubDueDate,
} from './projectHubUtils';
import { WORK_TYPE_INDENT_PX, depthDeltaFromPointerX } from './projectWorkTypes';

export const LIST_TABLE_GRID =
  'grid min-w-[72rem] grid-cols-[1.75rem_2rem_minmax(14rem,2fr)_minmax(7rem,0.9fr)_minmax(7rem,0.9fr)_minmax(4.5rem,0.65fr)_minmax(6rem,0.8fr)_minmax(5rem,0.65fr)_minmax(7.5rem,0.85fr)_minmax(7.5rem,0.85fr)_minmax(5.5rem,0.7fr)_2.25rem] gap-x-2';

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

function resolveReporter(raw) {
  const name = String(
    raw?.reporterName || raw?.createdByName || raw?.creatorName || raw?.createdBy?.displayName || ''
  ).trim();
  if (!name && !raw?.reporterId && !raw?.createdById) return null;
  return {
    name: name || '',
    avatar: raw?.reporterAvatar || raw?.createdByAvatar || raw?.createdBy?.avatar || '',
    userId: raw?.reporterId || raw?.createdById || raw?.createdBy?._id || null,
  };
}

function resolvePriority(raw, t) {
  const p = String(raw?.priority || '').toLowerCase();
  if (!p || p === 'none' || p === 'null') return t('workspace.projectHubListPriorityNone');
  if (p === 'medium') return t('tasks.priorityMedium');
  if (p === 'high' || p === 'urgent') return t('tasks.priorityHigh');
  if (p === 'low') return t('tasks.priorityLow');
  return String(raw.priority);
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
  selected = false,
  childTypes = [],
  lists = [],
  listMap = {},
  hasBoardColumn = false,
  busy = false,
  canChangeStatus = false,
  canAssign = false,
  canDrag = true,
  assignableMembers = [],
  membersLoading = false,
  dragDeltaX = 0,
  dragValid = null,
  dropAllowed = false,
  creatingUnderId = '',
  onToggleSelect,
  onToggleCollapse,
  onStartCreateChild,
  onCancelCreateChild,
  onCreateChild,
  onOpenWorkItem,
  onChangeStatus,
  onAssignMember = null,
  onManageTypes = null,
  t,
}) {
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  const canCreateChild = childTypes.length > 0;
  const isCreating = creatingUnderId === node.id;
  const raw = node.raw || {};
  const rawId = String(raw._id || raw.id || '');
  const keyLabel = displayIssueKey(projectCode, rawId);
  const typeLabel = t(LABEL_KEYS[node.workType] || LABEL_KEYS.task);
  const openable = node.kind === 'card';
  const assignee = resolveAssignee(raw);
  const reporter = resolveReporter(raw);
  const listMeta = listMap[String(raw.listId || '')] || null;
  const bucket = classifyListStatusBucket(raw.status || listMeta);
  const isDone = bucket === 'done';
  const resolution =
    isDone || String(raw.resolution || '').toLowerCase() === 'done'
      ? t('workspace.projectHubListResolutionDone')
      : t('workspace.projectHubListResolutionOpen');
  const createdLabel = formatHubDateTime(raw.createdAt, locale) || '—';
  const updatedLabel = formatHubDateTime(raw.updatedAt || raw.createdAt, locale) || '—';
  const dueLabel = formatHubDueDate(raw.dueDate, locale) || t('workspace.projectHubListPriorityNone');

  const indentStep = depthDeltaFromPointerX(dragDeltaX);
  const previewPad = Math.max(0, depth + indentStep) * WORK_TYPE_INDENT_PX;

  const listOptions = useMemo(() => (Array.isArray(lists) ? lists : []), [lists]);

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
        style={style}
        aria-grabbed={isDragging}
        aria-invalid={isDragging && !dragValid ? true : undefined}
        className={`${LIST_TABLE_GRID} items-center border-b border-border px-2 py-1.5 ${
          selected ? 'bg-primary/10' : 'hover:bg-muted/40'
        } ${isOver && dropAllowed ? 'border-t-2 border-t-primary' : ''} ${isOver && !dropAllowed ? 'opacity-60' : ''} ${dragRing}`}
      >
        <div className="flex items-center justify-center">
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
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(node.id)}
            aria-label={t('workspace.projectHubBacklogSelectIssue')}
            className="size-3.5 rounded border-border"
          />
        </div>

        <div className="group flex min-w-0 items-center gap-1.5" style={{ paddingLeft: previewPad }}>
          {hasChildren ? (
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label={
                collapsed
                  ? t('workspace.projectHubWorkTypeExpandAria')
                  : t('workspace.projectHubWorkTypeCollapseAria')
              }
              onClick={() => onToggleCollapse?.(node.id)}
            >
              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
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

        <ProjectHubListAssigneeCell
          assignee={assignee}
          members={assignableMembers}
          membersLoading={membersLoading}
          canEdit={canAssign}
          busy={busy}
          t={t}
          onAssign={(member) => onAssignMember?.(node, member)}
        />

        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {reporter?.name ? (
            <>
              <UserAvatar avatar={reporter.avatar} userId={reporter.userId} name={reporter.name} size="xs" />
              <span className="truncate">{reporter.name}</span>
            </>
          ) : (
            <span className="truncate">—</span>
          )}
        </div>

        <div className="truncate text-xs text-muted-foreground">{resolvePriority(raw, t)}</div>

        <div className="min-w-0">
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
          ) : (
            <span
              className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${statusPillClass(bucket)}`}
            >
              {statusBucketLabel(bucket, t)}
            </span>
          )}
        </div>

        <div className="truncate text-xs text-muted-foreground">{resolution}</div>
        <div className="truncate text-xs text-muted-foreground">{createdLabel}</div>
        <div className="truncate text-xs text-muted-foreground">{updatedLabel}</div>
        <div className="truncate text-xs text-muted-foreground">{dueLabel}</div>

        <div className="flex justify-end">
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

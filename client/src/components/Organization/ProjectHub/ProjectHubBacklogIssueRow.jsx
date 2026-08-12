import { useEffect, useMemo, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, Clock, GitFork } from 'lucide-react';
import UserAvatar from '../../Shared/UserAvatar';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import ProjectHubIssueMoreMenu from './ProjectHubIssueMoreMenu';
import {
  classifyListStatusBucket,
  displayIssueKey,
  dueDateTone,
  formatHubDateShort,
  normalizeIssueType,
} from './projectHubUtils';

function typeLabel(type, t) {
  const raw = String(type || '').toLowerCase();
  if (raw === 'feature') return t('workspace.projectHubIssueTypeFeature');
  const key = normalizeIssueType(type);
  if (key === 'story') return t('workspace.projectHubIssueTypeStory');
  if (key === 'bug') return t('workspace.projectHubIssueTypeBug');
  if (key === 'epic') return t('workspace.projectHubIssueTypeEpic');
  return t('workspace.projectHubIssueTypeTask');
}

function bucketLabel(bucket, t) {
  if (bucket === 'done') return t('workspace.projectHubBacklogStatusDone');
  if (bucket === 'progress') return t('workspace.projectHubBacklogStatusProgress');
  return t('workspace.projectHubBacklogStatusTodo');
}

/**
 * Một hàng work item kiểu Jira Backlog.
 */
export default function ProjectHubBacklogIssueRow({
  issue,
  lists = [],
  epics = [],
  projectCode = '',
  containerId = 'backlog',
  selected = false,
  onToggleSelect,
  canDelete = false,
  canLinkEpic = false,
  canChangeStatus = false,
  onDelete,
  onLinkEpic,
  onChangeStatus,
  locale = 'vi',
  isDarkMode = false,
  t,
  busy = false,
  childStats = null,
  onOpen = null,
}) {
  const issueId = String(issue?._id || issue?.id || '');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `issue:${issueId}`,
    data: { type: 'issue', issueId, containerId },
    disabled: busy || !issueId,
  });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  const [epicOpen, setEpicOpen] = useState(false);
  const epicRef = useRef(null);

  useEffect(() => {
    if (!epicOpen) return undefined;
    const onDoc = (e) => {
      if (epicRef.current && !epicRef.current.contains(e.target)) setEpicOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [epicOpen]);

  const listById = useMemo(() => new Map((lists || []).map((l) => [String(l._id), l])), [lists]);
  const currentList = listById.get(String(issue?.listId || ''));
  const bucket = classifyListStatusBucket(issue?.status || currentList);
  const tone = dueDateTone(issue?.dueDate, issue?.status || currentList);
  const epic = epics.find((e) => String(e._id) === String(issue?.epicId || ''));
  const assignee =
    issue?.assignees?.[0] ||
    (issue?.assigneeName || issue?.assigneeId
      ? {
          displayName: issue.assigneeName || '',
          avatar: issue.assigneeAvatar || '',
          userId: issue.assigneeId,
        }
      : null);
  const estimate =
    issue?.estimateHours === undefined || issue?.estimateHours === null || issue?.estimateHours === ''
      ? t('workspace.projectHubBacklogNoEstimate')
      : String(issue.estimateHours);

  const statusPill =
    bucket === 'done'
      ? 'border-primary/40 bg-primary/15 text-primary'
      : bucket === 'progress'
        ? 'border-primary/50 bg-primary/10 text-primary'
        : 'border-border bg-muted text-muted-foreground';

  const dueCls =
    tone === 'overdue'
      ? 'border-destructive/50 text-destructive'
      : tone === 'soon'
        ? 'border-primary/50 text-primary'
        : 'border-border text-muted-foreground';

  const rawType = String(issue?.issueType || issue?.type || 'task').toLowerCase();
  const type = rawType === 'feature' ? 'feature' : normalizeIssueType(rawType);
  const childTotal = Number(childStats?.total) || 0;
  const childDone = Number(childStats?.done) || 0;
  const childLabel =
    childTotal > 0
      ? t('workspace.projectHubBacklogChildrenComplete', { done: childDone, total: childTotal })
      : '';

  const openDetails = () => {
    if (issueId) onOpen?.(issueId);
  };

  const epicLabelCls =
    'block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10px] font-semibold';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative grid w-full min-w-0 max-w-full items-center gap-x-2 border-b border-border bg-surface px-2 py-1.5 last:border-b-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_auto_auto_minmax(0,1fr)_1.25rem_minmax(6.5rem,9rem)_auto] lg:grid-cols-[auto_auto_auto_minmax(0,1fr)_1.25rem_minmax(8rem,11rem)_auto] ${
        isDragging ? 'opacity-60' : ''
      } ${selected ? 'bg-primary/10' : 'hover:bg-muted/60'} ${
        epicOpen ? 'z-20' : 'z-0'
      } focus-within:z-20`}
      onClick={(e) => {
        if (e.target.closest('input, select, button, a, textarea, label')) return;
        openDetails();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.target.closest('input, select, button, a, textarea')) return;
          e.preventDefault();
          openDetails();
        }
      }}
      {...listeners}
      {...attributes}
    >
      <input
        type="checkbox"
        className="shrink-0"
        checked={selected}
        onChange={() => onToggleSelect?.(issueId)}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label={t('workspace.projectHubBacklogSelectIssue')}
      />
      <ProjectHubIssueTypeBadge type={type} variant="icon" label={typeLabel(type, t)} />
      <span className="hidden min-w-0 max-w-[4.75rem] truncate font-mono text-[11px] font-semibold text-muted-foreground sm:block">
        {displayIssueKey(projectCode, issueId)}
      </span>
      <span
        className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-sm text-foreground"
        title={issue?.title || ''}
      >
        {issue?.title || ''}
      </span>
      <span className="hidden w-4 justify-center sm:inline-flex">
        {childTotal > 0 ? (
          <button
            type="button"
            className="inline-flex rounded p-0.5 text-muted-foreground hover:text-foreground"
            title={childLabel}
            aria-label={childLabel}
            onClick={(e) => {
              e.stopPropagation();
              openDetails();
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <GitFork size={14} aria-hidden />
          </button>
        ) : null}
      </span>

      <div
        ref={epicRef}
        className="relative hidden min-w-0 sm:block"
        onPointerDown={(e) => e.stopPropagation()}
      >
        {canLinkEpic ? (
          <div
            className={
              epic
                ? ''
                : '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:focus-within:opacity-100'
            }
          >
            <button
              type="button"
              onClick={() => setEpicOpen((v) => !v)}
              title={epic ? epic.title : t('workspace.projectHubBacklogAddEpicAria')}
              aria-label={epic ? epic.title : t('workspace.projectHubBacklogAddEpicAria')}
              aria-expanded={epicOpen}
              className={`${epicLabelCls} ${
                epic
                  ? 'bg-primary/15 text-primary'
                  : 'border border-dashed border-border text-muted-foreground'
              }`}
            >
              {epic?.title || t('workspace.projectHubBacklogAddEpic')}
            </button>
            {epicOpen ? (
              <div className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-lg border border-border bg-surface py-1 shadow-xl">
                <p className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {t('workspace.projectHubBacklogRecentEpics')}
                </p>
                {epics.map((ep) => (
                  <button
                    key={ep._id}
                    type="button"
                    className="w-full truncate px-2 py-1.5 text-left text-xs hover:bg-muted"
                    onClick={() => {
                      setEpicOpen(false);
                      onLinkEpic?.(issueId, ep._id);
                    }}
                  >
                    {ep.title}
                  </button>
                ))}
                {issue?.epicId ? (
                  <button
                    type="button"
                    className="w-full border-t border-border px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                    onClick={() => {
                      setEpicOpen(false);
                      onLinkEpic?.(issueId, null);
                    }}
                  >
                    {t('workspace.projectHubBacklogRemoveParent')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : epic ? (
          <span
            className={`${epicLabelCls} bg-primary/15 text-primary`}
            title={epic.title}
          >
            {epic.title}
          </span>
        ) : (
          <span className="block h-[1.375rem]" aria-hidden />
        )}
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
        {canChangeStatus && lists.length > 0 ? (
          <select
            className={`w-[5.75rem] truncate rounded-md border px-1.5 py-0.5 text-[11px] font-semibold sm:w-[6.5rem] ${statusPill}`}
            value={String(issue?.listId || '')}
            onChange={(e) => onChangeStatus?.(issueId, e.target.value)}
            disabled={busy}
            aria-label={bucketLabel(bucket, t)}
          >
            {lists.map((list) => (
              <option key={list._id} value={String(list._id)}>
                {list.title || bucketLabel(classifyListStatusBucket(list), t)}
              </option>
            ))}
          </select>
        ) : (
          <span className={`w-[5.75rem] truncate rounded-md border px-1.5 py-0.5 text-center text-[11px] font-semibold sm:w-[6.5rem] ${statusPill}`}>
            {currentList?.title || bucketLabel(bucket, t)}
          </span>
        )}

        {issue?.dueDate ? (
          <span className={`hidden items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold md:inline-flex ${dueCls}`}>
            {tone === 'overdue' ? <AlertTriangle size={11} aria-hidden /> : <Clock size={11} aria-hidden />}
            {formatHubDateShort(issue.dueDate, locale)}
          </span>
        ) : null}

        <span className="hidden min-w-[1.5rem] justify-center rounded border border-border px-1 py-0.5 text-[11px] text-muted-foreground md:inline-flex">
          {estimate}
        </span>

        {assignee ? (
          <span className="hidden md:inline-flex">
          <UserAvatar
            avatar={assignee.avatar}
            userId={assignee.userId}
            name={assignee.displayName || assignee.name || ''}
            size="sm"
          />
          </span>
        ) : null}

        <ProjectHubIssueMoreMenu
          canDelete={canDelete}
          disabled={busy}
          onDelete={() => onDelete?.(issueId, issue?.title || '')}
          t={t}
          isDarkMode={isDarkMode}
        />
      </div>
    </div>
  );
}

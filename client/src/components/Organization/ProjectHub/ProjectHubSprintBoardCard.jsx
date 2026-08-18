import { useMemo, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, GitFork, GitPullRequest, Pencil, User } from 'lucide-react';
import UserAvatar from '../../Shared/UserAvatar';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import { cardsUnderParent, childWorkStats, entityRelId } from './projectHubBacklogStats';
import {
  childWorkProgressBarClass,
  childWorkProgressPct,
  classifyListStatusBucket,
  displayIssueKey,
  dueDateTone,
  formatHubDueDate,
  normalizeIssueType,
  statusBucketPillClass,
} from './projectHubUtils';
import { childWorkTypeIdsForParent, workTypeTitleKey } from './projectWorkTypes';

function cardAssignee(card) {
  const list = Array.isArray(card?.assignees) ? card.assignees : [];
  if (list.length) {
    const m = list[0];
    return {
      userId: String(m?.userId || m?.id || ''),
      name: String(m?.displayName || m?.name || m?.username || '').trim(),
      avatar: m?.avatar || m?.avatarUrl || '',
    };
  }
  if (card?.assigneeId) {
    return {
      userId: String(card.assigneeId),
      name: String(card.assigneeName || '').trim(),
      avatar: card.assigneeAvatar || '',
    };
  }
  return null;
}

function typeLabel(type, t) {
  const raw = String(type || '').toLowerCase();
  if (raw === 'feature') return t('workspace.projectHubIssueTypeFeature');
  if (raw === 'subtask') return t('workspace.projectHubIssueTypeSubtask');
  const key = normalizeIssueType(type);
  if (key === 'story') return t('workspace.projectHubIssueTypeStory');
  if (key === 'bug') return t('workspace.projectHubIssueTypeBug');
  if (key === 'epic') return t('workspace.projectHubIssueTypeEpic');
  return t('workspace.projectHubIssueTypeTask');
}

function namedWorkType(raw) {
  const id = String(raw || '').toLowerCase();
  if (id === 'epic' || id === 'feature' || id === 'story' || id === 'bug' || id === 'subtask') return id;
  return '';
}

function resolveBoardWorkType(card, allCards, config, seen = new Set()) {
  if (!card) return 'task';
  const id = entityRelId(card._id || card.id);
  if (id) {
    if (seen.has(id)) return namedWorkType(card.issueType || card.type) || 'task';
    seen.add(id);
  }
  const named = namedWorkType(card.issueType || card.type);
  if (named) return named;
  const parentId = entityRelId(card.parentTaskId);
  if (!parentId) return 'task';
  const parent = (Array.isArray(allCards) ? allCards : []).find(
    (c) => entityRelId(c._id || c.id) === parentId
  );
  const parentType = parent ? resolveBoardWorkType(parent, allCards, config, seen) : 'task';
  const childIds = childWorkTypeIdsForParent(parentType, config);
  if (childIds.includes('subtask') && !childIds.includes('task')) return 'subtask';
  if (childIds.includes('task')) return 'task';
  return childIds[0] || 'task';
}

function childSectionTitle(childTypeIds, t) {
  if (!childTypeIds.length || (childTypeIds.length === 1 && childTypeIds[0] === 'subtask')) {
    return t('workspace.projectHubWorkSubtasks');
  }
  return childTypeIds.map((id) => t(workTypeTitleKey(id))).join(', ');
}

function statusBucketLabel(bucket, t) {
  if (bucket === 'done') return t('workspace.projectHubBacklogStatusDone');
  if (bucket === 'progress') return t('workspace.projectHubBacklogStatusProgress');
  return t('workspace.projectHubBacklogStatusTodo');
}

function AssigneeMark({ assignee, t, compact = false }) {
  if (assignee) {
    return (
      <UserAvatar
        avatar={assignee.avatar}
        userId={assignee.userId}
        name={assignee.name}
        size="xs"
        title={assignee.name}
      />
    );
  }
  return (
    <span
      className={`flex items-center justify-center rounded-full bg-muted text-muted-foreground ${
        compact ? 'h-6 w-6' : 'h-7 w-7'
      }`}
      title={t('taskBoard.unassigned')}
      aria-label={t('taskBoard.unassigned')}
    >
      <User size={compact ? 11 : 12} aria-hidden />
    </span>
  );
}

function ChildPreviewRow({ card, listById, projectCode, onOpenCard, t }) {
  const issueId = entityRelId(card?._id || card?.id);
  const listMeta = listById.get(String(card?.listId || ''));
  const bucket = classifyListStatusBucket(card?.status || listMeta);
  const assignee = cardAssignee(card);
  const isDone = bucket === 'done';

  return (
    <button
      type="button"
      className="flex w-full min-w-0 flex-col gap-1 rounded-md border border-border bg-muted/40 px-2 py-1.5 text-left"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onOpenCard?.(card);
      }}
    >
      <span className="truncate text-xs font-semibold text-foreground">{card?.title || '—'}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <GitFork size={12} className="shrink-0 text-muted-foreground" aria-hidden />
        <span
          className={`truncate text-[10px] font-semibold ${
            isDone ? 'text-muted-foreground line-through' : 'text-muted-foreground'
          }`}
        >
          {displayIssueKey(projectCode, issueId)}
        </span>
        <span
          className={`ml-auto inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${statusBucketPillClass(bucket)}`}
        >
          {listMeta?.title || statusBucketLabel(bucket, t)}
        </span>
        <AssigneeMark assignee={assignee} t={t} compact />
      </span>
    </button>
  );
}

/**
 * Thẻ Kanban sprint: gọn — title/due/key/assignee + 1 tầng con (status pill).
 */
export default function ProjectHubSprintBoardCard({
  card,
  projectCode = '',
  onOpenMenu = null,
  onOpenCard = null,
  onOpenChangeRequest = null,
  busy = false,
  showDoneCheck = false,
  allCards = [],
  lists = [],
  workTypeConfig = null,
}) {
  const { t, locale } = useAppStrings();
  const [childrenOpen, setChildrenOpen] = useState(true);
  const issueId = String(card?._id || card?.id || '');
  const title = String(card?.title || '').trim();
  const dueLabel = formatHubDueDate(card?.dueDate, locale);
  const assignee = cardAssignee(card);
  const issueType = card?.issueType || card?.type || 'task';
  const dueTone = dueDateTone(card?.dueDate, card?.status);
  const children = useMemo(() => cardsUnderParent(allCards, issueId), [allCards, issueId]);
  const childStats = useMemo(() => childWorkStats(allCards, issueId, lists), [allCards, issueId, lists]);
  const viewedType = useMemo(
    () => resolveBoardWorkType(card, allCards, workTypeConfig),
    [card, allCards, workTypeConfig]
  );
  const childTypeIds = useMemo(
    () => childWorkTypeIdsForParent(viewedType, workTypeConfig),
    [viewedType, workTypeConfig]
  );
  const sectionTitle = childSectionTitle(childTypeIds, t);
  const progressPct = childWorkProgressPct(childStats.done, childStats.total);
  const listById = useMemo(
    () => new Map((lists || []).map((l) => [String(l._id || l.id || ''), l])),
    [lists]
  );

  return (
    <>
      <div className="min-w-0 pr-5">
        <div className="truncate font-semibold text-foreground" title={title}>
          {title || '—'}
        </div>
        {dueLabel ? (
          <div
            className={`mt-1 flex items-center gap-1 text-[10px] ${
              dueTone === 'overdue' ? 'font-semibold text-destructive' : 'text-muted-foreground'
            }`}
          >
            {dueTone === 'overdue' ? <AlertTriangle size={12} aria-hidden /> : null}
            <span>{dueLabel}</span>
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <ProjectHubIssueTypeBadge type={issueType} label={typeLabel(issueType, t)} variant="icon" />
        <span className="truncate text-[10px] font-semibold text-muted-foreground">
          {displayIssueKey(projectCode, issueId)}
        </span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {showDoneCheck ? (
            <Check
              className="h-3.5 w-3.5 text-success"
              strokeWidth={2.75}
              aria-label={t('taskBoard.doneColumnCheckAria')}
            />
          ) : null}
          <AssigneeMark assignee={assignee} t={t} />
        </span>
      </div>
      {Array.isArray(card?.changeRequests) && card.changeRequests.length ? (
        <div className="mt-1.5 flex flex-wrap gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {card.changeRequests.map((cr) => {
            const crId = String(cr._id || cr.id || '');
            const code = cr.code || 'CR';
            return (
              <button
                key={crId || code}
                type="button"
                title={cr.title || code}
                className="inline-flex items-center gap-0.5 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChangeRequest?.(crId);
                }}
              >
                <GitPullRequest size={11} aria-hidden className="shrink-0" />
                <span>{code}</span>
              </button>
            );
          })}
        </div>
      ) : null}
      {childStats.total > 0 ? (
        <div className="mt-2 border-t border-border pt-2" onPointerDown={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="flex w-full items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"
            aria-expanded={childrenOpen}
            aria-label={t('workspace.projectHubBacklogChildrenComplete', {
              done: childStats.done,
              total: childStats.total,
            })}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setChildrenOpen((v) => !v);
            }}
          >
            <GitFork size={14} aria-hidden />
            <span className="truncate">{sectionTitle}</span>
            <span className="tabular-nums">
              {childStats.done}/{childStats.total}
            </span>
            <span className="ml-auto">
              {childrenOpen ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
            </span>
          </button>
          <div
            className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPct}
          >
            <div
              className={`h-full ${childWorkProgressBarClass(childStats)}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {childrenOpen ? (
            <div className="mt-1.5 space-y-1.5">
              {children.map((child) => (
                <ChildPreviewRow
                  key={String(child._id || child.id)}
                  card={child}
                  listById={listById}
                  projectCode={projectCode}
                  onOpenCard={onOpenCard}
                  t={t}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {typeof onOpenMenu === 'function' ? (
        <button
          type="button"
          title={t('taskBoard.editCard')}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => onOpenMenu(card, e)}
          className="absolute right-1.5 top-1.5 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover:opacity-100"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );
}

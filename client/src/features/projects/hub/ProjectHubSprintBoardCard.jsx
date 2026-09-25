import { useMemo } from 'react';
import {
  AlertTriangle,
  Check,
  GitFork,
  GitPullRequest,
  MoreHorizontal,
  Pencil,
  User,
} from 'lucide-react';
import UserAvatar from '../../../components/Shared/UserAvatar';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import { childWorkStats, entityRelId } from './projectHubBacklogStats';
import { resolveBoardParentTitle } from './projectHubBoardParent';
import {
  childWorkProgressBarClass,
  childWorkProgressPct,
  displayIssueKey,
  dueDateTone,
  formatHubDueDate,
  normalizeIssueType,
} from './projectHubUtils';
import { childWorkTypeIdsForParent, workTypeTitleKey } from './projectWorkTypes';
import { isReadyForQaList } from './qaTestCaseCardScope';

export { resolveBoardParentTitle } from './projectHubBoardParent';

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

const CHIP =
  'inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold';

/**
 * Thẻ Kanban gọn — 3 vùng: tiêu đề · tín hiệu · meta.
 * Chi tiết (note QA, subtask list, parent đầy đủ) nằm trong popup khi bấm thẻ.
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
  epics = [],
  features = [],
  readyToDone = null,
  confirmingDone = false,
  onConfirmReadyToDone = null,
}) {
  const { t, locale } = useAppStrings();
  const issueId = String(card?._id || card?.id || '');
  const title = String(card?.title || '').trim();
  const dueDate = card?.dueDate;
  const dueLabel = formatHubDueDate(dueDate, locale);
  const dueTone = dueDateTone(dueDate, card?.status);
  const assignee = cardAssignee(card);
  const issueType = card?.issueType || card?.type || 'task';
  const issueKey = displayIssueKey(projectCode, issueId);
  const parentTitle = useMemo(
    () => resolveBoardParentTitle(card, { epics, features, allCards }),
    [card, epics, features, allCards]
  );
  const viewedType = useMemo(
    () => resolveBoardWorkType(card, allCards, workTypeConfig),
    [card, allCards, workTypeConfig]
  );
  const childStats = useMemo(
    () => childWorkStats(allCards, issueId, lists, viewedType),
    [allCards, issueId, lists, viewedType]
  );
  const childTypeIds = useMemo(
    () => childWorkTypeIdsForParent(viewedType, workTypeConfig),
    [viewedType, workTypeConfig]
  );
  const sectionTitle = childSectionTitle(childTypeIds, t);
  const progressPct = childWorkProgressPct(childStats.done, childStats.total);
  const childrenIncomplete = childStats.total > 0 && childStats.done < childStats.total;
  const incompleteHint = (childStats.incompleteTitles || []).slice(0, 2).join(' · ');

  const reworkNote = String(card?.qaReworkNote || '').trim();
  const onReadyForQa = isReadyForQaList(
    (Array.isArray(lists) ? lists : []).find(
      (l) => String(l._id || l.id) === String(card?.listId || '')
    )
  );
  const hasRework = Boolean(reworkNote) && !onReadyForQa;
  const fixPending = String(card?.fixSuggestion?.status || '').toLowerCase() === 'pending';
  const changeRequests = Array.isArray(card?.changeRequests) ? card.changeRequests : [];
  const showParent =
    Boolean(parentTitle) &&
    parentTitle.trim().toLowerCase() !== title.trim().toLowerCase();
  const showSignals =
    hasRework ||
    fixPending ||
    changeRequests.length > 0 ||
    (readyToDone?.ready && typeof onConfirmReadyToDone === 'function' && !showDoneCheck);

  return (
    <>
      {/* 1 — Title */}
      <div className="min-w-0 pr-7">
        <div className="flex min-w-0 items-start gap-1">
          <div className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug text-foreground" title={title}>
            {title || '—'}
          </div>
          {typeof onOpenMenu === 'function' ? (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                type="button"
                title={t('taskBoard.editCard')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onOpenMenu(card, e)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                title={t('taskBoard.cardActionsTitle')}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => onOpenMenu(card, e)}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : null}
        </div>
        {showParent ? (
          <p className="mt-0.5 truncate text-[10px] text-muted-foreground" title={parentTitle}>
            {parentTitle}
          </p>
        ) : null}
        {dueLabel ? (
          <p
            className={`mt-0.5 inline-flex items-center gap-0.5 text-[10px] ${
              dueTone === 'overdue' ? 'font-semibold text-destructive' : 'text-muted-foreground'
            }`}
            title={t('workspace.projectHubWorkFieldDueDate')}
          >
            {dueLabel}
            {dueTone === 'overdue' ? <AlertTriangle size={11} aria-hidden /> : null}
          </p>
        ) : null}
      </div>

      {/* 2 — Signals (compact chips; full copy in detail popup) */}
      {showSignals ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1" onPointerDown={(e) => e.stopPropagation()}>
          {hasRework ? (
            <span
              className={`${CHIP} border-destructive/40 bg-destructive/10 text-destructive`}
              title={reworkNote}
            >
              <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{t('workspace.phaseQaReworkNoteChip')}</span>
            </span>
          ) : null}
          {fixPending ? (
            <span
              className={`${CHIP} border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200`}
              title={t('workspace.phaseQaFixSuggestCardPending')}
            >
              {t('workspace.phaseQaFixSuggestCardPending')}
            </span>
          ) : null}
          {changeRequests.map((cr) => {
            const crId = String(cr._id || cr.id || '');
            const code = cr.code || 'CR';
            return (
              <button
                key={crId || code}
                type="button"
                title={cr.title || code}
                className={`${CHIP} border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200`}
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
          {readyToDone?.ready && typeof onConfirmReadyToDone === 'function' && !showDoneCheck ? (
            <button
              type="button"
              disabled={confirmingDone || busy}
              onClick={(e) => {
                e.stopPropagation();
                onConfirmReadyToDone(card);
              }}
              className={`${CHIP} border-primary/40 bg-primary/10 text-primary hover:bg-primary/15 disabled:opacity-50`}
            >
              {confirmingDone
                ? t('common.loading')
                : t('workspace.phaseQaReadyToDoneChip', {
                    pass: readyToDone.passCount,
                    total: readyToDone.totalActive,
                  })}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* 3 — Meta footer */}
      <div className="mt-2 flex min-w-0 items-center gap-1.5">
        <ProjectHubIssueTypeBadge type={issueType} label={typeLabel(issueType, t)} variant="icon" />
        <span className="truncate text-[10px] font-semibold text-muted-foreground">{issueKey}</span>
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

      {/* 4 — Children progress; warn when parent Done but child still open (hidden on Board) */}
      {childStats.total > 0 ? (
        <button
          type="button"
          className={`mt-2 flex w-full items-center gap-1.5 border-t pt-1.5 text-left ${
            childrenIncomplete
              ? 'border-amber-400/50 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-950/30'
              : 'border-border/70'
          }`}
          disabled={busy}
          title={
            childrenIncomplete
              ? t('workspace.projectHubBoardChildrenIncompleteHint', {
                  names: incompleteHint || String(childStats.total - childStats.done),
                })
              : t('workspace.projectHubBoardChildrenOpenHint')
          }
          aria-label={t('workspace.projectHubBacklogChildrenComplete', {
            done: childStats.done,
            total: childStats.total,
          })}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onOpenCard?.(card);
          }}
        >
          {childrenIncomplete ? (
            <AlertTriangle size={12} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
          ) : (
            <GitFork size={12} className="shrink-0 text-muted-foreground" aria-hidden />
          )}
          <span
            className={`min-w-0 flex-1 truncate text-[10px] font-medium ${
              childrenIncomplete
                ? 'text-amber-900 dark:text-amber-100'
                : 'text-muted-foreground'
            }`}
          >
            {childrenIncomplete
              ? t('workspace.projectHubBoardChildrenIncompleteLabel', {
                  open: childStats.total - childStats.done,
                  total: childStats.total,
                })
              : sectionTitle}
          </span>
          <span
            className={`shrink-0 text-[10px] font-semibold tabular-nums ${
              childrenIncomplete ? 'text-amber-950 dark:text-amber-50' : 'text-foreground'
            }`}
          >
            {childStats.done}/{childStats.total}
          </span>
          <div
            className="h-1 w-10 shrink-0 overflow-hidden rounded-full bg-muted"
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
        </button>
      ) : null}
    </>
  );
}

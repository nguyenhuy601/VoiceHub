import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, User } from 'lucide-react';
import UserAvatar from '../../Shared/UserAvatar';
import { useAppStrings } from '../../../locales/appStrings';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import { displayIssueKey, formatHubDueDate, normalizeIssueType } from './projectHubUtils';

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
  if (raw === 'subtask') return t('workspace.projectHubIssueTypeTask');
  const key = normalizeIssueType(type);
  if (key === 'story') return t('workspace.projectHubIssueTypeStory');
  if (key === 'bug') return t('workspace.projectHubIssueTypeBug');
  if (key === 'epic') return t('workspace.projectHubIssueTypeEpic');
  return t('workspace.projectHubIssueTypeTask');
}

/**
 * Thẻ Kanban sprint active: title, due, Parent (Epic), type + key + avatar.
 */
export default function ProjectHubSprintBoardCard({
  card,
  projectCode = '',
  epics = [],
  canLinkEpic = false,
  onLinkParent = null,
  onOpenMenu = null,
  busy = false,
  showDoneCheck = false,
}) {
  const { t, locale } = useAppStrings();
  const [epicOpen, setEpicOpen] = useState(false);
  const epicRef = useRef(null);
  const issueId = String(card?._id || card?.id || '');
  const title = String(card?.title || '').trim();
  const dueLabel = formatHubDueDate(card?.dueDate, locale);
  const assignee = cardAssignee(card);
  const issueType = card?.issueType || card?.type || 'task';

  const epic = useMemo(() => {
    const epicId = String(card?.epicId || '');
    if (!epicId) return null;
    return (epics || []).find((row) => String(row._id || row.id) === epicId) || null;
  }, [card?.epicId, epics]);

  useEffect(() => {
    if (!epicOpen) return undefined;
    const onDoc = (e) => {
      if (epicRef.current && !epicRef.current.contains(e.target)) setEpicOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [epicOpen]);

  const linkParent = (nextEpicId) => {
    const next = nextEpicId ? String(nextEpicId) : null;
    const current = card?.epicId ? String(card.epicId) : null;
    if (next === current) {
      setEpicOpen(false);
      return;
    }
    setEpicOpen(false);
    onLinkParent?.(issueId, next);
  };

  const chipCls =
    'block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-[10px] font-semibold';

  return (
    <>
      <div className="min-w-0 pr-5">
        <div className="truncate font-semibold text-foreground" title={title}>
          {title || '—'}
        </div>
        {dueLabel ? (
          <div className="mt-1 text-[10px] text-muted-foreground">{dueLabel}</div>
        ) : null}
        <div
          ref={epicRef}
          className="relative mt-1.5"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">
            {t('workspace.projectHubWorkDetailsParent')}
          </p>
          {canLinkEpic ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEpicOpen((v) => !v)}
                title={epic ? epic.title : t('workspace.projectHubBacklogAddEpicAria')}
                aria-label={epic ? epic.title : t('workspace.projectHubBacklogAddEpicAria')}
                aria-expanded={epicOpen}
                className={`${chipCls} ${
                  epic
                    ? 'border-primary/40 bg-primary/15 text-primary'
                    : 'border-dashed border-border text-muted-foreground'
                } disabled:opacity-50`}
              >
                {epic?.title || t('workspace.projectHubBacklogAddEpic')}
              </button>
              {epicOpen ? (
                <div className="absolute left-0 z-30 mt-1 max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-xl">
                  <p className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    {t('workspace.projectHubBacklogRecentEpics')}
                  </p>
                  {(epics || []).map((ep) => (
                    <button
                      key={ep._id || ep.id}
                      type="button"
                      className="w-full truncate px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => linkParent(ep._id || ep.id)}
                    >
                      {ep.title}
                    </button>
                  ))}
                  {card?.epicId ? (
                    <button
                      type="button"
                      className="w-full border-t border-border px-2 py-1.5 text-left text-xs text-destructive hover:bg-muted"
                      onClick={() => linkParent(null)}
                    >
                      {t('workspace.projectHubBacklogRemoveParent')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : epic ? (
            <span className={`${chipCls} border-primary/40 bg-primary/15 text-primary`} title={epic.title}>
              {epic.title}
            </span>
          ) : null}
        </div>
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
          {assignee ? (
            <UserAvatar
              avatar={assignee.avatar}
              userId={assignee.userId}
              name={assignee.name}
              size="xs"
              title={assignee.name}
            />
          ) : (
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground"
              title={t('taskBoard.unassigned')}
              aria-label={t('taskBoard.unassigned')}
            >
              <User size={12} aria-hidden />
            </span>
          )}
        </span>
      </div>
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

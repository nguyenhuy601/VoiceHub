import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, User } from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '../../Shared/UserAvatar';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import {
  childWorkProgressBarClass,
  childWorkProgressPct,
  classifyListStatusBucket,
  displayIssueKey,
  listsForStatusSelect,
  statusBucketPillClass,
} from './projectHubUtils';
import {
  childWorkTypeIdsForParent,
  createIssueTypeForChildWorkTypes,
  workTypeTitleKey,
} from './projectWorkTypes';

function relId(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'object') return String(v._id || v.id || '');
  return String(v);
}

function asListArray(lists) {
  if (Array.isArray(lists)) return lists;
  if (lists && typeof lists === 'object') return Object.values(lists);
  return [];
}

function cardsUnder(cards, parentId) {
  const pid = relId(parentId);
  if (!pid) return [];
  return (Array.isArray(cards) ? cards : []).filter((c) => relId(c.parentTaskId) === pid);
}

function namedWorkType(raw) {
  const id = String(raw || '').toLowerCase();
  if (id === 'epic' || id === 'feature' || id === 'story' || id === 'bug' || id === 'subtask') return id;
  return '';
}

/** Type thẻ đang mở: task+parentTaskId có thể là Sub-task (default) hoặc Task dưới Story. */
function resolveViewedWorkType(issue, boardCards, config, seen = new Set()) {
  if (!issue) return 'task';
  const id = relId(issue._id || issue.id);
  if (id) {
    if (seen.has(id)) return namedWorkType(issue.issueType || issue.type || issue.workType) || 'task';
    seen.add(id);
  }
  const named = namedWorkType(issue.issueType || issue.type || issue.workType);
  if (named) return named;
  const parentId = relId(issue.parentTaskId);
  if (!parentId) return 'task';
  const parentCard = (Array.isArray(boardCards) ? boardCards : []).find(
    (c) => relId(c._id || c.id) === parentId
  );
  const parentType = parentCard
    ? resolveViewedWorkType(parentCard, boardCards, config, seen)
    : 'task';
  const childIds = childWorkTypeIdsForParent(parentType, config);
  if (childIds.includes('subtask') && !childIds.includes('task')) return 'subtask';
  if (childIds.includes('task')) return 'task';
  return childIds[0] || 'task';
}

function displayChildType(card, childTypeIds) {
  const named = namedWorkType(card?.issueType || card?.type);
  if (named) return named;
  if (childTypeIds.length === 1 && childTypeIds[0] === 'subtask') return 'subtask';
  if (childTypeIds.includes('task')) return 'task';
  return childTypeIds[0] || 'task';
}

function statusBucketLabel(bucket, t) {
  if (bucket === 'done') return t('workspace.projectHubBacklogStatusDone');
  if (bucket === 'progress') return t('workspace.projectHubBacklogStatusProgress');
  return t('workspace.projectHubBacklogStatusTodo');
}

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

function AssigneeMark({ assignee, t }) {
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
      className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-muted-foreground"
      title={t('taskBoard.unassigned')}
      aria-label={t('taskBoard.unassigned')}
    >
      <User size={11} aria-hidden />
    </span>
  );
}

function StatusControl({ card, list, bucket, lists, t, canChangeStatus, disabled, onChangeStatus }) {
  const pillClass = statusBucketPillClass(bucket);
  const label = list?.title || statusBucketLabel(bucket, t);
  const selectLists = listsForStatusSelect(lists, card?.listId || card?.list);
  if (canChangeStatus && selectLists.length > 0) {
    return (
      <select
        className={`max-w-[7.5rem] shrink-0 truncate rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${pillClass}`}
        value={String(card?.listId || card?.list || '')}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChangeStatus?.(card, e.target.value)}
        aria-label={label}
      >
        {selectLists.map((row) => (
          <option key={String(row._id || row.id)} value={String(row._id || row.id)}>
            {row.title || statusBucketLabel(classifyListStatusBucket(row), t)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <span className={`inline-flex shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${pillClass}`}>
      {label}
    </span>
  );
}

function WorkLine({
  card,
  type,
  projectCode,
  listById,
  lists,
  t,
  canChangeStatus,
  movingId,
  onChangeStatus,
  onOpenChild,
}) {
  const list = listById.get(String(card?.listId || card?.list || ''));
  const bucket = classifyListStatusBucket(card?.status || list);
  const isDone = bucket === 'done';
  const cardId = relId(card._id || card.id);
  const assignee = cardAssignee(card);

  return (
    <div
      className={`flex items-center gap-2 rounded-md px-1 py-1 ${
        onOpenChild ? 'cursor-pointer hover:bg-muted/60' : ''
      }`}
      onClick={(e) => {
        if (!onOpenChild || e.target.closest('select, button, input')) return;
        onOpenChild(card);
      }}
    >
      <ProjectHubIssueTypeBadge type={type} variant="icon" />
      <span
        className={`font-mono text-[10px] ${
          isDone ? 'text-muted-foreground line-through' : 'text-muted-foreground'
        }`}
      >
        {displayIssueKey(projectCode, card._id || card.id)}
      </span>
      <span className="min-w-0 flex-1 truncate">{card.title}</span>
      <StatusControl
        card={card}
        list={list}
        bucket={bucket}
        lists={lists}
        t={t}
        canChangeStatus={canChangeStatus}
        disabled={movingId === cardId}
        onChangeStatus={onChangeStatus}
      />
      <AssigneeMark assignee={assignee} t={t} />
    </div>
  );
}

function ChildRow({
  card,
  childTypeIds,
  workTypeConfig,
  grandchildren,
  projectCode,
  listById,
  lists,
  t,
  canChangeStatus,
  movingId,
  onChangeStatus,
  onOpenChild,
}) {
  const l4TypeIds = childWorkTypeIdsForParent(displayChildType(card, childTypeIds), workTypeConfig);
  return (
    <li className="text-xs">
      <WorkLine
        card={card}
        type={displayChildType(card, childTypeIds)}
        projectCode={projectCode}
        listById={listById}
        lists={lists}
        t={t}
        canChangeStatus={canChangeStatus}
        movingId={movingId}
        onChangeStatus={onChangeStatus}
        onOpenChild={onOpenChild}
      />
      {grandchildren.length ? (
        <ul className="mt-1 space-y-1 border-l border-border pl-4">
          {grandchildren.map((g) => (
            <li key={String(g._id || g.id)}>
              <WorkLine
                card={g}
                type={displayChildType(g, l4TypeIds)}
                projectCode={projectCode}
                listById={listById}
                lists={lists}
                t={t}
                canChangeStatus={canChangeStatus}
                movingId={movingId}
                onChangeStatus={onChangeStatus}
                onOpenChild={onOpenChild}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * Mục con trên chi tiết thẻ: types cấp N+1 (theo Work types), cấp N+2 nest trong từng dòng.
 */
export default function ProjectHubChildWorkSection({
  issue,
  boardCards = [],
  lists = [],
  workTypeConfig = null,
  projectCode = '',
  boardId = '',
  defaultListId = '',
  apiCtx = null,
  canCreate = false,
  canChangeStatus = false,
  t,
  variant = 'accordion',
  onPatchBoardCards = null,
  onRefresh = null,
  onOpenChild = null,
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [movingId, setMovingId] = useState('');

  const parentId = relId(issue?._id || issue?.id);
  const viewedType = useMemo(
    () => resolveViewedWorkType(issue, boardCards, workTypeConfig),
    [issue, boardCards, workTypeConfig]
  );
  const childTypeIds = useMemo(
    () => childWorkTypeIdsForParent(viewedType, workTypeConfig),
    [viewedType, workTypeConfig]
  );
  const listArr = useMemo(() => asListArray(lists), [lists]);
  const listById = useMemo(
    () => new Map(listArr.map((l) => [String(l._id || l.id || ''), l])),
    [listArr]
  );
  const l3Children = useMemo(() => {
    const fromCards = cardsUnder(boardCards, parentId);
    if (fromCards.length) return fromCards;
    return Array.isArray(issue?.subtasks) ? issue.subtasks : [];
  }, [boardCards, issue?.subtasks, parentId]);
  const stats = useMemo(() => {
    let done = 0;
    for (const card of l3Children) {
      const list = listById.get(String(card?.listId || card?.list || ''));
      if (classifyListStatusBucket(card?.status || list) === 'done') done += 1;
    }
    return { total: l3Children.length, done };
  }, [l3Children, listById]);

  const typeTitle = useMemo(() => {
    const ids = childTypeIds.length ? childTypeIds : ['subtask'];
    return ids.map((id) => t(workTypeTitleKey(id))).join(', ');
  }, [childTypeIds, t]);
  const pct = childWorkProgressPct(stats.done, stats.total);
  const createType = createIssueTypeForChildWorkTypes(childTypeIds);
  const showSection = childTypeIds.length > 0 || l3Children.length > 0;

  const createChild = async () => {
    const title = draft.trim();
    if (!title || !boardId || !canCreate || creating || !parentId) return;
    setCreating(true);
    try {
      const res = await taskAPI.createBoardCard(
        boardId,
        {
          listId: issue?.listId || defaultListId,
          title,
          issueType: createType,
          parentTaskId: parentId,
          ...(issue?.epicId ? { epicId: issue.epicId } : {}),
          ...(issue?.featureId ? { featureId: issue.featureId } : {}),
        },
        apiCtx || {}
      );
      const created = unwrapTaskApiPayload(res);
      if (created && typeof created === 'object' && !Array.isArray(created)) {
        onPatchBoardCards?.((cards) => {
          const prev = Array.isArray(cards) ? cards : [];
          const id = String(created._id || created.id || '');
          if (!id || prev.some((c) => relId(c._id || c.id) === id)) return prev;
          return [
            ...prev,
            {
              ...created,
              title,
              issueType: created.issueType || createType,
              parentTaskId: parentId,
              listId: created.listId || issue?.listId || defaultListId,
              ...(issue?.epicId ? { epicId: issue.epicId } : {}),
              ...(issue?.featureId ? { featureId: issue.featureId } : {}),
            },
          ];
        });
      }
      setDraft('');
      await onRefresh?.();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') }));
    } finally {
      setCreating(false);
    }
  };

  const changeChildStatus = async (card, toListId) => {
    const cardId = relId(card?._id || card?.id);
    const nextList = String(toListId || '');
    if (!canChangeStatus || !cardId || !nextList || movingId) return;
    if (nextList === String(card?.listId || card?.list || '')) return;
    setMovingId(cardId);
    try {
      const res = await taskAPI.moveBoardCard(cardId, { toListId: nextList }, apiCtx || {});
      const moved = unwrapTaskApiPayload(res);
      onPatchBoardCards?.((cards) => {
        const prev = Array.isArray(cards) ? cards : [];
        return prev.map((c) =>
          relId(c._id || c.id) === cardId
            ? { ...c, ...(moved && typeof moved === 'object' ? moved : {}), listId: nextList }
            : c
        );
      });
      await onRefresh?.();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') }));
    } finally {
      setMovingId('');
    }
  };

  if (!showSection) return null;

  const body = (
    <>
      {stats.total ? (
        <div
          className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          aria-label={t('workspace.projectHubBacklogChildrenComplete', {
            done: stats.done,
            total: stats.total,
          })}
        >
          <div
            className={`h-full ${childWorkProgressBarClass(stats)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">
          {t('workspace.projectHubWorkChildrenEmpty', { type: typeTitle })}
        </p>
      )}
      <ul className="space-y-1.5">
        {l3Children.map((child) => (
          <ChildRow
            key={String(child._id || child.id)}
            card={child}
            childTypeIds={childTypeIds}
            workTypeConfig={workTypeConfig}
            grandchildren={cardsUnder(boardCards, child._id || child.id)}
            projectCode={projectCode}
            listById={listById}
            lists={listArr}
            t={t}
            canChangeStatus={canChangeStatus}
            movingId={movingId}
            onChangeStatus={changeChildStatus}
            onOpenChild={onOpenChild}
          />
        ))}
      </ul>
      {canCreate && boardId ? (
        <div className="mt-2 flex gap-1">
          <input
            className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('workspace.projectHubWorkChildrenPh', { type: typeTitle })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void createChild();
              }
            }}
          />
          <button
            type="button"
            className="inline-flex items-center gap-0.5 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
            disabled={creating || !draft.trim()}
            onClick={() => void createChild()}
          >
            <Plus size={12} aria-hidden />
            {t('workspace.projectHubWorkChildrenAdd')}
          </button>
        </div>
      ) : null}
    </>
  );

  if (variant === 'plain') {
    return (
      <div className="mb-4">
        <h4 className="mb-2 text-sm font-semibold text-foreground">{typeTitle}</h4>
        {body}
      </div>
    );
  }

  return (
    <section className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-4 py-2 text-left text-sm font-semibold text-foreground"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        {typeTitle}
      </button>
      {open ? <div className="px-4 pb-3">{body}</div> : null}
    </section>
  );
}

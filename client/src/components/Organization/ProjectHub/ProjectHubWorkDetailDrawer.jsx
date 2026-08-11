import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { projectAPI } from '../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../services/api/taskAPI';
import { formatRelativeTime } from '../../../utils/localeFormat';
import { resolveApiErrorMessage } from '../../../utils/resolveApiErrorMessage';
import UserAvatar from '../../Shared/UserAvatar';
import TaskWorklogPanel from '../TaskWorklogPanel';
import { FIGMA_ORG_MEMBER_PANEL_HEAD, FIGMA_ORG_MEMBER_PANEL_TITLE } from '../figmaOrganizationClasses';
import ProjectHubIssueTypeBadge from './ProjectHubIssueTypeBadge';
import { childWorkStats } from './projectHubBacklogStats';
import {
  classifyListStatusBucket,
  displayIssueKey,
  dueDateTone,
  formatHubDateShort,
} from './projectHubUtils';

const FIELD_I18N = {
  status: 'workspace.projectHubWorkFieldStatus',
  parentId: 'workspace.projectHubWorkFieldParent',
  parentTaskId: 'workspace.projectHubWorkFieldParent',
  title: 'workspace.projectHubWorkFieldTitle',
  assigneeId: 'workspace.projectHubWorkFieldAssignee',
  dueDate: 'workspace.projectHubWorkFieldDueDate',
  priority: 'workspace.projectHubWorkFieldPriority',
  estimateHours: 'workspace.projectHubWorkFieldEstimate',
  sprintId: 'workspace.projectHubWorkFieldSprint',
  issueType: 'workspace.projectHubWorkFieldIssueType',
  comment: 'workspace.projectHubWorkFieldComment',
  worklog: 'workspace.projectHubWorkFieldWorklog',
  issue: 'workspace.projectHubWorkFieldIssue',
  listId: 'workspace.projectHubWorkFieldList',
  epicId: 'workspace.projectHubWorkFieldEpic',
  tags: 'workspace.projectHubWorkFieldLabels',
  labels: 'workspace.projectHubWorkFieldLabels',
  sortOrder: 'workspace.projectHubWorkFieldRank',
  description: 'workspace.projectHubWorkFieldDescription',
};

function isFeatureIssue(issue) {
  return (
    String(issue?.kind || '') === 'planning' ||
    String(issue?.issueType || issue?.type || '').toLowerCase() === 'feature'
  );
}

function unwrapList(res) {
  const data = unwrapTaskApiPayload(res);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function actorFromMembers(members, actorId) {
  const id = String(actorId || '');
  const row = (members || []).find((m) => {
    const uid = String(m?.userId || m?.user?._id || m?._id || m?.id || '');
    return uid === id;
  });
  const nested = row?.user && typeof row.user === 'object' ? row.user : null;
  return {
    id,
    displayName:
      row?.displayName ||
      nested?.displayName ||
      row?.fullName ||
      nested?.fullName ||
      row?.name ||
      nested?.name ||
      (id ? id.slice(-6) : '—'),
    avatar: row?.avatar || nested?.avatar || '',
  };
}

function formatHistoryValue(value, t) {
  if (value === null || value === undefined || value === '') return t('workspace.projectHubWorkNone');
  if (Array.isArray(value)) return value.length ? value.join(', ') : t('workspace.projectHubWorkNone');
  return String(value);
}

function Accordion({ title, open, onToggle, children }) {
  return (
    <section className="border-b border-border">
      <button
        type="button"
        className="flex w-full items-center gap-1 px-4 py-2 text-left text-sm font-semibold text-foreground"
        aria-expanded={open}
        onClick={onToggle}
      >
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
        {title}
      </button>
      {open ? <div className="px-4 pb-3">{children}</div> : null}
    </section>
  );
}

function DetailRow({ label, children }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-2 py-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <div className="min-w-0 text-foreground">{children}</div>
    </div>
  );
}

/**
 * Panel phải chi tiết work trên Backlog: Subtasks / Details / Activity.
 */
export default function ProjectHubWorkDetailDrawer({
  issue,
  boardCards = [],
  lists = [],
  epics = [],
  sprints = [],
  projectCode = '',
  projectId = '',
  boardId = '',
  defaultListId = '',
  apiCtx = null,
  isDarkMode = false,
  locale = 'vi',
  t,
  canCreateSubtask = false,
  canComment = false,
  onClose,
  onPatchBoardCards,
}) {
  const issueId = String(issue?._id || issue?.id || '');
  const isFeature = isFeatureIssue(issue);
  const [openSub, setOpenSub] = useState(true);
  const [openDet, setOpenDet] = useState(true);
  const [openAct, setOpenAct] = useState(true);
  const [actTab, setActTab] = useState(isFeature ? 'history' : 'comments');
  const [moreOpen, setMoreOpen] = useState(false);
  const [subDraft, setSubDraft] = useState('');
  const [creatingSub, setCreatingSub] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [members, setMembers] = useState([]);

  const childStats = useMemo(
    () => childWorkStats(boardCards, issueId, lists),
    [boardCards, issueId, lists]
  );
  const children = useMemo(
    () => (boardCards || []).filter((c) => String(c.parentTaskId || '') === issueId),
    [boardCards, issueId]
  );
  const epic = epics.find(
    (e) => String(e._id) === String(issue?.epicId || issue?.parentId || '')
  );
  const sprint = sprints.find((s) => String(s._id) === String(issue?.sprintId || ''));
  const listById = useMemo(() => new Map((lists || []).map((l) => [String(l._id), l])), [lists]);
  const currentList = listById.get(String(issue?.listId || ''));
  const assignee =
    issue?.assignees?.[0] ||
    (issue?.assigneeName || issue?.assigneeId
      ? {
          displayName: issue.assigneeName || '',
          avatar: issue.assigneeAvatar || '',
          userId: issue.assigneeId,
        }
      : null);
  const reporterId = issue?.createdBy || issue?.reporterId || '';
  const reporter = actorFromMembers(members, reporterId);
  const dueTone = dueDateTone(issue?.dueDate, issue?.status || currentList);
  const pct = childStats.total ? Math.round((childStats.done / childStats.total) * 100) : 0;
  const comments = Array.isArray(issue?.comments) ? issue.comments : [];
  const rawType = String(issue?.issueType || issue?.type || 'task').toLowerCase();

  const loadHistory = useCallback(async () => {
    if (!issueId) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = isFeature
        ? await projectAPI.getPlanningItemHistory(projectId, issueId, { limit: 80 })
        : await taskAPI.getTaskHistory(issueId, { limit: 80 }, apiCtx || {});
      const data = unwrapTaskApiPayload(res);
      setHistory(Array.isArray(data?.items) ? data.items : unwrapList(res));
    } catch {
      setHistory([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [issueId, isFeature, projectId, apiCtx]);

  useEffect(() => {
    if (actTab !== 'history' && actTab !== 'all') return undefined;
    void loadHistory();
    return undefined;
  }, [actTab, loadHistory]);

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    projectAPI
      .listMembers(projectId)
      .then((res) => {
        if (!cancelled) setMembers(unwrapList(res));
      })
      .catch(() => {
        if (!cancelled) setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const createSubtask = async () => {
    const title = subDraft.trim();
    if (!title || !boardId || !canCreateSubtask || creatingSub || isFeature) return;
    setCreatingSub(true);
    try {
      const res = await taskAPI.createBoardCard(
        boardId,
        {
          listId: issue?.listId || defaultListId,
          title,
          issueType: 'task',
          parentTaskId: issueId,
          ...(issue?.epicId ? { epicId: issue.epicId } : {}),
        },
        apiCtx || {}
      );
      const created = unwrapTaskApiPayload(res);
      if (created && typeof created === 'object' && !Array.isArray(created)) {
        onPatchBoardCards?.((cards) => {
          const id = String(created._id || created.id || '');
          if (!id || cards.some((c) => String(c._id) === id)) return cards;
          return [
            ...cards,
            {
              ...created,
              title,
              issueType: 'task',
              parentTaskId: issueId,
              listId: created.listId || issue?.listId || defaultListId,
              ...(issue?.epicId ? { epicId: issue.epicId } : {}),
            },
          ];
        });
      }
      setSubDraft('');
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setCreatingSub(false);
    }
  };

  const sendComment = async () => {
    const text = commentDraft.trim();
    if (!text || !canComment || sendingComment || isFeature) return;
    setSendingComment(true);
    try {
      const res = await taskAPI.addBoardCardComment(issueId, text, apiCtx || {});
      const updated = unwrapTaskApiPayload(res);
      if (updated?.comments) {
        onPatchBoardCards?.((cards) =>
          cards.map((c) =>
            String(c._id || c.id) === issueId ? { ...c, comments: updated.comments } : c
          )
        );
      }
      setCommentDraft('');
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('workspace.projectHubPlanCreateFail') })
      );
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-30 bg-black/40 sm:hidden"
        aria-label={t('workspace.projectHubWorkDrawerClose')}
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 right-0 z-40 flex h-full min-h-0 w-full shrink-0 animate-slide-in-right flex-col overflow-hidden border-l border-border bg-surface sm:relative sm:z-auto sm:max-w-md"
        role="dialog"
        aria-label={issue?.title || t('workspace.projectHubWorkDetails')}
      >
      <header className={FIGMA_ORG_MEMBER_PANEL_HEAD}>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ProjectHubIssueTypeBadge type={rawType === 'feature' ? 'feature' : rawType} variant="icon" />
            <span className="font-mono text-[11px] font-semibold text-muted-foreground">
              {displayIssueKey(projectCode, issueId)}
            </span>
          </div>
          <h3 className={`${FIGMA_ORG_MEMBER_PANEL_TITLE} mt-1 truncate`}>{issue?.title || ''}</h3>
        </div>
        <button
          type="button"
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={onClose}
          aria-label={t('workspace.projectHubWorkDrawerClose')}
        >
          <X size={18} aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-overlay">
        <Accordion
          title={t('workspace.projectHubWorkSubtasks')}
          open={openSub}
          onToggle={() => setOpenSub((v) => !v)}
        >
          {childStats.total ? (
            <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
              {t('workspace.projectHubWorkPctDone', { pct })}
            </p>
          ) : (
            <p className="mb-2 text-xs text-muted-foreground">{t('workspace.projectHubWorkSubtasksEmpty')}</p>
          )}
          <ul className="space-y-1">
            {children.map((child) => {
              const list = listById.get(String(child.listId || ''));
              const bucket = classifyListStatusBucket(child.status || list);
              return (
                <li key={String(child._id)} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {displayIssueKey(projectCode, child._id)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{child.title}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {list?.title ||
                      (bucket === 'done'
                        ? t('workspace.projectHubBacklogStatusDone')
                        : bucket === 'progress'
                          ? t('workspace.projectHubBacklogStatusProgress')
                          : t('workspace.projectHubBacklogStatusTodo'))}
                  </span>
                </li>
              );
            })}
          </ul>
          {!isFeature && canCreateSubtask && boardId ? (
            <div className="mt-2 flex gap-1">
              <input
                className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary"
                value={subDraft}
                onChange={(e) => setSubDraft(e.target.value)}
                placeholder={t('workspace.projectHubWorkSubtaskPh')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void createSubtask();
                  }
                }}
              />
              <button
                type="button"
                className="inline-flex items-center gap-0.5 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                disabled={creatingSub || !subDraft.trim()}
                onClick={() => void createSubtask()}
              >
                <Plus size={12} aria-hidden />
                {t('workspace.projectHubWorkSubtaskAdd')}
              </button>
            </div>
          ) : null}
        </Accordion>

        <Accordion
          title={t('workspace.projectHubWorkDetails')}
          open={openDet}
          onToggle={() => setOpenDet((v) => !v)}
        >
          <DetailRow label={t('workspace.projectHubWorkDetailsAssignee')}>
            {assignee ? (
              <span className="inline-flex items-center gap-1">
                <UserAvatar
                  avatar={assignee.avatar}
                  userId={assignee.userId}
                  name={assignee.displayName || assignee.name || ''}
                  size="sm"
                />
                <span>{assignee.displayName || assignee.name || ''}</span>
              </span>
            ) : (
              t('workspace.projectHubWorkNone')
            )}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsParent')}>
            {epic?.title || t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsSprint')}>
            {sprint?.name || t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsLabels')}>
            {(issue?.tags || issue?.labels || []).length
              ? (issue.tags || issue.labels).join(', ')
              : t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsDue')}>
            {issue?.dueDate ? (
              <span className={dueTone === 'overdue' ? 'font-semibold text-destructive' : ''}>
                {formatHubDateShort(issue.dueDate, locale)}
              </span>
            ) : (
              t('workspace.projectHubWorkNone')
            )}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsTeam')}>
            {t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsStart')}>
            {issue?.startDate
              ? formatHubDateShort(issue.startDate, locale)
              : t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsPoints')}>
            {issue?.storyPoints != null && issue?.storyPoints !== ''
              ? String(issue.storyPoints)
              : t('workspace.projectHubWorkNone')}
          </DetailRow>
          <DetailRow label={t('workspace.projectHubWorkDetailsReporter')}>
            {reporterId ? (
              <span className="inline-flex items-center gap-1">
                <UserAvatar
                  avatar={reporter.avatar}
                  userId={reporter.id}
                  name={reporter.displayName}
                  size="sm"
                />
                <span>{reporter.displayName}</span>
              </span>
            ) : (
              t('workspace.projectHubWorkNone')
            )}
          </DetailRow>
        </Accordion>

        <Accordion
          title={t('workspace.projectHubWorkActivity')}
          open={openAct}
          onToggle={() => setOpenAct((v) => !v)}
        >
          <div className="mb-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                actTab === 'comments' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
              onClick={() => setActTab('comments')}
            >
              {t('workspace.projectHubWorkComments')}
            </button>
            <div className="relative">
              <button
                type="button"
                className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
                  actTab !== 'comments' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
              >
                {t('workspace.projectHubWorkMore')}
              </button>
              {moreOpen ? (
                <div className="absolute left-0 z-20 mt-1 min-w-[8rem] rounded-md border border-border bg-surface py-1 shadow-lg">
                  {[
                    ['all', 'workspace.projectHubWorkAll'],
                    ['history', 'workspace.projectHubWorkHistory'],
                    ['worklog', 'workspace.projectHubWorkWorklog'],
                  ].map(([id, key]) => (
                    <button
                      key={id}
                      type="button"
                      className="block w-full px-2 py-1.5 text-left text-xs hover:bg-muted"
                      onClick={() => {
                        setActTab(id);
                        setMoreOpen(false);
                      }}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {actTab === 'comments' || actTab === 'all' ? (
            <div className="mb-3">
              {isFeature ? (
                <p className="text-xs text-muted-foreground">{t('workspace.projectHubWorkHistoryEmpty')}</p>
              ) : (
                <>
                  <ul className="mb-2 space-y-2">
                    {comments.map((c, idx) => {
                      const uid = String(c.userId || c.createdBy || '');
                      const actor = actorFromMembers(members, uid);
                      return (
                        <li key={String(c._id || `${uid}-${idx}`)} className="text-xs">
                          <span className="font-semibold">{actor.displayName}</span>
                          <p className="text-foreground">{c.content}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {c.createdAt ? formatRelativeTime(c.createdAt, t) : ''}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                  {canComment ? (
                    <>
                      <textarea
                        className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary"
                        rows={2}
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder={t('workspace.projectHubWorkAddComment')}
                      />
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {t('workspace.projectHubWorkCommentHint')}
                      </p>
                      <button
                        type="button"
                        className="mt-1 rounded-md bg-primary px-2 py-1 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
                        disabled={sendingComment || !commentDraft.trim()}
                        onClick={() => void sendComment()}
                      >
                        {t('workspace.projectHubWorkComments')}
                      </button>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {actTab === 'history' || actTab === 'all' ? (
            <div className="mb-3">
              {historyLoading ? (
                <p className="text-xs text-muted-foreground" role="status">
                  {t('workspace.loading')}
                </p>
              ) : null}
              {historyError ? (
                <div className="flex flex-col items-start gap-1">
                  <p className="text-xs text-muted-foreground">{t('workspace.projectHubWorkHistoryFail')}</p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => void loadHistory()}
                  >
                    {t('workspace.projectHubWorkHistoryRetry')}
                  </button>
                </div>
              ) : null}
              {!historyLoading && !historyError && history.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('workspace.projectHubWorkHistoryEmpty')}</p>
              ) : null}
              <ul className="space-y-3">
                {history.map((row) => {
                  const actor = actorFromMembers(members, row.actorId);
                  const fieldKey = FIELD_I18N[row.field] || '';
                  const fieldLabel = fieldKey ? t(fieldKey) : row.field || '';
                  const verb =
                    row.field === 'parentId' || row.field === 'parentTaskId' || row.field === 'epicId'
                      ? t('workspace.projectHubWorkChanged')
                      : row.field === 'issue'
                        ? t('workspace.projectHubWorkCreated')
                        : t('workspace.projectHubWorkUpdated');
                  return (
                    <li key={row.id} className="flex gap-2 text-xs">
                      <UserAvatar
                        avatar={actor.avatar}
                        userId={actor.id}
                        name={actor.displayName}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p>
                          <span className="font-semibold">{actor.displayName}</span>{' '}
                          {verb} {fieldLabel}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {row.createdAt ? formatRelativeTime(row.createdAt, t) : ''}
                        </p>
                        {row.field !== 'issue' && row.field !== 'comment' ? (
                          <p className="mt-0.5 text-muted-foreground">
                            {formatHistoryValue(row.from, t)} → {formatHistoryValue(row.to, t)}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {(actTab === 'worklog' || actTab === 'all') && !isFeature ? (
            <TaskWorklogPanel
              taskId={issueId}
              organizationId={apiCtx?.organizationId || ''}
              isDarkMode={isDarkMode}
              t={t}
              canEdit={canComment}
            />
          ) : null}
        </Accordion>
      </div>
      </aside>
    </>
  );
}

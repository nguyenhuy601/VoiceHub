import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../../../context/AuthContext';
import { projectAPI } from '../../../../services/api/projectAPI';
import { taskAPI, unwrapTaskApiPayload } from '../../../../services/api/taskAPI';
import { formatRelativeTime } from '../../../../utils/localeFormat';
import { resolveApiErrorMessage } from '../../../../utils/resolveApiErrorMessage';
import UserAvatar from '../../../Shared/UserAvatar';
import {
  FIGMA_ORG_TASK_MODAL_INPUT,
  FIGMA_ORG_TASK_MODAL_PRIMARY_BTN,
} from '../../figmaOrganizationClasses';
import { useWorkItemDetail } from './WorkItemDetailContext';
import { HISTORY_FIELD_I18N, unwrapList } from './workItemDetailUtils';

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

export default function ActivityTab() {
  const {
    workItem,
    issueId,
    isPlanning,
    projectId,
    apiCtx,
    t,
    canComment,
    projectMembers,
    onPatchBoardCards,
    onUpdateCard,
  } = useWorkItemDetail();
  const { user } = useAuth();
  const [subTab, setSubTab] = useState(isPlanning ? 'history' : 'comments');
  const [commentDraft, setCommentDraft] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(false);

  const comments = Array.isArray(workItem?.comments) ? workItem.comments : [];

  const loadHistory = useCallback(async () => {
    if (!issueId) return;
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const res = isPlanning
        ? await projectAPI.getPlanningItemHistory(projectId, issueId, { limit: 80 })
        : await taskAPI.getTaskHistory(issueId, { limit: 80 }, apiCtx || {});
      const data = unwrapTaskApiPayload(res);
      setHistory(Array.isArray(data?.items) ? data.items : unwrapList(res, unwrapTaskApiPayload));
    } catch {
      setHistory([]);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, [issueId, isPlanning, projectId, apiCtx]);

  useEffect(() => {
    if (subTab !== 'history' && subTab !== 'all') return undefined;
    void loadHistory();
    return undefined;
  }, [subTab, loadHistory]);

  const sendComment = async () => {
    const text = commentDraft.trim();
    if (!text || !canComment || sendingComment || isPlanning) return;
    setSendingComment(true);
    try {
      const res = await taskAPI.addBoardCardComment(issueId, text, apiCtx || {});
      const updated = unwrapTaskApiPayload(res);
      if (updated?.comments) {
        onPatchBoardCards?.((cards) =>
          (cards || []).map((c) =>
            String(c._id || c.id) === issueId ? { ...c, comments: updated.comments } : c
          )
        );
        // Merge local only — comment đã lưu qua POST /comments
        await onUpdateCard?.(issueId, { comments: updated.comments });
      }
      setCommentDraft('');
      toast.success(t('taskBoard.commentAdded'));
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.commentFail') }));
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <div className="space-y-3 px-1 py-1">
      <div className="flex flex-wrap gap-1">
        {!isPlanning ? (
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              subTab === 'comments' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
            onClick={() => setSubTab('comments')}
          >
            {t('workspace.projectHubWorkComments')}
          </button>
        ) : null}
        <button
          type="button"
          className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
            subTab === 'history' || subTab === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
          onClick={() => setSubTab('history')}
        >
          {t('workspace.projectHubWorkHistory')}
        </button>
        {!isPlanning ? (
          <button
            type="button"
            className={`rounded-md px-2 py-1 text-[11px] font-semibold ${
              subTab === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}
            onClick={() => setSubTab('all')}
          >
            {t('workspace.projectHubWorkAll')}
          </button>
        ) : null}
      </div>

      {(subTab === 'comments' || subTab === 'all') && !isPlanning ? (
        <div>
          {canComment ? (
            <div className="mb-3">
              <textarea
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void sendComment();
                  }
                }}
                placeholder={t('workspace.projectHubWorkAddComment')}
                rows={3}
                className={`w-full resize-y ${FIGMA_ORG_TASK_MODAL_INPUT}`}
              />
              <button
                type="button"
                disabled={!commentDraft.trim() || sendingComment}
                onClick={() => void sendComment()}
                className={`mt-2 ${FIGMA_ORG_TASK_MODAL_PRIMARY_BTN} w-auto px-3 py-1.5`}
              >
                {sendingComment ? t('taskBoard.sendingComment') : t('taskBoard.sendComment')}
              </button>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t('workspace.projectHubWorkCommentHint')}
              </p>
            </div>
          ) : null}
          {comments.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('workspace.projectHubWorkHistoryEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {[...comments]
                .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                .map((cm, idx) => {
                  const uid = String(cm.userId || cm.createdBy || '');
                  const actor = actorFromMembers(projectMembers, uid);
                  const author =
                    actor.displayName ||
                    (uid === String(user?.id || user?._id)
                      ? user?.displayName || t('common.you')
                      : uid.slice(-6));
                  return (
                    <li key={`${uid}-${cm.createdAt || idx}`} className="text-sm">
                      <div className="mb-0.5 flex items-baseline gap-2">
                        <span className="font-semibold">{author}</span>
                        {cm.createdAt ? (
                          <span className="text-[10px] text-muted-foreground">
                            {formatRelativeTime(cm.createdAt, t)}
                          </span>
                        ) : null}
                      </div>
                      <p className="whitespace-pre-wrap text-foreground">{cm.content}</p>
                    </li>
                  );
                })}
            </ul>
          )}
        </div>
      ) : null}

      {subTab === 'history' || subTab === 'all' ? (
        <div>
          {historyLoading ? (
            <p className="text-xs text-muted-foreground" role="status">
              {t('common.loading')}
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
              const actor = actorFromMembers(projectMembers, row.actorId);
              const fieldKey = HISTORY_FIELD_I18N[row.field] || '';
              const fieldLabel = fieldKey ? t(fieldKey) : row.field || '';
              const verb =
                row.field === 'parentId' || row.field === 'parentTaskId' || row.field === 'epicId'
                  ? t('workspace.projectHubWorkChanged')
                  : row.field === 'issue'
                    ? t('workspace.projectHubWorkCreated')
                    : t('workspace.projectHubWorkUpdated');
              return (
                <li key={row.id || `${row.field}-${row.createdAt}`} className="flex gap-2 text-xs">
                  <UserAvatar
                    avatar={actor.avatar}
                    userId={actor.id}
                    name={actor.displayName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">{actor.displayName}</span> {verb} {fieldLabel}
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
    </div>
  );
}

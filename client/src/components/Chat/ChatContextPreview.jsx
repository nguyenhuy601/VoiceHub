import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { projectAPI } from '../../services/api/projectAPI';
import {
  taskAPI,
  unwrapTaskApiPayload,
  unwrapTaskBoardDetailPayload,
} from '../../services/api/taskAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { previewCacheKey } from './chatContextRefs';

const PREVIEW_TTL_MS = 30_000;
const previewCache = new Map();

function readCache(key) {
  const hit = previewCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > PREVIEW_TTL_MS) {
    previewCache.delete(key);
    return null;
  }
  return hit.data;
}

function Row({ label, value }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium">{value}</dd>
    </div>
  );
}

function listsFromBoardDetail(detail) {
  if (Array.isArray(detail?.lists) && detail.lists.length) return detail.lists;
  return [];
}

/**
 * Lazy Preview — member thấy field v1; không thuộc PJ → thẻ khóa.
 * Action transition: gọi moveBoardCard hiện có (BE authz + workflow); không tin snapshot cũ.
 */
export default function ChatContextPreview({
  target = null,
  onClose,
  onOpenWork,
  onOpenDiscussion,
  apiCtx = null,
  t,
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [payload, setPayload] = useState(null);
  const [lists, setLists] = useState([]);
  const [listsLoading, setListsLoading] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveSelectValue, setMoveSelectValue] = useState('');

  useEffect(() => {
    if (!target) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [target, onClose]);

  useEffect(() => {
    setMoveSelectValue('');
  }, [target]);

  useEffect(() => {
    if (!target?.projectId) {
      setPayload(null);
      setLists([]);
      return undefined;
    }
    const key = previewCacheKey(target);
    const cached = readCache(key);
    if (cached) {
      setPayload(cached);
      setError(false);
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const kind = target.kind === 'project' ? undefined : target.kind;
        const id = target.kind === 'project' ? undefined : target.id;
        const res = await projectAPI.getWorkPreview(target.projectId, { kind, id });
        const data = unwrapTaskApiPayload(res);
        if (!cancelled) {
          previewCache.set(key, { at: Date.now(), data });
          setPayload(data);
        }
      } catch {
        if (!cancelled) {
          setError(true);
          setPayload(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target]);

  useEffect(() => {
    const boardId = String(payload?.boardId || '').trim();
    const canMove =
      Boolean(payload?.actions?.canChangeStatus) &&
      !payload?.restricted &&
      String(payload?.kind || '') === 'task' &&
      boardId;
    if (!canMove) {
      setLists([]);
      return undefined;
    }
    let cancelled = false;
    setListsLoading(true);
    taskAPI
      .getBoardDetail(boardId, { ...(apiCtx || {}), includeCards: false })
      .then((res) => {
        if (cancelled) return;
        const detail = unwrapTaskBoardDetailPayload(res);
        setLists(listsFromBoardDetail(detail));
      })
      .catch(() => {
        if (!cancelled) setLists([]);
      })
      .finally(() => {
        if (!cancelled) setListsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [payload, apiCtx]);

  if (!target) return null;

  const restricted = Boolean(payload?.restricted);
  const canOpen = Boolean(payload?.actions?.canOpenDetail) && !restricted;
  const canDiscuss = Boolean(payload?.actions?.canOpenDiscussion) && !restricted;
  const canChangeStatus = Boolean(payload?.actions?.canChangeStatus) && !restricted;
  const currentListId = String(payload?.listId || '').trim();
  const moveOptions = lists.filter((list) => {
    const id = String(list?._id || list?.id || '').trim();
    return id && id !== currentListId;
  });

  const refreshPreview = async () => {
    previewCache.delete(previewCacheKey(target));
    const kind = target.kind === 'project' ? undefined : target.kind;
    const id = target.kind === 'project' ? undefined : target.id;
    const res = await projectAPI.getWorkPreview(target.projectId, { kind, id });
    const data = unwrapTaskApiPayload(res);
    previewCache.set(previewCacheKey(target), { at: Date.now(), data });
    setPayload(data);
  };

  const handleMove = async (toListId) => {
    const cardId = String(payload?.id || target?.id || '').trim();
    const listId = String(toListId || '').trim();
    if (!cardId || !listId || moving) return;
    setMoving(true);
    try {
      await taskAPI.moveBoardCard(cardId, { toListId: listId }, apiCtx || {});
      toast.success(t('orgPanel.contextPreviewMoveOk'));
      await refreshPreview();
    } catch (err) {
      toast.error(
        resolveApiErrorMessage(err, { t, fallback: t('orgPanel.contextPreviewMoveFail') })
      );
      try {
        await refreshPreview();
      } catch {
        /* ignore */
      }
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={t('orgPanel.contextPreviewClose')}
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-surface p-4 text-foreground shadow-xl">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('orgPanel.contextPreviewLoading')}</p>
        ) : null}
        {error && !loading ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t('orgPanel.contextPreviewError')}</p>
            <button
              type="button"
              className="text-sm font-semibold text-primary"
              onClick={() => {
                setError(false);
                setLoading(true);
                refreshPreview()
                  .catch(() => setError(true))
                  .finally(() => setLoading(false));
              }}
            >
              {t('orgPanel.contextPreviewRetry')}
            </button>
          </div>
        ) : null}
        {!loading && !error && restricted ? (
          <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-3">
            <Lock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm font-semibold">{t('orgPanel.contextPreviewLocked')}</p>
          </div>
        ) : null}
        {!loading && !error && payload && !restricted ? (
          <div className="space-y-3">
            <div>
              <p className="font-mono text-[11px] font-semibold text-muted-foreground">
                {payload.displayIssueKey ||
                  payload.code ||
                  payload.project?.projectCode ||
                  target.label ||
                  ''}
              </p>
              <h3 className="text-base font-semibold">
                {payload.title || payload.project?.title || target.label || ''}
              </h3>
            </div>
            <dl className="space-y-1.5">
              <Row label={t('orgPanel.contextPreviewType')} value={payload.issueType || payload.type} />
              <Row label={t('orgPanel.contextPreviewPriority')} value={payload.priority} />
              <Row label={t('orgPanel.contextPreviewStatus')} value={payload.status} />
              <Row
                label={t('orgPanel.contextPreviewProject')}
                value={
                  payload.project
                    ? [payload.project.projectCode, payload.project.title].filter(Boolean).join(' · ')
                    : ''
                }
              />
              <Row label={t('orgPanel.contextPreviewSprint')} value={payload.sprint?.name} />
              <Row label={t('orgPanel.contextPreviewAssignee')} value={payload.assignee?.displayName} />
            </dl>
            {Array.isArray(payload.changeRequests) && payload.changeRequests.length ? (
              <p className="text-xs text-muted-foreground">
                {t('orgPanel.contextPreviewLinkedCr')}:{' '}
                {payload.changeRequests.map((cr) => cr.code || cr.title).filter(Boolean).join(', ')}
              </p>
            ) : null}
            {Array.isArray(payload.recent) && payload.recent.length ? (
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('orgPanel.contextPreviewRecent')}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {payload.recent.slice(0, 3).map((item, idx) => (
                    <li key={`${item.kind || 'r'}-${idx}`} className="truncate">
                      {item.content || item.field || item.type || item.to || '—'}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {canChangeStatus && payload.kind === 'task' ? (
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('orgPanel.contextPreviewMoveStatus')}
                </label>
                {listsLoading ? (
                  <p className="text-xs text-muted-foreground">{t('orgPanel.contextPreviewLoading')}</p>
                ) : (
                  <select
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
                    disabled={moving || !moveOptions.length}
                    value={moveSelectValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      setMoveSelectValue('');
                      if (next) void handleMove(next);
                    }}
                  >
                    <option value="">
                      {moving ? t('orgPanel.contextPreviewMoving') : t('orgPanel.contextPreviewMoveStatus')}
                    </option>
                    {moveOptions.map((list) => {
                      const id = String(list._id || list.id || '');
                      return (
                        <option key={id} value={id}>
                          {list.title || list.name || list.statusKey || id}
                        </option>
                      );
                    })}
                  </select>
                )}
              </div>
            ) : null}
            {canOpen || canDiscuss ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {canOpen ? (
                  <button
                    type="button"
                    className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                    onClick={() => onOpenWork?.(payload, target)}
                  >
                    {t('orgPanel.contextPreviewOpenWork')}
                  </button>
                ) : null}
                {canDiscuss ? (
                  <button
                    type="button"
                    className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold"
                    onClick={() => onOpenDiscussion?.(payload, target)}
                  >
                    {t('orgPanel.contextPreviewDiscussion')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

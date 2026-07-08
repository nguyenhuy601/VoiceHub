import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Modal } from '../Shared';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import aiTaskService from '../../services/aiTaskService';
import { getAiTaskTooltipShort } from '../../utils/aiTaskEligibility';
import { sanitizeMentionsForApi } from '../../utils/parseMessageMentions';
import {
  taskAPI,
  unwrapTaskBoardDetailPayload,
  unwrapTaskBoardListPayload,
} from '../../services/api/taskAPI';

const POLL_MS = 2000;
const MAX_POLLS = 90;

/**
 * Modal: gọi extract → poll draft → xác nhận tạo task.
 */
export default function CreateTaskFromAiModal({
  isOpen,
  onClose,
  messageId,
  organizationId,
  workspaceSlug = '',
  currentUserId,
  messagePreview = '',
  mentions = [],
  channelId = null,
  teamId = null,
  onConfirmed,
}) {
  const { t, locale } = useAppStrings();
  const [phase, setPhase] = useState('idle'); // idle | queued | ready | failed
  const [extractionId, setExtractionId] = useState(null);
  const [extraction, setExtraction] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [boardsLoading, setBoardsLoading] = useState(false);
  const [taskBoards, setTaskBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [listsLoading, setListsLoading] = useState(false);
  const [taskLists, setTaskLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');

  const userHeaders = useMemo(
    () => (currentUserId ? { 'x-user-id': String(currentUserId) } : {}),
    [currentUserId]
  );
  const startedRef = useRef(false);
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;

  const mentionsKey = useMemo(
    () => JSON.stringify(sanitizeMentionsForApi(mentions)),
    [mentions]
  );

  const reset = useCallback(() => {
    setPhase('idle');
    setExtractionId(null);
    setExtraction(null);
    setError('');
    setConfirming(false);
    setTaskBoards([]);
    setSelectedBoardId('');
    setTaskLists([]);
    setSelectedListId('');
  }, []);

  useEffect(() => {
    if (!isOpen) {
      startedRef.current = false;
      reset();
      return;
    }

    if (startedRef.current) return;
    startedRef.current = true;

    if (!messageId || !organizationId || !currentUserId) {
      setError(t('taskBoard.aiMissingInfo'));
      setPhase('failed');
      return;
    }

    let cancelled = false;
    const run = async () => {
      setPhase('queued');
      setError('');
      try {
        const res = await aiTaskService.extract(
          {
            messageId: String(messageId),
            organizationId: String(organizationId),
            mentions: sanitizeMentionsForApi(mentionsRef.current),
            channelId: channelId ? String(channelId) : undefined,
          },
          userHeaders
        );
        const id = res?.data?.extractionId || res?.data?.data?.extractionId || res?.extractionId;
        if (!id) throw new Error(res?.message || t('taskBoard.aiNoExtractionId'));
        if (cancelled) return;
        setExtractionId(id);

        for (let i = 0; i < MAX_POLLS; i++) {
          if (cancelled) return;
          const poll = await aiTaskService.getExtraction(id, userHeaders);
          const row = poll?.data ?? poll?.data?.data ?? poll;
          setExtraction(row);
          const st = row?.status;
          if (st === 'ready' || st === 'confirmed') {
            setPhase('ready');
            return;
          }
          if (st === 'failed') {
            setPhase('failed');
            setError(row?.error || t('taskBoard.aiAnalysisFailed'));
            return;
          }
          await new Promise((r) => setTimeout(r, POLL_MS));
        }
        setPhase('failed');
        setError(t('taskBoard.aiPollTimeout'));
      } catch (e) {
        if (cancelled) return;
        setPhase('failed');
        setError(resolveApiErrorMessage(e, { t, fallback: t('taskBoard.aiUnknownError') }));
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, messageId, organizationId, currentUserId, mentionsKey, channelId, reset, userHeaders, t]);

  // Load board/list theo team của kênh chat
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen) return;
      if (!organizationId || !teamId) return;
      setBoardsLoading(true);
      try {
        const res = await taskAPI.getBoards({
          organizationId: String(organizationId),
          teamId: String(teamId),
          ...(workspaceSlug ? { workspaceSlug } : {}),
        });
        const boards = unwrapTaskBoardListPayload(res);
        if (cancelled) return;
        setTaskBoards(boards);
        const firstBoard = boards[0]?._id || boards[0]?.id;
        if (firstBoard) {
          setSelectedBoardId((prev) => prev || String(firstBoard));
        }
      } catch {
        if (!cancelled) setTaskBoards([]);
      } finally {
        if (!cancelled) setBoardsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, organizationId, teamId, workspaceSlug]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!isOpen) return;
      if (!selectedBoardId) {
        setTaskLists([]);
        setSelectedListId('');
        return;
      }
      setListsLoading(true);
      try {
        const res = await taskAPI.getBoardDetail(
          String(selectedBoardId),
          workspaceSlug ? { workspaceSlug } : {}
        );
        const detail = unwrapTaskBoardDetailPayload(res);
        const lists = Array.isArray(detail?.lists) ? detail.lists : [];
        if (cancelled) return;
        setTaskLists(lists);
        const firstList = lists[0]?._id || lists[0]?.id;
        setSelectedListId(firstList ? String(firstList) : '');
      } catch {
        if (!cancelled) {
          setTaskLists([]);
          setSelectedListId('');
        }
      } finally {
        if (!cancelled) setListsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedBoardId, workspaceSlug]);

  const draft = extraction?.draft || {};
  const assigneeId = draft.assigneeId ? String(draft.assigneeId) : '';

  const resolvedAssigneeId = useMemo(() => {
    if (assigneeId && /^[a-f0-9]{24}$/i.test(assigneeId)) return assigneeId;
    const fromMention = sanitizeMentionsForApi(mentions)[0]?.userId;
    return fromMention && /^[a-f0-9]{24}$/i.test(fromMention) ? fromMention : '';
  }, [assigneeId, mentions]);

  const handleConfirm = async () => {
    if (!extractionId || confirming) return;
    setConfirming(true);
    setError('');
    try {
      const body = { extractionId };
      if (resolvedAssigneeId) body.assigneeId = resolvedAssigneeId;
      body.boardId = selectedBoardId || undefined;
      body.listId = selectedListId || undefined;
      if (!body.boardId || !body.listId) {
        throw new Error(t('taskBoard.aiBoardListRequired'));
      }
      const res = await aiTaskService.confirm(body, userHeaders);
      const taskId = res?.data?.taskId || res?.data?.data?.taskId || res?.taskId;
      onConfirmed?.(taskId, extractionId);
      onClose();
    } catch (e) {
      setError(resolveApiErrorMessage(e, { t, fallback: t('taskBoard.aiCreateFailed') }));
    } finally {
      setConfirming(false);
    }
  };

  const LOCALE_TAG_EN = 'en-US';
  const LOCALE_TAG_VI = 'vi-VN';
  const dateLocale = locale === 'en' ? LOCALE_TAG_EN : LOCALE_TAG_VI;
  const title = draft.title || t('taskBoard.aiNoTitle');
  const summary = draft.summary || '';
  const description = draft.description || '';
  const priority = draft.priority || 'medium';
  const assigneeName = draft.assigneeName || '';
  const departmentName = draft.departmentName || '';
  const dueLabel = draft.dueDate
    ? new Date(draft.dueDate).toLocaleString(dateLocale, { dateStyle: 'short', timeStyle: 'short' })
    : '';
  const draftAttachments = Array.isArray(draft.attachments) ? draft.attachments : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('taskBoard.aiModalTitle')} size="lg">
      <p className="mb-3 text-xs text-slate-400" title={getAiTaskTooltipShort(t)}>
        {t('taskBoard.aiModalDesc')}
      </p>
      {messagePreview ? (
        <div className="mb-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300 line-clamp-4">
          {messagePreview}
        </div>
      ) : null}

      {phase === 'queued' && (
        <div className="py-8 text-center text-sm text-slate-300">{t('taskBoard.aiAnalyzing')}</div>
      )}

      {phase === 'failed' && error && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      )}

      {phase === 'ready' && (
        <div className="space-y-3">
          {(teamId && (!selectedBoardId || !selectedListId)) ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {t('taskBoard.aiSelectBoardList')}
            </div>
          ) : null}
          {!dueLabel ? (
            <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100">
              {t('taskBoard.aiNoDeadline')}
            </div>
          ) : null}

          {teamId ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiBoardLabel')}</div>
                <select
                  value={selectedBoardId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSelectedBoardId(v);
                    setSelectedListId('');
                  }}
                  disabled={boardsLoading || !taskBoards.length}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  {taskBoards.length === 0 ? <option value="">{t('taskBoard.aiNoBoard')}</option> : null}
                  {taskBoards.map((b) => (
                    <option key={b._id || b.id} value={String(b._id || b.id)}>
                      {b.title}
                    </option>
                  ))}
                </select>
                {boardsLoading ? <div className="mt-1 text-[10px] text-slate-400">{t('taskBoard.aiLoadingBoard')}</div> : null}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiListLabel')}</div>
                <select
                  value={selectedListId}
                  onChange={(e) => setSelectedListId(e.target.value)}
                  disabled={listsLoading || !taskLists.length}
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
                >
                  {taskLists.length === 0 ? <option value="">{t('taskBoard.aiNoList')}</option> : null}
                  {taskLists.map((l) => (
                    <option key={l._id || l.id} value={String(l._id || l.id)}>
                      {l.title}
                    </option>
                  ))}
                </select>
                {listsLoading ? <div className="mt-1 text-[10px] text-slate-400">{t('taskBoard.aiLoadingList')}</div> : null}
              </div>
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiSuggestedTitle')}</div>
            <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">{title}</div>
          </div>
          {summary ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiSummary')}</div>
              <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                {summary}
              </div>
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiDetailDesc')}</div>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
              {description || '—'}
            </div>
          </div>
          {mentions.length > 0 && !resolvedAssigneeId && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
              {t('taskBoard.aiMentionNoAssignee')}
            </div>
          )}
          {(assigneeName || resolvedAssigneeId || departmentName || dueLabel) && (
            <div className="grid gap-1 text-xs text-slate-400 sm:grid-cols-2">
              {assigneeName || resolvedAssigneeId ? (
                <div>
                  {t('taskBoard.aiAssigneeLabel')}{' '}
                  <span className="text-slate-200">{assigneeName || t('taskBoard.aiAssigneeFromMention')}</span>
                </div>
              ) : null}
              {departmentName ? (
                <div>
                  {t('taskBoard.aiDepartmentLabel')} <span className="text-slate-200">{departmentName}</span>
                </div>
              ) : null}
              {dueLabel ? (
                <div>
                  {t('taskBoard.aiDueLabel')} <span className="text-slate-200">{dueLabel}</span>
                </div>
              ) : null}
            </div>
          )}
          {draftAttachments.length > 0 ? (
            <div>
              <div className="mb-1 text-xs font-semibold uppercase text-slate-500">{t('taskBoard.aiDraftAttachments')}</div>
              <ul className="space-y-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                {draftAttachments.map((a, idx) => (
                  <li key={`${a.url || a.name}-${idx}`} className="truncate">
                    • {a.name || a.url}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="text-xs text-slate-400">
            {t('taskBoard.aiSuggestedPriority')}{' '}
            <span className="text-slate-200">{priority}</span>
            {extraction?.confidence != null && (
              <>
                {' '}
                · {t('taskBoard.aiConfidence')}{' '}
                <span className="text-slate-200">{(Number(extraction.confidence) * 100).toFixed(0)}%</span>
              </>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5"
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              disabled={
                confirming ||
                !dueLabel ||
                (teamId ? (!selectedBoardId || !selectedListId) : false)
              }
              onClick={handleConfirm}
              className="rounded-lg bg-[#5865F2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4752c4] disabled:opacity-50"
            >
              {confirming ? t('taskBoard.creatingTask') : t('taskBoard.approveAiDraft')}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

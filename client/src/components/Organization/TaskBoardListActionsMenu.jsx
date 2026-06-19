import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Archive, ArrowLeft, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { taskAPI, unwrapTaskBoardDetailPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function TaskBoardListActionsMenu({
  isOpen,
  anchorRect,
  isDarkMode,
  workspaceSlug = '',
  list,
  lists = [],
  boards = [],
  currentBoardId = '',
  onClose,
  onOpenAddCard,
  onRefresh,
}) {
  const { t } = useAppStrings();
  const boardApiOpts = workspaceSlug ? { workspaceSlug } : {};
  const [view, setView] = useState('menu');
  const [copyTitle, setCopyTitle] = useState('');
  const [moveBoardId, setMoveBoardId] = useState('');
  const [movePosition, setMovePosition] = useState(1);
  const [targetListCount, setTargetListCount] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState('');

  const listId = list?._id ? String(list._id) : '';
  const listTitle = String(list?.title || '').trim();
  const cardCount =
    typeof list?.cardCount === 'number'
      ? list.cardCount
      : Array.isArray(list?.cards)
        ? list.cards.length
        : 0;
  const hasCards = cardCount > 0;
  const activeListCount = lists.length;
  const rawBlockReason = String(list?.archiveBlockReason || '');
  const normBlockReason = rawBlockReason
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const isLegacyDefaultBlock =
    normBlockReason.includes('he thong mac dinh') || normBlockReason.includes('chi doi ten');
  const canArchive = isLegacyDefaultBlock
    ? activeListCount > 1 && cardCount === 0
    : Boolean(list?.canArchive);
  const archiveBlockReason = isLegacyDefaultBlock
    ? activeListCount <= 1
      ? t('taskBoard.listMinOne')
      : cardCount > 0
        ? t('taskBoard.listHasCards', { n: cardCount })
        : ''
    : rawBlockReason;
  const archiveNameOk = archiveConfirmText.trim() === listTitle && listTitle.length > 0;

  useEffect(() => {
    if (!isOpen) return;
    setView('menu');
    setCopyTitle(String(list?.title || ''));
    setMoveBoardId(String(currentBoardId || ''));
    const idx = lists.findIndex((l) => String(l._id) === listId);
    setMovePosition(idx >= 0 ? idx + 1 : lists.length || 1);
    setArchiveConfirmText('');
  }, [isOpen, list, listId, lists, currentBoardId]);

  useEffect(() => {
    if (view !== 'move' || !moveBoardId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardDetail(String(moveBoardId), boardApiOpts);
        const detail = unwrapTaskBoardDetailPayload(res);
        const n = Array.isArray(detail?.lists) ? detail.lists.length : 0;
        const onCurrent = String(moveBoardId) === String(currentBoardId);
        const maxPos = onCurrent ? Math.max(1, n) : Math.max(1, n + 1);
        if (!cancelled) {
          setTargetListCount(maxPos);
          setMovePosition((p) => Math.min(p, maxPos));
        }
      } catch {
        if (!cancelled) setTargetListCount(Math.max(1, lists.length));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [view, moveBoardId, currentBoardId, lists.length]);

  const positionOptions = useMemo(
    () => Array.from({ length: Math.max(1, targetListCount) }, (_, i) => i + 1),
    [targetListCount]
  );

  const otherLists = useMemo(
    () => lists.filter((l) => String(l._id) !== listId),
    [lists, listId]
  );

  if (!isOpen || !anchorRect || !listId) return null;

  const shell = isDarkMode
    ? 'border-white/10 bg-[#2b2f38] text-slate-100 shadow-2xl'
    : 'border-slate-200 bg-white text-slate-900 shadow-xl';

  const itemBtn = isDarkMode
    ? 'w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/10'
    : 'w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-slate-100';

  const run = async (fn) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fn();
      await onRefresh?.();
      onClose?.();
    } catch (err) {
      toast.error(resolveApiErrorMessage(err, { t, fallback: t('taskBoard.actionFailed') }));
    } finally {
      setSubmitting(false);
    }
  };

  const menuStyle = {
    position: 'fixed',
    top: Math.min(anchorRect.bottom + 6, window.innerHeight - 420),
    left: Math.min(anchorRect.left, window.innerWidth - 300),
    zIndex: 10050,
    width: 280,
  };

  const header = (title, onBack) => (
    <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
      <button
        type="button"
        onClick={onBack}
        className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
        aria-label={t('taskBoard.backAria')}
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
      <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold">{title}</div>
      <button
        type="button"
        onClick={onClose}
        className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}
        aria-label={t('common.close')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  const body =
    view === 'copy' ? (
      <>
        {header(t('taskBoard.copyListTitle'), () => setView('menu'))}
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{t('taskBoard.listNameLabel')}</label>
        <input
          value={copyTitle}
          onChange={(e) => setCopyTitle(e.target.value)}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        />
        <button
          type="button"
          disabled={!copyTitle.trim() || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.copyBoardList(
                currentBoardId,
                listId,
                { title: copyTitle.trim(), toBoardId: currentBoardId },
                boardApiOpts
              );
              toast.success(t('taskBoard.listCopied'));
            })
          }
          className="rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('taskBoard.createListBtn')}
        </button>
      </>
    ) : view === 'move' ? (
      <>
        {header(t('taskBoard.moveListTitle'), () => setView('menu'))}
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {t('taskBoard.listBoardLabel')}
        </label>
        <select
          value={moveBoardId}
          onChange={(e) => {
            setMoveBoardId(e.target.value);
            setMovePosition(1);
          }}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        >
          {boards.map((b) => (
            <option key={b._id} value={String(b._id)}>
              {b.title}
              {String(b._id) === String(currentBoardId) ? t('taskBoard.currentBoardSuffix') : ''}
            </option>
          ))}
        </select>
        <label className={`mb-1 block text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>{t('taskBoard.listPositionLabel')}</label>
        <select
          value={movePosition}
          onChange={(e) => setMovePosition(Number(e.target.value))}
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        >
          {positionOptions.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!moveBoardId || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.moveBoardList(
                currentBoardId,
                listId,
                { toBoardId: moveBoardId, position: movePosition },
                boardApiOpts
              );
              toast.success(t('taskBoard.listMoved'));
            })
          }
          className="rounded-lg bg-[#0c66e4] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('taskBoard.moveBtn')}
        </button>
      </>
    ) : view === 'archive' ? (
      <>
        {header(t('taskBoard.archiveListTitle'), () => setView('menu'))}
        <p className={`mb-3 text-xs leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {t('taskBoard.archiveListDesc')}
        </p>
        <p className={`mb-2 text-xs ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>
          {t('taskBoard.archiveConfirmPrompt')} <strong>{listTitle}</strong>
        </p>
        <input
          value={archiveConfirmText}
          onChange={(e) => setArchiveConfirmText(e.target.value)}
          placeholder={listTitle}
          autoFocus
          className={`mb-3 w-full rounded-lg border px-3 py-2 text-sm outline-none ${
            isDarkMode ? 'border-white/15 bg-[#1a1d26] text-white' : 'border-slate-200 bg-white'
          }`}
        />
        <button
          type="button"
          disabled={!archiveNameOk || submitting}
          onClick={() =>
            run(async () => {
              await taskAPI.archiveBoardList(currentBoardId, listId, boardApiOpts);
              toast.success(t('taskBoard.listArchived'));
            })
          }
          className="w-full rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t('taskBoard.archiveListTitle')}
        </button>
      </>
    ) : view === 'moveAll' ? (
      <>
        {header(t('taskBoard.moveAllCardsTitle'), () => setView('menu'))}
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {otherLists.map((l) => (
            <button
              key={l._id}
              type="button"
              disabled={submitting}
              onClick={() =>
                run(async () => {
                  await taskAPI.moveAllBoardListCards(
                    currentBoardId,
                    listId,
                    { toListId: String(l._id) },
                    boardApiOpts
                  );
                  toast.success(t('taskBoard.allCardsMoved'));
                })
              }
              className={`${itemBtn} disabled:opacity-50`}
            >
              {l.title}
            </button>
          ))}
        </div>
      </>
    ) : (
      <>
        <div className="mb-2 flex items-center justify-between border-b border-white/10 pb-2">
          <span className="text-sm font-semibold">{t('taskBoard.listActions')}</span>
          <button type="button" onClick={onClose} className={`rounded p-1 ${isDarkMode ? 'hover:bg-white/10' : 'hover:bg-slate-100'}`}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-0.5">
          <button
            type="button"
            className={itemBtn}
            onClick={() => {
              onOpenAddCard?.();
              onClose?.();
            }}
          >
            {t('taskBoard.addCard')}
          </button>
          <button type="button" className={itemBtn} onClick={() => setView('copy')}>
            {t('taskBoard.copyListMenu')}
          </button>
          <button type="button" className={itemBtn} onClick={() => setView('move')}>
            {t('taskBoard.moveListMenu')}
          </button>
          {hasCards ? (
            <button type="button" className={itemBtn} onClick={() => setView('moveAll')}>
              {t('taskBoard.moveAllCardsMenu')}
            </button>
          ) : null}
          <button
            type="button"
            className={`${itemBtn} flex items-center gap-2`}
            onClick={() =>
              run(async () => {
                if (list?.isWatching) {
                  await taskAPI.unwatchBoardList(currentBoardId, listId, boardApiOpts);
                  toast.success(t('taskBoard.listUnwatched'));
                } else {
                  await taskAPI.watchBoardList(currentBoardId, listId, boardApiOpts);
                  toast.success(t('taskBoard.listWatchingToast'));
                }
              })
            }
          >
            <Eye className="h-4 w-4" />
            {list?.isWatching ? t('taskBoard.unwatchList') : t('taskBoard.watchList')}
            {list?.watcherCount > 0 ? (
              <span className={`ml-auto text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {list.watcherCount}
              </span>
            ) : null}
          </button>
          <div className={`my-2 border-t ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} />
          <button
            type="button"
            disabled={!canArchive || submitting}
            title={!canArchive ? archiveBlockReason : t('taskBoard.archiveListTitle')}
            onClick={() => {
              if (!canArchive) return;
              setArchiveConfirmText('');
              setView('archive');
            }}
            className={`${itemBtn} flex items-center gap-2 text-red-500 disabled:cursor-not-allowed disabled:opacity-45`}
          >
            <Archive className="h-4 w-4 shrink-0" />
            {t('taskBoard.archiveListTitle')}
          </button>
          {!canArchive && archiveBlockReason ? (
            <p className={`px-3 pb-1 text-[11px] leading-snug ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>
              {archiveBlockReason}
            </p>
          ) : null}
        </div>
      </>
    );

  return createPortal(
    <>
      <div className="fixed inset-0 z-[10040]" onClick={onClose} aria-hidden />
      <div className={`rounded-xl border p-3 ${shell}`} style={menuStyle} role="dialog">
        {body}
      </div>
    </>,
    document.body
  );
}

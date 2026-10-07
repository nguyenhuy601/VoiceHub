import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

const SPRINT_NAME_MAX_LENGTH = 100;
const SPRINT_GOAL_MAX_LENGTH = 500;
const CARD_SEARCH_MAX_LENGTH = 100;

function unwrap(res) {
  return unwrapTaskApiPayload(res) ?? res?.data ?? res;
}

function sprintStatusLabel(status, t) {
  const key = `adminTasks.sprintStatus_${status}`;
  const label = t(key);
  return label === key ? String(status || '—') : label;
}

export default function TasksSprintsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [sprints, setSprints] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  const [cardQuery, setCardQuery] = useState('');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setSprints([]);
      setCards([]);
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [spRes, detailRes] = await Promise.all([
        taskAPI.listBoardSprints(boardId, { organizationId: orgId }),
        taskAPI.getBoardDetail(boardId, { organizationId: orgId }),
      ]);
      const list = unwrap(spRes);
      setSprints(Array.isArray(list) ? list : []);
      const detail = unwrap(detailRes);
      setCards(Array.isArray(detail?.cards) ? detail.cards : []);
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintLoadFail') }));
      setSprints([]);
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const runBusy = async (action, failKey) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t(failKey) }));
    } finally {
      setBusy(false);
    }
  };

  const createSprint = (e) => {
    e.preventDefault();
    if (!boardId || !name.trim()) return;
    return runBusy(async () => {
      await taskAPI.createBoardSprint(
        boardId,
        { name: name.trim(), goal, status: 'planned' },
        { organizationId: orgId }
      );
      toast.success(t('adminTasks.sprintCreated'));
      setName('');
      setGoal('');
      await load();
    }, 'adminTasks.sprintCreateFail');
  };

  const setStatus = (sprintId, status) =>
    runBusy(async () => {
      await taskAPI.updateBoardSprint(boardId, sprintId, { status }, { organizationId: orgId });
      toast.success(t('adminTasks.sprintUpdated'));
      await load();
    }, 'adminTasks.sprintUpdateFail');

  const removeSprint = (sprintId) =>
    runBusy(async () => {
      await taskAPI.deleteBoardSprint(boardId, sprintId, { organizationId: orgId });
      toast.success(t('adminTasks.sprintDeleted'));
      await load();
    }, 'adminTasks.sprintDeleteFail');

  const confirmCloseSprint = (sprint) => {
    setPendingConfirm({
      message: t('adminTasks.sprintCloseConfirm', { name: sprint.name || String(sprint._id) }),
      confirmText: t('adminTasks.sprintClose'),
      run: () => setStatus(sprint._id, 'closed'),
    });
  };

  const confirmRemoveSprint = (sprint) => {
    setPendingConfirm({
      message: t('adminTasks.sprintDeleteConfirm'),
      confirmText: t('adminTasks.delete'),
      variant: 'danger',
      run: () => removeSprint(sprint._id),
    });
  };

  const sprintNameById = useMemo(() => {
    const map = new Map();
    sprints.forEach((s) => map.set(String(s._id), s.name || String(s._id)));
    return map;
  }, [sprints]);

  const pickableCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    return cards.filter((c) => {
      if (c?.isActive === false) return false;
      if (onlyUnassigned && c.sprintId) return false;
      if (q && !String(c.title || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [cards, cardQuery, onlyUnassigned]);

  const cardsInSprint = useMemo(
    () => cards.filter((c) => c?.isActive !== false && c.sprintId),
    [cards]
  );

  const toggleCard = (cardId) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  };

  const assignCards = () => {
    if (!selectedSprintId || !selectedCardIds.size) return;
    return runBusy(async () => {
      await taskAPI.assignCardsToSprint(boardId, selectedSprintId, [...selectedCardIds], {
        organizationId: orgId,
      });
      toast.success(t('adminTasks.sprintCardsAssigned'));
      setSelectedCardIds(new Set());
      await load();
    }, 'adminTasks.sprintAssignFail');
  };

  const confirmRemoveCardFromSprint = (card) => {
    setPendingConfirm({
      message: t('adminTasks.sprintRemoveCardConfirm', {
        card: card.title || String(card._id),
        sprint: sprintNameById.get(String(card.sprintId)) || '—',
      }),
      confirmText: t('adminTasks.sprintRemoveCard'),
      variant: 'danger',
      run: () =>
        runBusy(async () => {
          await taskAPI.removeCardFromSprint(boardId, String(card.sprintId), String(card._id), {
            organizationId: orgId,
          });
          toast.success(t('adminTasks.sprintCardRemoved'));
          await load();
        }, 'adminTasks.sprintRemoveCardFail'),
    });
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.projects.sprints')} hint={t('adminTasks.sprintHint')} wide>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading && !sprints.length && !cards.length && !loadError ? (
        <AdminListSkeleton rows={5} />
      ) : loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminUserFormCard title={t('adminTasks.sprintCreate')}>
            <form className="space-y-3" onSubmit={createSprint}>
              <label className={adminLabelClass()}>
                {t('adminTasks.colTitle')}
                <input
                  className={adminInputClass()}
                  value={name}
                  maxLength={SPRINT_NAME_MAX_LENGTH}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className={adminLabelClass()}>
                {t('adminTasks.sprintGoal')}
                <input
                  className={adminInputClass()}
                  value={goal}
                  maxLength={SPRINT_GOAL_MAX_LENGTH}
                  onChange={(e) => setGoal(e.target.value)}
                />
              </label>
              <button
                type="submit"
                className={adminPrimaryBtnClass()}
                disabled={busy || !name.trim()}
                aria-busy={busy}
              >
                <AdminBusySpinner busy={busy} />
                {t('adminTasks.sprintCreate')}
              </button>
            </form>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.sprintAssignCards')}>
            <label className={adminLabelClass()}>
              {t('adminTasks.sprintLabel')}
              <select
                className={adminInputClass()}
                value={selectedSprintId}
                onChange={(e) => setSelectedSprintId(e.target.value)}
              >
                <option value="">—</option>
                {sprints.map((s) => (
                  <option key={String(s._id)} value={String(s._id)}>
                    {s.name} ({sprintStatusLabel(s.status, t)})
                  </option>
                ))}
              </select>
            </label>
            <label className={`${adminLabelClass()} mt-3`}>
              {t('adminTasks.sprintCardSearch')}
              <input
                type="search"
                className={adminInputClass()}
                value={cardQuery}
                maxLength={CARD_SEARCH_MAX_LENGTH}
                onChange={(e) => setCardQuery(e.target.value)}
              />
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2" role="group" aria-label={t('adminTasks.sprintCardFilter')}>
              {[true, false].map((unassigned) => (
                <button
                  key={String(unassigned)}
                  type="button"
                  aria-pressed={onlyUnassigned === unassigned}
                  onClick={() => setOnlyUnassigned(unassigned)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    onlyUnassigned === unassigned
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {unassigned ? t('adminTasks.sprintFilterUnassigned') : t('adminTasks.sprintFilterAll')}
                </button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
                {t('adminTasks.sprintSelectedCount', { n: selectedCardIds.size })}
              </span>
            </div>
            <ul className="mt-2 max-h-56 space-y-1 overflow-auto rounded-lg border border-border p-2 text-sm">
              {pickableCards.map((c) => {
                const id = String(c._id);
                return (
                  <li key={id}>
                    <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={selectedCardIds.has(id)}
                        onChange={() => toggleCard(id)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-foreground">{c.title || id}</span>
                        {c.sprintId ? (
                          <span className="block text-xs text-muted-foreground">
                            {t('adminTasks.sprintCardIn', { name: sprintNameById.get(String(c.sprintId)) || '—' })}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {!pickableCards.length ? (
              <AdminEmptyState className="!py-4" message={t('adminTasks.sprintNoCards')} />
            ) : null}
            <button
              type="button"
              className={`${adminSecondaryBtnClass()} mt-3`}
              disabled={busy || !selectedSprintId || !selectedCardIds.size}
              aria-busy={busy}
              onClick={assignCards}
            >
              <AdminBusySpinner busy={busy} />
              {t('adminTasks.sprintAssignCards')}
            </button>
            {cardsInSprint.length ? (
              <div className="mt-4">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('adminTasks.sprintCardsInSprints')}</p>
                <ul className="max-h-40 space-y-1 overflow-auto text-sm">
                  {cardsInSprint.map((c) => (
                    <li
                      key={String(c._id)}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate">
                        {c.title || String(c._id)}
                        <span className="text-xs text-muted-foreground">
                          {' · '}
                          {sprintNameById.get(String(c.sprintId)) || '—'}
                        </span>
                      </span>
                      <button
                        type="button"
                        className={adminDangerBtnClass('!px-2 !py-1 text-xs')}
                        disabled={busy}
                        onClick={() => confirmRemoveCardFromSprint(c)}
                      >
                        {t('adminTasks.sprintRemoveCard')}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.sprintList')}>
            <ul className="space-y-2 text-sm">
              {sprints.map((s) => (
                <li
                  key={String(s._id)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div>
                    <p className="font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {sprintStatusLabel(s.status, t)}
                      {s.goal ? ` · ${s.goal}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status !== 'active' && s.status !== 'closed' ? (
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                        disabled={busy}
                        onClick={() => setStatus(s._id, 'active')}
                      >
                        {t('adminTasks.sprintActivate')}
                      </button>
                    ) : null}
                    {s.status !== 'closed' ? (
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                        disabled={busy}
                        onClick={() => confirmCloseSprint(s)}
                      >
                        {t('adminTasks.sprintClose')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={adminDangerBtnClass('!py-1.5 text-xs')}
                      disabled={busy}
                      onClick={() => confirmRemoveSprint(s)}
                    >
                      {t('adminTasks.delete')}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!sprints.length ? <AdminEmptyState message={t('adminTasks.sprintEmpty')} /> : null}
          </AdminUserFormCard>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        onClose={() => setPendingConfirm(null)}
        onConfirm={() => pendingConfirm?.run()}
        title={t('adminTasks.confirmTitle')}
        message={pendingConfirm?.message}
        confirmText={pendingConfirm?.confirmText}
        variant={pendingConfirm?.variant || 'default'}
        cancelText={t('adminTasks.cancel')}
      />
    </AdminUserPanelShell>
  );
}

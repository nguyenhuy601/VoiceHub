import { useCallback, useEffect, useState } from 'react';
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
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

function unwrap(res) {
  return unwrapTaskApiPayload(res) ?? res?.data ?? res;
}

export default function TasksSprintsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [sprints, setSprints] = useState([]);
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [selectedSprintId, setSelectedSprintId] = useState('');
  const [cardIdsText, setCardIdsText] = useState('');

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
      return;
    }
    setLoading(true);
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
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintLoadFail') }));
      setSprints([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const createSprint = async (e) => {
    e.preventDefault();
    if (!boardId || !name.trim()) return;
    try {
      await taskAPI.createBoardSprint(
        boardId,
        { name: name.trim(), goal, status: 'planned' },
        { organizationId: orgId }
      );
      toast.success(t('adminTasks.sprintCreated'));
      setName('');
      setGoal('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintCreateFail') }));
    }
  };

  const setStatus = async (sprintId, status) => {
    try {
      await taskAPI.updateBoardSprint(boardId, sprintId, { status }, { organizationId: orgId });
      toast.success(t('adminTasks.sprintUpdated'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintUpdateFail') }));
    }
  };

  const removeSprint = async (sprintId) => {
    if (!window.confirm(t('adminTasks.sprintDeleteConfirm'))) return;
    try {
      await taskAPI.deleteBoardSprint(boardId, sprintId, { organizationId: orgId });
      toast.success(t('adminTasks.sprintDeleted'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintDeleteFail') }));
    }
  };

  const assignCards = async () => {
    if (!selectedSprintId) return;
    const cardIds = cardIdsText
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await taskAPI.assignCardsToSprint(boardId, selectedSprintId, cardIds, {
        organizationId: orgId,
      });
      toast.success(t('adminTasks.sprintCardsAssigned'));
      setCardIdsText('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.sprintAssignFail') }));
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.sprints')} hint={t('adminTasks.sprintHint')} wide>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <AdminUserFormCard title={t('adminTasks.sprintCreate')}>
            <form className="space-y-3" onSubmit={createSprint}>
              <label className={adminLabelClass()}>
                {t('adminTasks.colTitle')}
                <input className={adminInputClass()} value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className={adminLabelClass()}>
                {t('adminTasks.sprintGoal')}
                <input className={adminInputClass()} value={goal} onChange={(e) => setGoal(e.target.value)} />
              </label>
              <button type="submit" className={adminPrimaryBtnClass()}>
                {t('adminTasks.sprintCreate')}
              </button>
            </form>
          </AdminUserFormCard>

          <AdminUserFormCard title={t('adminTasks.sprintAssignCards')}>
            <label className={adminLabelClass()}>
              Sprint
              <select
                className={adminInputClass()}
                value={selectedSprintId}
                onChange={(e) => setSelectedSprintId(e.target.value)}
              >
                <option value="">—</option>
                {sprints.map((s) => (
                  <option key={String(s._id)} value={String(s._id)}>
                    {s.name} ({s.status})
                  </option>
                ))}
              </select>
            </label>
            <label className={`${adminLabelClass()} mt-3`}>
              {t('adminTasks.sprintCardIds')}
              <textarea
                className={adminInputClass()}
                rows={3}
                value={cardIdsText}
                onChange={(e) => setCardIdsText(e.target.value)}
                placeholder={cards
                  .slice(0, 3)
                  .map((c) => c._id)
                  .join(', ')}
              />
            </label>
            <button type="button" className={`${adminSecondaryBtnClass()} mt-3`} onClick={assignCards}>
              {t('adminTasks.sprintAssignCards')}
            </button>
            <ul className="mt-3 max-h-40 space-y-1 overflow-auto text-xs text-muted-foreground">
              {cards.slice(0, 20).map((c) => (
                <li key={String(c._id)}>
                  {c.title} · {String(c._id).slice(-6)}
                  {c.sprintId ? ` · sprint ${String(c.sprintId).slice(-4)}` : ''}
                </li>
              ))}
            </ul>
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
                      {s.status}
                      {s.goal ? ` · ${s.goal}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {s.status !== 'active' && s.status !== 'closed' ? (
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                        onClick={() => setStatus(s._id, 'active')}
                      >
                        Active
                      </button>
                    ) : null}
                    {s.status !== 'closed' ? (
                      <button
                        type="button"
                        className={adminSecondaryBtnClass('!py-1.5 text-xs')}
                        onClick={() => setStatus(s._id, 'closed')}
                      >
                        Close
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className={adminDangerBtnClass('!py-1.5 text-xs')}
                      onClick={() => removeSprint(s._id)}
                    >
                      {t('adminTasks.delete')}
                    </button>
                  </div>
                </li>
              ))}
              {!sprints.length ? (
                <li className="text-muted-foreground">{t('adminTasks.sprintEmpty')}</li>
              ) : null}
            </ul>
          </AdminUserFormCard>
        </div>
      )}
    </AdminUserPanelShell>
  );
}

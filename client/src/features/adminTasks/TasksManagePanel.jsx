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
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

export default function TasksManagePanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [cards, setCards] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(String(params.get('status') || ''));
  const [priority, setPriority] = useState(String(params.get('priority') || ''));
  const [tag, setTag] = useState('');
  const [editId, setEditId] = useState('');
  const [editStatus, setEditStatus] = useState('todo');
  const [editPriority, setEditPriority] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createAssignee, setCreateAssignee] = useState('');
  const [boardMembers, setBoardMembers] = useState([]);
  const [creating, setCreating] = useState(false);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const load = useCallback(async () => {
    if (!boardId) {
      setCards([]);
      setLists([]);
      return;
    }
    setLoading(true);
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const list = Array.isArray(data?.cards) ? data.cards : Array.isArray(data?.tasks) ? data.tasks : [];
      setCards(list.filter((c) => c?.isActive !== false));
      setLists(Array.isArray(data?.lists) ? data.lists : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageLoadFail') }));
      setCards([]);
      setLists([]);
    } finally {
      setLoading(false);
    }
  }, [boardId, orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!boardId) {
      setBoardMembers([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardAssignableMembers(boardId, { organizationId: orgId });
        const payload = unwrapTaskApiPayload(res);
        const rows = Array.isArray(payload?.members) ? payload.members : [];
        if (!cancelled) setBoardMembers(rows);
      } catch {
        if (!cancelled) setBoardMembers([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [boardId, orgId]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const tg = tag.trim().toLowerCase();
    return cards.filter((c) => {
      if (status && String(c.status || '') !== status) return false;
      if (priority && String(c.priority || '') !== priority) return false;
      if (qq && !String(c.title || '').toLowerCase().includes(qq)) return false;
      if (tg) {
        const tags = (c.tags || []).map((x) => String(x).toLowerCase());
        if (!tags.some((x) => x.includes(tg))) return false;
      }
      return true;
    });
  }, [cards, q, status, priority, tag]);

  const startEdit = (card) => {
    setEditId(String(card._id));
    setEditStatus(card.status || 'todo');
    setEditPriority(card.priority || 'medium');
  };

  const saveEdit = async () => {
    if (!editId || saving) return;
    setSaving(true);
    try {
      await taskAPI.updateBoardCard(
        editId,
        { status: editStatus, priority: editPriority },
        { organizationId: orgId }
      );
      toast.success(t('adminTasks.manageSaved'));
      setEditId('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageSaveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const archiveCard = async (card) => {
    const name = card.title || String(card._id);
    if (!window.confirm(t('adminTasks.manageArchiveConfirm').replace('{name}', name))) return;
    try {
      await taskAPI.archiveBoardCard(String(card._id), { organizationId: orgId });
      toast.success(t('adminTasks.manageArchived'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageArchiveFail') }));
    }
  };

  const createCard = async (e) => {
    e.preventDefault();
    if (!boardId || !createTitle.trim() || creating) return;
    const listId = lists[0]?._id;
    if (!listId) {
      toast.error(t('adminTasks.manageNoList'));
      return;
    }
    setCreating(true);
    try {
      await taskAPI.createBoardCard(
        boardId,
        {
          listId,
          title: createTitle.trim(),
          assigneeId: createAssignee || undefined,
        },
        { organizationId: orgId }
      );
      toast.success(t('adminTasks.manageCreated'));
      setCreateTitle('');
      setCreateAssignee('');
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageCreateFail') }));
    } finally {
      setCreating(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.manageTasks')} hint={t('adminTasks.manageHint')}>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {boardId ? (
        <AdminUserFormCard title={t('adminTasks.manageCreate')}>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={createCard}>
            <label className={`${adminLabelClass()} sm:col-span-2`}>
              {t('adminTasks.manageCreateTitle')}
              <input
                className={adminInputClass()}
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
              />
            </label>
            <label className={adminLabelClass()}>
              {t('adminTasks.manageAssignee')}
              <select
                className={adminInputClass()}
                value={createAssignee}
                onChange={(e) => setCreateAssignee(e.target.value)}
              >
                <option value="">—</option>
                {boardMembers.map((m) => {
                  const id = String(m.userId || '');
                  const label = m.displayName || m.username || id;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            </label>
            <button type="submit" className={adminPrimaryBtnClass()} disabled={creating}>
              {t('adminTasks.manageCreate')}
            </button>
          </form>
        </AdminUserFormCard>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterQ')}
          <input className={adminInputClass()} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterStatus')}
          <select className={adminInputClass()} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('adminTasks.manageAll')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterPriority')}
          <select
            className={adminInputClass()}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            <option value="">{t('adminTasks.manageAll')}</option>
            {PRIORITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterTag')}
          <input className={adminInputClass()} value={tag} onChange={(e) => setTag(e.target.value)} />
        </label>
      </div>

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.loading')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((card) => {
            const id = String(card._id);
            const editing = editId === id;
            return (
              <AdminUserFormCard key={id} title={card.title || id}>
                <p className="text-xs text-muted-foreground">
                  {card.status || '—'} · {card.priority || '—'}
                  {card.assigneeId ? ` · assignee ${card.assigneeId}` : ''}
                </p>
                {(card.tags || []).length ? (
                  <p className="mt-1 text-xs text-muted-foreground">tags: {(card.tags || []).join(', ')}</p>
                ) : null}
                {editing ? (
                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <label className={adminLabelClass()}>
                      Status
                      <select
                        className={adminInputClass()}
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={adminLabelClass()}>
                      Priority
                      <select
                        className={adminInputClass()}
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                      >
                        {PRIORITIES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className={adminPrimaryBtnClass()} disabled={saving} onClick={saveEdit}>
                      {t('adminTasks.save')}
                    </button>
                    <button
                      type="button"
                      className={adminSecondaryBtnClass()}
                      onClick={() => setEditId('')}
                    >
                      {t('adminTasks.cancel')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className={adminSecondaryBtnClass()} onClick={() => startEdit(card)}>
                      {t('adminTasks.edit')}
                    </button>
                    <button type="button" className={adminDangerBtnClass()} onClick={() => archiveCard(card)}>
                      {t('adminTasks.delete')}
                    </button>
                  </div>
                )}
              </AdminUserFormCard>
            );
          })}
          {!filtered.length ? (
            <p className="text-sm text-muted-foreground">{t('adminTasks.manageEmpty')}</p>
          ) : null}
        </div>
      )}
    </AdminUserPanelShell>
  );
}

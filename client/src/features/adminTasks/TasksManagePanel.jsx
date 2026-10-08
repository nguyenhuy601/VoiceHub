import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminDenseMobileList,
  AdminDenseTableCard,
  AdminDenseTableScroll,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminDenseRowClass,
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

const STATUSES = ['todo', 'in_progress', 'review', 'done', 'cancelled'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
/** API board detail không phân trang — hiển thị dần phía client. */
const MANAGE_PAGE_SIZE = 50;
const CARD_TITLE_MAX_LENGTH = 200;
const FILTER_MAX_LENGTH = 100;

function translateOrRaw(t, key, raw) {
  const label = t(key);
  return label === key ? String(raw || '—') : label;
}

function workStatusLabel(status, t) {
  if (!status) return '—';
  return translateOrRaw(t, `workspace.projectHubWorkStatus_${status}`, status);
}

function priorityLabel(priority, t) {
  if (!priority) return '—';
  const suffix = String(priority).charAt(0).toUpperCase() + String(priority).slice(1);
  return translateOrRaw(t, `workspace.projectHubPriority${suffix}`, priority);
}

export default function TasksManagePanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [cards, setCards] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [membersError, setMembersError] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [archiving, setArchiving] = useState(false);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(String(params.get('status') || ''));
  const [priority, setPriority] = useState(String(params.get('priority') || ''));
  const [tag, setTag] = useState(String(params.get('tag') || '').slice(0, FILTER_MAX_LENGTH));
  const [visibleCount, setVisibleCount] = useState(MANAGE_PAGE_SIZE);
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
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const list = Array.isArray(data?.cards) ? data.cards : Array.isArray(data?.tasks) ? data.tasks : [];
      setCards(list.filter((c) => c?.isActive !== false));
      setLists(Array.isArray(data?.lists) ? data.lists : []);
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageLoadFail') }));
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
      setMembersError(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await taskAPI.getBoardAssignableMembers(boardId, { organizationId: orgId });
        const payload = unwrapTaskApiPayload(res);
        const rows = Array.isArray(payload?.members) ? payload.members : [];
        if (!cancelled) {
          setBoardMembers(rows);
          setMembersError(false);
        }
      } catch {
        if (!cancelled) {
          setBoardMembers([]);
          setMembersError(true);
        }
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

  useEffect(() => {
    setVisibleCount(MANAGE_PAGE_SIZE);
  }, [boardId, q, status, priority, tag]);

  const visibleCards = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hiddenCount = Math.max(0, filtered.length - visibleCards.length);

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

  const memberNameById = useMemo(() => {
    const map = new Map();
    boardMembers.forEach((m) => {
      const id = String(m.userId || '');
      if (id) map.set(id, m.displayName || m.username || id);
    });
    return map;
  }, [boardMembers]);

  const assigneeLabel = (card) => {
    const assigneeId = card.assigneeId ? String(card.assigneeId) : '';
    return assigneeId ? memberNameById.get(assigneeId) || assigneeId : '—';
  };

  const cardSummaryLine = (card) => {
    const parts = [workStatusLabel(card.status, t), priorityLabel(card.priority, t)];
    if (card.assigneeId) parts.push(`${t('adminTasks.manageAssignee')}: ${assigneeLabel(card)}`);
    if ((card.tags || []).length) {
      parts.push(t('adminTasks.manageTagsLine', { tags: (card.tags || []).join(', ') }));
    }
    return parts.join(' · ');
  };

  const renderEditFields = () => (
    <div className="flex flex-wrap items-end gap-2">
      <label className={adminLabelClass()}>
        {t('adminTasks.manageFilterStatus')}
        <select className={adminInputClass()} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {workStatusLabel(s, t)}
            </option>
          ))}
        </select>
      </label>
      <label className={adminLabelClass()}>
        {t('adminTasks.manageFilterPriority')}
        <select
          className={adminInputClass()}
          value={editPriority}
          onChange={(e) => setEditPriority(e.target.value)}
        >
          {PRIORITIES.map((s) => (
            <option key={s} value={s}>
              {priorityLabel(s, t)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );

  const renderRowActions = (card) => {
    if (editId === String(card._id)) {
      return (
        <>
          <button
            type="button"
            className={adminPrimaryBtnClass('px-3 py-1.5')}
            disabled={saving}
            aria-busy={saving}
            onClick={saveEdit}
          >
            <AdminBusySpinner busy={saving} />
            {saving ? t('common.saving') : t('adminTasks.save')}
          </button>
          <button
            type="button"
            className={adminSecondaryBtnClass('px-3 py-1.5')}
            disabled={saving}
            onClick={() => setEditId('')}
          >
            {t('adminTasks.cancel')}
          </button>
        </>
      );
    }
    return (
      <>
        <button type="button" className={adminSecondaryBtnClass('px-3 py-1.5')} onClick={() => startEdit(card)}>
          {t('adminTasks.edit')}
        </button>
        <button
          type="button"
          className={adminDangerBtnClass('px-3 py-1.5')}
          disabled={archiving}
          aria-busy={archiving && String(pendingArchive?._id) === String(card._id)}
          onClick={() => setPendingArchive(card)}
        >
          {t('adminTasks.archive')}
        </button>
      </>
    );
  };

  const archiveCard = async (card) => {
    if (archiving) return;
    setArchiving(true);
    try {
      await taskAPI.archiveBoardCard(String(card._id), { organizationId: orgId });
      toast.success(t('adminTasks.manageArchived'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.manageArchiveFail') }));
    } finally {
      setArchiving(false);
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
                maxLength={CARD_TITLE_MAX_LENGTH}
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
              {membersError ? (
                <span className="mt-1 block text-[11px] text-warning">{t('adminTasks.manageMembersLoadFail')}</span>
              ) : null}
            </label>
            <button
              type="submit"
              className={adminPrimaryBtnClass()}
              disabled={creating || !createTitle.trim()}
              aria-busy={creating}
            >
              <AdminBusySpinner busy={creating} />
              {t('adminTasks.manageCreate')}
            </button>
          </form>
        </AdminUserFormCard>
      ) : null}

      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterQ')}
          <input
            className={adminInputClass()}
            value={q}
            maxLength={FILTER_MAX_LENGTH}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterStatus')}
          <select className={adminInputClass()} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('adminTasks.manageAll')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {workStatusLabel(s, t)}
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
                {priorityLabel(s, t)}
              </option>
            ))}
          </select>
        </label>
        <label className={adminLabelClass()}>
          {t('adminTasks.manageFilterTag')}
          <input
            className={adminInputClass()}
            value={tag}
            maxLength={FILTER_MAX_LENGTH}
            onChange={(e) => setTag(e.target.value)}
          />
        </label>
      </div>

      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : loading && !cards.length && !loadError ? (
        <AdminListSkeleton rows={5} />
      ) : loadError ? (
        <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
      ) : (
        <AdminDenseTableCard>
          <AdminDenseTableScroll>
            <AdminDenseMobileList
              items={visibleCards}
              getKey={(card) => String(card._id)}
              ariaLabel={t('adminDomains.tasks.manageTasks')}
              renderTitle={(card) => card.title || String(card._id)}
              renderMeta={(card) => (
                <>
                  {cardSummaryLine(card)}
                  {editId === String(card._id) ? <div className="mt-2">{renderEditFields()}</div> : null}
                </>
              )}
              renderActions={renderRowActions}
            />
            <table className="hidden min-w-full text-sm md:table">
              <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('adminTasks.manageColTitle')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageFilterStatus')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageFilterPriority')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageAssignee')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageFilterTag')}</th>
                  <th className="px-4 py-3">{t('adminTasks.manageColActions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleCards.map((card) => {
                  const id = String(card._id);
                  const editing = editId === id;
                  return (
                    <tr key={id} className={adminDenseRowClass('align-top')}>
                      <td className="max-w-[18rem] px-4 py-3 font-medium text-foreground">
                        <span className="line-clamp-2 break-words">{card.title || id}</span>
                      </td>
                      {editing ? (
                        <td colSpan={2} className="px-4 py-3">
                          {renderEditFields()}
                        </td>
                      ) : (
                        <>
                          <td className="px-4 py-3 text-muted-foreground">{workStatusLabel(card.status, t)}</td>
                          <td className="px-4 py-3 text-muted-foreground">{priorityLabel(card.priority, t)}</td>
                        </>
                      )}
                      <td className="px-4 py-3 text-muted-foreground">{assigneeLabel(card)}</td>
                      <td className="max-w-[12rem] px-4 py-3 text-xs text-muted-foreground">
                        {(card.tags || []).join(', ') || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">{renderRowActions(card)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filtered.length ? (
              <AdminEmptyState className="!py-10" message={t('adminTasks.manageEmpty')} />
            ) : null}
          </AdminDenseTableScroll>
          {hiddenCount > 0 ? (
            <div className="flex shrink-0 justify-center border-t border-border px-4 py-3">
              <button
                type="button"
                className={adminSecondaryBtnClass()}
                onClick={() => setVisibleCount((n) => n + MANAGE_PAGE_SIZE)}
              >
                {t('adminTasks.manageShowMore', { n: hiddenCount })}
              </button>
            </div>
          ) : null}
        </AdminDenseTableCard>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingArchive)}
        onClose={() => setPendingArchive(null)}
        onConfirm={() => (pendingArchive ? archiveCard(pendingArchive) : undefined)}
        title={t('adminTasks.confirmTitle')}
        message={
          pendingArchive
            ? t('adminTasks.manageArchiveConfirm', {
                name: pendingArchive.title || String(pendingArchive._id),
              })
            : ''
        }
        confirmText={t('adminTasks.archive')}
        cancelText={t('adminTasks.cancel')}
        variant="danger"
      />
    </AdminUserPanelShell>
  );
}

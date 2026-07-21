import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';
import useAdminOrgBoards, { boardCodeOf, boardIdOf, boardTitleOf } from './useAdminOrgBoards';

function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function TasksExportPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const { boards, loadBoards } = useAdminOrgBoards(orgId);
  const [busy, setBusy] = useState(false);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const exportBoards = async () => {
    setBusy(true);
    try {
      const list = boards.length ? boards : await loadBoards();
      const rows = [
        ['id', 'title', 'projectCode', 'scopeType', 'scopeId'],
        ...list.map((b) => [
          boardIdOf(b),
          boardTitleOf(b),
          boardCodeOf(b),
          b.scopeType || '',
          b.scopeId || b.teamId || '',
        ]),
      ];
      downloadCsv(`boards-${orgId || 'org'}.csv`, rows);
      toast.success(t('adminTasks.exportDone'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.exportFail') }));
    } finally {
      setBusy(false);
    }
  };

  const exportCards = async () => {
    if (!boardId) {
      toast.error(t('adminTasks.exportNeedBoard'));
      return;
    }
    setBusy(true);
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const cards = Array.isArray(data?.cards) ? data.cards : [];
      const rows = [
        ['id', 'title', 'status', 'priority', 'assigneeId', 'listId'],
        ...cards.map((c) => [
          c._id,
          c.title,
          c.status,
          c.priority,
          c.assigneeId || '',
          c.listId || '',
        ]),
      ];
      downloadCsv(`cards-${boardId}.csv`, rows);
      toast.success(t('adminTasks.exportDone'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.exportFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.export')} hint={t('adminTasks.exportHint')}>
      <AdminUserFormCard title={t('adminTasks.exportBoards')}>
        <button type="button" className={adminPrimaryBtnClass()} disabled={busy} onClick={exportBoards}>
          {t('adminTasks.exportBoards')}
        </button>
      </AdminUserFormCard>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />
      <AdminUserFormCard title={t('adminTasks.exportTasks')}>
        <button type="button" className={adminSecondaryBtnClass()} disabled={busy} onClick={exportCards}>
          {t('adminTasks.exportTasks')}
        </button>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

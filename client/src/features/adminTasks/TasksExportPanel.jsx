import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminBusySpinner,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
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
import { buildCsv } from './csvCell';
import useAdminOrgBoards, { boardCodeOf, boardIdOf, boardTitleOf } from './useAdminOrgBoards';

function sanitizeFilePart(name) {
  return String(name || 'board')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'board';
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadCsv(filename, rows) {
  const csv = buildCsv(rows);
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
  const { boards, loading: boardsLoading, error: boardsError, loadBoards } = useAdminOrgBoards(orgId);
  const [busyBoards, setBusyBoards] = useState(false);
  const [busyCards, setBusyCards] = useState(false);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const boardsLoadMessage = boardsError
    ? resolveApiErrorMessage(boardsError, { t, fallback: t('adminTasks.boardsLoadFail') })
    : '';

  const exportBoards = async () => {
    setBusyBoards(true);
    try {
      const list = boards.length ? boards : await loadBoards();
      const rows = [
        [
          t('adminTasks.exportColBoardId'),
          t('adminTasks.exportColBoardTitle'),
          t('adminTasks.exportColProjectCode'),
          t('adminTasks.exportColScopeType'),
          t('adminTasks.exportColScopeId'),
        ],
        ...list.map((b) => [
          boardIdOf(b),
          boardTitleOf(b),
          boardCodeOf(b),
          b.scopeType || '',
          b.scopeId || b.teamId || '',
        ]),
      ];
      downloadCsv(`boards-${orgId || 'org'}-${todayStamp()}.csv`, rows);
      toast.success(t('adminTasks.exportDone'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.exportFail') }));
    } finally {
      setBusyBoards(false);
    }
  };

  const exportCards = async () => {
    if (!boardId) {
      toast.error(t('adminTasks.exportNeedBoard'));
      return;
    }
    setBusyCards(true);
    try {
      const res = await taskAPI.getBoardDetail(boardId, { organizationId: orgId });
      const data = unwrapTaskApiPayload(res);
      const cards = Array.isArray(data?.cards) ? data.cards : [];
      const board = boards.find((b) => boardIdOf(b) === boardId);
      const boardName = sanitizeFilePart(board ? boardTitleOf(board) : boardId);
      const rows = [
        [
          t('adminTasks.exportColCardId'),
          t('adminTasks.exportColCardTitle'),
          t('adminTasks.exportColStatus'),
          t('adminTasks.exportColPriority'),
          t('adminTasks.exportColAssigneeId'),
          t('adminTasks.exportColListId'),
        ],
        ...cards.map((c) => [
          c._id,
          c.title,
          c.status,
          c.priority,
          c.assigneeId || '',
          c.listId || '',
        ]),
      ];
      downloadCsv(`cards-${boardName}-${todayStamp()}.csv`, rows);
      toast.success(t('adminTasks.exportDone'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.exportFail') }));
    } finally {
      setBusyCards(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.projects.export')} hint={t('adminTasks.exportHint')}>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />

      {boardsLoadMessage ? (
        <AdminLoadErrorState
          className="mb-4"
          message={boardsLoadMessage}
          onRetry={() => loadBoards().catch(() => {})}
          disabled={boardsLoading}
        />
      ) : null}

      <AdminUserFormCard title={t('adminTasks.exportBoards')}>
        <button
          type="button"
          className={adminPrimaryBtnClass()}
          disabled={busyBoards || boardsLoading}
          aria-busy={busyBoards || undefined}
          onClick={exportBoards}
        >
          <AdminBusySpinner busy={busyBoards} />
          {busyBoards ? t('adminTasks.exportBusy') : t('adminTasks.exportBoards')}
        </button>
      </AdminUserFormCard>

      <AdminUserFormCard title={t('adminTasks.exportTasks')}>
        <button
          type="button"
          className={adminSecondaryBtnClass()}
          disabled={!boardId || busyCards}
          aria-busy={busyCards || undefined}
          onClick={exportCards}
        >
          <AdminBusySpinner busy={busyCards} />
          {busyCards ? t('adminTasks.exportBusy') : t('adminTasks.exportTasks')}
        </button>
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner } from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import useAdminMembers from '../../hooks/useAdminMembers';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberLabelById } from '../../utils/adminUserUtils';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

export default function TasksTransferPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  // Người nhận lấy từ ?userId= (AdminUserPicker ghi URL) — cùng cơ chế Project Team.
  const toUserId = String(params.get('userId') || '').trim();
  const [demote, setDemote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { membersByIdAll } = useAdminMembers(orgId, { view: 'directory' });

  const unknownName = t('adminTasks.briefsPmUnknown');
  const toUserName = toUserId ? memberLabelById(membersByIdAll, toUserId, unknownName) : '';

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    next.delete('userId');
    setParams(next, { replace: true });
    setResult(null);
  };

  const submit = (e) => {
    e.preventDefault();
    if (!boardId || !toUserId || busy) return;
    setConfirmOpen(true);
  };

  const transfer = async () => {
    if (!boardId || !toUserId || busy) return;
    setBusy(true);
    try {
      const res = await taskAPI.transferBoard(
        boardId,
        { toUserId, demotePreviousPm: demote },
        { organizationId: orgId }
      );
      const data = unwrapTaskApiPayload(res) ?? res?.data ?? res;
      setResult(data);
      toast.success(t('adminTasks.transferDone'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.transferFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.tasks.transfer')} hint={t('adminTasks.transferApiHint')} wide>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />
      {!boardId ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-start">
          <AdminUserPicker
            orgId={orgId}
            selectedUserId={toUserId}
            hint={t('adminTasks.transferPickerHint')}
          />
          <AdminUserFormCard title={t('adminTasks.transferForm')}>
            <form className="space-y-4" onSubmit={submit} aria-busy={busy}>
              <div>
                <p className="text-xs font-medium text-muted-foreground">{t('adminTasks.transferToUser')}</p>
                <p className="mt-1 text-sm text-foreground">
                  {toUserId ? t('adminTasks.transferSelected', { name: toUserName }) : '—'}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={demote}
                  disabled={busy}
                  onChange={(e) => setDemote(e.target.checked)}
                />
                {t('adminTasks.transferDemote')}
              </label>
              <div>
                <button
                  type="submit"
                  className={adminDangerBtnClass()}
                  disabled={busy || !toUserId}
                  aria-busy={busy}
                >
                  <AdminBusySpinner busy={busy} />
                  {busy ? t('common.saving') : t('adminTasks.transferSubmit')}
                </button>
              </div>
              {result ? (
                <p className="text-xs text-muted-foreground">
                  {memberLabelById(membersByIdAll, result.previousOwnerId, unknownName)} →{' '}
                  {memberLabelById(membersByIdAll, result.newOwnerId, unknownName)}
                </p>
              ) : null}
            </form>
          </AdminUserFormCard>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={transfer}
        variant="danger"
        title={t('adminTasks.confirmTitle')}
        message={`${t('adminTasks.transferConfirm')}${toUserName ? ` (${toUserName})` : ''}`}
        confirmText={t('adminTasks.transferSubmit')}
        cancelText={t('adminTasks.cancel')}
      />
    </AdminUserPanelShell>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { taskAPI, unwrapTaskApiPayload } from '../../services/api/taskAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import AdminTaskBoardPicker from './AdminTaskBoardPicker';

export default function TasksTransferPanel({ orgId }) {
  const { t } = useAppStrings();
  const [params, setParams] = useSearchParams();
  const boardId = String(params.get('boardId') || '').trim();
  const [toUserId, setToUserId] = useState('');
  const [demote, setDemote] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const setBoardId = (id) => {
    const next = new URLSearchParams(params);
    if (id) next.set('boardId', id);
    else next.delete('boardId');
    setParams(next, { replace: true });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!boardId || !toUserId.trim()) return;
    if (!window.confirm(t('adminTasks.transferConfirm'))) return;
    setBusy(true);
    try {
      const res = await taskAPI.transferBoard(
        boardId,
        { toUserId: toUserId.trim(), demotePreviousPm: demote },
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
    <AdminUserPanelShell title={t('adminDomains.tasks.transfer')} hint={t('adminTasks.transferApiHint')}>
      <AdminTaskBoardPicker orgId={orgId} boardId={boardId} onBoardIdChange={setBoardId} />
      <AdminUserFormCard title={t('adminTasks.transferForm')}>
        {!boardId ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.needBoard')}</p>
        ) : (
          <form className="space-y-4" onSubmit={submit}>
            <label className={adminLabelClass()}>
              {t('adminTasks.transferToUser')}
              <input
                className={adminInputClass()}
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                placeholder="user ObjectId"
              />
            </label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={demote} onChange={(e) => setDemote(e.target.checked)} />
              {t('adminTasks.transferDemote')}
            </label>
            <button type="submit" className={adminDangerBtnClass()} disabled={busy}>
              {t('adminTasks.transferSubmit')}
            </button>
            {result ? (
              <p className="text-xs text-muted-foreground">
                {String(result.previousOwnerId)} → {String(result.newOwnerId)}
              </p>
            ) : null}
          </form>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

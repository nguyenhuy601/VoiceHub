import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogOut } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function AccountRevokeSessionsPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const confirm = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await adminUserAPI.revokeSessions(orgId, userId);
      toast.success(t('adminAccounts.revokeSuccess'));
      setOpen(false);
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.revokeFail') });
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <AdminUserFormCard title={t('adminDomains.accounts.revokeSessions')} hint={t('adminAccounts.revokeHint')} danger>
        <p className="mb-4 text-sm text-muted-foreground">{t('adminAccounts.revokeDescription')}</p>
        {actionError ? <p className="mb-3 text-sm text-destructive">{actionError}</p> : null}
        <button
          type="button"
          disabled={!userId}
          className={adminDangerBtnClass()}
          onClick={() => setOpen(true)}
        >
          <LogOut className="h-3.5 w-3.5" />
          {t('adminAccounts.revokeSessions')}
        </button>
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminAccounts.revokeConfirmTitle')}
        message={t('adminAccounts.revokeConfirmMessage')}
        confirmText={t('adminAccounts.revokeSessions')}
        cancelText={t('common.cancel')}
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.revokeSessions')} hint={t('adminAccounts.revokeHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.revokePickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

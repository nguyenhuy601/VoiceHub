import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

export default function AccountResetPasswordPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const sendReset = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await adminUserAPI.triggerPasswordReset(orgId, userId, window.location.origin);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      setResult(data);
      toast.success(t('adminUsers.resetSent'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.resetFail') }));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminUsers.sendResetEmail')} hint={t('adminUsers.resetHint')}>
      {!userId ? (
        <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : null}
      <button
        type="button"
        disabled={!userId || busy}
        className={adminPrimaryBtnClass()}
        onClick={sendReset}
      >
        <Mail className="h-3.5 w-3.5" />
        {busy ? t('common.saving') : t('adminUsers.sendResetEmail')}
      </button>
      {result?.resetUrl ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('adminUsers.devResetUrl')}</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{result.resetUrl}</p>
        </div>
      ) : null}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.resetPassword')} hint={t('adminUsers.resetHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.resetPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

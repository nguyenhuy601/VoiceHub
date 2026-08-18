import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function AccountSetPasswordPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [password, setPassword] = useState('');
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [busy, setBusy] = useState(false);
  const { loadMembers } = useAdminMembers(orgId);

  const submit = async () => {
    if (!orgId || !userId || busy || !password.trim()) return;
    setBusy(true);
    try {
      await adminUserAPI.setPassword(orgId, userId, { password, mustChangePassword });
      toast.success(t('adminAccounts.setPasswordSuccess'));
      setPassword('');
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.setPasswordFail') }));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.accounts.setPassword')} hint={t('adminAccounts.setPasswordHint')}>
      {!userId ? (
        <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : (
        <>
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-muted-foreground">{t('adminAccounts.newPassword')}</span>
            <input
              type="password"
              autoComplete="new-password"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <label className="mb-4 flex items-start gap-2.5 text-sm text-foreground">
            <input
              type="checkbox"
              className="mt-0.5 rounded border-border"
              checked={mustChangePassword}
              onChange={(e) => setMustChangePassword(e.target.checked)}
            />
            <span>{t('adminAccounts.requireChangeAfterSet')}</span>
          </label>
          <button
            type="button"
            disabled={!userId || busy || !password.trim()}
            className={adminPrimaryBtnClass()}
            onClick={submit}
          >
            <KeyRound className="h-3.5 w-3.5" />
            {busy ? t('common.saving') : t('adminAccounts.applyPassword')}
          </button>
        </>
      )}
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.setPassword')} hint={t('adminAccounts.setPasswordHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.setPasswordPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

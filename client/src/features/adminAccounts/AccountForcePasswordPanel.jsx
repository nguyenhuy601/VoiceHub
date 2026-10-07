import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { AccountLoadError, AccountStatusPill, useAccountAuthSummary } from './accountPanelParts';

export default function AccountForcePasswordPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { summary, setSummary, loading, loadError, reload } = useAccountAuthSummary(
    orgId,
    userId,
    'adminUsers.forceFail'
  );
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { loadMembers } = useAdminMembers(orgId, { view: 'directory' });

  const isRequired = summary?.mustChangePassword === true;

  const apply = async (mustChangePassword) => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      await adminUserAPI.forcePasswordChange(orgId, userId, mustChangePassword);
      setSummary((prev) => (prev ? { ...prev, mustChangePassword } : prev));
      toast.success(mustChangePassword ? t('adminUsers.forceEnabled') : t('adminUsers.forceDisabled'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.forceFail') }));
    } finally {
      setBusy(false);
    }
  };

  const actionsDisabled = !userId || busy || loading || Boolean(loadError);

  const body = (
    <>
      <AdminUserFormCard title={t('adminDomains.accounts.forcePassword')} hint={t('adminUsers.forceHint')}>
        {!userId ? (
          <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : loading ? (
          <p className="mb-4 text-sm text-muted-foreground" aria-busy="true">
            {t('common.loading')}
          </p>
        ) : loadError ? (
          <AccountLoadError message={loadError} onRetry={reload} disabled={busy} />
        ) : (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">{t('adminAccounts.colMustChange')}:</span>
            <AccountStatusPill tone={isRequired ? 'warning' : 'muted'}>
              {isRequired ? t('adminAccounts.flagYes') : t('adminAccounts.flagNo')}
            </AccountStatusPill>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={actionsDisabled || isRequired}
            className={adminPrimaryBtnClass()}
            onClick={() => setConfirmOpen(true)}
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
            {busy ? t('common.saving') : t('adminUsers.requireChangeOnLogin')}
          </button>
          <button
            type="button"
            disabled={actionsDisabled || !isRequired}
            className={adminSecondaryBtnClass()}
            onClick={() => apply(false)}
          >
            {busy ? t('common.saving') : t('adminUsers.clearRequireChange')}
          </button>
        </div>
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => apply(true)}
        title={t('adminAccounts.forceConfirmTitle')}
        message={t('adminAccounts.forceConfirmMessage')}
        confirmText={t('adminUsers.requireChangeOnLogin')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.forcePassword')} hint={t('adminUsers.forceHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.forcePickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

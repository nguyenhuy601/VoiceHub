import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  AccountLoadError,
  AccountStatusPill,
  DevLinkNotice,
  unwrapSummary,
  useAccountAuthSummary,
} from './accountPanelParts';

export default function AccountResetPasswordPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { summary, loading, loadError, reload } = useAccountAuthSummary(orgId, userId, 'adminAccounts.loadFail');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [devUrl, setDevUrl] = useState('');

  useEffect(() => {
    setDevUrl('');
  }, [orgId, userId]);

  const sendReset = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    setDevUrl('');
    try {
      const res = await adminUserAPI.triggerPasswordReset(orgId, userId, window.location.origin);
      const data = unwrapSummary(res);
      setDevUrl(typeof data?.resetUrl === 'string' ? data.resetUrl : '');
      toast.success(t('adminUsers.resetSent'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.resetFail') }));
    } finally {
      setBusy(false);
    }
  };

  const targetEmail = summary?.email || '';

  const body = (
    <>
      <AdminUserFormCard title={t('adminUsers.sendResetEmail')} hint={t('adminUsers.resetHint')}>
        {!userId ? (
          <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : loading ? (
          <p className="mb-4 text-sm text-muted-foreground" aria-busy="true">
            {t('common.loading')}
          </p>
        ) : loadError ? (
          <AccountLoadError message={loadError} onRetry={reload} disabled={busy} />
        ) : (
          <div className="mb-4 space-y-1">
            <p className="text-xs text-muted-foreground">{t('adminAccounts.resetTarget')}</p>
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
              <span className="break-all">{targetEmail || '—'}</span>
              {summary?.pendingActivation ? (
                <AccountStatusPill tone="warning">{t('adminAccounts.statusPendingActivation')}</AccountStatusPill>
              ) : summary?.isActive === false ? (
                <AccountStatusPill tone="danger">{t('adminUsers.statusInactive')}</AccountStatusPill>
              ) : (
                <AccountStatusPill tone="success">{t('adminUsers.statusActive')}</AccountStatusPill>
              )}
            </p>
          </div>
        )}
        <button
          type="button"
          disabled={!userId || busy || loading || Boolean(loadError)}
          className={adminPrimaryBtnClass()}
          onClick={() => setConfirmOpen(true)}
        >
          <Mail className="h-3.5 w-3.5" aria-hidden />
          {busy ? t('common.saving') : t('adminUsers.sendResetEmail')}
        </button>
        <DevLinkNotice label={t('adminUsers.devResetUrl')} url={devUrl} />
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={sendReset}
        title={t('adminAccounts.resetConfirmTitle')}
        message={t('adminAccounts.resetConfirmMessage', { email: targetEmail || '—' })}
        confirmText={t('adminUsers.sendResetEmail')}
        cancelText={t('common.cancel')}
      />
    </>
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

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ShieldCheck } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  AccountLoadError,
  SensitiveValueRow,
  unwrapSummary,
  useAccountAuthSummary,
} from './accountPanelParts';

export default function AccountActivatePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { summary, setSummary, loading, loadError, reload } = useAccountAuthSummary(
    orgId,
    userId,
    'adminAccounts.activateFail'
  );
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [issued, setIssued] = useState(null);
  const { loadMembers } = useAdminMembers(orgId, { view: 'directory' });

  useEffect(() => {
    setIssued(null);
    return () => setIssued(null);
  }, [orgId, userId]);

  const pending = Boolean(summary?.pendingActivation);

  const activate = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.activatePending(orgId, userId, { mustChangePassword: true });
      const data = unwrapSummary(res);
      setIssued({
        email: String(data?.email || summary?.email || '').trim(),
        password: String(data?.temporaryPassword || '').trim(),
      });
      const rest = { ...(data || {}) };
      delete rest.temporaryPassword;
      setSummary((prev) => ({
        ...prev,
        ...rest,
        pendingActivation: false,
        isActive: true,
        isEmailVerified: true,
      }));
      toast.success(t('adminAccounts.activateSuccess'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.activateFail') }));
    } finally {
      setBusy(false);
    }
  };

  const body = (
    <>
      <AdminUserFormCard title={t('adminDomains.accounts.activate')} hint={t('adminAccounts.activateHint')}>
        {!userId ? (
          <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : loading ? (
          <p className="mb-4 text-sm text-muted-foreground" aria-busy="true">
            {t('common.loading')}
          </p>
        ) : loadError ? (
          <AccountLoadError message={loadError} onRetry={reload} disabled={busy} />
        ) : (
          <>
            {summary?.pendingActivation === false && summary?.isActive ? (
              <p className="mb-4 text-sm text-muted-foreground">{t('adminAccounts.activateAlreadyActive')}</p>
            ) : null}
            {pending ? (
              <p className="mb-4 text-sm text-warning">{t('adminAccounts.activatePendingBanner')}</p>
            ) : null}
            <button
              type="button"
              disabled={!userId || busy || !pending}
              className={adminPrimaryBtnClass()}
              onClick={() => setConfirmOpen(true)}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              {busy ? t('common.saving') : t('adminAccounts.activateCta')}
            </button>

            {issued?.email && issued?.password ? (
              <div className="mt-4 space-y-3 rounded-xl border border-warning bg-warning-bg p-3">
                <p role="status" className="text-xs font-semibold text-warning">
                  {t('adminAccounts.activateOnceWarning')}
                </p>
                <SensitiveValueRow label={t('oneTimeCredentials.account')} value={issued.email} />
                <SensitiveValueRow label={t('oneTimeCredentials.password')} value={issued.password} secret />
              </div>
            ) : null}
          </>
        )}
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={activate}
        title={t('adminAccounts.activateConfirmTitle')}
        message={t('adminAccounts.activateConfirmMessage')}
        confirmText={t('adminAccounts.activateCta')}
        cancelText={t('common.cancel')}
        variant="danger"
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.activate')} hint={t('adminAccounts.activateHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.activatePickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

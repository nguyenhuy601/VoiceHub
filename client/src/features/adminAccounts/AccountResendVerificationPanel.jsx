import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MailCheck } from 'lucide-react';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
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

export default function AccountResendVerificationPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { summary, setSummary, loading, loadError, reload } = useAccountAuthSummary(
    orgId,
    userId,
    'adminAccounts.verificationFail'
  );
  const [busy, setBusy] = useState(false);
  const [devUrl, setDevUrl] = useState('');

  useEffect(() => {
    setDevUrl('');
  }, [orgId, userId]);

  const send = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.resendVerification(orgId, userId, window.location.origin);
      const data = unwrapSummary(res);
      setDevUrl(typeof data?.verificationUrl === 'string' ? data.verificationUrl : '');
      if (data?.alreadyVerified) {
        setSummary((prev) => (prev ? { ...prev, isEmailVerified: true } : prev));
        toast.success(t('adminAccounts.alreadyVerified'));
      } else {
        toast.success(t('adminAccounts.verificationSent'));
      }
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.verificationFail') }));
    } finally {
      setBusy(false);
    }
  };

  const isVerified = summary?.isEmailVerified === true;

  const body = (
    <AdminUserFormCard
      title={t('adminDomains.accounts.resendVerification')}
      hint={t('adminAccounts.resendVerificationHint')}
    >
      {!userId ? (
        <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
      ) : loading ? (
        <p className="mb-4 text-sm text-muted-foreground" aria-busy="true">
          {t('common.loading')}
        </p>
      ) : loadError ? (
        <AccountLoadError message={loadError} onRetry={reload} disabled={busy} />
      ) : summary ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('adminAccounts.emailVerified')}:</span>
          <AccountStatusPill tone={isVerified ? 'success' : 'warning'}>
            {isVerified ? t('adminAccounts.verifiedYes') : t('adminAccounts.verifiedNo')}
          </AccountStatusPill>
          {summary.email ? <span className="text-sm text-foreground">{summary.email}</span> : null}
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">{t('adminAccounts.summaryUnavailable')}</p>
      )}
      <button
        type="button"
        disabled={!userId || busy || loading || isVerified || Boolean(loadError)}
        className={adminPrimaryBtnClass()}
        onClick={send}
      >
        <MailCheck className="h-3.5 w-3.5" aria-hidden />
        {busy ? t('common.saving') : t('adminAccounts.sendVerification')}
      </button>
      <DevLinkNotice label={t('adminAccounts.devVerifyUrl')} url={devUrl} />
    </AdminUserFormCard>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.accounts.resendVerification')}
      hint={t('adminAccounts.resendVerificationHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.resendPickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

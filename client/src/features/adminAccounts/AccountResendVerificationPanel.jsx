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
import { unwrapApi } from '../../utils/adminUserUtils';

export default function AccountResendVerificationPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!orgId || !userId) {
      setSummary(null);
      setLoadError('');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await adminUserAPI.getAuthSummary(orgId, userId);
        if (!cancelled) setSummary(unwrapApi(res)?.data ?? unwrapApi(res));
      } catch (error) {
        if (!cancelled) {
          setSummary(null);
          setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.verificationFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId, t, reloadTick]);

  const send = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.resendVerification(orgId, userId, window.location.origin);
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      setResult(data);
      if (data?.alreadyVerified) {
        toast.error(t('adminAccounts.alreadyVerified'));
      } else {
        toast.success(t('adminAccounts.verificationSent'));
      }
      setLoadError('');
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
        <p className="mb-4 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="mb-4 space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={busy}
            onClick={() => setReloadTick((n) => n + 1)}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : summary ? (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t('adminAccounts.emailVerified')}:</span>
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${
              isVerified
                ? 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300'
                : 'bg-amber-500/12 text-amber-800 ring-amber-500/25 dark:text-amber-200'
            }`}
          >
            {isVerified ? t('adminAccounts.verifiedYes') : t('adminAccounts.verifiedNo')}
          </span>
        </div>
      ) : (
        <p className="mb-4 text-sm text-muted-foreground">{t('common.loading')}</p>
      )}
      <button
        type="button"
        disabled={!userId || busy || isVerified || Boolean(loadError)}
        className={adminPrimaryBtnClass()}
        onClick={send}
      >
        <MailCheck className="h-3.5 w-3.5" />
        {busy ? t('common.saving') : t('adminAccounts.sendVerification')}
      </button>
      {result?.verificationUrl ? (
        <div className="mt-4 rounded-xl border border-border/70 bg-muted/20 p-3">
          <p className="text-xs font-medium text-muted-foreground">{t('adminAccounts.devVerifyUrl')}</p>
          <p className="mt-1 break-all font-mono text-xs text-foreground">{result.verificationUrl}</p>
        </div>
      ) : null}
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

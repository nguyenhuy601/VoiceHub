import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Copy, ShieldCheck } from 'lucide-react';
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

/**
 * Kích hoạt tài khoản Excel/HR pending (mail fake / không nhận được SMTP).
 * Hiện email + mật khẩu tạm đúng một lần.
 */
export default function AccountActivatePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [issued, setIssued] = useState(null);

  useEffect(() => {
    setIssued(null);
    if (!orgId || !userId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await adminUserAPI.getAuthSummary(orgId, userId);
        if (!cancelled) setSummary(unwrapApi(res)?.data ?? unwrapApi(res));
      } catch {
        if (!cancelled) setSummary(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, userId]);

  const pending = Boolean(summary?.pendingActivation);

  const copy = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t('oneTimeCredentials.copied', { label }));
    } catch {
      toast.error(t('oneTimeCredentials.copyFail'));
    }
  };

  const activate = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      const res = await adminUserAPI.activatePending(orgId, userId, { mustChangePassword: true });
      const data = unwrapApi(res)?.data ?? unwrapApi(res);
      setIssued({
        email: String(data?.email || summary?.email || '').trim(),
        password: String(data?.temporaryPassword || '').trim(),
      });
      setSummary({
        ...summary,
        ...data,
        pendingActivation: false,
        isActive: true,
        isEmailVerified: true,
      });
      toast.success(t('adminAccounts.activateSuccess'));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminAccounts.activateFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.accounts.activate')} hint={t('adminAccounts.activateHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminAccounts.activatePickerHint')} />
        <AdminUserFormCard title={t('adminDomains.accounts.activate')} hint={t('adminAccounts.activateHint')}>
          {!userId ? (
            <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : (
            <>
              {summary?.pendingActivation === false && summary?.isActive ? (
                <p className="mb-4 text-sm text-muted-foreground">{t('adminAccounts.activateAlreadyActive')}</p>
              ) : null}
              {pending ? (
                <p className="mb-4 text-sm text-amber-700 dark:text-amber-200">{t('adminAccounts.activatePendingBanner')}</p>
              ) : null}
              <button
                type="button"
                disabled={!userId || busy || !pending}
                className={adminPrimaryBtnClass()}
                onClick={activate}
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {busy ? t('common.saving') : t('adminAccounts.activateCta')}
              </button>

              {issued?.email && issued?.password ? (
                <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/20 p-3">
                  <p className="text-xs font-semibold text-amber-700 dark:text-amber-200">
                    {t('adminAccounts.activateOnceWarning')}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <code className="break-all font-semibold text-foreground">{issued.email}</code>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-cyan-600 hover:bg-cyan-500/10"
                      onClick={() => copy(issued.email, t('oneTimeCredentials.account'))}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <code className="break-all font-semibold text-foreground">{issued.password}</code>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1.5 text-cyan-600 hover:bg-cyan-500/10"
                      onClick={() => copy(issued.password, t('oneTimeCredentials.password'))}
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

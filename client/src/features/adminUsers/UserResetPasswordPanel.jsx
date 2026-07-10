import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

export default function UserResetPasswordPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const sendReset = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.resetPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.resetPassword')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.resetHint')}</p>
        <GradientButton type="button" className="mt-4" disabled={!userId || busy} onClick={sendReset}>
          {busy ? t('common.saving') : t('adminUsers.sendResetEmail')}
        </GradientButton>
        {result?.resetUrl ? (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            {t('adminUsers.devResetUrl')}: {result.resetUrl}
          </p>
        ) : null}
      </div>
    </div>
  );
}

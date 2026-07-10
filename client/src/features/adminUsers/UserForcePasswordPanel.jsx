import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function UserForcePasswordPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const [busy, setBusy] = useState(false);

  const apply = async (mustChangePassword) => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      await adminUserAPI.forcePasswordChange(orgId, userId, mustChangePassword);
      toast.success(
        mustChangePassword ? t('adminUsers.forceEnabled') : t('adminUsers.forceDisabled')
      );
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.forceFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.forcePickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.forcePassword')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.forceHint')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <GradientButton type="button" disabled={!userId || busy} onClick={() => apply(true)}>
            {t('adminUsers.requireChangeOnLogin')}
          </GradientButton>
          <GradientButton type="button" variant="secondary" disabled={!userId || busy} onClick={() => apply(false)}>
            {t('adminUsers.clearRequireChange')}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

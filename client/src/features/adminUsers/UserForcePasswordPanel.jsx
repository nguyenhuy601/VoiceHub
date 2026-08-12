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
    <AdminUserPanelShell title={t('adminDomains.users.forcePassword')} hint={t('adminUsers.forceHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.forcePickerHint')} />
        <AdminUserFormCard title={t('adminDomains.users.forcePassword')} hint={t('adminUsers.forceHint')}>
          {!userId ? (
            <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!userId || busy}
              className={adminPrimaryBtnClass()}
              onClick={() => apply(true)}
            >
              <KeyRound className="h-3.5 w-3.5" />
              {t('adminUsers.requireChangeOnLogin')}
            </button>
            <button
              type="button"
              disabled={!userId || busy}
              className={adminSecondaryBtnClass()}
              onClick={() => apply(false)}
            >
              {t('adminUsers.clearRequireChange')}
            </button>
          </div>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

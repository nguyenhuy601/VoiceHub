import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function UserDeletePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { isSystemAdmin } = useCompanyAdminAccess();
  const { loadMembers } = useAdminMembers(orgId);
  const [open, setOpen] = useState(false);
  const [deactivate, setDeactivate] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      if (deactivate && isSystemAdmin) {
        await adminUserAPI.setLocked(orgId, userId, true);
      }
      await organizationAPI.removeMember(orgId, userId);
      toast.success(t('adminUsers.removedFromOrg'));
      setOpen(false);
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.removeFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.deletePickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.delete')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.deleteHint')}</p>
        {isSystemAdmin ? (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={deactivate} onChange={(e) => setDeactivate(e.target.checked)} />
            {t('adminUsers.deactivateAccount')}
          </label>
        ) : null}
        <GradientButton
          type="button"
          className="mt-4"
          disabled={!userId}
          onClick={() => setOpen(true)}
        >
          {t('adminUsers.removeMember')}
        </GradientButton>
      </div>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminUsers.removeMember')}
        message={t('adminUsers.removeConfirm')}
        confirmText={t('adminUsers.removeMember')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}

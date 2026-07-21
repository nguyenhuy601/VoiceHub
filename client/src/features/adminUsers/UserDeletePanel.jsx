import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useCompanyAdminContext } from '../../pages/Admin/CompanyAdminLayout';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { clearAdminUserSelection } from '../../utils/adminSelectionParams';

export default function UserDeletePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { refreshStats } = useCompanyAdminContext();
  const { loadMembers, removeMemberLocally } = useAdminMembers(orgId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.removeMember(orgId, userId);
      removeMemberLocally(userId);
      clearAdminUserSelection(searchParams, setSearchParams);
      toast.success(t('adminUsers.removedFromOrg'));
      setOpen(false);
      await loadMembers();
      refreshStats?.();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.removeFail') }));
      await loadMembers();
    } finally {
      setBusy(false);
    }
  };

  const lockHref = userId
    ? `/app/admin/accounts/lock?userId=${encodeURIComponent(userId)}`
    : '/app/admin/accounts/lock';

  return (
    <AdminUserPanelShell title={t('adminDomains.users.delete')} hint={t('adminUsers.deleteHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.deletePickerHint')} />
        <AdminUserFormCard title={t('adminUsers.removeMember')} hint={t('adminUsers.deleteHint')} danger>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('adminUsers.deleteHint')}{' '}
            <Link to={lockHref} className="font-medium text-red-500 hover:underline">
              {t('adminUsers.lockAccountHint')}
            </Link>
          </p>
          <button
            type="button"
            disabled={!userId}
            className={adminDangerBtnClass()}
            onClick={() => setOpen(true)}
          >
            {t('adminUsers.removeMember')}
          </button>
        </AdminUserFormCard>
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
    </AdminUserPanelShell>
  );
}

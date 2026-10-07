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
import { memberUserId } from '../../utils/adminUserUtils';

export default function UserDeletePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { refreshStats } = useCompanyAdminContext();
  // Wave 1: cần systemRole để chặn xóa system admin → admin_table.
  const { members, loadMembers, removeMemberLocally, loading: membersLoading, error: membersError } = useAdminMembers(orgId, { view: 'admin_table' });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const selectedMember = members.find((m) => memberUserId(m) === userId);
  const isSystemAdmin = String(selectedMember?.systemRole || '').trim().toLowerCase() === 'admin';

  const confirm = async () => {
    if (!orgId || !userId || busy) return;
    if (isSystemAdmin) {
      toast.error(t('adminUsers.removeSystemAdminBlocked'));
      return;
    }
    setBusy(true);
    setRemoveError('');
    try {
      await organizationAPI.removeMember(orgId, userId);
      removeMemberLocally(userId);
      clearAdminUserSelection(searchParams, setSearchParams);
      toast.success(t('adminUsers.removedFromOrg'));
      setOpen(false);
      await loadMembers();
      refreshStats?.();
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('adminUsers.removeFail') });
      toast.error(msg);
      setRemoveError(msg);
      await loadMembers();
    } finally {
      setBusy(false);
    }
  };

  const lockHref = userId
    ? `/app/admin/accounts/access?userId=${encodeURIComponent(userId)}&tab=lock`
    : '/app/admin/accounts/access?tab=lock';

  const body = (
    <>
      {userId && membersLoading ? (
        <div className="mb-3 h-10 rounded-xl bg-muted motion-safe:animate-pulse" aria-busy="true" aria-label={t('common.loading')} />
      ) : null}
      {userId && membersError ? (
        <div className="space-y-3 rounded-xl border border-destructive bg-error-bg p-4" role="alert">
          <p className="text-sm text-destructive">{resolveApiErrorMessage(membersError, { t, fallback: t('adminUsers.removeFail') })}</p>
          <button
            type="button"
            className={adminDangerBtnClass()}
            disabled={busy}
            onClick={() => loadMembers()}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : (
        <AdminUserFormCard title={t('adminUsers.removeMember')} hint={t('adminUsers.deleteHint')} danger>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('adminUsers.deleteHint')}{' '}
            <Link
              to={lockHref}
              className="rounded font-medium text-destructive transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {t('adminUsers.lockAccountHint')}
            </Link>
          </p>
          {removeError ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {removeError}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!userId || isSystemAdmin || membersLoading}
            className={adminDangerBtnClass()}
            onClick={() => setOpen(true)}
          >
            {t('adminUsers.removeMember')}
          </button>
          {isSystemAdmin ? (
            <p className="mt-2 text-xs text-muted-foreground">{t('adminUsers.removeSystemAdminBlocked')}</p>
          ) : null}
        </AdminUserFormCard>
      )}
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        variant="danger"
        title={t('adminUsers.removeMember')}
        message={t('adminUsers.removeConfirm')}
        confirmText={t('adminUsers.removeMember')}
        cancelText={t('common.cancel')}
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.users.delete')} hint={t('adminUsers.deleteHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.deletePickerHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

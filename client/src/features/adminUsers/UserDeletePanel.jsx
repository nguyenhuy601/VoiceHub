import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
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
    <AdminUserPanelShell title={t('adminDomains.users.delete')} hint={t('adminUsers.deleteHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.deletePickerHint')} />
        <AdminUserFormCard title={t('adminUsers.removeMember')} hint={t('adminUsers.deleteHint')} danger>
          {isSystemAdmin ? (
            <label className="mb-4 flex items-start gap-2.5 text-sm text-foreground">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-border"
                checked={deactivate}
                onChange={(e) => setDeactivate(e.target.checked)}
              />
              <span>{t('adminUsers.deactivateAccount')}</span>
            </label>
          ) : null}
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

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

export default function UserAssignOrgPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { roles, loadMembers } = useAdminMembers(orgId);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [membershipRole, setMembershipRole] = useState('member');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!roles.length) return;
    setSelectedRoleId(String(roles[0]?._id || roles[0]?.id || ''));
  }, [roles]);

  const assign = async () => {
    if (!orgId || !userId || busy) return;
    setBusy(true);
    try {
      if (selectedRoleId) {
        await roleAPI.assignRoleToUser(selectedRoleId, userId, orgId);
      }
      await organizationAPI.updateMemberRole(orgId, userId, membershipRole);
      toast.success(t('adminUsers.assignSaved'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.assignFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.assignOrg')} hint={t('adminUsers.assignHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.assignPickerHint')} />
        <AdminUserFormCard title={t('adminUsers.assignRole')} hint={t('adminUsers.assignHint')}>
          {!userId ? (
            <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : null}
          <div className="space-y-4">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminUsers.rbacRole')}</span>
              <select
                className={adminInputClass()}
                value={selectedRoleId}
                onChange={(e) => setSelectedRoleId(e.target.value)}
              >
                {roles.map((role) => {
                  const id = String(role._id || role.id);
                  return (
                    <option key={id} value={id}>
                      {role.name || id}
                    </option>
                  );
                })}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminUsers.membershipRole')}</span>
              <select
                className={adminInputClass()}
                value={membershipRole}
                onChange={(e) => setMembershipRole(e.target.value)}
              >
                <option value="member">member</option>
                <option value="hr">hr</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <button type="button" disabled={!userId || busy} className={adminPrimaryBtnClass()} onClick={assign}>
              {busy ? t('common.saving') : t('adminUsers.saveAssignment')}
            </button>
          </div>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

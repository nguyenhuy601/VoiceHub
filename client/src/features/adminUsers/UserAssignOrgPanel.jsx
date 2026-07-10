import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapApi } from '../../utils/adminUserUtils';

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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminUsers.assignPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.users.assignOrg')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminUsers.assignHint')}</p>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{t('adminUsers.rbacRole')}</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
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
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">{t('adminUsers.membershipRole')}</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={membershipRole}
              onChange={(e) => setMembershipRole(e.target.value)}
            >
              <option value="member">member</option>
              <option value="hr">hr</option>
              <option value="admin">admin</option>
            </select>
          </label>
          <GradientButton type="button" disabled={!userId || busy} onClick={assign}>
            {busy ? t('common.saving') : t('adminUsers.saveAssignment')}
          </GradientButton>
        </div>
      </div>
    </div>
  );
}

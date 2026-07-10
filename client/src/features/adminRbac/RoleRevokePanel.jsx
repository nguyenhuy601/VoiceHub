import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { normalizeRoleDisplayName, normalizeRoleId, unwrapList } from '../../utils/adminRbacUtils';

export default function RoleRevokePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { rolesById } = useAdminRoles(orgId);
  const [assigned, setAssigned] = useState([]);
  const [busyId, setBusyId] = useState('');

  const loadAssigned = async () => {
    if (!orgId || !userId) {
      setAssigned([]);
      return;
    }
    try {
      const res = await roleAPI.getUserRoles(userId, orgId);
      setAssigned(unwrapList(res));
    } catch {
      setAssigned([]);
    }
  };

  useEffect(() => {
    loadAssigned();
  }, [orgId, userId]);

  const revoke = async (roleId) => {
    if (!orgId || !userId || !roleId || busyId) return;
    setBusyId(roleId);
    try {
      await roleAPI.removeRoleFromUser(roleId, userId, orgId);
      toast.success(t('adminRbac.revoked'));
      await loadAssigned();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.revokeFail') }));
    } finally {
      setBusyId('');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminRbac.revokePickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.revoke')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.revokeHint')}</p>
        {!userId ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
        ) : !assigned.length ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminRbac.noAssignedRoles')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {assigned.map((row) => {
              const rid = String(row?.roleId || row?._id || row?.id || row?.role?._id || '').trim();
              const role = rolesById.get(rid) || row?.role || { name: rid };
              return (
                <li
                  key={rid}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm"
                >
                  <span>{normalizeRoleDisplayName(role?.name || rid)}</span>
                  <GradientButton
                    type="button"
                    variant="secondary"
                    disabled={busyId === rid}
                    onClick={() => revoke(rid)}
                  >
                    {t('adminRbac.revokeAction')}
                  </GradientButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

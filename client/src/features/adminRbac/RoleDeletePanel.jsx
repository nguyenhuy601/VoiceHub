import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { clearAdminRoleSelection } from '../../utils/adminSelectionParams';
import {
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
} from '../../utils/adminRbacUtils';

export default function RoleDeletePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles, removeRoleLocally } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    if (!orgId || !roleId || !role || busy || isProtectedDefaultRole(role)) return;
    setBusy(true);
    try {
      await roleAPI.deleteRole(roleId, orgId);
      removeRoleLocally(roleId);
      clearAdminRoleSelection(searchParams, setSearchParams);
      toast.success(t('adminRbac.deleted'));
      setOpen(false);
      await loadRoles();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.deleteFail') }));
      await loadRoles();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminRolePicker orgId={orgId} selectedRoleId={roleId} hint={t('adminRbac.deletePickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.delete')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.deleteHint')}</p>
        {role && isProtectedDefaultRole(role) ? (
          <p className="mt-4 text-sm text-amber-400">{t('adminRbac.protectedRole')}</p>
        ) : null}
        <GradientButton
          type="button"
          className="mt-4"
          disabled={!roleId || !role || isProtectedDefaultRole(role)}
          onClick={() => setOpen(true)}
        >
          {t('adminDomains.rbac.delete')}
        </GradientButton>
      </div>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminDomains.rbac.delete')}
        message={t('adminRbac.deleteConfirm', { name: role ? normalizeRoleDisplayName(role.name) : '' })}
        confirmText={t('adminDomains.rbac.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
}

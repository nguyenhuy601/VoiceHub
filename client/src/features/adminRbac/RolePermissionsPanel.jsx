import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import PermissionEditorGrid from '../../components/adminRbac/PermissionEditorGrid';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  normalizeRoleDisplayName,
  permissionEntriesFromState,
  permissionStateFromEntries,
} from '../../utils/adminRbacUtils';

export default function RolePermissionsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);
  const [permDraft, setPermDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!role) {
      setPermDraft({});
      return;
    }
    setPermDraft(permissionStateFromEntries(role.permissions));
  }, [role]);

  const setMany = (keys, value) => {
    setPermDraft((prev) => {
      const next = { ...prev };
      for (const key of keys) {
        if (value) next[key] = true;
        else delete next[key];
      }
      return next;
    });
  };

  const save = async () => {
    if (!orgId || !roleId || !role || busy) return;
    setBusy(true);
    try {
      await roleAPI.updateRole(roleId, {
        permissions: permissionEntriesFromState(permDraft),
        serverId: orgId,
        organizationId: orgId,
      });
      toast.success(t('adminRbac.permissionsSaved'));
      await loadRoles();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.permissionsSaveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <AdminRolePicker orgId={orgId} selectedRoleId={roleId} hint={t('adminRbac.permissionsPickerHint')} />
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t('adminDomains.rbac.permissions')}</h2>
            <p className="text-sm text-muted-foreground">{t('adminRbac.permissionsHint')}</p>
          </div>
          {role ? (
            <GradientButton type="button" disabled={busy} onClick={save}>
              {busy ? t('common.saving') : t('common.save')}
            </GradientButton>
          ) : null}
        </div>
        {!roleId || !role ? (
          <p className="rounded-xl border border-border bg-card/40 p-4 text-sm text-muted-foreground">
            {t('adminRbac.selectRoleFirst')}
          </p>
        ) : (
          <PermissionEditorGrid
            permDraft={permDraft}
            editable
            roleName={normalizeRoleDisplayName(role.name)}
            roleScope={role.scope || 'ORGANIZATION'}
            onToggle={(key) =>
              setPermDraft((prev) => {
                const next = { ...prev };
                if (next[key]) delete next[key];
                else next[key] = true;
                return next;
              })
            }
            onSetMany={setMany}
          />
        )}
      </div>
    </div>
  );
}

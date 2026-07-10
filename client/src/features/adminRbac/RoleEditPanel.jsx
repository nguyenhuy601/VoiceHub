import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import { GradientButton } from '../../components/Shared';
import { DEFAULT_ROLE_SCOPE, ROLE_SCOPES } from '../../config/adminRbacCatalog';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
} from '../../utils/adminRbacUtils';

export default function RoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState(DEFAULT_ROLE_SCOPE);
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!role) return;
    setName(normalizeRoleDisplayName(role.name));
    setDescription(role.description || '');
    setScope(String(role.scope || DEFAULT_ROLE_SCOPE).toUpperCase());
    setColor(role.color || '#6366f1');
    setPriority(String(role.priority ?? ''));
  }, [role]);

  const save = async () => {
    if (!orgId || !roleId || !role || busy) return;
    if (isProtectedDefaultRole(role)) {
      toast.error(t('adminRbac.protectedRole'));
      return;
    }
    setBusy(true);
    try {
      await roleAPI.updateRole(roleId, {
        name: name.trim(),
        description: description.trim(),
        scope,
        color,
        priority: Number(priority) || role.priority,
        serverId: orgId,
        organizationId: orgId,
      });
      toast.success(t('adminRbac.saved'));
      await loadRoles();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminRolePicker orgId={orgId} selectedRoleId={roleId} hint={t('adminRbac.editPickerHint')} />
      <div className="rounded-xl border border-border bg-card/40 p-4">
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.edit')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.editHint')}</p>
        {!roleId || !role ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('adminRbac.selectRoleFirst')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={name}
              disabled={isProtectedDefaultRole(role)}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('adminRbac.roleNamePlaceholder')}
            />
            <textarea
              rows={3}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('adminRbac.roleDescriptionPlaceholder')}
            />
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {ROLE_SCOPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="color"
                className="h-10 w-full rounded-lg border border-border bg-background"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <input
                type="number"
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                placeholder={t('adminRbac.priority')}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
            <GradientButton type="button" disabled={busy || isProtectedDefaultRole(role)} onClick={save}>
              {busy ? t('common.saving') : t('common.save')}
            </GradientButton>
          </div>
        )}
      </div>
    </div>
  );
}

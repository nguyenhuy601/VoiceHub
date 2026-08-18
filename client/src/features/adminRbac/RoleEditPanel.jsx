import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import { GradientButton } from '../../components/Shared';
import { DEFAULT_ROLE_SCOPE, PACK_ROLE_SCOPES } from '../../config/adminRbacCatalog';
import { adminSecondaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isProtectedDefaultRole, normalizeRoleDisplayName } from '../../utils/adminRbacUtils';
import {
  SYSTEM_ROLE_NAME_PREFIX,
  isTitleLikeSystemRoleName,
  normalizeLayerLabel,
  splitLayerLabel,
} from '../../utils/roleLayerNaming';

export default function RoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);
  const protectedRole = role ? isProtectedDefaultRole(role) : false;
  const [suffix, setSuffix] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!role) return;
    const display = normalizeRoleDisplayName(role.name);
    setSuffix(splitLayerLabel(display, 'system').suffix || display);
    setDescription(role.description || '');
    setColor(role.color || '#6366f1');
    setPriority(String(role.priority ?? ''));
  }, [role]);

  const save = async () => {
    if (!orgId || !roleId || !role || busy) return;
    if (!protectedRole) {
      if (!suffix.trim()) return;
      if (isTitleLikeSystemRoleName(suffix)) {
        toast.error(t('adminRbac.roleNameTitleLikeError'));
        return;
      }
    }
    setBusy(true);
    try {
      await roleAPI.updateRole(roleId, {
        name: protectedRole ? role.name : normalizeLayerLabel(suffix, 'system'),
        description: description.trim(),
        scope: DEFAULT_ROLE_SCOPE,
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

  const permissionsHref = roleId
    ? `/app/admin/rbac/permissions?roleId=${encodeURIComponent(roleId)}`
    : '/app/admin/rbac/permissions';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
      <AdminRolePicker orgId={orgId} selectedRoleId={roleId} hint={t('adminRbac.editPickerHint')} />
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold">{t('adminDomains.rbac.edit')}</h2>
            <p className="text-sm text-muted-foreground">{t('adminRbac.editHint')}</p>
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
          <>
            {protectedRole ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                {t('adminRbac.protectedRoleEditNote')}
              </p>
            ) : null}
            <div className="grid gap-3 rounded-xl border border-border bg-card/40 p-4 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleName')}</span>
                {protectedRole ? (
                  <input
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={normalizeRoleDisplayName(role.name)}
                    disabled
                  />
                ) : (
                  <div className="flex overflow-hidden rounded-lg border border-border bg-background">
                    <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                      {SYSTEM_ROLE_NAME_PREFIX.trimEnd()}
                    </span>
                    <input
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                      value={suffix}
                      onChange={(e) => setSuffix(e.target.value)}
                      placeholder={t('adminRbac.roleNamePlaceholder')}
                    />
                  </div>
                )}
                {!protectedRole && suffix.trim() && isTitleLikeSystemRoleName(suffix) ? (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminRbac.roleNameTitleLikeError')}</p>
                ) : null}
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleDescription')}</span>
                <textarea
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('adminRbac.roleDescriptionPlaceholder')}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleScope')}</span>
                <select
                  className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                  value={DEFAULT_ROLE_SCOPE}
                  disabled
                >
                  {PACK_ROLE_SCOPES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {t(item.labelKey)}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-muted-foreground">{t('adminRbac.packScopeLockedNote')}</p>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{t('adminRbac.color')}</span>
                  <input
                    type="color"
                    className="h-10 w-full rounded-lg border border-border bg-background"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-muted-foreground">{t('adminRbac.colPriority')}</span>
                  <input
                    type="number"
                    className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  />
                </label>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card/40 p-4">
              <p className="text-sm text-muted-foreground">{t('adminRbac.editPermissionsV2Hint')}</p>
              <Link to={permissionsHref} className={`${adminSecondaryBtnClass()} mt-3 inline-flex`}>
                {t('adminRbac.editPermissionsV2Cta')}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

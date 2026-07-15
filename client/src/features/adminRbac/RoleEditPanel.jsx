import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminRolePicker from '../../components/adminRbac/AdminRolePicker';
import PermissionEditorGrid from '../../components/adminRbac/PermissionEditorGrid';
import { GradientButton } from '../../components/Shared';
import { DEFAULT_ROLE_SCOPE, ROLE_SCOPES } from '../../config/adminRbacCatalog';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  isProtectedDefaultRole,
  normalizeRoleDisplayName,
  permissionDraftForEditor,
  permissionEntriesForPersist,
} from '../../utils/adminRbacUtils';

export default function RoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const roleId = String(searchParams.get('roleId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const role = rolesById.get(roleId);
  const protectedRole = role ? isProtectedDefaultRole(role) : false;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState(DEFAULT_ROLE_SCOPE);
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState('');
  const [permDraft, setPermDraft] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!role) {
      setPermDraft({});
      return;
    }
    setName(normalizeRoleDisplayName(role.name));
    setDescription(role.description || '');
    setScope(String(role.scope || DEFAULT_ROLE_SCOPE).toUpperCase());
    setColor(role.color || '#6366f1');
    setPriority(String(role.priority ?? ''));
    setPermDraft(permissionDraftForEditor(role.permissions));
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
        // Vai trò hệ thống giữ nguyên tên; vẫn cho sửa quyền / mô tả / scope / priority.
        name: protectedRole ? role.name : name.trim(),
        description: description.trim(),
        scope,
        color,
        priority: Number(priority) || role.priority,
        permissions: permissionEntriesForPersist(permDraft),
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
                <input
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  value={name}
                  disabled={protectedRole}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('adminRbac.roleNamePlaceholder')}
                />
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
                  <span className="mb-1 block text-muted-foreground">{t('adminRbac.priority')}</span>
                  <input
                    type="number"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder={t('adminRbac.priority')}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-foreground">{t('adminRbac.assignPermissions')}</p>
              <PermissionEditorGrid
                permDraft={permDraft}
                editable
                roleName={normalizeRoleDisplayName(role.name)}
                roleScope={scope}
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}

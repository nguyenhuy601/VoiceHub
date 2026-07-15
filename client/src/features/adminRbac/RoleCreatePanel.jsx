import { useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import PermissionEditorGrid from '../../components/adminRbac/PermissionEditorGrid';
import { DEFAULT_ROLE_SCOPE, ROLE_SCOPES } from '../../config/adminRbacCatalog';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  permissionEntriesForPersist,
  priorityFromTier,
  TIER_EXEC,
} from '../../utils/adminRbacUtils';

export default function RoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { loadRoles } = useAdminRoles(orgId);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [scope, setScope] = useState(DEFAULT_ROLE_SCOPE);
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState(String(priorityFromTier(TIER_EXEC)));
  const [permDraft, setPermDraft] = useState({});

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!orgId || !trimmed || saving) return;
    setSaving(true);
    try {
      await roleAPI.createRole({
        name: trimmed,
        description: description.trim(),
        scope,
        serverId: orgId,
        organizationId: orgId,
        permissions: permissionEntriesForPersist(permDraft),
        priority: Number(priority) || priorityFromTier(TIER_EXEC),
        color: color || undefined,
        isDefault: false,
      });
      toast.success(t('adminRbac.created'));
      setName('');
      setDescription('');
      setScope(DEFAULT_ROLE_SCOPE);
      setPermDraft({});
      await loadRoles();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.create')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminRbac.createHint')}</p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 rounded-xl border border-border bg-card/40 p-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleName')}</span>
            <input
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder={t('adminRbac.roleNamePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleDescription')}</span>
            <textarea
              rows={2}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
              placeholder={t('adminRbac.roleDescriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            roleName={name}
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

        <GradientButton type="submit" disabled={saving}>
          {saving ? t('common.saving') : t('adminDomains.rbac.create')}
        </GradientButton>
      </form>
    </div>
  );
}

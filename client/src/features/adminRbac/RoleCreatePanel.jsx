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
import {
  SYSTEM_ROLE_NAME_PREFIX,
  isTitleLikeSystemRoleName,
  normalizeLayerLabel,
} from '../../utils/roleLayerNaming';

export default function RoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { loadRoles } = useAdminRoles(orgId);
  const [saving, setSaving] = useState(false);
  const [suffix, setSuffix] = useState('');
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
    const trimmedSuffix = suffix.trim();
    if (!orgId || !trimmedSuffix || saving) return;
    if (isTitleLikeSystemRoleName(trimmedSuffix)) {
      toast.error(t('adminRbac.roleNameTitleLikeError'));
      return;
    }
    const name = normalizeLayerLabel(trimmedSuffix, 'system');
    setSaving(true);
    try {
      await roleAPI.createRole({
        name,
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
      setSuffix('');
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
      <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
        <p className="font-medium text-foreground">{t('adminRbac.listBanner')}</p>
        <p className="text-muted-foreground">{t('adminRbac.createNamingHint')}</p>
      </div>
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 rounded-xl border border-border bg-card/40 p-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleName')}</span>
            <div className="flex overflow-hidden rounded-lg border border-border bg-background">
              <span className="shrink-0 border-r border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {SYSTEM_ROLE_NAME_PREFIX.trimEnd()}
              </span>
              <input
                required
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                placeholder={t('adminRbac.roleNamePlaceholder')}
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
              />
            </div>
            {suffix.trim() && isTitleLikeSystemRoleName(suffix) ? (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('adminRbac.roleNameTitleLikeError')}</p>
            ) : null}
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

        <div>
          <p className="mb-2 text-sm font-medium text-foreground">{t('adminRbac.assignPermissions')}</p>
          <PermissionEditorGrid
            permDraft={permDraft}
            editable
            roleName={normalizeLayerLabel(suffix, 'system') || suffix}
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

        <GradientButton type="submit" disabled={saving || !suffix.trim()}>
          {saving ? t('common.saving') : t('adminDomains.rbac.create')}
        </GradientButton>
      </form>
    </div>
  );
}

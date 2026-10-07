import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useRbacCatalog } from '../../hooks/useRoleMasterGrantsMap';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { priorityFromTier, TIER_EXEC } from '../../utils/adminRbacUtils';
import { isOrgCloneableTemplate } from '../../utils/rbacV2Ui';

const CUSTOM_NAME_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 500;
const PRIORITY_MIN = 0;
const PRIORITY_MAX = 1000;
const FIELD_CLASS =
  'w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none transition-colors duration-150 focus:ring-2 focus:ring-ring motion-reduce:transition-none';

export default function RoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { loadRoles } = useAdminRoles(orgId);
  const [saving, setSaving] = useState(false);
  const catalogQuery = useRbacCatalog();
  const catalog = catalogQuery.data ?? null;
  const catalogLoading = catalogQuery.isPending;
  const loadError = catalogQuery.isError
    ? resolveApiErrorMessage(catalogQuery.error, { t, fallback: t('adminRbac.createCatalogLoadFail') })
    : '';
  const [templateKey, setTemplateKey] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [otherName, setOtherName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState(String(priorityFromTier(TIER_EXEC)));

  useEffect(() => {
    if (!catalog) return;
    const orgTemplates = (catalog?.templates || []).filter((tpl) => isOrgCloneableTemplate(tpl, catalog));
    const first = orgTemplates[0]?.key || '';
    setTemplateKey((prev) =>
      prev && orgTemplates.some((tpl) => tpl.key === prev) ? prev : first
    );
  }, [catalog]);

  const templates = (catalog?.templates || []).filter((tpl) => isOrgCloneableTemplate(tpl, catalog));
  const specializations = catalog?.specializations || [];
  const selectedTemplate = useMemo(
    () => templates.find((x) => x.key === templateKey) || null,
    [templates, templateKey]
  );
  const isOther = String(specialization).toLowerCase() === 'other';

  const previewName = useMemo(() => {
    if (isOther) return otherName.trim() || '…';
    const label = selectedTemplate?.label || templateKey;
    if (!specialization) return label;
    return `${specialization} ${label}`.trim();
  }, [isOther, otherName, selectedTemplate, specialization, templateKey]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!orgId || !templateKey || saving) return;
    if (isOther && !otherName.trim()) {
      toast.error(t('adminRbac.createOtherNameRequired'));
      return;
    }
    const priorityNum = Number(priority);
    setSaving(true);
    try {
      await roleAPI.clonePermissionGroup({
        organizationId: orgId,
        serverId: orgId,
        templateKey,
        specialization,
        allowOtherName: isOther,
        otherName: isOther ? otherName.trim() : '',
        createRole: true,
        description: description.trim(),
        color: color || undefined,
        priority: Number.isFinite(priorityNum)
          ? Math.min(PRIORITY_MAX, Math.max(PRIORITY_MIN, priorityNum))
          : priorityFromTier(TIER_EXEC),
      });
      toast.success(t('adminRbac.created'));
      setSpecialization('');
      setOtherName('');
      setDescription('');
      await loadRoles();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.createFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.create')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminRbac.createHint')}</p>
      </div>

      <div className="space-y-2 rounded-xl border border-warning bg-warning-bg px-3 py-3 text-sm">
        <p className="font-medium text-foreground">{t('adminRbac.createNamingRule')}</p>
        <p className="text-muted-foreground">{t('adminRbac.createCatalogFixed')}</p>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-destructive px-3 py-2 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {catalogLoading ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t('adminRbac.createCatalogLoading')}
        </p>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit} aria-busy={catalogLoading || undefined}>
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createTemplate')}</span>
            <select
              required
              className={FIELD_CLASS}
              value={templateKey}
              disabled={catalogLoading}
              onChange={(e) => setTemplateKey(e.target.value)}
            >
              {templates.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {tpl.label || tpl.key}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createSpecialization')}</span>
            <select
              className={FIELD_CLASS}
              value={specialization}
              disabled={catalogLoading}
              onChange={(e) => setSpecialization(e.target.value)}
            >
              {specializations.map((s) => (
                <option key={s.key || s.label} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {isOther ? (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createOtherName')}</span>
              <input
                required
                className={FIELD_CLASS}
                value={otherName}
                maxLength={CUSTOM_NAME_MAX_LENGTH}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder={t('adminRbac.createOtherNamePlaceholder')}
              />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createPreviewName')}</span>
              <input readOnly className={`${FIELD_CLASS} bg-muted`} value={previewName} />
            </label>
          )}

          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleDescription')}</span>
            <textarea
              rows={2}
              className={`${FIELD_CLASS} resize-y`}
              value={description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createPriority')}</span>
            <input
              type="number"
              min={PRIORITY_MIN}
              max={PRIORITY_MAX}
              className={FIELD_CLASS}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.createColor')}</span>
            <input
              type="color"
              className="h-10 w-full rounded-lg border border-border bg-background px-2 focus:outline-none focus:ring-2 focus:ring-ring"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>

        <GradientButton type="submit" disabled={saving || !templateKey || !orgId}>
          {saving ? t('common.saving') : t('adminRbac.createSubmit')}
        </GradientButton>
      </form>
    </div>
  );
}

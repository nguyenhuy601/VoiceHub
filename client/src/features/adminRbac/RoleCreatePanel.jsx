import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { priorityFromTier, TIER_EXEC } from '../../utils/adminRbacUtils';
import { unwrapRoleApi } from '../../utils/adminRbacUtils';

export default function RoleCreatePanel({ orgId }) {
  const { t } = useAppStrings();
  const { loadRoles } = useAdminRoles(orgId);
  const [saving, setSaving] = useState(false);
  const [catalog, setCatalog] = useState(null);
  const [templateKey, setTemplateKey] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [otherName, setOtherName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#6366f1');
  const [priority, setPriority] = useState(String(priorityFromTier(TIER_EXEC)));
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await roleAPI.getRbacCatalog();
        const data = unwrapRoleApi(res) || res?.data?.data || res?.data;
        if (cancelled) return;
        setCatalog(data);
        const first = data?.templates?.[0]?.key || '';
        setTemplateKey((prev) => prev || first);
      } catch (error) {
        if (!cancelled) {
          setLoadError(resolveApiErrorMessage(error, { t, fallback: 'Không tải được catalog RBAC V2' }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const templates = catalog?.templates || [];
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
      toast.error('Nhập tên custom khi chọn Other');
      return;
    }
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
        priority: Number(priority) || priorityFromTier(TIER_EXEC),
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
        <p className="text-sm text-muted-foreground">
          RBAC V2: chỉ clone Permission Group từ template hệ thống (không tạo blank).
        </p>
      </div>

      <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-3 text-sm">
        <p className="font-medium text-foreground">Quy ước tên: &lt;Specialization&gt; + &lt;Template&gt;</p>
        <p className="text-muted-foreground">
          Category / Module / Master Permission là catalog cố định — doanh nghiệp không được tạo mới.
        </p>
      </div>

      {loadError ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-4 rounded-xl border border-border bg-card/40 p-4 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">Template</span>
            <select
              required
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={templateKey}
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
            <span className="mb-1 block font-medium text-foreground">Specialization</span>
            <select
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={specialization}
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
              <span className="mb-1 block font-medium text-foreground">Tên custom (Other)</span>
              <input
                required
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                value={otherName}
                onChange={(e) => setOtherName(e.target.value)}
                placeholder="VD: Platform Guild Lead"
              />
            </label>
          ) : (
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-foreground">Tên sẽ tạo</span>
              <input
                readOnly
                className="w-full rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                value={previewName}
              />
            </label>
          )}

          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block font-medium text-foreground">{t('adminRbac.roleDescription')}</span>
            <textarea
              rows={2}
              className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Priority</span>
            <input
              type="number"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="mb-1 block font-medium text-foreground">Color</span>
            <input
              type="color"
              className="h-10 w-full rounded-lg border border-border bg-background px-2"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>

        <GradientButton type="submit" disabled={saving || !templateKey || !orgId}>
          {saving ? t('common.saving') : 'Clone template → Permission Group + Role'}
        </GradientButton>
      </form>
    </div>
  );
}

/** Huy: Cấu hình Organizational Levels + áp template IT */
import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapOrgApi } from '../../utils/adminOrgStructureUtils';

export default function OrgLevelsPanel({ orgId }) {
  const { t } = useAppStrings();
  const [levels, setLevels] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [lvlRes, tplRes] = await Promise.all([
        organizationAPI.getStructureLevels(orgId),
        organizationAPI.listStructureTemplates(orgId),
      ]);
      const schema = unwrapOrgApi(lvlRes);
      const tplData = unwrapOrgApi(tplRes);
      setLevels(Array.isArray(schema?.levels) ? schema.levels : []);
      setTemplateId(schema?.templateId || '');
      setTemplates(Array.isArray(tplData?.templates) ? tplData.templates : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    load();
  }, [load]);

  const saveLevels = async () => {
    if (!orgId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.putStructureLevels(orgId, { levels, templateId: templateId || 'custom' });
      toast.success(t('adminOrg.saved'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = async () => {
    if (!orgId || !templateId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.applyStructureTemplate(orgId, { templateId, mode: 'merge' });
      toast.success(t('adminOrg.templateApplied'));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.templateFail') }));
    } finally {
      setSaving(false);
    }
  };

  const backfill = async () => {
    if (!orgId || saving) return;
    setSaving(true);
    try {
      const res = await organizationAPI.backfillStructureOu(orgId);
      const data = unwrapOrgApi(res);
      toast.success(t('adminOrg.backfillDone', { n: data?.created ?? 0 }));
      await load();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.backfillFail') }));
    } finally {
      setSaving(false);
    }
  };

  const updateLevel = (idx, patch) => {
    setLevels((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const addLevel = () => {
    const order = levels.length + 1;
    setLevels((prev) => [
      ...prev,
      { key: `level_${order}`, label: `Level ${order}`, order, enabled: true, allowsChildren: true },
    ]);
  };

  const removeLevel = (idx) => {
    setLevels((prev) => prev.filter((_, i) => i !== idx).map((l, i) => ({ ...l, order: i + 1 })));
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.levels')}
      hint={t('adminOrg.levelsHint')}
      wide
      actions={
        <>
          <button type="button" className={adminSecondaryBtnClass()} onClick={backfill} disabled={saving}>
            {t('adminOrg.backfill')}
          </button>
          <button type="button" className={adminPrimaryBtnClass()} onClick={saveLevels} disabled={saving || loading}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <AdminUserFormCard title={t('adminOrg.templatesTitle')} hint={t('adminOrg.templatesHint')}>
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.template')}</span>
            <select
              className={adminInputClass()}
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">{t('adminOrg.selectTemplate')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-xs text-muted-foreground">
            {templates.find((x) => x.id === templateId)?.description || ''}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass('mt-4')}
            disabled={!templateId || saving}
            onClick={applyTemplate}
          >
            {t('adminOrg.applyTemplate')}
          </button>
        </AdminUserFormCard>

        <AdminUserFormCard title={t('adminOrg.levelsTitle')}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <div className="space-y-3">
              {levels.map((level, idx) => (
                <div
                  key={`${level.key}-${idx}`}
                  className="grid gap-2 rounded-xl border border-border/70 p-3 sm:grid-cols-[1fr_1fr_auto_auto]"
                >
                  <input
                    className={adminInputClass()}
                    value={level.key}
                    onChange={(e) => updateLevel(idx, { key: e.target.value })}
                    placeholder="key"
                  />
                  <input
                    className={adminInputClass()}
                    value={level.label}
                    onChange={(e) => updateLevel(idx, { label: e.target.value })}
                    placeholder="label"
                  />
                  <label className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={level.enabled !== false}
                      onChange={(e) => updateLevel(idx, { enabled: e.target.checked })}
                    />
                    {t('adminOrg.active')}
                  </label>
                  <button type="button" className={adminDangerBtnClass('!px-3 !py-1.5 text-xs')} onClick={() => removeLevel(idx)}>
                    {t('common.delete')}
                  </button>
                </div>
              ))}
              <button type="button" className={adminSecondaryBtnClass()} onClick={addLevel}>
                {t('adminOrg.addLevel')}
              </button>
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

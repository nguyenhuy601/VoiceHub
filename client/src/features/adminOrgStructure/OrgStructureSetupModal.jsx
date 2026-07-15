/** Huy: Modal setup cơ cấu tổ chức một lần — chọn template rồi Confirm ghi DB. */
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapOrgApi } from '../../utils/adminOrgStructureUtils';

export default function OrgStructureSetupModal({ orgId, open, onCompleted }) {
  const { t } = useAppStrings();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await organizationAPI.listStructureTemplates(orgId);
        const data = unwrapOrgApi(res);
        if (!cancelled) {
          setTemplates(Array.isArray(data?.templates) ? data.templates : []);
        }
      } catch (error) {
        if (!cancelled) {
          toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, t]);

  const selected = templates.find((x) => x.id === templateId);

  const confirmSetup = async () => {
    if (!orgId || !selected?.levels?.length || saving) return;
    setSaving(true);
    try {
      const levels = selected.levels.map((l, i) => ({
        key: String(l.key || '').trim(),
        label: String(l.label || l.key || '').trim(),
        order: Number(l.order) || i + 1,
        enabled: l.enabled !== false,
        allowsChildren: l.allowsChildren !== false,
      }));
      await organizationAPI.putStructureLevels(orgId, {
        levels,
        templateId: selected.id,
      });
      toast.success(t('adminOrg.setupDone'));
      onCompleted?.({ levels, templateId: selected.id });
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.setupFail') }));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-structure-setup-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl">
        <h2 id="org-structure-setup-title" className="text-lg font-semibold text-foreground">
          {t('adminOrg.setupTitle')}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('adminOrg.setupHint')}</p>

        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.template')}</span>
              <select
                className={adminInputClass()}
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                disabled={saving}
              >
                <option value="">{t('adminOrg.selectTemplate')}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </label>
            {selected ? (
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 text-sm">
                <p className="text-muted-foreground">{selected.description}</p>
                <ul className="mt-2 list-inside list-disc text-foreground">
                  {(selected.levels || []).map((l) => (
                    <li key={l.key}>
                      {l.label || l.key}
                      <span className="text-muted-foreground"> ({l.key})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={!templateId || saving || loading}
            onClick={confirmSetup}
          >
            {saving ? t('common.saving') : t('adminOrg.setupConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

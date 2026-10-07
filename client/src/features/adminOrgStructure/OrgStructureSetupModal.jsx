/** Huy: Modal setup cơ cấu tổ chức một lần — chọn template rồi Confirm ghi DB. */
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import useModalA11y from '../../components/Shared/useModalA11y';
import { organizationAPI } from '../../services/api/organizationAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unwrapOrgApi } from '../../utils/adminOrgStructureUtils';

/** Bắt buộc hoàn tất setup: không có nút đóng, Esc không đóng (onClose không truyền). */
export default function OrgStructureSetupModal({ orgId, open, onCompleted }) {
  const { t } = useAppStrings();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);
  const selectRef = useRef(null);

  useModalA11y({ isOpen: open, containerRef, initialFocusRef: selectRef, isBusy: saving });

  useEffect(() => {
    if (!open || !orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await organizationAPI.listStructureTemplates(orgId);
        const data = unwrapOrgApi(res);
        if (!cancelled) {
          setTemplates(Array.isArray(data?.templates) ? data.templates : []);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orgId, t, reloadTick]);

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
    <div className="fixed inset-0 z-[10040] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 motion-safe:animate-fade-in-fast" aria-hidden />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-structure-setup-title"
        aria-describedby="org-structure-setup-hint"
        className="relative w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-xl motion-safe:animate-scale-in"
      >
        <h2 id="org-structure-setup-title" className="text-lg font-semibold text-foreground">
          {t('adminOrg.setupTitle')}
        </h2>
        <p id="org-structure-setup-hint" className="mt-2 text-sm text-muted-foreground">
          {t('adminOrg.setupHint')}
        </p>

        {loading && !templates.length ? (
          <AdminListSkeleton rows={3} className="mt-4" />
        ) : loadError ? (
          <AdminLoadErrorState
            className="mt-4"
            message={loadError}
            onRetry={() => setReloadTick((n) => n + 1)}
          />
        ) : (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.template')}</span>
              <select
                ref={selectRef}
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
              <div className="rounded-xl border border-border bg-muted p-3 text-sm">
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
            aria-busy={saving || undefined}
            onClick={confirmSetup}
          >
            <AdminBusySpinner busy={saving} />
            {saving ? t('common.saving') : t('adminOrg.setupConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

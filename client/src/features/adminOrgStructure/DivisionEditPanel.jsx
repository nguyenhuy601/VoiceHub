/** Huy: Domain Cơ cấu tổ chức — admin Khối (division) */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId } from '../../utils/adminOrgStructureUtils';

export default function DivisionEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { divisions, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '' });

  const selected = useMemo(
    () => divisions.find((row) => unitId(row) === selectedId) || null,
    [divisions, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    if (!selected) {
      setForm({ name: '' });
      return;
    }
    setForm({ name: selected.name || '' });
  }, [selected]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !selectedId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.updateDivision(orgId, selectedId, {
        name: String(form.name || '').trim(),
      });
      toast.success(t('adminOrg.saved'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.divisionEdit')}
      hint={t('adminOrg.divisionEditHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={divisions}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.divisionEditPickerHint')}
          subtitleFn={(row) => row.branchName || ''}
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.divisionEdit')}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.name')}</span>
                <input
                  required
                  className={adminInputClass()}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <button type="submit" disabled={saving} className={adminPrimaryBtnClass()}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </form>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

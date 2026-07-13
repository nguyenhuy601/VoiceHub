/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
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
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function TeamDeptPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { teams, departments, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [departmentId, setDepartmentId] = useState('');
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => teams.find((row) => unitId(row) === selectedId) || null,
    [teams, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  useEffect(() => {
    setDepartmentId(selected?.departmentId || '');
  }, [selected]);

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !selectedId || !departmentId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, selectedId, {
        department: departmentId,
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
    <AdminUserPanelShell title={t('adminDomains.orgStructure.teamDept')} hint={t('adminOrg.teamDeptHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={teams}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.teamDeptPickerHint')}
          subtitleFn={(row) => row.departmentName || ''}
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.teamDept')}>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <form className="space-y-4" onSubmit={save}>
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.colDepartment')}</span>
                <select
                  required
                  className={adminInputClass()}
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  <option value="">{t('adminOrg.selectDepartment')}</option>
                  {departments.map((d) => (
                    <option key={unitId(d)} value={unitId(d)}>
                      {unitName(d)}
                    </option>
                  ))}
                </select>
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

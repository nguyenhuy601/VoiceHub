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

export default function TeamDeptPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { teams, departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
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

  const body = (
    <AdminUserFormCard title={t('adminDomains.orgStructure.teamDept')}>
      {structureError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {structureError}
          </p>
          <button type="button" className={adminPrimaryBtnClass()} onClick={() => loadStructure()}>
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !selected ? (
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
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.teamDept')} hint={t('adminOrg.teamDeptHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={teams}
          loading={loading}
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.teamDeptPickerHint')}
          subtitleFn={(row) => row.departmentName || ''}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

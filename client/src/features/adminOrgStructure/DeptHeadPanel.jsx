/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId } from '../../utils/adminOrgStructureUtils';

export default function DeptHeadPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const userId = String(searchParams.get('userId') || '').trim();
  const { departments, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => departments.find((d) => unitId(d) === selectedId) || null,
    [departments, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const save = async () => {
    if (!orgId || !selectedId || !userId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.updateDepartment(orgId, selectedId, { head: userId });
      toast.success(t('adminOrg.saved'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.deptHead')} hint={t('adminOrg.deptHeadHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={departments}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptHeadPickerHint')}
          subtitleFn={(row) => row.divisionName || ''}
        />
        <div className="space-y-4">
          <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.deptHeadUserHint')} />
          <AdminUserFormCard title={t('adminDomains.orgStructure.deptHead')}>
            {!selected || !userId ? (
              <p className="text-sm text-muted-foreground">{t('adminOrg.deptHeadSelectBoth')}</p>
            ) : (
              <button type="button" disabled={saving} className={adminPrimaryBtnClass()} onClick={save}>
                {saving ? t('common.saving') : t('common.save')}
              </button>
            )}
          </AdminUserFormCard>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}

/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId } from '../../utils/adminOrgStructureUtils';

export default function DeptDisablePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, loadStructure } = useAdminOrgStructure(orgId, { includeInactive: true });
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canDeleteDept = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DEPT_DELETE);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const selected = useMemo(
    () => departments.find((d) => unitId(d) === selectedId) || null,
    [departments, selectedId]
  );

  const toggle = async (isActive) => {
    if (!orgId || !selectedId || busy) return;
    if (!canDeleteDept) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    setBusy(true);
    try {
      await organizationAPI.updateDepartment(orgId, selectedId, { isActive });
      toast.success(t('adminOrg.deptToggled'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.deptToggleFail') }));
    } finally {
      setBusy(false);
    }
  };

  const active = selected?.isActive !== false;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.deptDisable')}
      hint={t('adminOrg.deptDisableHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={departments}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptDisablePickerHint')}
          subtitleFn={(row) => row.divisionName || ''}
          badgeFn={(row) => (row.isActive === false ? t('adminOrg.inactive') : t('adminOrg.active'))}
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.deptDisable')} danger={!active}>
          {!canDeleteDept ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.grantDenied')}</p>
          ) : !selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {active ? (
                <button
                  type="button"
                  disabled={busy}
                  className={adminDangerBtnClass()}
                  onClick={() => toggle(false)}
                >
                  {t('adminOrg.deptDisable')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={adminPrimaryBtnClass()}
                  onClick={() => toggle(true)}
                >
                  {t('adminOrg.deptEnable')}
                </button>
              )}
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

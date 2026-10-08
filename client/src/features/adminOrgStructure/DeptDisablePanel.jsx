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
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import { AdminBusySpinner, AdminLoadErrorState } from '../../components/adminUsers/adminPanelStates';

export default function DeptDisablePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId, {
    includeInactive: true,
  });
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canDeleteDept = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.DEPT_UPDATE);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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

  const body = (
    <AdminUserFormCard title={t('adminDomains.orgStructure.deptDisable')} danger={!active}>
      {structureError ? (
        <AdminLoadErrorState message={structureError} onRetry={() => loadStructure()} />
      ) : !selected ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {active ? (
            <button
              type="button"
              disabled={busy}
              aria-busy={busy || undefined}
              className={adminDangerBtnClass()}
              onClick={() => setConfirmOpen(true)}
            >
              <AdminBusySpinner busy={busy} />
              {t('adminOrg.deptDisable')}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              aria-busy={busy || undefined}
              className={adminPrimaryBtnClass()}
              onClick={() => toggle(true)}
            >
              <AdminBusySpinner busy={busy} />
              {t('adminOrg.deptEnable')}
            </button>
          )}
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => toggle(false)}
        variant="danger"
        title={t('adminOrg.unitDisableConfirmTitle', { action: t('adminOrg.deptDisable'), name: unitName(selected) })}
        message={
          Array.isArray(selected?.memberIds)
            ? t('adminOrg.unitDisableConfirmMessage', { name: unitName(selected), n: selected.memberIds.length })
            : t('adminOrg.unitDisableConfirmMessageNoCount', { name: unitName(selected) })
        }
        confirmText={t('adminOrg.deptDisable')}
        cancelText={t('common.cancel')}
      />
    </AdminUserFormCard>
  );

  if (embedded) return body;

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
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptDisablePickerHint')}
          subtitleFn={(row) => row.divisionName || ''}
          badgeFn={(row) => (row.isActive === false ? t('adminOrg.inactive') : t('adminOrg.active'))}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

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

export default function TeamArchivePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { teams, loading, loadStructure } = useAdminOrgStructure(orgId, { includeInactive: true });
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canDeleteTeam = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.TEAM_DELETE);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const selected = useMemo(
    () => teams.find((row) => unitId(row) === selectedId) || null,
    [teams, selectedId]
  );

  const toggle = async (isActive) => {
    if (!orgId || !selectedId || busy) return;
    if (!canDeleteTeam) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
    setBusy(true);
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, selectedId, { isActive });
      toast.success(t('adminOrg.teamToggled'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.teamToggleFail') }));
    } finally {
      setBusy(false);
    }
  };

  const active = selected?.isActive !== false;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.teamArchive')}
      hint={t('adminOrg.teamArchiveHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={teams}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.teamArchivePickerHint')}
          subtitleFn={(row) => row.departmentName || ''}
          badgeFn={(row) => (row.isActive === false ? t('adminOrg.inactive') : t('adminOrg.active'))}
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.teamArchive')} danger={!active}>
          {!canDeleteTeam ? (
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
                  {t('adminOrg.teamDisable')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={adminPrimaryBtnClass()}
                  onClick={() => toggle(true)}
                >
                  {t('adminOrg.teamEnable')}
                </button>
              )}
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

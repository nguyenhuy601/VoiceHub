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
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId } from '../../utils/adminOrgStructureUtils';

export default function BranchDisablePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { branches, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => branches.find((row) => unitId(row) === selectedId) || null,
    [branches, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const toggle = async (isActive) => {
    if (!orgId || !selectedId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.updateBranch(orgId, selectedId, { isActive });
      toast.success(t('adminOrg.branchToggled'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.branchToggleFail') }));
    } finally {
      setBusy(false);
    }
  };

  const active = selected?.isActive !== false;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.branchDisable')}
      hint={t('adminOrg.branchDisableHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={branches}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.branchDisablePickerHint')}
          subtitleFn={(row) => row.location || ''}
          badgeFn={(row) => (row.isActive === false ? t('adminOrg.inactive') : t('adminOrg.active'))}
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.branchDisable')} danger={!active}>
          {!selected ? (
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
                  {t('adminOrg.branchDisable')}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  className={adminPrimaryBtnClass()}
                  onClick={() => toggle(true)}
                >
                  {t('adminOrg.branchEnable')}
                </button>
              )}
            </div>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

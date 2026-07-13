/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { ConfirmDialog } from '../../components/Shared';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function DeptDisablePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { departments, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const selected = useMemo(
    () => departments.find((d) => unitId(d) === selectedId) || null,
    [departments, selectedId]
  );

  const confirm = async () => {
    if (!orgId || !selectedId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.deleteDepartment(orgId, selectedId);
      toast.success(t('adminOrg.deleted'));
      setOpen(false);
      setSelectedId('');
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.deleteFail') }));
    } finally {
      setBusy(false);
    }
  };

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
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.deptDisable')} danger>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <button type="button" className={adminDangerBtnClass()} onClick={() => setOpen(true)}>
              {t('adminDomains.orgStructure.deptDisable')}
            </button>
          )}
        </AdminUserFormCard>
      </div>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminDomains.orgStructure.deptDisable')}
        message={t('adminOrg.deptDisableConfirm', { name: unitName(selected) })}
        confirmText={t('adminDomains.orgStructure.deptDisable')}
        cancelText={t('common.cancel')}
      />
    </AdminUserPanelShell>
  );
}

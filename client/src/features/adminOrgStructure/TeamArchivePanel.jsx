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

export default function TeamArchivePanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const { teams, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const selected = useMemo(
    () => teams.find((row) => unitId(row) === selectedId) || null,
    [teams, selectedId]
  );

  const confirm = async () => {
    if (!orgId || !selectedId || busy) return;
    setBusy(true);
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, selectedId, { isActive: false });
      toast.success(t('adminOrg.teamArchived'));
      setOpen(false);
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.teamArchiveFail') }));
    } finally {
      setBusy(false);
    }
  };

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
        />
        <AdminUserFormCard title={t('adminDomains.orgStructure.teamArchive')} danger>
          {!selected ? (
            <p className="text-sm text-muted-foreground">{t('adminOrg.selectUnitFirst')}</p>
          ) : (
            <button type="button" className={adminDangerBtnClass()} onClick={() => setOpen(true)}>
              {t('adminDomains.orgStructure.teamArchive')}
            </button>
          )}
        </AdminUserFormCard>
      </div>
      <ConfirmDialog
        isOpen={open}
        onClose={() => !busy && setOpen(false)}
        onConfirm={confirm}
        title={t('adminDomains.orgStructure.teamArchive')}
        message={t('adminOrg.teamArchiveConfirm', { name: unitName(selected) })}
        confirmText={t('adminDomains.orgStructure.teamArchive')}
        cancelText={t('common.cancel')}
      />
    </AdminUserPanelShell>
  );
}

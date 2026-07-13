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

export default function TeamLeaderPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const userId = String(searchParams.get('userId') || '').trim();
  const { teams, loading, loadStructure } = useAdminOrgStructure(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => teams.find((row) => unitId(row) === selectedId) || null,
    [teams, selectedId]
  );

  useEffect(() => {
    if (unitParam) setSelectedId(unitParam);
  }, [unitParam]);

  const save = async () => {
    if (!orgId || !selectedId || !userId || saving) return;
    setSaving(true);
    try {
      await organizationAPI.updateTeamByHierarchy(orgId, selectedId, { leader: userId });
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
      title={t('adminDomains.orgStructure.teamLeader')}
      hint={t('adminOrg.teamLeaderHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={teams}
          loading={loading}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.teamLeaderPickerHint')}
          subtitleFn={(row) => row.departmentName || ''}
        />
        <div className="space-y-4">
          <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.teamLeaderUserHint')} />
          <AdminUserFormCard title={t('adminDomains.orgStructure.teamLeader')}>
            {!selected || !userId ? (
              <p className="text-sm text-muted-foreground">{t('adminOrg.teamLeaderSelectBoth')}</p>
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

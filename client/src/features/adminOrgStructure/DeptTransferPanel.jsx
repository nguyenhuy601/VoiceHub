/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
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

export default function DeptTransferPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { departments, loadStructure } = useAdminOrgStructure(orgId);
  const [fromDept, setFromDept] = useState('');
  const [toDept, setToDept] = useState('');
  const [saving, setSaving] = useState(false);

  const fromRow = useMemo(
    () => departments.find((d) => unitId(d) === fromDept) || null,
    [departments, fromDept]
  );
  const toRow = useMemo(
    () => departments.find((d) => unitId(d) === toDept) || null,
    [departments, toDept]
  );

  const transfer = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || !fromDept || !toDept || fromDept === toDept || saving) return;
    setSaving(true);
    try {
      const fromMembers = (fromRow?.memberIds || []).filter((id) => id !== userId);
      const toMembers = Array.from(new Set([...(toRow?.memberIds || []), userId]));
      await organizationAPI.updateDepartment(orgId, fromDept, { members: fromMembers });
      await organizationAPI.updateDepartment(orgId, toDept, { members: toMembers });
      toast.success(t('adminOrg.transferred'));
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.transferFail') }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminUserPanelShell
      title={t('adminDomains.orgStructure.deptTransfer')}
      hint={t('adminOrg.deptTransferHint')}
      wide
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.deptTransferUserHint')} />
        <AdminUserFormCard title={t('adminDomains.orgStructure.deptTransfer')}>
          <form className="space-y-4" onSubmit={transfer}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.fromDept')}</span>
              <select
                required
                className={adminInputClass()}
                value={fromDept}
                onChange={(e) => setFromDept(e.target.value)}
              >
                <option value="">{t('adminOrg.selectDepartment')}</option>
                {departments.map((d) => (
                  <option key={unitId(d)} value={unitId(d)}>
                    {unitName(d)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.toDept')}</span>
              <select
                required
                className={adminInputClass()}
                value={toDept}
                onChange={(e) => setToDept(e.target.value)}
              >
                <option value="">{t('adminOrg.selectDepartment')}</option>
                {departments.map((d) => (
                  <option key={unitId(d)} value={unitId(d)}>
                    {unitName(d)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={saving || !userId || !fromDept || !toDept || fromDept === toDept}
              className={adminPrimaryBtnClass()}
            >
              {saving ? t('common.saving') : t('adminOrg.transferAction')}
            </button>
          </form>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

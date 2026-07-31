/** Huy: Điều chuyển nhân viên — ưu tiên list chưa có phòng ban + validation rõ. */
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberDepartmentId, memberUserId } from '../../utils/adminUserUtils';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function DeptTransferPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { departments, loadStructure } = useAdminOrgStructure(orgId);
  const { members, loadMembers, membersById } = useAdminMembers(orgId);
  const [fromDept, setFromDept] = useState('');
  const [toDept, setToDept] = useState('');
  const [showAssigned, setShowAssigned] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedMember = membersById.get(userId) || null;
  const selectedDeptId = memberDepartmentId(selectedMember);

  const unassignedFilter = useCallback(
    (m) => {
      if (showAssigned) return true;
      return !memberDepartmentId(m);
    },
    [showAssigned]
  );

  useEffect(() => {
    if (!userId) return;
    if (selectedDeptId) {
      setFromDept(selectedDeptId);
      setShowAssigned(true);
    } else {
      setFromDept('');
    }
  }, [userId, selectedDeptId]);

  const fromRow = useMemo(
    () => departments.find((d) => unitId(d) === fromDept) || null,
    [departments, fromDept]
  );
  const toRow = useMemo(
    () => departments.find((d) => unitId(d) === toDept) || null,
    [departments, toDept]
  );

  const validationMessage = useMemo(() => {
    if (!userId) return t('adminOrg.selectUserFirst');
    if (!departments.length) return t('adminOrg.noDepartments');
    if (!toDept) return t('adminOrg.deptTransferNeedTo');
    if (fromDept && fromDept === toDept) return t('adminOrg.deptTransferSameDept');
    if (fromDept && fromRow && !(fromRow.memberIds || []).includes(userId) && selectedDeptId !== fromDept) {
      return t('adminOrg.deptTransferNotInFrom');
    }
    return '';
  }, [userId, departments.length, toDept, fromDept, fromRow, selectedDeptId, t]);

  const canSubmit = !validationMessage && !saving;

  const transfer = async (e) => {
    e.preventDefault();
    if (!orgId || saving) return;
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }
    setSaving(true);
    try {
      // membersAdd: merge trên BE (tránh OU structure thiếu members[] → ghi đè mất head)
      await organizationAPI.updateDepartment(orgId, toDept, { membersAdd: [userId] });
      toast.success(t('adminOrg.transferred'));
      setToDept('');
      await Promise.all([loadStructure(), loadMembers()]);
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
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-border"
              checked={showAssigned}
              onChange={(e) => setShowAssigned(e.target.checked)}
            />
            {t('adminOrg.deptTransferShowAssigned')}
          </label>
          <AdminUserPicker
            orgId={orgId}
            selectedUserId={userId}
            hint={
              showAssigned
                ? t('adminOrg.deptTransferUserHint')
                : t('adminOrg.deptTransferUnassignedHint')
            }
            filterFn={unassignedFilter}
            emptyLabel={
              showAssigned ? t('adminUsers.noUsers') : t('adminOrg.deptTransferNoUnassigned')
            }
            subtitleFn={(m) => {
              const dept = memberDepartmentId(m);
              if (!dept) return `${m.email || '—'} · ${t('adminOrg.deptTransferUnassignedBadge')}`;
              const name =
                m.departmentName ||
                unitName(departments.find((d) => unitId(d) === dept) || {}, dept);
              return `${m.email || '—'} · ${name}`;
            }}
          />
        </div>
        <AdminUserFormCard title={t('adminDomains.orgStructure.deptTransfer')}>
          <form className="space-y-4" onSubmit={transfer}>
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.fromDept')}</span>
              <select
                className={adminInputClass()}
                value={fromDept}
                onChange={(e) => setFromDept(e.target.value)}
              >
                <option value="">{t('adminOrg.deptTransferFromNone')}</option>
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
            {validationMessage ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{validationMessage}</p>
            ) : selectedMember ? (
              <p className="text-xs text-muted-foreground">
                {t('adminOrg.deptTransferReady', {
                  name: selectedMember.displayName || selectedMember.email || memberUserId(selectedMember),
                })}
              </p>
            ) : null}
            <button type="submit" disabled={!canSubmit} className={adminPrimaryBtnClass()}>
              {saving ? t('common.saving') : t('adminOrg.transferAction')}
            </button>
          </form>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

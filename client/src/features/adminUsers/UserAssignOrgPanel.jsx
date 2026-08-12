/** Huy: Gán phòng ban / nhóm — chỉ list + search nhân viên chưa có dept và team. */
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
import { clearAdminUserSelection } from '../../utils/adminSelectionParams';
import {
  memberDisplayName,
  memberEmail,
  memberIsUnplaced,
  memberUserId,
} from '../../utils/adminUserUtils';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

export default function UserAssignOrgPanel({ orgId }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { departments, teams, loadStructure } = useAdminOrgStructure(orgId);
  const { loadMembers, membersById } = useAdminMembers(orgId);
  const [departmentId, setDepartmentId] = useState('');
  const [teamId, setTeamId] = useState('');
  const [busy, setBusy] = useState(false);

  const unplacedFilter = useCallback((m) => memberIsUnplaced(m), []);

  const selectedMember = membersById.get(userId) || null;
  const selectedIsUnplaced = selectedMember ? memberIsUnplaced(selectedMember) : false;

  const teamsInDept = useMemo(
    () => teams.filter((row) => String(row.departmentId || '') === String(departmentId || '')),
    [teams, departmentId]
  );

  useEffect(() => {
    if (!teamId) return;
    if (!teamsInDept.some((row) => unitId(row) === teamId)) {
      setTeamId('');
    }
  }, [teamsInDept, teamId]);

  const validationMessage = useMemo(() => {
    if (!userId) return t('adminUsers.selectUserFirst');
    if (!selectedIsUnplaced) return t('adminUsers.assignOrgAlreadyPlaced');
    if (!departments.length) return t('adminOrg.noDepartments');
    if (!departmentId) return t('adminUsers.assignOrgNeedDept');
    return '';
  }, [userId, selectedIsUnplaced, departments.length, departmentId, t]);

  const canSubmit = !validationMessage && !busy;

  const assign = async () => {
    if (!orgId || busy || validationMessage) {
      if (validationMessage) toast.error(validationMessage);
      return;
    }
    setBusy(true);
    try {
      const dep = departments.find((d) => unitId(d) === departmentId);
      const depMembers = (dep?.memberIds || []).map(String);
      if (!depMembers.includes(userId)) {
        await organizationAPI.updateDepartment(orgId, departmentId, {
          membersAdd: [userId],
        });
      }
      if (teamId) {
        const team = teams.find((row) => unitId(row) === teamId);
        const teamMembers = (team?.memberIds || []).map(String);
        if (!teamMembers.includes(userId)) {
          await organizationAPI.updateTeamByHierarchy(orgId, teamId, {
            members: Array.from(new Set([...teamMembers, userId])),
          });
        }
      }
      toast.success(t('adminUsers.assignOrgSaved'));
      setDepartmentId('');
      setTeamId('');
      clearAdminUserSelection(searchParams, setSearchParams);
      await Promise.all([loadStructure(), loadMembers()]);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminUsers.assignOrgFail') }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.users.assignOrg')} hint={t('adminUsers.assignOrgHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectedUserId={userId}
          hint={t('adminUsers.assignOrgPickerHint')}
          filterFn={unplacedFilter}
          emptyLabel={t('adminUsers.assignOrgNoUnplaced')}
          subtitleFn={(m) => `${memberEmail(m)} · ${t('adminOrg.deptTransferUnassignedBadge')}`}
        />
        <AdminUserFormCard title={t('adminDomains.users.assignOrg')} hint={t('adminUsers.assignOrgHint')}>
          {!userId ? (
            <p className="mb-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
          ) : null}
          <div className="space-y-4">
            <label className="block">
              <span className={adminLabelClass()}>{t('adminOrg.toDept')}</span>
              <select
                className={adminInputClass()}
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
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
              <span className={adminLabelClass()}>{t('adminUsers.assignOrgTeamOptional')}</span>
              <select
                className={adminInputClass()}
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                disabled={!departmentId}
              >
                <option value="">{t('adminUsers.assignOrgTeamNone')}</option>
                {teamsInDept.map((row) => (
                  <option key={unitId(row)} value={unitId(row)}>
                    {unitName(row)}
                  </option>
                ))}
              </select>
            </label>
            {validationMessage ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">{validationMessage}</p>
            ) : selectedMember ? (
              <p className="text-xs text-muted-foreground">
                {t('adminUsers.assignOrgReady', {
                  name: memberDisplayName(selectedMember) || memberUserId(selectedMember),
                })}
              </p>
            ) : null}
            <button type="button" disabled={!canSubmit} className={adminPrimaryBtnClass()} onClick={assign}>
              {busy ? t('common.saving') : t('adminUsers.saveAssignment')}
            </button>
          </div>
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}

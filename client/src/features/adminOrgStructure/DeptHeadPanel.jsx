/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminOrgUnitPicker from '../../components/adminOrgStructure/AdminOrgUnitPicker';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { ConfirmDialog } from '../../components/Shared';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { organizationAPI } from '../../services/api/organizationAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import useAdminOrgStructure from '../../hooks/useAdminOrgStructure';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import {
  departmentHeadId,
  unitId,
  unitName,
  unwrapOrgApi,
} from '../../utils/adminOrgStructureUtils';
import {
  memberEligibleForDeptHead,
  memberLabelById,
  memberUserId,
} from '../../utils/adminUserUtils';

export default function DeptHeadPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const unitParam = String(searchParams.get('unitId') || '').trim();
  const userId = String(searchParams.get('userId') || '').trim();
  const { departments, loading, error: structureError, loadStructure } = useAdminOrgStructure(orgId);
  const { members, membersByIdAll, error: membersError, loadMembers } = useAdminMembers(orgId);
  const [selectedId, setSelectedId] = useState(unitParam);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selected = useMemo(
    () => departments.find((d) => unitId(d) === selectedId) || null,
    [departments, selectedId]
  );

  const headUserIds = useMemo(() => {
    const set = new Set();
    for (const row of departments) {
      const hid = departmentHeadId(row);
      if (hid) set.add(hid);
    }
    return set;
  }, [departments]);

  const eligibleFilter = useCallback(
    (m) => {
      if (!selectedId) return false;
      return memberEligibleForDeptHead(m, {
        headUserIds,
        departmentId: selectedId,
      });
    },
    [headUserIds, selectedId]
  );

  const selectionKey = selectedId && userId && selected ? `${selectedId}:${userId}` : '';

  const selectedUserName = memberLabelById(membersByIdAll, userId, userId || '—');
  const selectedDeptName = unitName(selected, t('common.department'));

  useEffect(() => {
    setSelectedId(unitParam);
  }, [unitParam]);

  // Huy: bỏ userId URL nếu không còn trong danh sách đủ điều kiện
  useEffect(() => {
    if (!userId) return;
    const member = membersByIdAll.get(userId) || members.find((m) => memberUserId(m) === userId);
    if (!member) return;
    if (
      !selectedId ||
      !memberEligibleForDeptHead(member, {
        headUserIds,
        departmentId: selectedId,
      })
    ) {
      const next = new URLSearchParams(searchParams);
      next.delete('userId');
      setSearchParams(next, { replace: true });
    }
  }, [userId, members, membersByIdAll, headUserIds, selectedId, searchParams, setSearchParams]);

  useEffect(() => {
    if (!selectionKey) {
      setConfirmOpen(false);
      return;
    }
    setConfirmOpen(true);
  }, [selectionKey]);

  const clearSelections = () => {
    setSelectedId('');
    setConfirmOpen(false);
    const next = new URLSearchParams(searchParams);
    next.delete('unitId');
    next.delete('userId');
    setSearchParams(next, { replace: true });
  };

  const closeConfirm = () => {
    if (saving) return;
    clearSelections();
  };

  const save = async () => {
    if (!orgId || !selectedId || !userId || saving) return;
    setSaving(true);
    try {
      const res = await organizationAPI.updateDepartment(orgId, selectedId, { head: userId });
      const saved = unwrapOrgApi(res);
      const savedHead = String(saved?.head?._id || saved?.head || '').trim();
      if (savedHead && savedHead !== userId) {
        throw new Error(t('adminOrg.saveFail'));
      }
      toast.success(t('adminOrg.saved'));
      clearSelections();
      await loadStructure();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.saveFail') }));
    } finally {
      setSaving(false);
    }
  };

  const body = (
    <AdminUserFormCard title={t('adminDomains.orgStructure.deptHead')}>
      {structureError || membersError ? (
        <div className="space-y-3">
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {structureError || resolveApiErrorMessage(membersError, { t, fallback: t('adminOrg.loadFail') })}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            onClick={() => Promise.allSettled([loadStructure(), loadMembers()])}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : !selected || !userId ? (
        <p className="text-sm text-muted-foreground">{t('adminOrg.deptHeadSelectBoth')}</p>
      ) : (
        <p className="text-sm text-foreground">
          {t('adminOrg.deptHeadReady', {
            userName: selectedUserName,
            deptName: selectedDeptName,
          })}
        </p>
      )}
    </AdminUserFormCard>
  );

  const confirmDialog = (
    <ConfirmDialog
      isOpen={confirmOpen}
      onClose={closeConfirm}
      onConfirm={save}
      title={t('adminDomains.orgStructure.deptHead')}
      message={t('adminOrg.deptHeadConfirm', {
        userName: selectedUserName,
        deptName: selectedDeptName,
      })}
      confirmText={t('common.save')}
      cancelText={t('common.cancel')}
    />
  );

  if (embedded) {
    return (
      <>
        {body}
        {confirmDialog}
      </>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.orgStructure.deptHead')} hint={t('adminOrg.deptHeadHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminOrgUnitPicker
          items={departments}
          loading={loading}
          error={structureError}
          onRetry={() => loadStructure()}
          selectedId={selectedId}
          onSelect={setSelectedId}
          hint={t('adminOrg.deptHeadPickerHint')}
          subtitleFn={(row) => row.divisionName || ''}
        />
        <div className="space-y-4">
          <AdminUserPicker
            orgId={orgId}
            selectedUserId={userId}
            hint={
              selectedId ? t('adminOrg.deptHeadUserHintScoped') : t('adminOrg.deptHeadUserHint')
            }
            filterFn={eligibleFilter}
            emptyLabel={
              selectedId
                ? t('adminOrg.deptHeadNoEligibleInDept')
                : t('adminOrg.deptHeadNoEligible')
            }
          />
          {body}
        </div>
      </div>
      {confirmDialog}
    </AdminUserPanelShell>
  );
}

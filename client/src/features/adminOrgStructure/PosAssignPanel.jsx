/** Position (HR) — admin RBAC */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminListSkeleton,
} from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { orgRbacAPI } from '../../services/api/orgRbacAPI';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { memberDisplayName } from '../../utils/adminUserUtils';
import {
  activeAssignmentByUser,
  partitionPositionChange,
  uniqueIds,
} from './positionAssignmentBulk';

const PROFILE_PATCH = {
  skipGlobalErrorHandling: true,
  skipNotFoundToast: true,
  skipPermissionDeniedToast: true,
};

function assignmentRows(res) {
  return res?.data?.assignments || res?.data?.data?.assignments || [];
}

export default function PosAssignPanel({ orgId, embedded = false, selectedUserIds }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const selectionControlled = Array.isArray(selectedUserIds);
  const [localUserIds, setLocalUserIds] = useState([]);
  const checkedIds = selectionControlled ? uniqueIds(selectedUserIds) : localUserIds;
  const targetUserIds = checkedIds.length ? checkedIds : userId ? [userId] : [];
  const singleUserId = targetUserIds.length === 1 ? targetUserIds[0] : '';
  const titleParam = String(searchParams.get('title') || '').trim();
  const { loadMembers, membersById, error: membersError } = useAdminMembers(orgId, { view: 'directory' });
  const [mode, setMode] = useState('existing');
  const [selectedPositionId, setSelectedPositionId] = useState('');
  const [currentPositionId, setCurrentPositionId] = useState('');
  const [customTitle, setCustomTitle] = useState('');
  const [hrPositions, setHrPositions] = useState([]);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [positionsError, setPositionsError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmUnassign, setConfirmUnassign] = useState(false);

  const selectedMember = membersById.get(singleUserId) || null;
  const memberName = selectedMember
    ? memberDisplayName(selectedMember, singleUserId)
    : singleUserId;

  const positionLabel = (row) => {
    const title = String(row?.title || row?.name || '').trim();
    const code = String(row?.key || row?.code || '').trim();
    if (title && code) return `${title} (${code})`;
    return title || code;
  };

  const currentPosition = (hrPositions || []).find(
    (row) => String(row?.id || row?._id || '') === currentPositionId
  );
  const currentTitle = currentPosition ? positionLabel(currentPosition) : '';

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setPositionsLoading(true);
      setPositionsError('');
      try {
        const res = await organizationAPI.listHrPositions(orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (cancelled) return;
        setHrPositions(Array.isArray(data?.positions) ? data.positions : []);
      } catch (error) {
        if (!cancelled) setHrPositions([]);
        if (!cancelled) {
          const msg = resolveApiErrorMessage(error, { t, fallback: t('adminRbac.masterDataLoadFail') });
          setPositionsError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setPositionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, reloadTick]);

  const positionOptions = useMemo(
    () =>
      (hrPositions || [])
        .map((row) => ({
          id: String(row?.id || row?._id || '').trim(),
          label: positionLabel(row),
        }))
        .filter((row) => row.id && row.label)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [hrPositions]
  );

  useEffect(() => {
    if (!titleParam || !hrPositions.length || selectedPositionId) return;
    const match = hrPositions.find(
      (row) => String(row?.title || row?.name || '').trim() === titleParam
    );
    const id = String(match?.id || match?._id || '').trim();
    if (id) setSelectedPositionId(id);
  }, [titleParam, hrPositions, selectedPositionId]);

  useEffect(() => {
    if (!orgId || !singleUserId) {
      setCurrentPositionId('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const asgRes = await orgRbacAPI.listAssignments(orgId, { userId: singleUserId, status: 'active' });
        const assignments = asgRes?.data?.assignments || asgRes?.data?.data?.assignments || [];
        const active = Array.isArray(assignments) ? assignments[0] : null;
        if (!cancelled) setCurrentPositionId(String(active?.positionId || '').trim());
      } catch {
        if (!cancelled) setCurrentPositionId('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, singleUserId, reloadTick]);

  const selectedPosition = (hrPositions || []).find(
    (row) => String(row?.id || row?._id || '') === selectedPositionId
  );
  const jobTitle =
    mode === 'custom'
      ? String(customTitle || '').trim()
      : String(selectedPosition?.title || selectedPosition?.name || '').trim();

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !targetUserIds.length || saving) return;
    if (mode === 'existing' && !selectedPositionId) return;
    if (mode === 'custom' && !jobTitle) return;
    setSaving(true);
    try {
      let positionId = mode === 'existing' ? selectedPositionId : '';
      if (!positionId && mode === 'custom') {
        const created = await organizationAPI.createHrPosition(orgId, { title: jobTitle });
        const pos = created?.data?.position || created?.data?.data?.position || created?.data;
        positionId = String(pos?._id || pos?.id || '').trim();
        if (!positionId && pos?.title) {
          const refreshed = await organizationAPI.listHrPositions(orgId);
          const data = refreshed?.data?.data ?? refreshed?.data ?? refreshed;
          const list = Array.isArray(data?.positions) ? data.positions : [];
          const found = list.find((r) => String(r?.title || r?.name || '').trim() === jobTitle);
          positionId = String(found?._id || found?.id || '').trim();
          setHrPositions(list);
        }
      }
      if (!positionId) {
        toast.error(t('adminOrg.posAssignNeedPosition', 'Chọn hoặc tạo vị trí tổ chức trước khi gán.'));
        return;
      }
      const listed = assignmentRows(await orgRbacAPI.listAssignments(orgId, { status: 'active' }));
      const { changed, skipped } = partitionPositionChange(
        targetUserIds,
        activeAssignmentByUser(listed),
        { mode: 'assign', toId: positionId }
      );
      for (const id of changed) {
        await orgRbacAPI.assignPosition(orgId, { userId: id, positionId });
        try {
          await adminUserAPI.patchProfile(orgId, id, { jobTitle }, PROFILE_PATCH);
        } catch {
          /* hồ sơ chỉ là nhãn hiển thị */
        }
      }
      if (singleUserId) setCurrentPositionId(positionId);
      if (!changed.length) {
        toast.error(t('adminOrg.posBulkNoneChanged'));
        return;
      }
      toast.success(t('adminOrg.posBulkAssignDone', { count: changed.length }));
      if (skipped.length) toast(t('adminOrg.posBulkSkipped', { count: skipped.length }));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posAssignFail') }));
    } finally {
      setSaving(false);
    }
  };

  const unassign = async () => {
    if (!orgId || !targetUserIds.length || saving) return;
    setSaving(true);
    try {
      const listed = assignmentRows(await orgRbacAPI.listAssignments(orgId, { status: 'active' }));
      const byUser = activeAssignmentByUser(listed);
      const { changed } = partitionPositionChange(targetUserIds, byUser, { mode: 'remove' });
      for (const id of changed) {
        const aid = byUser.get(id)?.assignmentId;
        if (aid) await orgRbacAPI.endAssignment(orgId, aid);
        try {
          await adminUserAPI.patchProfile(orgId, id, { jobTitle: '' }, PROFILE_PATCH);
        } catch {
          /* hồ sơ chỉ là nhãn hiển thị */
        }
      }
      if (!changed.length) {
        toast.error(t('adminOrg.posBulkNoneChanged'));
        return;
      }
      toast.success(t('adminOrg.posBulkRemoveDone', { count: changed.length }));
      setConfirmUnassign(false);
      setCurrentPositionId('');
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posUnassignFail') }));
    } finally {
      setSaving(false);
    }
  };

  const formCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.posAssign')}>
      {membersError || positionsError ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-xl border border-destructive bg-card px-3 py-2 text-sm text-destructive">
            {membersError
              ? resolveApiErrorMessage(membersError, { t, fallback: t('companyAdmin.loadMembersFail') })
              : positionsError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            disabled={saving}
            onClick={async () => {
              await loadMembers();
              setReloadTick((n) => n + 1);
            }}
          >
            {t('adminRbac.retry')}
          </button>
        </div>
      ) : positionsLoading ? (
        <AdminListSkeleton rows={3} />
      ) : (
        <form className="space-y-4" onSubmit={save}>
        {!targetUserIds.length ? (
          <p className="text-sm text-muted-foreground">{t('adminOrg.posSelectUsersFirst')}</p>
        ) : targetUserIds.length > 1 ? (
          <p className="text-sm text-muted-foreground">
            {t('adminOrg.posBulkSelected', { count: targetUserIds.length })}
            {' '}
            {t('adminOrg.posBulkAssignHint')}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {currentTitle
              ? t('adminOrg.posCurrentTitle', { name: currentTitle })
              : t('adminOrg.posNoCurrentTitle')}
          </p>
        )}
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />
            {t('adminOrg.posSelectExisting')}
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="pos-mode"
              checked={mode === 'custom'}
              onChange={() => setMode('custom')}
            />
            {t('adminOrg.posCreateNew')}
          </label>
        </div>
        {mode === 'existing' ? (
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
            <select
              required
              className={adminInputClass()}
              value={selectedPositionId}
              onChange={(e) => setSelectedPositionId(e.target.value)}
            >
              <option value="">{t('adminOrg.selectTitle')}</option>
              {positionOptions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="block">
            <span className={adminLabelClass()}>{t('adminOrg.posTitle')}</span>
            <input
              required
              className={adminInputClass()}
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder={t('adminOrg.posTitle')}
            />
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving || !targetUserIds.length || (mode === 'existing' ? !selectedPositionId : !jobTitle)}
            className={adminPrimaryBtnClass()}
          >
            {saving ? t('common.saving') : t('adminDomains.rbac.posAssign')}
          </button>
          <button
            type="button"
            disabled={saving || !targetUserIds.length || (targetUserIds.length === 1 && !currentPositionId)}
            className={adminDangerBtnClass()}
            onClick={() => setConfirmUnassign(true)}
          >
            {t('adminOrg.posUnassignFromMember')}
          </button>
        </div>
        </form>
      )}
    </AdminUserFormCard>
  );

  const body = (
    <>
      {formCard}
      <ConfirmDialog
        isOpen={confirmUnassign}
        onClose={() => !saving && setConfirmUnassign(false)}
        onConfirm={unassign}
        variant="danger"
        title={t('adminOrg.posUnassignFromMember')}
        message={
          targetUserIds.length > 1
            ? t('adminOrg.posBulkRemoveConfirmMessage', { count: targetUserIds.length, name: currentTitle })
            : t('adminOrg.posUnassignConfirm', { name: currentTitle, user: memberName })
        }
        confirmText={t('adminOrg.posUnassignFromMember')}
        cancelText={t('common.cancel')}
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posAssign')} hint={t('adminOrg.posAssignHint')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker
          orgId={orgId}
          selectionMode="multiple"
          scrollLoad
          selectedUserIds={targetUserIds}
          onSelectedUserIdsChange={setLocalUserIds}
          hint={t('adminOrg.posAssignUserHint')}
        />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

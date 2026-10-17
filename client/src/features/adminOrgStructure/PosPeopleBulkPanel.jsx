import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  adminDangerBtnClass,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminListSkeleton } from '../../components/adminUsers/adminPanelStates';
import { ConfirmDialog } from '../../components/Shared';
import { adminUserAPI } from '../../services/api/adminUserAPI';
import { organizationAPI } from '../../services/api/organizationAPI';
import { orgRbacAPI } from '../../services/api/orgRbacAPI';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
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

/**
 * Đổi hoặc gỡ vị trí tổ chức cho nhân sự đã chọn.
 * @param {{ orgId: string, selectedUserIds?: string[], mode: 'replace' | 'remove' }} props
 */
export default function PosPeopleBulkPanel({ orgId, selectedUserIds = [], mode }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const clickedUserId = String(searchParams.get('userId') || '').trim();
  const checkedIds = uniqueIds(selectedUserIds);
  const userIds = checkedIds.length ? checkedIds : clickedUserId ? [clickedUserId] : [];
  const replaceMode = mode === 'replace';
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!orgId) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await organizationAPI.listHrPositions(orgId);
        const data = res?.data?.data ?? res?.data ?? res;
        if (!cancelled) setPositions(Array.isArray(data?.positions) ? data.positions : []);
      } catch (error) {
        if (!cancelled) {
          setPositions([]);
          setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.masterDataLoadFail') }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t]);

  const options = useMemo(
    () =>
      positions
        .map((row) => ({
          id: String(row?.id || row?._id || '').trim(),
          label: String(row?.name || row?.title || row?.code || '').trim(),
          name: String(row?.name || row?.title || '').trim(),
        }))
        .filter((row) => row.id && row.label)
        .sort((a, b) => a.label.localeCompare(b.label, 'vi')),
    [positions]
  );

  const labelOf = (id) => options.find((row) => row.id === id)?.label || id;
  const nameOf = (id) => options.find((row) => row.id === id)?.name || labelOf(id);
  const ready = replaceMode ? Boolean(userIds.length && fromId && toId && fromId !== toId) : Boolean(userIds.length && fromId);

  const apply = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const byUser = activeAssignmentByUser(
        assignmentRows(await orgRbacAPI.listAssignments(orgId, { status: 'active' }))
      );
      const { changed, skipped } = partitionPositionChange(userIds, byUser, {
        mode: replaceMode ? 'replace' : 'remove',
        fromId,
        toId,
      });
      for (const id of changed) {
        if (replaceMode) {
          await orgRbacAPI.assignPosition(orgId, { userId: id, positionId: toId });
          try {
            await adminUserAPI.patchProfile(orgId, id, { jobTitle: nameOf(toId) }, PROFILE_PATCH);
          } catch {
            /* nhãn hồ sơ */
          }
        } else {
          const aid = byUser.get(id)?.assignmentId;
          if (aid) await orgRbacAPI.endAssignment(orgId, aid);
          try {
            await adminUserAPI.patchProfile(orgId, id, { jobTitle: '' }, PROFILE_PATCH);
          } catch {
            /* nhãn hồ sơ */
          }
        }
      }
      if (!changed.length) {
        toast.error(t('adminOrg.posBulkNoneChanged'));
        return;
      }
      toast.success(
        t(replaceMode ? 'adminOrg.posBulkReplaceDone' : 'adminOrg.posBulkRemoveDone', {
          count: changed.length,
        })
      );
      if (skipped.length) toast(t('adminOrg.posBulkSkipped', { count: skipped.length }));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t(replaceMode ? 'adminOrg.posSaveFail' : 'adminOrg.posUnassignFail'),
        })
      );
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <AdminUserFormCard title={t(replaceMode ? 'adminDomains.rbac.posEdit' : 'adminDomains.rbac.posDisable')}>
        {loading ? (
          <AdminListSkeleton rows={3} />
        ) : loadError ? (
          <p role="alert" className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {userIds.length
                ? t('adminOrg.posBulkSelected', { count: userIds.length })
                : t('adminOrg.posSelectUsersFirst')}
            </p>
            <p className="text-xs text-muted-foreground">
              {replaceMode ? t('adminOrg.posPeopleEditHint') : t('adminOrg.posPeopleDisableHint')}
            </p>
            <label className="block">
              <span className={adminLabelClass()}>
                {replaceMode ? t('adminOrg.posBulkReplaceFrom') : t('adminOrg.posTitle')}
              </span>
              <select className={adminInputClass()} value={fromId} onChange={(event) => setFromId(event.target.value)}>
                <option value="">{t('adminOrg.selectTitle')}</option>
                {options.map((row) => (
                  <option key={row.id} value={row.id}>{row.label}</option>
                ))}
              </select>
            </label>
            {replaceMode ? (
              <label className="block">
                <span className={adminLabelClass()}>{t('adminOrg.posBulkReplaceTo')}</span>
                <select className={adminInputClass()} value={toId} onChange={(event) => setToId(event.target.value)}>
                  <option value="">{t('adminOrg.selectTitle')}</option>
                  {options.filter((row) => row.id !== fromId).map((row) => (
                    <option key={row.id} value={row.id}>{row.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              disabled={!ready || busy}
              aria-busy={busy || undefined}
              className={replaceMode ? adminPrimaryBtnClass() : adminDangerBtnClass()}
              onClick={() => setConfirmOpen(true)}
            >
              <AdminBusySpinner busy={busy} />
              {busy
                ? t('common.saving')
                : replaceMode
                  ? t('adminOrg.posBulkReplaceAction')
                  : t('adminOrg.posBulkRemoveAction')}
            </button>
          </div>
        )}
      </AdminUserFormCard>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={apply}
        variant={replaceMode ? 'default' : 'danger'}
        title={t(replaceMode ? 'adminOrg.posBulkReplaceConfirmTitle' : 'adminOrg.posBulkRemoveConfirmTitle')}
        message={t(
          replaceMode ? 'adminOrg.posBulkReplaceConfirmMessage' : 'adminOrg.posBulkRemoveConfirmMessage',
          { from: labelOf(fromId), to: labelOf(toId), name: labelOf(fromId), count: userIds.length }
        )}
        confirmText={replaceMode ? t('adminOrg.posBulkReplaceAction') : t('adminOrg.posBulkRemoveAction')}
        cancelText={t('common.cancel')}
      />
    </>
  );
}

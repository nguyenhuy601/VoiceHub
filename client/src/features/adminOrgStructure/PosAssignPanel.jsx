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

export default function PosAssignPanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
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

  const selectedMember = membersById.get(userId) || null;
  const memberName = selectedMember
    ? memberDisplayName(selectedMember, userId)
    : userId;

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
    if (!orgId || !userId) {
      setCurrentPositionId('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const asgRes = await orgRbacAPI.listAssignments(orgId, { userId, status: 'active' });
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
  }, [orgId, userId, reloadTick]);

  const selectedPosition = (hrPositions || []).find(
    (row) => String(row?.id || row?._id || '') === selectedPositionId
  );
  const jobTitle =
    mode === 'custom'
      ? String(customTitle || '').trim()
      : String(selectedPosition?.title || selectedPosition?.name || '').trim();

  const save = async (e) => {
    e.preventDefault();
    if (!orgId || !userId || saving) return;
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
      await orgRbacAPI.assignPosition(orgId, { userId, positionId });
      setCurrentPositionId(positionId);
      // Nhãn hồ sơ. Assignment đã lưu — thiếu hồ sơ không được báo "không tìm thấy tổ chức/dữ liệu".
      try {
        await adminUserAPI.patchProfile(orgId, userId, { jobTitle }, {
          skipGlobalErrorHandling: true,
          skipNotFoundToast: true,
          skipPermissionDeniedToast: true,
        });
      } catch {
        /* hồ sơ chỉ là nhãn hiển thị */
      }
      toast.success(t('adminOrg.posAssigned'));
      await loadMembers();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminOrg.posAssignFail') }));
    } finally {
      setSaving(false);
    }
  };

  const unassign = async () => {
    if (!orgId || !userId || !currentTitle || saving) return;
    setSaving(true);
    try {
      try {
        const asgRes = await orgRbacAPI.listAssignments(orgId, { userId, status: 'active' });
        const assignments =
          asgRes?.data?.assignments || asgRes?.data?.data?.assignments || [];
        for (const row of assignments) {
          const aid = String(row?._id || row?.id || '').trim();
          if (aid) await orgRbacAPI.endAssignment(orgId, aid);
        }
      } catch (_) {
        /* profile clear vẫn chạy */
      }
      try {
        await adminUserAPI.patchProfile(orgId, userId, { jobTitle: '' }, {
          skipGlobalErrorHandling: true,
          skipNotFoundToast: true,
          skipPermissionDeniedToast: true,
        });
      } catch {
        /* hồ sơ chỉ là nhãn hiển thị */
      }
      toast.success(t('adminOrg.posUnassigned'));
      setConfirmUnassign(false);
      setCurrentPositionId('');
      setSelectedPositionId('');
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
        {!userId ? (
          <p className="text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>
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
            disabled={saving || !userId || (mode === 'existing' ? !selectedPositionId : !jobTitle)}
            className={adminPrimaryBtnClass()}
          >
            {saving ? t('common.saving') : t('adminDomains.rbac.posAssign')}
          </button>
          <button
            type="button"
            disabled={saving || !userId || !currentTitle}
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
        message={t('adminOrg.posUnassignConfirm', { name: currentTitle, user: memberName })}
        confirmText={t('adminOrg.posUnassignFromMember')}
        cancelText={t('common.cancel')}
      />
    </>
  );

  if (embedded) return body;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.posAssign')} wide>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start">
        <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminOrg.posAssignUserHint')} />
        {body}
      </div>
    </AdminUserPanelShell>
  );
}

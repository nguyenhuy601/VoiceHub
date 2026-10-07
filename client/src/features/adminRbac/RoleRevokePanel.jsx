import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import AdminUserPicker from '../../components/adminUsers/AdminUserPicker';
import { ConfirmDialog, GradientButton } from '../../components/Shared';
import roleAPI from '../../services/api/roleAPI';
import useAdminRoles from '../../hooks/useAdminRoles';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { notifyRbacGrantsChanged } from '../../utils/rbacV2Ui';
import {
  assignedRoleIdFromRow,
  isStructuralRole,
  normalizeRoleDisplayName,
  unwrapUserRoleList,
} from '../../utils/adminRbacUtils';
import {
  AdminListSkeleton,
} from '../../components/adminUsers/adminPanelStates';

function resolveAssignedRole(row, rolesById) {
  const rid = assignedRoleIdFromRow(row);
  const role =
    rolesById.get(rid) ||
    (row?.role && typeof row.role === 'object' ? row.role : null) ||
    row ||
    { name: rid };
  return { rid, role };
}

export default function RoleRevokePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const [searchParams] = useSearchParams();
  const userId = String(searchParams.get('userId') || '').trim();
  const { rolesById, loadRoles } = useAdminRoles(orgId);
  const [assigned, setAssigned] = useState([]);
  const [busyId, setBusyId] = useState('');
  const [hierarchyConfirm, setHierarchyConfirm] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(orgId && userId));
  const [loadError, setLoadError] = useState('');
  const loadGenRef = useRef(0);

  const loadAssigned = useCallback(async () => {
    const gen = ++loadGenRef.current;
    if (!orgId || !userId) {
      setAssigned([]);
      setLoading(false);
      setLoadError('');
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await roleAPI.getUserRoles(userId, orgId);
      if (gen !== loadGenRef.current) return;
      setAssigned(unwrapUserRoleList(res));
    } catch (error) {
      if (gen !== loadGenRef.current) return;
      setAssigned([]);
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.loadFail') }));
    } finally {
      if (gen === loadGenRef.current) setLoading(false);
    }
  }, [orgId, userId, t]);

  useEffect(() => {
    loadRoles();
    loadAssigned();
  }, [loadRoles, loadAssigned]);

  useEffect(() => {
    const onPageShow = () => loadAssigned();
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [loadAssigned]);

  const { packRoles, hierarchyRoles } = useMemo(() => {
    const pack = [];
    const hierarchy = [];
    for (const row of assigned) {
      const { rid, role } = resolveAssignedRole(row, rolesById);
      if (!rid) continue;
      if (isStructuralRole(role)) hierarchy.push({ rid, role, row });
      else pack.push({ rid, role, row });
    }
    return { packRoles: pack, hierarchyRoles: hierarchy };
  }, [assigned, rolesById]);

  const requestRevoke = (rid, role, { hierarchy = false } = {}) => {
    if (!orgId || !userId || !rid || busyId) return;
    if (hierarchy) {
      setHierarchyConfirm({ rid, label: normalizeRoleDisplayName(role?.name || rid) });
      return;
    }
    revoke(rid);
  };

  const revoke = async (rid, { hierarchy = false } = {}) => {
    if (!orgId || !userId || !rid || busyId) return;
    setBusyId(rid);
    try {
      await roleAPI.removeRoleFromUser(rid, userId, orgId);
      toast.success(
        hierarchy ? t('adminRbac.revokedHierarchy') : t('adminRbac.revoked')
      );
      await loadAssigned();
      notifyRbacGrantsChanged();
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.revokeFail') }));
    } finally {
      setBusyId('');
    }
  };

  const renderRoleRow = (item, { hierarchy = false } = {}) => (
    <li
      key={item.rid}
      className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
    >
      <span>{normalizeRoleDisplayName(item.role?.name || item.rid)}</span>
      <GradientButton
        type="button"
        variant="secondary"
        disabled={Boolean(busyId)}
        onClick={() => requestRevoke(item.rid, item.role, { hierarchy })}
      >
        {hierarchy ? t('adminRbac.revokeHierarchyAction') : t('adminRbac.revokeAction')}
      </GradientButton>
    </li>
  );

  const hasAny = packRoles.length > 0 || hierarchyRoles.length > 0;

  const renderAssignedBody = () => {
    if (!userId) {
      return <p className="mt-4 text-sm text-muted-foreground">{t('adminUsers.selectUserFirst')}</p>;
    }
    if (loading) {
      return <AdminListSkeleton className="mt-4" />;
    }
    if (loadError) {
      return (
        <div className="mt-4 space-y-3">
          <p className="rounded-lg border border-destructive px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
          <GradientButton type="button" variant="secondary" onClick={() => loadAssigned()}>
            {t('common.retry')}
          </GradientButton>
        </div>
      );
    }
    if (!hasAny) {
      return <p className="mt-4 text-sm text-muted-foreground">{t('adminRbac.noAssignedRoles')}</p>;
    }
    return (
      <div className="mt-4 space-y-4">
        {packRoles.length > 0 && (
          <ul className="space-y-2">
            {packRoles.map((item) => renderRoleRow(item))}
          </ul>
        )}
        {hierarchyRoles.length > 0 && (
          <div className="space-y-2 rounded-lg border border-warning bg-warning-bg p-3">
            <p className="text-sm font-medium text-foreground">
              {t('adminRbac.revokeHierarchySection')}
            </p>
            <p className="text-xs text-muted-foreground">{t('adminRbac.revokeHierarchyHint')}</p>
            <ul className="space-y-2">
              {hierarchyRoles.map((item) => renderRoleRow(item, { hierarchy: true }))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const body = (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-lg font-semibold">{t('adminDomains.rbac.revoke')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('adminRbac.revokeHint')}</p>
      {renderAssignedBody()}
      <ConfirmDialog
        isOpen={Boolean(hierarchyConfirm)}
        onClose={() => setHierarchyConfirm(null)}
        onConfirm={() => revoke(hierarchyConfirm?.rid, { hierarchy: true })}
        variant="danger"
        title={t('adminTasks.confirmTitle')}
        message={t('adminRbac.revokeHierarchyConfirm', { name: hierarchyConfirm?.label || '' })}
        confirmText={t('adminRbac.revokeHierarchyAction')}
        cancelText={t('common.cancel')}
      />
    </div>
  );

  if (embedded) return body;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <AdminUserPicker orgId={orgId} selectedUserId={userId} hint={t('adminRbac.revokePickerHint')} />
      {body}
    </div>
  );
}

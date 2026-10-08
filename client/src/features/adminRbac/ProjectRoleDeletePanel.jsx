import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import ConfirmDialog from '../../components/Shared/ConfirmDialog';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRolesAPI } from '../../services/api/projectRolesAPI';

export default function ProjectRoleDeletePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = async () => {
    if (!orgId || !roleId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectRolesAPI.listRoles(orgId);
      const list = res?.data?.data || res?.data?.roles || res?.data || [];
      setRole(list.find((r) => String(r._id || r.id) === roleId) || null);
    } catch (error) {
      setRole(null);
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId, roleId]);

  const del = async () => {
    if (!orgId || !roleId || !role || role.isSystem || busy) return;
    setBusy(true);
    try {
      await projectRolesAPI.deleteRole(orgId, roleId);
      toast.success(t('common.deleteSuccess'));
      navigate('/app/admin/rbac/project-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.deleteFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    const loadingBody = <AdminListSkeleton />;
    if (embedded) return loadingBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
        {loadingBody}
      </AdminUserPanelShell>
    );
  }

  if (!role) {
    const notFoundBody = loadError ? (
      <AdminLoadErrorState message={loadError} onRetry={() => load()} />
    ) : (
      <p className="text-sm text-muted-foreground">{t('adminRbac.notFound')}</p>
    );
    if (embedded) return notFoundBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
        {notFoundBody}
      </AdminUserPanelShell>
    );
  }

  const formCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.projectRoleDelete')}>
      <div className="rounded-lg border border-border bg-muted p-3 text-sm">
        <div className="font-medium">
          {t('adminRbac.colKey')}: {role.key}
        </div>
        <div className="mt-1">{role.label}</div>
        {role.isSystem ? (
          <div className="mt-2 text-xs text-warning">
            {t('adminRbac.systemBadge')} - {t('adminRbac.orgRoleEditSystemHint')}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={role.isSystem || busy}
          aria-busy={busy || undefined}
          className={adminDangerBtnClass()}
          onClick={() => setConfirmOpen(true)}
        >
          <AdminBusySpinner busy={busy} />
          {busy ? t('common.deleting') : t('adminDomains.rbac.delete')}
        </button>
        <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/project-roles')}>
          {t('common.cancel')}
        </button>
      </div>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={del}
        variant="danger"
        title={t('adminRbac.projectRoleDeleteConfirmTitle', { name: role.label || role.key })}
        message={t('adminRbac.projectRoleDeleteConfirmMessage')}
        confirmText={t('adminDomains.rbac.delete')}
        cancelText={t('common.cancel')}
      />
    </AdminUserFormCard>
  );

  if (embedded) return formCard;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {formCard}
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t('adminRbac.projectRoleDeleteWarning')}</p>
          <p className="mt-1">
            {t('adminRbac.projectRoleDeleteWarningBody')}
          </p>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}


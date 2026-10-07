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
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

export default function OrgRoleDeletePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadRole = async () => {
    if (!orgId || !roleId) {
      setRole(null);
      setLoadError('');
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const roles = res?.data?.roles || [];
      setRole(roles.find((r) => String(r._id || r.id) === roleId) || null);
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
      toast.error(msg);
      setLoadError(msg);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRole();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, roleId]);

  const del = async () => {
    if (!orgId || !roleId || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await orgRoleCatalogAPI.deleteCatalog(orgId, roleId);
      toast.success(t('common.deleteSuccess'));
      navigate('/app/admin/rbac/org-roles');
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.deleteFail') });
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    const loadingBody = <AdminListSkeleton />;
    if (embedded) return loadingBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleDelete')} hint={t('adminRbac.orgRoleDeleteHint')}>
        {loadingBody}
      </AdminUserPanelShell>
    );
  }

  if (!roleId || loadError || !role) {
    const emptyBody = !roleId ? (
      <p className="text-sm text-muted-foreground">{t('adminRbac.selectRole')}</p>
    ) : loadError ? (
      <AdminLoadErrorState message={loadError} disabled={busy} onRetry={() => loadRole()} />
    ) : (
      <p className="text-sm text-muted-foreground">{t('adminRbac.notFound')}</p>
    );
    if (embedded) return emptyBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleDelete')} hint={t('adminRbac.orgRoleDeleteHint')}>
        {emptyBody}
      </AdminUserPanelShell>
    );
  }

  const formCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.orgRoleDelete')}>
      <div className="rounded-lg border border-border bg-muted p-3 text-sm">
        <div>
          <span className="text-muted-foreground">{t('adminDomains.rbac.orgRoleKey')}:</span>{' '}
          <span className="font-medium">{role.key}</span>
        </div>
        <div className="mt-1">
          <span className="text-muted-foreground">{t('adminDomains.rbac.orgRoleLabel')}:</span>{' '}
          <span className="font-medium">{role.label}</span>
        </div>
        {role.isSystem ? (
          <div className="mt-2 text-sm text-warning">
            {t('adminRbac.systemBadge')} - {t('adminRbac.orgRoleEditSystemHint')}
          </div>
        ) : null}
      </div>
      {actionError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {actionError}
        </p>
      ) : null}
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
        <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/org-roles')}>
          {t('common.cancel')}
        </button>
      </div>
      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={del}
        variant="danger"
        title={t('adminRbac.orgRoleDeleteConfirmTitle', { name: role.label || role.key })}
        message={t('adminRbac.orgRoleDeleteConfirmMessage')}
        confirmText={t('adminDomains.rbac.delete')}
        cancelText={t('common.cancel')}
      />
    </AdminUserFormCard>
  );

  if (embedded) return formCard;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleDelete')} hint={t('adminRbac.orgRoleDeleteHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {formCard}
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t('adminRbac.orgRoleDeleteWarning')}</p>
          <p className="mt-1">
            {t('adminRbac.orgRoleDeleteWarningBody')}
          </p>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}


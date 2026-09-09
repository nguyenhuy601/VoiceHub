import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
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
    const loadingBody = <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
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
      <div className="space-y-3">
        <p className="rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
        <button type="button" className={adminPrimaryBtnClass()} disabled={busy} onClick={() => loadRole()}>
          {t('adminRbac.retry')}
        </button>
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">{t('adminRbac.notFound') || 'Not found'}</p>
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
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <div>
          <span className="text-muted-foreground">Key:</span> <span className="font-medium">{role.key}</span>
        </div>
        <div className="mt-1">
          <span className="text-muted-foreground">Label:</span> <span className="font-medium">{role.label}</span>
        </div>
        {role.isSystem ? (
          <div className="mt-2 text-sm text-emerald-700">
            {t('common.system') || 'System'} - {t('adminRbac.orgRoleEditSystemHint') || 'Cannot delete.'}
          </div>
        ) : null}
      </div>
      {actionError ? <p className="mt-3 text-sm text-destructive">{actionError}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={role.isSystem || busy} className={adminDangerBtnClass()} onClick={del}>
          {busy ? t('common.deleting') : t('adminDomains.rbac.delete')}
        </button>
        <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/org-roles')}>
          {t('common.cancel') || 'Cancel'}
        </button>
      </div>
    </AdminUserFormCard>
  );

  if (embedded) return formCard;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.orgRoleDelete')} hint={t('adminRbac.orgRoleDeleteHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {formCard}
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t('adminRbac.orgRoleDeleteWarning') || 'Warning'}</p>
          <p className="mt-1">
            {t('adminRbac.orgRoleDeleteWarningBody') ||
              'Nếu role đang được gán cho user, hệ thống sẽ chặn xóa để tránh mất dữ liệu.'}
          </p>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}


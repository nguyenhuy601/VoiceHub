import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';

export default function ProjectRoleDeletePanel({ orgId, embedded = false }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!orgId || !roleId) return;
    setLoading(true);
    try {
      const res = await projectRoleAdminAPI.listRoles(orgId);
      const list = res?.data?.data || res?.data?.roles || res?.data || [];
      setRole(list.find((r) => String(r._id || r.id) === roleId) || null);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, roleId]);

  const del = async () => {
    if (!orgId || !roleId || !role || role.isSystem || busy) return;
    setBusy(true);
    try {
      await projectRoleAdminAPI.deleteRole(orgId, roleId);
      toast.success(t('common.deleteSuccess'));
      navigate('/app/admin/rbac/project-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.deleteFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    const loadingBody = <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
    if (embedded) return loadingBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
        {loadingBody}
      </AdminUserPanelShell>
    );
  }

  if (!role) {
    const notFoundBody = <p className="text-sm text-muted-foreground">{t('adminRbac.notFound') || 'Not found'}</p>;
    if (embedded) return notFoundBody;
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
        {notFoundBody}
      </AdminUserPanelShell>
    );
  }

  const formCard = (
    <AdminUserFormCard title={t('adminDomains.rbac.projectRoleDelete')}>
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <div className="font-medium">Key: {role.key}</div>
        <div className="mt-1">{role.label}</div>
        {role.isSystem ? <div className="mt-2 text-xs text-emerald-700">System role</div> : null}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" disabled={role.isSystem || busy} className={adminDangerBtnClass()} onClick={del}>
          {busy ? t('common.deleting') : t('adminDomains.rbac.delete')}
        </button>
        <button type="button" disabled={busy} className={adminSecondaryBtnClass()} onClick={() => navigate('/app/admin/rbac/project-roles')}>
          {t('common.cancel') || 'Cancel'}
        </button>
      </div>
    </AdminUserFormCard>
  );

  if (embedded) return formCard;

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleDelete')} hint={t('adminRbac.projectRoleDeleteHint')}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {formCard}
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t('adminRbac.projectRoleDeleteWarning') || 'Warning'}</p>
          <p className="mt-1">
            {t('adminRbac.projectRoleDeleteWarningBody') || 'System roles or roles in use cannot be deleted.'}
          </p>
        </div>
      </div>
    </AdminUserPanelShell>
  );
}


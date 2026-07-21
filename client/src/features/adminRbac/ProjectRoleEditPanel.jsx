import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminLabelClass,
  adminPrimaryBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';

export default function ProjectRoleEditPanel({ orgId }) {
  const { t } = useAppStrings();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roleId = useMemo(() => String(searchParams.get('roleId') || '').trim(), [searchParams]);

  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [label, setLabel] = useState('');
  const [canAssign, setCanAssign] = useState(false);
  const [sortOrder, setSortOrder] = useState(100);

  const load = async () => {
    if (!orgId || !roleId) return;
    setLoading(true);
    try {
      const res = await projectRoleAdminAPI.listRoles(orgId);
      const list = res?.data?.data || res?.data?.roles || res?.data || [];
      const found = list.find((r) => String(r._id || r.id) === roleId);
      setRole(found || null);
      setLabel(found?.label || '');
      setCanAssign(Boolean(found?.canAssign));
      setSortOrder(Number(found?.sortOrder || 100));
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

  const submit = async () => {
    if (!orgId || !roleId || !role || role.isSystem || busy) return;
    setBusy(true);
    try {
      await projectRoleAdminAPI.updateRole(orgId, roleId, { label, canAssign, sortOrder });
      toast.success(t('common.saveSuccess'));
      navigate('/app/admin/rbac/project-roles');
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleEdit')} hint={t('common.loading')}>
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      </AdminUserPanelShell>
    );
  }

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.projectRoleEdit')} hint={t('adminRbac.projectRoleCatalogHint')}>
      <div className="max-w-xl">
        <AdminUserFormCard title={t('adminDomains.rbac.projectRoleEdit')}>
          {!role ? (
            <p className="text-sm text-muted-foreground">{t('adminRbac.notFound') || 'Not found'}</p>
          ) : (
            <>
              <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <div className="font-medium">Key: {role.key}</div>
                {role.isSystem ? <div className="mt-1 text-xs text-emerald-700">System</div> : null}
              </div>

              <label className="mb-4 block">
                <span className={adminLabelClass()}>{t('adminTasks.roleLabel') || 'Label'}</span>
                <input className={adminInputClass()} value={label} onChange={(e) => setLabel(e.target.value)} disabled={role.isSystem} />
              </label>

              <label className="mb-4 flex items-start gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="mt-1 rounded border-border"
                  checked={canAssign}
                  onChange={(e) => setCanAssign(e.target.checked)}
                  disabled={role.isSystem}
                />
                <span className="text-muted-foreground">{t('adminTasks.canAssign') || 'Can assign'}</span>
              </label>

              <label className="mb-2 block">
                <span className={adminLabelClass()}>{t('adminRbac.sortOrder') || 'Sort order'}</span>
                <input
                  className={adminInputClass()}
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(Number(e.target.value))}
                  disabled={role.isSystem}
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" disabled={busy || role.isSystem || !label.trim()} className={adminPrimaryBtnClass()} onClick={submit}>
                  {busy ? t('common.saving') : t('common.save')}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className={adminSecondaryBtnClass()}
                  onClick={() => navigate('/app/admin/rbac/project-roles')}
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
              </div>
            </>
          )}
        </AdminUserFormCard>
      </div>
    </AdminUserPanelShell>
  );
}


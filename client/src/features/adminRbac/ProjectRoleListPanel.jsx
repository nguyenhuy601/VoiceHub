import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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

export default function ProjectRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectRoleAdminAPI.listRoles(orgId);
      setRoles(res?.data?.data || res?.data?.roles || res?.data || []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.sectionProjectRoles')} hint={t('adminRbac.projectRoleCatalogHint')} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('adminRbac.projectRoleCatalogResolve')}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/project-roles/create" className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.projectRoleCreate')}
          </Link>
        </div>
      </div>

      <AdminUserFormCard title={t('adminDomains.rbac.projectRoleCatalog')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">{t('adminDomains.rbac.projectRoleLabel') || 'Label'}</th>
                  <th className="px-3 py-2">{t('adminTasks.canAssign') || 'canAssign'}</th>
                  <th className="px-3 py-2">{t('adminDomains.rbac.type') || 'Type'}</th>
                  <th className="px-3 py-2">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {roles
                  .slice()
                  .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
                  .map((role) => (
                    <tr key={role._id || role.id} className="border-b border-border/50">
                      <td className="px-3 py-2">
                        <span className="font-medium">{role.key}</span>
                        {role.isSystem ? (
                          <span className="ml-2 rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">
                            System
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{role.label}</td>
                      <td className="px-3 py-2">
                        {role.canAssign ? <span className="text-emerald-600">Yes</span> : <span className="text-muted-foreground">No</span>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">Organization</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-2">
                          {!role.isSystem ? (
                            <>
                              <Link
                                to={`/app/admin/rbac/project-roles/edit?roleId=${encodeURIComponent(role._id || role.id)}`}
                                className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                              >
                                {t('adminDomains.rbac.edit')}
                              </Link>
                              <Link
                                to={`/app/admin/rbac/project-roles/delete?roleId=${encodeURIComponent(role._id || role.id)}`}
                                className={adminDangerBtnClass('!px-2 !py-1 text-xs')}
                              >
                                {t('adminDomains.rbac.delete')}
                              </Link>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">System</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                {!roles.length ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {t('adminRbac.projectRoleCatalogEmpty') || 'No roles'}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </AdminUserFormCard>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/app/admin/rbac/project-roles/board" className={adminSecondaryBtnClass()}>
          {t('adminDomains.rbac.projectRoleBoard')}
        </Link>
      </div>
    </AdminUserPanelShell>
  );
}


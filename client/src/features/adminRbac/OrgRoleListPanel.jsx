import { useEffect, useMemo, useState } from 'react';
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
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';

function SystemBadge({ isSystem }) {
  if (!isSystem) return null;
  return <span className="ml-2 rounded bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-700">System</span>;
}

export default function OrgRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      setRoles(res?.data?.roles || res?.data?.data?.roles || []);
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

  const nonSystemRoles = useMemo(() => roles.filter((r) => !r.isSystem), [roles]);

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.sectionOrgRoles')} hint={t('adminRbac.orgRoleCatalogHint')} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('adminRbac.orgRoleCatalogResolve')}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/org-roles/create" className={adminSecondaryBtnClass()}>
            {t('adminDomains.rbac.orgRoleCreate')}
          </Link>
        </div>
      </div>

      <AdminUserFormCard title={t('adminDomains.rbac.orgRoleCatalog')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">{t('adminOrg.colActions')}</th>
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role._id || role.id} className="border-b border-border/50">
                    <td className="px-3 py-2">
                      <span className="font-medium">{role.key}</span>
                      <SystemBadge isSystem={role.isSystem} />
                    </td>
                    <td className="px-3 py-2">{role.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{role.description || ''}</td>
                    <td className="px-3 py-2 text-muted-foreground">Organization</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {!role.isSystem ? (
                          <>
                            <Link
                              to={`/app/admin/rbac/org-roles/edit?roleId=${encodeURIComponent(role._id || role.id)}`}
                              className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                            >
                              {t('adminDomains.rbac.edit')}
                            </Link>
                            <Link
                              to={`/app/admin/rbac/org-roles/delete?roleId=${encodeURIComponent(role._id || role.id)}`}
                              className={adminDangerBtnClass('!px-2 !py-1 text-xs')}
                            >
                              {t('adminDomains.rbac.delete')}
                            </Link>
                            <Link
                              to={`/app/admin/rbac/org-roles/assign?roleId=${encodeURIComponent(role._id || role.id)}`}
                              className={adminSecondaryBtnClass('!px-2 !py-1 text-xs')}
                            >
                              {t('adminDomains.rbac.orgRoleAssign')}
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
                      {t('adminRbac.orgRoleDirectoryEmpty')}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {!nonSystemRoles.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t('adminRbac.orgRoleCatalogResolve')}
              </p>
            ) : null}
          </div>
        )}
      </AdminUserFormCard>

      <div className="mt-4 flex flex-wrap gap-2">
        <Link to="/app/admin/rbac/org-roles/directory" className={adminSecondaryBtnClass()}>
          {t('adminDomains.rbac.orgRoleDirectory')}
        </Link>
        <Link to="/app/admin/rbac/org-roles/lookup" className={adminSecondaryBtnClass()}>
          {t('adminDomains.rbac.orgRoleLookup')}
        </Link>
      </div>
    </AdminUserPanelShell>
  );
}


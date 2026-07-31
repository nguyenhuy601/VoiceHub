import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminDangerBtnClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import AdminSortableRoleList, {
  ADMIN_ROLE_LIST_GRID,
} from '../../components/adminUsers/AdminSortableRoleList';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { reorderItemsByIds } from '../../utils/adminSortOrder';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { hasLayerPrefix } from '../../utils/roleLayerNaming';

function SystemBadge({ isSystem }) {
  if (!isSystem) return null;
  return <span className="ml-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">System</span>;
}

const actionBtn = '!px-2 !py-1 text-xs whitespace-nowrap';

export default function OrgRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const list = res?.data?.roles || res?.data?.data?.roles || [];
      setRoles(
        [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      );
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

  const onReorder = async (orderedIds) => {
    if (!orgId || reordering) return;
    const prev = roles;
    setRoles(reorderItemsByIds(roles, orderedIds));
    setReordering(true);
    try {
      const res = await orgRoleCatalogAPI.reorderCatalog(orgId, orderedIds);
      const next = res?.data?.roles || res?.data?.data?.roles || [];
      if (Array.isArray(next) && next.length) {
        setRoles(next);
      }
    } catch (error) {
      setRoles(prev);
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('common.saveFail') }));
    } finally {
      setReordering(false);
    }
  };

  return (
    <AdminUserPanelShell title={t('adminDomains.rbac.sectionOrgRoles')} hint={t('adminRbac.orgRoleCatalogHint')} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('adminRbac.roleListDragHint')}</p>
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
          <>
            <AdminSortableRoleList
              items={roles}
              disabled={reordering}
              emptyLabel={t('adminRbac.orgRoleDirectoryEmpty')}
              onReorder={onReorder}
              gridClassName={ADMIN_ROLE_LIST_GRID}
              headerCells={
                <>
                  <span>Key</span>
                  <span>{t('adminRbac.roleLabelField')}</span>
                  <span>{t('adminRbac.roleDescriptionField')}</span>
                  <span className="text-right">{t('adminOrg.colActions')}</span>
                </>
              }
              renderCells={(role) => (
                <>
                  <div className="min-w-0 self-center text-sm">
                    <span className="break-all font-medium">{role.key}</span>
                    <SystemBadge isSystem={role.isSystem} />
                  </div>
                  <div className="min-w-0 self-center text-sm">
                    <div className="truncate" title={role.label}>
                      {role.label}
                    </div>
                    {!hasLayerPrefix(role.label, 'org') ? (
                      <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                        {t('adminRbac.listLegacyNameHint')}
                      </div>
                    ) : null}
                  </div>
                  <div
                    className="min-w-0 self-center truncate text-sm text-muted-foreground"
                    title={role.description || ''}
                  >
                    {role.description || '—'}
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5 self-center">
                    {!role.isSystem ? (
                      <>
                        <Link
                          to={`/app/admin/rbac/org-roles/edit?roleId=${encodeURIComponent(role._id || role.id)}`}
                          className={adminSecondaryBtnClass(actionBtn)}
                        >
                          {t('adminRbac.edit')}
                        </Link>
                        <Link
                          to={`/app/admin/rbac/org-roles/delete?roleId=${encodeURIComponent(role._id || role.id)}`}
                          className={adminDangerBtnClass(actionBtn)}
                        >
                          {t('adminRbac.delete')}
                        </Link>
                        <Link
                          to={`/app/admin/rbac/org-roles/assign?roleId=${encodeURIComponent(role._id || role.id)}`}
                          className={adminSecondaryBtnClass(actionBtn)}
                        >
                          {t('adminRbac.roleActionAssign')}
                        </Link>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">System</span>
                    )}
                  </div>
                </>
              )}
            />
            {!nonSystemRoles.length && roles.length ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('adminRbac.orgRoleCatalogResolve')}</p>
            ) : null}
          </>
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

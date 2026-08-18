import { useEffect, useState } from 'react';
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
import { projectRoleAdminAPI } from '../../services/api/projectRoleAdminAPI';
import { hasLayerPrefix } from '../../utils/roleLayerNaming';
import { adminRoleHubLink } from '../../utils/adminHubLinks';

const PROJECT_ROLE_MANAGE_HUB = '/app/admin/rbac/project-roles/manage';

const PROJECT_ROLE_LIST_GRID =
  'grid-cols-[2rem_minmax(6.5rem,1.2fr)_minmax(5.5rem,1fr)_minmax(4rem,5.5rem)_minmax(10rem,13rem)]';

const actionBtn = '!px-2 !py-1 text-xs whitespace-nowrap';

export default function ProjectRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reordering, setReordering] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectRoleAdminAPI.listRoles(orgId);
      const list = res?.data?.data || res?.data?.roles || res?.data || [];
      setRoles(
        [...(Array.isArray(list) ? list : [])].sort(
          (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
        )
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

  const onReorder = async (orderedIds) => {
    if (!orgId || reordering) return;
    const prev = roles;
    setRoles(reorderItemsByIds(roles, orderedIds));
    setReordering(true);
    try {
      const res = await projectRoleAdminAPI.reorderRoles(orgId, orderedIds);
      const next = res?.data?.data || res?.data?.roles || res?.data || [];
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
    <AdminUserPanelShell title={t('adminDomains.rbac.sectionProjectRoles')} hint={t('adminRbac.projectRoleCatalogHint')} wide>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('adminRbac.roleListDragHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Link to="/app/admin/rbac/master-data" className={adminSecondaryBtnClass()}>
            {t('adminRbac.masterDataTitle')}
          </Link>
        </div>
      </div>

      <AdminUserFormCard title={t('adminDomains.rbac.projectRoleCatalog')}>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : (
          <AdminSortableRoleList
            items={roles}
            disabled={reordering}
            emptyLabel={t('adminRbac.projectRoleCatalogEmpty') || 'No roles'}
            onReorder={onReorder}
            gridClassName={PROJECT_ROLE_LIST_GRID || ADMIN_ROLE_LIST_GRID}
            headerCells={
              <>
                <span>Key</span>
                <span>{t('adminRbac.roleLabelField')}</span>
                <span>{t('adminRbac.canAssignField')}</span>
                <span className="text-right">{t('adminOrg.colActions')}</span>
              </>
            }
            renderCells={(role) => (
              <>
                <div className="min-w-0 self-center text-sm">
                  <span className="break-all font-medium">{role.key}</span>
                  {role.isSystem ? (
                    <span className="ml-1.5 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-700">
                      System
                    </span>
                  ) : null}
                  {role.legacyOutsideMaster ? (
                    <span className="ml-1.5 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300">
                      Legacy
                    </span>
                  ) : role.enabled === true || role.isSystem ? (
                    <span className="ml-1.5 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-300">
                      Enabled
                    </span>
                  ) : null}
                </div>
                <div className="min-w-0 self-center text-sm">
                  <div className="truncate" title={role.label}>
                    {role.label}
                  </div>
                  {role.legacyOutsideMaster ? (
                    <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                      {t('adminRbac.legacyOutsideMasterHint')}
                    </div>
                  ) : !hasLayerPrefix(role.label, 'project') ? (
                    <div className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">
                      {t('adminRbac.listLegacyNameHint')}
                    </div>
                  ) : null}
                </div>
                <div className="self-center text-sm">
                  {role.canAssign ? (
                    <span className="text-emerald-600">Yes</span>
                  ) : (
                    <span className="text-muted-foreground">No</span>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-1.5 self-center">
                  <Link
                    to={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, role._id || role.id, 'edit')}
                    className={adminSecondaryBtnClass(actionBtn)}
                    aria-label={`${t('adminRbac.projectRolePermAction')}: ${role.label || role.key}`}
                  >
                    {t('adminRbac.projectRolePermAction')}
                  </Link>
                  {!role.isSystem ? (
                    <>
                      <Link
                        to={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, role._id || role.id, 'edit')}
                        className={adminSecondaryBtnClass(actionBtn)}
                      >
                        {t('adminRbac.edit')}
                      </Link>
                      <Link
                        to={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, role._id || role.id, 'delete')}
                        className={adminDangerBtnClass(actionBtn)}
                      >
                        {t('adminRbac.delete')}
                      </Link>
                    </>
                  ) : null}
                </div>
              </>
            )}
          />
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

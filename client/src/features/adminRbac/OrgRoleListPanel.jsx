import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

import {
  AdminDenseMobileList,
  AdminUserFormCard,
  AdminUserPanelShell,
  adminManageLinkClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import AdminSortableRoleList, {
  ADMIN_ROLE_LIST_GRID,
} from '../../components/adminUsers/AdminSortableRoleList';
import { useAppStrings } from '../../locales/appStrings';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { reorderItemsByIds } from '../../utils/adminSortOrder';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { hasLayerPrefix } from '../../utils/roleLayerNaming';
import { adminRoleHubLink } from '../../utils/adminHubLinks';
import useCompanyAdminAccess from '../../hooks/useCompanyAdminAccess';
import { useEffectiveMasterGrants } from '../../hooks/useEffectiveMasterGrants';
import { RBAC_GRANT, canActWithGrant } from '../../config/rbacUiGrantMap';

const ORG_ROLE_MANAGE_HUB = '/app/admin/rbac/org-roles/manage';

function SystemBadge({ isSystem, label }) {
  if (!isSystem) return null;
  return <span className="ml-1.5 rounded bg-success-bg px-1.5 py-0.5 text-[10px] text-success">{label}</span>;
}

function EnabledBadge({ role, enabledLabel, legacyLabel }) {
  if (role.legacyOutsideMaster) {
    return (
      <span className="ml-1.5 rounded bg-warning-bg px-1.5 py-0.5 text-[10px] text-warning">
        {legacyLabel}
      </span>
    );
  }
  if (role.enabled === true || role.isSystem) {
    return (
      <span className="ml-1.5 rounded bg-primary-subtle px-1.5 py-0.5 text-[10px] text-primary">
        {enabledLabel}
      </span>
    );
  }
  return null;
}

export default function OrgRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const { isFullAccess } = useCompanyAdminAccess();
  const { hasGrant } = useEffectiveMasterGrants(orgId);
  const canUpdateOrgRole = canActWithGrant(isFullAccess, hasGrant, RBAC_GRANT.ORG_ROLE_UPDATE);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reordering, setReordering] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await orgRoleCatalogAPI.listCatalog(orgId);
      const list = res?.data?.roles || res?.data?.data?.roles || [];
      setRoles(
        [...list].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      );
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
      toast.error(msg);
      setLoadError(msg);
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
    if (!canUpdateOrgRole) {
      toast.error(t('adminOrg.grantDenied'));
      return;
    }
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
          <Link to="/app/admin/rbac/master-data" className={adminSecondaryBtnClass()}>
            {t('adminRbac.masterDataTitle')}
          </Link>
        </div>
      </div>

      <AdminUserFormCard title={t('adminDomains.rbac.orgRoleCatalog')}>
        {loading && !roles.length ? (
          <AdminListSkeleton />
        ) : loadError ? (
          <AdminLoadErrorState message={loadError} onRetry={() => load()} />
        ) : !roles.length ? (
          <AdminEmptyState message={t('adminRbac.orgRoleDirectoryEmpty')} />
        ) : (
          <>
            <AdminDenseMobileList
              items={roles}
              getKey={(role) => String(role._id || role.id || role.key)}
              ariaLabel={t('adminDomains.rbac.orgRoleCatalog')}
              renderTitle={(role) => role.label || role.key}
              renderMeta={(role) =>
                [role.key, role.isSystem ? t('adminRbac.systemBadge') : null, role.description || null]
                  .filter(Boolean)
                  .join(' · ')
              }
              renderActions={
                canUpdateOrgRole
                  ? (role) =>
                      role.isSystem ? null : (
                        <Link
                          to={adminRoleHubLink(ORG_ROLE_MANAGE_HUB, role._id || role.id, 'edit')}
                          className={adminManageLinkClass()}
                        >
                          {t('adminDomains.rbac.orgRoleManageHub')}
                        </Link>
                      )
                  : undefined
              }
            />
            <div className="hidden md:block" aria-busy={loading || reordering}>
            <AdminSortableRoleList
              items={roles}
              disabled={reordering || !canUpdateOrgRole}
              emptyLabel={t('adminRbac.orgRoleDirectoryEmpty')}
              onReorder={onReorder}
              gridClassName={ADMIN_ROLE_LIST_GRID}
              headerCells={
                <>
                  <span>{t('adminRbac.roleKeyField')}</span>
                  <span>{t('adminRbac.roleLabelField')}</span>
                  <span>{t('adminRbac.roleDescriptionField')}</span>
                  <span className="text-right">{t('adminOrg.colActions')}</span>
                </>
              }
              renderCells={(role) => (
                <>
                  <div className="min-w-0 self-center text-sm">
                    <span className="break-all font-medium">{role.key}</span>
                    <SystemBadge isSystem={role.isSystem} label={t('adminRbac.systemBadge')} />
                    <EnabledBadge
                      role={role}
                      enabledLabel={t('adminRbac.enabledBadge')}
                      legacyLabel={t('adminRbac.legacyBadge')}
                    />
                  </div>
                  <div className="min-w-0 self-center text-sm">
                    <div className="truncate" title={role.label}>
                      {role.label}
                    </div>
                    {role.legacyOutsideMaster ? (
                      <div className="mt-0.5 text-[10px] text-warning">
                        {t('adminRbac.legacyOutsideMasterHint')}
                      </div>
                    ) : !hasLayerPrefix(role.label, 'org') ? (
                      <div className="mt-0.5 text-[10px] text-warning">
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
                  <div className="flex justify-end self-center">
                    {role.isSystem ? (
                      <span className="text-xs text-muted-foreground">{t('adminRbac.systemBadge')}</span>
                    ) : canUpdateOrgRole ? (
                      <Link
                        to={adminRoleHubLink(ORG_ROLE_MANAGE_HUB, role._id || role.id, 'edit')}
                        className={adminManageLinkClass('whitespace-nowrap')}
                      >
                        {t('adminDomains.rbac.orgRoleManageHub')}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                </>
              )}
            />
            </div>
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

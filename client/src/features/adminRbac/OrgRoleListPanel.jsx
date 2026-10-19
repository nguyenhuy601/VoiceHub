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
import { splitLayerLabel } from '../../utils/roleLayerNaming';
import { canonicalizeOrgRoleLabel } from '../../utils/effectiveOrgRoleLabel';
import {
  filterOrgRoleCatalogRows,
  localizedOrgRoleDescription,
} from '../../utils/orgRoleLocale';
import { adminRoleHubLink } from '../../utils/adminHubLinks';
import { useAdminActionGate } from '../../hooks/useAdminActionGate';
import { RBAC_GRANT } from '../../config/rbacUiGrantMap';

const ORG_ROLE_MANAGE_HUB = '/app/admin/rbac/org-roles/manage';

function orgRoleLabel(role, t) {
  const code = role?.code || role?.key || '';
  const raw = role?.label || role?.name || '';
  const canonical = canonicalizeOrgRoleLabel(code, raw, t);
  if (canonical) return canonical;
  return splitLayerLabel(raw, 'org').suffix || raw;
}

function orgRoleDescription(role, t) {
  const code = role?.code || role?.key || '';
  return localizedOrgRoleDescription(code, role?.description, t) || '';
}

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
  const { can } = useAdminActionGate(orgId);
  const canUpdateOrgRole = can(RBAC_GRANT.ORG_ROLE_UPDATE);
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
  }, [orgId]);

  const visibleRoles = useMemo(() => filterOrgRoleCatalogRows(roles), [roles]);
  const nonSystemRoles = useMemo(() => visibleRoles.filter((r) => !r.isSystem), [visibleRoles]);

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
    <AdminUserPanelShell title={t('adminDomains.rbac.sectionOrgRoles')} wide>
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
        ) : !visibleRoles.length ? (
          <AdminEmptyState message={t('adminRbac.orgRoleDirectoryEmpty')} />
        ) : (
          <>
            <AdminDenseMobileList
              items={visibleRoles}
              getKey={(role) => String(role._id || role.id || role.key)}
              ariaLabel={t('adminDomains.rbac.orgRoleCatalog')}
              renderTitle={(role) => orgRoleLabel(role, t) || role.key}
              renderMeta={(role) =>
                [
                  role.key,
                  role.isSystem ? t('adminRbac.systemBadge') : null,
                  orgRoleDescription(role, t) || null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              }
              renderActions={
                canUpdateOrgRole
                  ? (role) => (
                      <span className="flex flex-wrap gap-2">
                        <Link
                          to={`/app/admin/rbac/org-roles/permissions?roleId=${encodeURIComponent(role._id || role.id)}`}
                          className={adminManageLinkClass()}
                        >
                          {t('adminDomains.rbac.assignRolePermissions')}
                        </Link>
                        {role.isSystem ? null : (
                          <Link
                            to={adminRoleHubLink(ORG_ROLE_MANAGE_HUB, role._id || role.id, 'edit')}
                            className={adminManageLinkClass()}
                          >
                            {t('adminDomains.rbac.orgRoleManageHub')}
                          </Link>
                        )}
                      </span>
                    )
                  : undefined
              }
            />
            <div className="hidden md:block" aria-busy={loading || reordering}>
            <AdminSortableRoleList
              items={visibleRoles}
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
              renderCells={(role) => {
                const label = orgRoleLabel(role, t);
                const description = orgRoleDescription(role, t);
                return (
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
                    <div className="truncate" title={label}>
                      {label}
                    </div>
                  </div>
                  <div
                    className="min-w-0 self-center truncate text-sm text-muted-foreground"
                    title={description || ''}
                  >
                    {description || '—'}
                  </div>
                  <div className="flex justify-end gap-2 self-center">
                    {canUpdateOrgRole ? (
                      <Link
                        to={`/app/admin/rbac/org-roles/permissions?roleId=${encodeURIComponent(role._id || role.id)}`}
                        className={adminManageLinkClass('whitespace-nowrap')}
                      >
                        {t('adminDomains.rbac.assignRolePermissions')}
                      </Link>
                    ) : null}
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
              );
              }}
            />
            </div>
            {!nonSystemRoles.length && visibleRoles.length ? (
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

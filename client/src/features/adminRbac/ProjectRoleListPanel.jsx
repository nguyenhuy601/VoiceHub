import { useEffect, useRef, useState } from 'react';
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
import { projectRolesAPI } from '../../services/api/projectRolesAPI';
import { hasLayerPrefix } from '../../utils/roleLayerNaming';
import { adminRoleHubLink } from '../../utils/adminHubLinks';

const PROJECT_ROLE_MANAGE_HUB = '/app/admin/rbac/project-roles/manage';

const PROJECT_ROLE_LIST_GRID =
  'grid-cols-[2rem_minmax(5.5rem,1fr)_minmax(5.5rem,1.1fr)_minmax(3.5rem,4.5rem)_minmax(4rem,5.5rem)_minmax(8rem,11rem)]';

function RoleRowMoreMenu({ roleName, deleteTo, t }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const itemRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    itemRef.current?.focus();
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className="rounded border border-border px-2 py-0.5 text-xs transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('adminRbac.moreActions')}: ${roleName}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        …
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[9rem] rounded-lg border border-border bg-card py-1 shadow-md motion-safe:animate-fade-in-fast"
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Tab') {
              e.preventDefault();
              close();
            } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
              e.preventDefault();
              itemRef.current?.focus();
            }
          }}
        >
          <Link
            ref={itemRef}
            role="menuitem"
            to={deleteTo}
            className="block px-3 py-1.5 text-xs text-destructive hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            onClick={() => setOpen(false)}
          >
            {t('adminRbac.delete')}
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function roleStatusLabel(role, t) {
  if (role.isSystem) return t('adminRbac.systemBadge');
  if (role.legacyOutsideMaster) return t('adminOrg.legacyBadge');
  if (role.enabled === true) return t('adminOrg.active');
  if (role.enabled === false) return t('adminOrg.inactive');
  return '—';
}

export default function ProjectRoleListPanel({ orgId }) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reordering, setReordering] = useState(false);

  const load = async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectRolesAPI.listRoles(orgId);
      const list = res?.data?.data || res?.data?.roles || res?.data || [];
      setRoles(
        [...(Array.isArray(list) ? list : [])].sort(
          (a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0)
        )
      );
    } catch (error) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
      setLoadError(msg);
      toast.error(msg);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [orgId]);

  const onReorder = async (orderedIds) => {
    if (!orgId || reordering) return;
    const prev = roles;
    setRoles(reorderItemsByIds(roles, orderedIds));
    setReordering(true);
    try {
      const res = await projectRolesAPI.reorderRoles(orgId, orderedIds);
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
        {loading && !roles.length ? (
          <AdminListSkeleton />
        ) : loadError ? (
          <AdminLoadErrorState message={loadError} onRetry={() => load()} />
        ) : !roles.length ? (
          <AdminEmptyState message={t('adminRbac.projectRoleCatalogEmpty')} />
        ) : (
          <>
          <AdminDenseMobileList
            items={roles}
            getKey={(role) => String(role._id || role.id || role.key)}
            ariaLabel={t('adminDomains.rbac.projectRoleCatalog')}
            renderTitle={(role) => role.label || role.key}
            renderMeta={(role) =>
              [role.key, roleStatusLabel(role, t), role.canAssign ? t('adminRbac.canAssignField') : null]
                .filter(Boolean)
                .join(' · ')
            }
            renderActions={(role) => (
              <Link
                to={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, String(role._id || role.id || ''), 'edit')}
                className={adminManageLinkClass()}
              >
                {t('adminDomains.rbac.projectRoleManageHub')}
              </Link>
            )}
          />
          <div className="hidden md:block" aria-busy={loading || reordering}>
          <AdminSortableRoleList
            items={roles}
            disabled={reordering}
            emptyLabel={t('adminRbac.projectRoleCatalogEmpty')}
            onReorder={onReorder}
            gridClassName={PROJECT_ROLE_LIST_GRID || ADMIN_ROLE_LIST_GRID}
            headerCells={
              <>
                <span>{t('adminRbac.colKey')}</span>
                <span>{t('adminRbac.roleLabelField')}</span>
                <span>{t('adminRbac.canAssignField')}</span>
                <span>{t('adminOrg.colStatus')}</span>
                <span className="text-right">{t('adminOrg.colActions')}</span>
              </>
            }
            renderCells={(role) => {
              const id = String(role._id || role.id || '').trim();
              return (
                <>
                  <div className="min-w-0 self-center text-sm">
                    <span className="break-all font-medium">{role.key}</span>
                  </div>
                  <div className="min-w-0 self-center text-sm">
                    <div className="truncate" title={role.label}>
                      {role.label}
                    </div>
                    {role.legacyOutsideMaster ? (
                      <div className="mt-0.5 text-[10px] text-warning">
                        {t('adminRbac.legacyOutsideMasterHint')}
                      </div>
                    ) : !hasLayerPrefix(role.label, 'project') ? (
                      <div className="mt-0.5 text-[10px] text-warning">
                        {t('adminRbac.listLegacyNameHint')}
                      </div>
                    ) : null}
                  </div>
                  <div className="self-center text-sm">
                    {role.canAssign ? (
                      <span className="text-success">{t('adminRbac.yes')}</span>
                    ) : (
                      <span className="text-muted-foreground">{t('adminRbac.no')}</span>
                    )}
                  </div>
                  <div className="self-center text-xs text-muted-foreground">{roleStatusLabel(role, t)}</div>
                  <div className="relative flex flex-wrap items-center justify-end gap-1 self-center">
                    <Link
                      to={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, id, 'edit')}
                      className={adminManageLinkClass()}
                      aria-label={`${t('adminDomains.rbac.projectRoleManageHub')}: ${role.label || role.key}`}
                    >
                      {t('adminDomains.rbac.projectRoleManageHub')}
                    </Link>
                    {!role.isSystem ? (
                      <RoleRowMoreMenu
                        roleName={role.label || role.key}
                        deleteTo={adminRoleHubLink(PROJECT_ROLE_MANAGE_HUB, id, 'delete')}
                        t={t}
                      />
                    ) : null}
                  </div>
                </>
              );
            }}
          />
          </div>
          </>
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

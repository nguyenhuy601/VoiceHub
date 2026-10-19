import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import {
  AdminUserFormCard,
  AdminUserPanelShell,
} from '../../components/adminUsers/adminUserPanelUi';
import { AdminBusySpinner, AdminLoadErrorState } from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { roleAPI } from '../../services/api/roleAPI';
import { unwrapCatalogPayload } from '../../utils/rbacUi';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import PermissionDomainCardBrowser from './PermissionDomainCardBrowser';
import { PermissionModuleSections } from './PermissionModuleSections';
import {
  labelCategory,
  labelModule,
  labelPermission,
} from './permissionCatalogLabels';
import {
  filterHiddenOrgRolePermissionGroups,
  isHiddenOrgRolePermission,
} from './orgRolePermissionVisibility';

function countPerms(domain) {
  return (domain.modules || []).reduce(
    (n, mod) => n + (Array.isArray(mod.permissions) ? mod.permissions.length : 0),
    0
  );
}

/**
 * Step 1 — Quyền hệ thống theo nhóm chức năng (read-only). Không tạo permission.
 */
export default function PermissionByDomainPage() {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState([]);
  const [filter, setFilter] = useState('');
  const [activeKey, setActiveKey] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await (roleAPI.listSystemPermissions || roleAPI.getRbacCatalog)();
        const payload = unwrapCatalogPayload(res);
        if (!cancelled) setTree(Array.isArray(payload?.tree) ? payload.tree : []);
      } catch (err) {
        if (!cancelled) {
          const msg = resolveApiErrorMessage(err, {
            t,
            fallback: t('adminDomains.rbac.permissionsLoadFail'),
          });
          setError(msg);
          toast.error(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t, reloadTick]);

  const domains = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = filterHiddenOrgRolePermissionGroups(
      (Array.isArray(tree) ? tree : []).map((cat) => {
        const catKey = cat.key || cat.id || cat.label;
        return {
          key: catKey,
          label: labelCategory(catKey, t),
          modules: (Array.isArray(cat.modules) ? cat.modules : []).map((mod) => {
            const modKey = mod.key || mod.label;
            return {
              ...mod,
              key: modKey,
              label: labelModule(modKey, t),
              permissions: (Array.isArray(mod.permissions) ? mod.permissions : []).map((p) => {
                const code = String(p.key || p.code || '').trim();
                return {
                  ...p,
                  key: code,
                  label: labelPermission(code, t),
                };
              }),
            };
          }),
        };
      })
    );
    if (!q) return base;
    return base
      .map((cat) => ({
        ...cat,
        modules: cat.modules
          .map((mod) => ({
            ...mod,
            permissions: (Array.isArray(mod.permissions) ? mod.permissions : []).filter((p) => {
              if (isHiddenOrgRolePermission(p.key || p.code)) return false;
              const blob =
                `${p.key || ''} ${p.label || ''} ${p.action || ''} ${mod.label || ''} ${cat.label || ''}`.toLowerCase();
              return blob.includes(q);
            }),
          }))
          .filter((mod) => mod.permissions.length),
      }))
      .filter((cat) => cat.modules.length);
  }, [tree, filter, t]);

  useEffect(() => {
    if (!domains.length) {
      setActiveKey('');
      return;
    }
    if (!domains.some((d) => d.key === activeKey)) {
      setActiveKey(domains[0].key);
    }
  }, [domains, activeKey]);

  const cards = useMemo(
    () =>
      domains.map((d) => ({
        key: d.key,
        label: d.label,
        total: countPerms(d),
      })),
    [domains]
  );

  const activeDomain = useMemo(
    () => domains.find((d) => d.key === activeKey) || null,
    [domains, activeKey]
  );

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.permissionsByDomain')}
      hint={t('adminDomains.rbac.permissionsByDomainHint')}
    >
      {loading ? <AdminBusySpinner /> : null}
      {!loading && error ? (
        <AdminLoadErrorState message={error} onRetry={() => setReloadTick((n) => n + 1)} />
      ) : null}
      {!loading && !error ? (
        <AdminUserFormCard>
          <PermissionDomainCardBrowser
            domains={cards}
            activeKey={activeKey}
            onSelect={setActiveKey}
            searchValue={filter}
            onSearchChange={setFilter}
            searchLabel={t('adminDomains.rbac.permissionSearch')}
            searchPlaceholder={t('adminDomains.rbac.permissionSearchPlaceholder')}
            navTitle={t('adminDomains.rbac.domainCardsNav')}
            detailHeading={t('adminDomains.rbac.domainDetailHeading')}
            pickHint={t('adminDomains.rbac.domainCardPickHint')}
            emptyNav={t('adminDomains.rbac.domainCardsEmpty')}
          >
            <PermissionModuleSections
              modules={activeDomain?.modules || []}
              emptyLabel={t('adminDomains.rbac.domainDetailEmpty')}
              resolveLabel={(code) => labelPermission(code, t)}
            />
          </PermissionDomainCardBrowser>
        </AdminUserFormCard>
      ) : null}
    </AdminUserPanelShell>
  );
}

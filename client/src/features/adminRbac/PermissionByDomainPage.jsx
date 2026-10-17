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

/**
 * Step 1 — Quyền hệ thống theo nhóm chức năng (read-only). Không tạo permission.
 */
export default function PermissionByDomainPage() {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tree, setTree] = useState([]);
  const [filter, setFilter] = useState('');
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
            fallback: t('adminDomains.rbac.permissionsLoadFail', 'Không tải được danh sách quyền'),
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
    return (Array.isArray(tree) ? tree : [])
      .map((cat) => {
        const modules = (Array.isArray(cat.modules) ? cat.modules : []).map((mod) => {
          const perms = (Array.isArray(mod.permissions) ? mod.permissions : []).filter((p) => {
            if (!q) return true;
            const blob = `${p.key || ''} ${p.label || ''} ${p.action || ''}`.toLowerCase();
            return blob.includes(q);
          });
          return { ...mod, permissions: perms };
        }).filter((mod) => mod.permissions.length);
        return {
          key: cat.key || cat.id || cat.label,
          label: cat.label || cat.key || '—',
          modules,
        };
      })
      .filter((cat) => cat.modules.length);
  }, [tree, filter]);

  return (
    <AdminUserPanelShell
      title={t('adminDomains.rbac.permissionsByDomain', 'Quyền theo chức năng')}
      hint={t(
        'adminDomains.rbac.permissionsByDomainHint',
        'Danh sách quyền hệ thống (chỉ xem). Gán quyền vào Vai trò tổ chức ở màn Org Role.'
      )}
    >
      {loading ? <AdminBusySpinner /> : null}
      {!loading && error ? (
        <AdminLoadErrorState message={error} onRetry={() => setReloadTick((n) => n + 1)} />
      ) : null}
      {!loading && !error ? (
        <label className="flex max-w-md flex-col gap-1 text-sm">
          <span>{t('adminDomains.rbac.permissionSearch')}</span>
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1.5"
          />
        </label>
      ) : null}
      {!loading && !error && !domains.length ? (
        <p className="text-sm text-muted-foreground">
          {t('adminDomains.rbac.permissionsEmpty', 'Chưa có quyền hệ thống.')}
        </p>
      ) : null}
      <div className="grid gap-3">
        {domains.map((domain) => (
          <AdminUserFormCard key={domain.key} title={domain.label}>
            <ul className="space-y-2 text-sm">
              {(domain.modules || []).map((mod) => {
                const perms = Array.isArray(mod.permissions)
                  ? mod.permissions
                  : Array.isArray(mod.children)
                    ? mod.children
                    : [];
                return (
                  <li key={mod.key || mod.label}>
                    <div className="font-medium text-foreground">{mod.label || mod.key}</div>
                    <ul className="mt-1 space-y-0.5 pl-3 text-muted-foreground">
                      {perms.map((p) => (
                        <li key={p.key || p.code}>
                          <code className="text-xs">{p.key || p.code}</code>
                          {p.label ? <span className="ml-2">{p.label}</span> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </AdminUserFormCard>
        ))}
      </div>
    </AdminUserPanelShell>
  );
}

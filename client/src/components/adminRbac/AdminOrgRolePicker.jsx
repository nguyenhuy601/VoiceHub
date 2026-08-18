import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAppStrings } from '../../locales/appStrings';
import { orgRoleCatalogAPI } from '../../services/api/orgRoleCatalogAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { adminPrimaryBtnClass } from '../adminUsers/adminUserPanelUi';

function roleId(row) {
  return String(row?._id || row?.id || '').trim();
}

function roleLabel(row) {
  return String(row?.label || row?.key || roleId(row) || '—').trim();
}

export default function AdminOrgRolePicker({ orgId, selectedRoleId, hint, paramKey = 'roleId' }) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [reloadTick, setReloadTick] = useState(0);

  const activeId = String(selectedRoleId || searchParams.get(paramKey) || '').trim();

  useEffect(() => {
    if (!orgId) {
      setRoles([]);
      setLoadError('');
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError('');
      try {
        const res = await orgRoleCatalogAPI.listCatalog(orgId);
        const list = res?.data?.roles || res?.data?.data?.roles || [];
        if (cancelled) return;
        setRoles(Array.isArray(list) ? list : []);
      } catch (error) {
        if (cancelled) return;
        setRoles([]);
        const msg = resolveApiErrorMessage(error, { t, fallback: t('common.loadFail') });
        setLoadError(msg);
        toast.error(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId, t, reloadTick]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((row) => {
      const id = roleId(row).toLowerCase();
      const label = roleLabel(row).toLowerCase();
      const key = String(row?.key || '').toLowerCase();
      return label.includes(q) || key.includes(q) || id.includes(q);
    });
  }, [roles, query]);

  const pick = (id) => {
    const nextId = String(id || '').trim();
    if (!nextId) return;
    const next = new URLSearchParams(searchParams);
    next.set(paramKey, nextId);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/40 p-4">
      <div>
        <h3 className="text-sm font-semibold">{t('adminRbac.orgRolePickerTitle')}</h3>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('adminRbac.orgRoleSearchPlaceholder')}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
      />
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : loadError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <div className="mt-3">
            <button
              type="button"
              className={adminPrimaryBtnClass()}
              onClick={() => setReloadTick((n) => n + 1)}
            >
              {t('adminRbac.retry')}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-64 overflow-auto rounded-lg border border-border/70">
          <ul className="divide-y divide-border/50">
            {filtered.map((row) => {
              const id = roleId(row);
              const active = id === activeId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => pick(id)}
                    className={`flex w-full flex-col px-3 py-2.5 text-left transition ${
                      active ? 'bg-red-500/10' : 'hover:bg-muted/30'
                    }`}
                  >
                    <span className="text-sm font-medium">{roleLabel(row)}</span>
                    <span className="text-xs text-muted-foreground">{row?.key || id}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {!filtered.length ? (
            <p className="px-3 py-4 text-sm text-muted-foreground">{t('adminRbac.noOrgRoles')}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}


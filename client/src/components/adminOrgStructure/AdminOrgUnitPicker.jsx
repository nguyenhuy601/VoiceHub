/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import {
  AdminUserFormCard,
  adminInputClass,
  adminPrimaryBtnClass,
} from '../adminUsers/adminUserPanelUi';
import { unitId, unitName } from '../../utils/adminOrgStructureUtils';

/**
 * Picker đơn vị org (dept / team / branch / division).
 * Query param: ?unitId= (hoặc paramKey tùy chỉnh).
 */
export default function AdminOrgUnitPicker({
  items,
  loading,
  error = '',
  onRetry,
  selectedId,
  onSelect,
  title,
  hint,
  paramKey = 'unitId',
  subtitleFn,
  badgeFn,
}) {
  const { t } = useAppStrings();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const activeId = String(selectedId || searchParams.get(paramKey) || '').trim();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items || [];
    return (items || []).filter((row) => {
      const id = unitId(row);
      const name = unitName(row).toLowerCase();
      const sub = String(subtitleFn?.(row) || '').toLowerCase();
      return name.includes(q) || sub.includes(q) || id.toLowerCase().includes(q);
    });
  }, [items, query, subtitleFn]);

  const pick = (id) => {
    const nextId = String(id || '').trim();
    if (!nextId) return;
    onSelect?.(nextId);
    const next = new URLSearchParams(searchParams);
    next.set(paramKey, nextId);
    setSearchParams(next, { replace: true });
  };

  return (
    <AdminUserFormCard title={title || t('adminOrg.pickerTitle')} hint={hint}>
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('adminOrg.searchPlaceholder')}
          className={`${adminInputClass()} pl-9`}
        />
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : error ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
          {typeof onRetry === 'function' ? (
            <div className="mt-3">
              <button type="button" className={adminPrimaryBtnClass()} onClick={() => onRetry()}>
                {t('adminRbac.retry')}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-xl border border-border/70">
          <ul className="divide-y divide-border/50">
            {filtered.map((row) => {
              const id = unitId(row);
              const active = id === activeId;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => pick(id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                      active ? 'bg-red-500/10' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-foreground">{unitName(row)}</div>
                      {subtitleFn ? (
                        <p className="truncate text-xs text-muted-foreground">{subtitleFn(row)}</p>
                      ) : null}
                    </div>
                    {badgeFn ? (
                      <span className="shrink-0 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        {badgeFn(row)}
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {!filtered.length ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t('adminOrg.emptyList')}</p>
          ) : null}
        </div>
      )}
    </AdminUserFormCard>
  );
}

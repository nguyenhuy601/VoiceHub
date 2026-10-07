import { Fragment, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAppStrings } from '../../locales/appStrings';
import { adminInputClass, adminPrimaryBtnClass } from '../../components/adminUsers/adminUserPanelUi';
import useAdminRoles from '../../hooks/useAdminRoles';
import useRoleMasterGrantsMap from '../../hooks/useRoleMasterGrantsMap';
import { countMasterGrants } from '../../utils/rbacV2Ui';
import { normalizeRoleDisplayName, normalizeRoleId } from '../../utils/adminRbacUtils';
import {
  AdminListSkeleton,
} from '../../components/adminUsers/adminPanelStates';

const SEARCH_MAX_LENGTH = 100;
const ALL_CATEGORIES = '';

const chipClass = (active) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
    active ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:bg-muted'
  }`;

function slotMatchesQuery(slot, q) {
  if (!q) return true;
  return [slot.key, slot.label, slot.moduleLabel, slot.categoryLabel, slot.action]
    .some((v) => String(v || '').toLowerCase().includes(q));
}

export default function RolesMatrixPanel({ orgId }) {
  const { t } = useAppStrings();
  const { systemRoles, loading, error, loadRoles } = useAdminRoles(orgId);
  const {
    slots,
    grantsByRoleId,
    loading: grantsLoading,
    error: catalogError,
    reload,
  } = useRoleMasterGrantsMap(orgId, systemRoles);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(ALL_CATEGORIES);

  const busy = loading || grantsLoading;
  const grantSetByRole = useMemo(() => {
    const map = {};
    for (const [id, grants] of Object.entries(grantsByRoleId || {})) {
      map[id] = new Set(grants);
    }
    return map;
  }, [grantsByRoleId]);

  const categories = useMemo(() => {
    const seen = new Map();
    for (const slot of slots) {
      if (slot.categoryKey && !seen.has(slot.categoryKey)) {
        seen.set(slot.categoryKey, slot.categoryLabel || slot.categoryKey);
      }
    }
    return [...seen.entries()].map(([key, label]) => ({ key, label }));
  }, [slots]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byCategory = new Map();
    for (const slot of slots) {
      if (category && slot.categoryKey !== category) continue;
      if (!slotMatchesQuery(slot, q)) continue;
      const key = slot.categoryKey || '';
      if (!byCategory.has(key)) {
        byCategory.set(key, { key, label: slot.categoryLabel || key, slots: [] });
      }
      byCategory.get(key).slots.push(slot);
    }
    return [...byCategory.values()];
  }, [slots, query, category]);

  const visibleCount = groups.reduce((sum, g) => sum + g.slots.length, 0);
  const loadError = error || catalogError ? t('adminRbac.matrixLoadFail') : '';

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t('adminDomains.rbac.matrix')}</h2>
        <p className="text-sm text-muted-foreground">{t('adminRbac.matrixHint')}</p>
      </div>
      {busy ? (
        <AdminListSkeleton />
      ) : loadError ? (
        <div className="space-y-3">
          <p role="alert" className="rounded-xl border border-destructive px-3 py-2 text-sm text-destructive">
            {loadError}
          </p>
          <button
            type="button"
            className={adminPrimaryBtnClass()}
            onClick={() => {
              loadRoles();
              reload();
            }}
          >
            {t('common.retry')}
          </button>
        </div>
      ) : !systemRoles.length ? (
        <p className="text-sm text-muted-foreground">{t('adminRbac.noRoles')}</p>
      ) : !slots.length ? (
        <p className="rounded-xl border border-warning bg-warning-bg px-3 py-2 text-sm text-warning">
          {t('adminRbac.createHint')}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <input
                type="search"
                value={query}
                maxLength={SEARCH_MAX_LENGTH}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('adminRbac.matrixSearchPlaceholder')}
                aria-label={t('adminRbac.matrixSearchPlaceholder')}
                className={`${adminInputClass()} pl-9`}
              />
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {t('adminRbac.matrixShowing', { n: visibleCount, total: slots.length })}
            </p>
          </div>

          {categories.length > 1 ? (
            <div role="group" aria-label={t('adminRbac.matrixGroupAria')} className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={category === ALL_CATEGORIES}
                className={chipClass(category === ALL_CATEGORIES)}
                onClick={() => setCategory(ALL_CATEGORIES)}
              >
                {t('adminRbac.matrixAllCategories')}
              </button>
              {categories.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={category === c.key}
                  className={chipClass(category === c.key)}
                  onClick={() => setCategory(c.key)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-success" aria-hidden="true" />
              {t('adminRbac.granted')}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full border border-border bg-muted" aria-hidden="true" />
              {t('adminRbac.denied')}
            </span>
          </div>

          {!visibleCount ? (
            <p className="rounded-xl border border-border px-3 py-6 text-center text-sm text-muted-foreground">
              {t('adminRbac.matrixNoMatch')}
            </p>
          ) : (
            <div className="max-h-[70vh] overflow-auto rounded-xl border border-border">
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-20 bg-muted text-left uppercase text-muted-foreground">
                  <tr>
                    <th scope="col" className="sticky left-0 z-30 bg-muted px-3 py-2">
                      {t('adminRbac.colPermission')}
                    </th>
                    {systemRoles.map((role) => {
                      const id = normalizeRoleId(role);
                      return (
                        <th key={id} scope="col" className="min-w-[88px] px-2 py-2 text-center">
                          <div className="truncate font-medium normal-case">{normalizeRoleDisplayName(role.name)}</div>
                          <div className="text-[10px] font-normal text-muted-foreground">
                            {countMasterGrants(grantsByRoleId[id])}
                            {role.scope ? ` · ${role.scope}` : ''}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <Fragment key={group.key || 'uncategorized'}>
                      <tr className="border-t border-border bg-card">
                        <th
                          scope="colgroup"
                          colSpan={systemRoles.length + 1}
                          className="sticky left-0 px-3 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-foreground"
                        >
                          {group.label} · {group.slots.length}
                        </th>
                      </tr>
                      {group.slots.map((slot) => (
                        <tr
                          key={slot.key}
                          className="border-t border-border transition-colors duration-150 hover:bg-muted motion-reduce:transition-none"
                        >
                          <th scope="row" className="sticky left-0 z-10 bg-background px-3 py-1.5 text-left font-normal">
                            <span title={slot.key}>
                              {slot.moduleLabel} · {slot.action}
                            </span>
                          </th>
                          {systemRoles.map((role) => {
                            const id = normalizeRoleId(role);
                            const on = grantSetByRole[id]?.has(slot.key);
                            const stateLabel = on ? t('adminRbac.granted') : t('adminRbac.denied');
                            return (
                              <td key={`${id}-${slot.key}`} className="px-2 py-1.5 text-center">
                                <span
                                  role="img"
                                  aria-label={`${normalizeRoleDisplayName(role.name)}: ${stateLabel}`}
                                  title={stateLabel}
                                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                                    on ? 'bg-success' : 'border border-border bg-muted'
                                  }`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

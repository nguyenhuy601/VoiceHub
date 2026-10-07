import { useCallback, useEffect, useState } from 'react';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminInputClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function barColor(row) {
  if (!row.headcount) return 'bg-muted';
  const used = row.allocatedFtePct / Math.max(1, row.capacityFtePct);
  if (used > 1) return 'bg-destructive';
  if (used > 0.75) return 'bg-warning';
  return 'bg-success';
}

/**
 * Admin — Department Capacity (headcount / allocated / available).
 */
export default function DepartmentCapacityPanel({ orgId }) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.getDepartmentCapacity(orgId, { asOf });
      setData(unwrap(res));
    } catch (error) {
      setLoadError(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.capacityLoadFail') }));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, asOf, t]);

  useEffect(() => {
    load();
  }, [load]);

  const items = Array.isArray(data?.items) ? data.items : [];
  const totals = data?.totals || null;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.capacity')}
      hint={t('adminTasks.capacityHint')}
      wide
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={asOf}
            aria-label={t('adminTasks.capacityAsOfAria')}
            onChange={(e) => setAsOf(e.target.value)}
            className={adminInputClass('!w-auto !py-1.5')}
          />
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={load}
            disabled={loading}
            aria-busy={loading}
          >
            <AdminBusySpinner busy={loading} />
            {t('common.refresh')}
          </button>
        </div>
      }
    >
      {totals ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-4">
          {[
            { label: t('adminTasks.capacityHeadcount'), value: totals.headcount },
            { label: t('adminTasks.capacityAllocated'), value: `${totals.allocatedFtePct}%` },
            { label: t('adminTasks.capacityAvailable'), value: `${totals.availableFtePct}%` },
            { label: t('adminTasks.capacityOverPeople'), value: totals.overallocatedPeople },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <AdminUserFormCard title={t('adminTasks.capacityByDept')}>
        <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.capacityApproxNote')}</p>
        {loading && !items.length && !loadError ? (
          <AdminListSkeleton rows={5} />
        ) : loadError ? (
          <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />
        ) : !items.length ? (
          <AdminEmptyState message={t('adminTasks.capacityEmpty')} />
        ) : (
          <ul className="space-y-3">
            {items.map((row) => {
              const pct =
                row.capacityFtePct > 0
                  ? Math.min(100, Math.round((row.allocatedFtePct / row.capacityFtePct) * 100))
                  : 0;
              return (
                <li key={row.departmentId} className="rounded-lg border border-border px-3 py-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{row.name || row.departmentId}</span>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {t('adminTasks.capacityRowLine', {
                        hc: row.headcount,
                        alloc: row.allocatedFtePct,
                        avail: row.availableFtePct,
                      })}
                    </span>
                  </div>
                  <div
                    className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-valuenow={pct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={t('adminTasks.capacityBarAria', { name: row.name || row.departmentId })}
                  >
                    <div
                      className={`h-full transition-[width] duration-300 ease-out motion-reduce:transition-none ${barColor(row)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {t('adminTasks.capacityPeopleBreakdown', {
                      available: row.availablePeople,
                      partial: row.partialPeople,
                      over: row.overallocatedPeople,
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}

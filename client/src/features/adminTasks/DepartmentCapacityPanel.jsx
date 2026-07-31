import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function barColor(row) {
  if (!row.headcount) return 'bg-muted';
  const used = row.allocatedFtePct / Math.max(1, row.capacityFtePct);
  if (used > 1) return 'bg-red-500';
  if (used > 0.75) return 'bg-amber-500';
  return 'bg-emerald-500';
}

/**
 * Admin — Department Capacity (headcount / allocated / available).
 */
export default function DepartmentCapacityPanel({ orgId }) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(false);
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.getDepartmentCapacity(orgId, { asOf });
      setData(unwrap(res));
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminTasks.capacityLoadFail') }));
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
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh') || 'Refresh'}
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
            <div key={card.label} className="rounded-xl border border-border bg-card/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      <AdminUserFormCard title={t('adminTasks.capacityByDept')}>
        <p className="mb-3 text-xs text-muted-foreground">{t('adminTasks.capacityApproxNote')}</p>
        {loading && !items.length ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !items.length ? (
          <p className="text-sm text-muted-foreground">{t('adminTasks.capacityEmpty')}</p>
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
                      HC {row.headcount} · alloc {row.allocatedFtePct}% · avail {row.availableFtePct}%
                    </span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${barColor(row)}`} style={{ width: `${pct}%` }} />
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

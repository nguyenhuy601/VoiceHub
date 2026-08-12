import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { isTimeTrackingV1Enabled } from '../../utils/timeTrackingFlag';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function defaultFrom() {
  const d = new Date();
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10);
}

/**
 * Admin — Utilization (planned available hours ∩ actual worklog hours).
 */
export default function UtilizationPanel({ orgId }) {
  const { t } = useAppStrings();
  const enabled = isTimeTrackingV1Enabled();
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    if (!orgId || !enabled) return;
    setLoading(true);
    try {
      const res = await projectAPI.getUtilization(orgId, { from, to });
      setData(unwrap(res));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.utilizationLoadFail') })
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, from, to, t, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  if (!enabled) {
    return (
      <AdminUserPanelShell title={t('adminDomains.projects.utilization')} hint={t('adminTasks.utilizationDisabled')}>
        <p className="text-sm text-muted-foreground">{t('adminTasks.utilizationDisabled')}</p>
      </AdminUserPanelShell>
    );
  }

  const items = Array.isArray(data?.items) ? data.items : [];
  const totals = data?.totals || null;

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.utilization')}
      hint={t('adminTasks.utilizationHint')}
      wide
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
          />
          <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
            {loading ? t('common.loading') : t('common.refresh') || 'Refresh'}
          </button>
        </div>
      }
    >
      {totals ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: t('adminTasks.utilizationPlanned'),
              value: `${totals.plannedAvailableHours}h`,
            },
            { label: t('adminTasks.utilizationActual'), value: `${totals.actualHours}h` },
            { label: t('adminTasks.utilizationPeople'), value: totals.people },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card/40 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {!items.length && !loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.utilizationEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">{t('adminTasks.utilizationPlanned')}</th>
                <th className="px-3 py-2">{t('adminTasks.utilizationActual')}</th>
                <th className="px-3 py-2">%</th>
                <th className="px-3 py-2">Projects</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{String(row.userId).slice(-8)}</td>
                  <td className="px-3 py-2 tabular-nums">{row.plannedAvailableHours}h</td>
                  <td className="px-3 py-2 tabular-nums">{row.actualHours}h</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.utilizationPct == null ? '—' : `${row.utilizationPct}%`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.projectCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">{t('adminTasks.utilizationApproxNote')}</p>
    </AdminUserPanelShell>
  );
}

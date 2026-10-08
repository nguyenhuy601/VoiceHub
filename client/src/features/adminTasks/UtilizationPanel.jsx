import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import {
  AdminUserPanelShell,
  adminInputClass,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { memberLabelById } from '../../utils/adminUserUtils';
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
  const [loadError, setLoadError] = useState('');
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const { membersById } = useAdminMembers(orgId, { view: 'directory' });

  const rangeInvalid = Boolean(from && to && from > to);

  const userLabel = useCallback(
    (userId) => memberLabelById(membersById, userId, t('adminTasks.unknownUser')),
    [membersById, t]
  );

  const load = useCallback(async () => {
    if (!orgId || !enabled || rangeInvalid) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.getUtilization(orgId, { from, to });
      setData(unwrap(res));
    } catch (error) {
      setLoadError(
        resolveApiErrorMessage(error, { t, fallback: t('adminTasks.utilizationLoadFail') })
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, from, to, t, enabled, rangeInvalid]);

  useEffect(() => {
    void load();
  }, [load]);

  const items = useMemo(() => (Array.isArray(data?.items) ? data.items : []), [data]);
  const totals = data?.totals || null;

  if (!enabled) {
    return (
      <AdminUserPanelShell
        title={t('adminDomains.projects.utilization')}
        hint={t('adminTasks.utilizationDisabled')}
      >
        <p role="status" className="text-sm text-muted-foreground">
          {t('adminTasks.utilizationDisabled')}
        </p>
      </AdminUserPanelShell>
    );
  }

  let body;
  if (loading && !items.length) {
    body = <AdminListSkeleton rows={6} />;
  } else if (loadError) {
    body = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading || rangeInvalid} />;
  } else if (!items.length) {
    body = <AdminEmptyState message={t('adminTasks.utilizationEmpty')} />;
  } else {
    body = (
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('adminTasks.utilizationUser')}</th>
              <th className="px-3 py-2">{t('adminTasks.utilizationPlanned')}</th>
              <th className="px-3 py-2">{t('adminTasks.utilizationActual')}</th>
              <th className="px-3 py-2">{t('adminTasks.utilizationPct')}</th>
              <th className="px-3 py-2">{t('adminTasks.utilizationProjects')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const pct = row.utilizationPct;
              const barWidth =
                pct == null || !Number.isFinite(Number(pct))
                  ? 0
                  : Math.max(0, Math.min(100, Number(pct)));
              return (
                <tr key={row.userId} className="border-t border-border hover:bg-muted">
                  <td className="px-3 py-2 text-sm">{userLabel(row.userId)}</td>
                  <td className="px-3 py-2 tabular-nums">{row.plannedAvailableHours}h</td>
                  <td className="px-3 py-2 tabular-nums">{row.actualHours}h</td>
                  <td className="px-3 py-2">
                    {pct == null ? (
                      '—'
                    ) : (
                      <div className="flex min-w-[5rem] items-center gap-2">
                        <div
                          className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
                          aria-hidden
                        >
                          <div
                            className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out motion-reduce:transition-none"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        <span className="tabular-nums text-xs">{pct}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{row.projectCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.utilization')}
      hint={t('adminTasks.utilizationHint')}
      wide
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            {t('adminTasks.utilizationDateFrom')}
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              aria-label={t('adminTasks.utilizationDateFrom')}
              aria-invalid={rangeInvalid || undefined}
              className={adminInputClass(
                rangeInvalid ? 'border-destructive focus-visible:ring-destructive' : ''
              )}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-muted-foreground">
            {t('adminTasks.utilizationDateTo')}
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              aria-label={t('adminTasks.utilizationDateTo')}
              aria-invalid={rangeInvalid || undefined}
              className={adminInputClass(
                rangeInvalid ? 'border-destructive focus-visible:ring-destructive' : ''
              )}
            />
          </label>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={load}
            disabled={loading || rangeInvalid}
            aria-busy={loading || undefined}
          >
            <AdminBusySpinner busy={loading} />
            {loading ? t('common.loading') : t('common.refresh')}
          </button>
        </div>
      }
    >
      {rangeInvalid ? (
        <p role="alert" className="mb-3 text-sm text-destructive">
          {t('adminTasks.utilizationDateRangeInvalid')}
        </p>
      ) : null}

      {totals && !loadError ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {[
            {
              label: t('adminTasks.utilizationPlanned'),
              value: `${totals.plannedAvailableHours}h`,
            },
            { label: t('adminTasks.utilizationActual'), value: `${totals.actualHours}h` },
            { label: t('adminTasks.utilizationPeople'), value: totals.people },
          ].map((card) => (
            <div key={card.label} className="rounded-xl border border-border bg-card px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{card.value}</p>
            </div>
          ))}
        </div>
      ) : null}

      {body}
      <p className="mt-3 text-[11px] text-muted-foreground">{t('adminTasks.utilizationApproxNote')}</p>
    </AdminUserPanelShell>
  );
}

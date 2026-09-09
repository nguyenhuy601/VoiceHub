import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function pct(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Math.round(Number(n) * 1000) / 10}%`;
}

function hours(n) {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n)}h`;
}

/**
 * Admin — Historical Performance per user (velocity, estimation accuracy, quality).
 */
export default function UserPerformancePanel({ orgId }) {
  const { t } = useAppStrings();
  const [loading, setLoading] = useState(false);
  const [windowDays, setWindowDays] = useState(90);
  const [data, setData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await projectAPI.listUserPerformance(orgId, { windowDays });
      setData(unwrap(res));
    } catch (error) {
      toast.error(
        resolveApiErrorMessage(error, {
          t,
          fallback: t('adminTasks.performanceLoadFail'),
        })
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, windowDays, t]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = useCallback(
    async (userId) => {
      if (!orgId || !userId) return;
      setSelectedUserId(userId);
      setDetailLoading(true);
      try {
        const res = await projectAPI.getUserPerformance(orgId, userId, { windowDays });
        setDetail(unwrap(res));
      } catch (error) {
        toast.error(
          resolveApiErrorMessage(error, {
            t,
            fallback: t('adminTasks.performanceDetailFail'),
          })
        );
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [orgId, windowDays, t]
  );

  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <AdminUserPanelShell
      title={t('adminDomains.projects.performance')}
      hint={t('adminTasks.performanceHint')}
      wide
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value) || 90)}
            className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm"
            aria-label={t('adminTasks.performanceWindow')}
          >
            <option value={30}>30d</option>
            <option value={90}>90d</option>
            <option value={180}>180d</option>
          </select>
          <button type="button" className={adminSecondaryBtnClass} onClick={load} disabled={loading}>
            {loading ? t('common.loading') : t('adminTasks.performanceReload')}
          </button>
        </div>
      }
    >
      {items.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">{t('adminTasks.performanceEmpty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2">{t('adminTasks.performanceUser')}</th>
                <th className="px-3 py-2">{t('adminTasks.performanceConfidence')}</th>
                <th className="px-3 py-2">{t('adminTasks.performanceDone')}</th>
                <th className="px-3 py-2">{t('adminTasks.performanceAccuracy')}</th>
                <th className="px-3 py-2">{t('adminTasks.performanceBias')}</th>
                <th className="px-3 py-2">{t('adminTasks.performanceVelocity')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((row) => (
                <tr key={row.userId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{row.userId}</td>
                  <td className="px-3 py-2 capitalize">{row.confidence || '—'}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.sampleSize?.tasksCompleted ?? 0}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {row.estimation?.accuracyPct != null
                      ? `${row.estimation.accuracyPct}%`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{hours(row.estimation?.biasHours)}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {hours(row.velocity?.actualHoursPerWeek)}
                    <span className="text-muted-foreground"> /wk</span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className={adminSecondaryBtnClass}
                      onClick={() => loadDetail(row.userId)}
                    >
                      {t('adminTasks.performanceDetail')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedUserId ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">
            {t('adminTasks.performanceDetailTitle')}{' '}
            <span className="font-mono text-xs text-muted-foreground">{selectedUserId}</span>
          </h3>
          {detailLoading ? (
            <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
          ) : detail ? (
            <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceAccuracy')}</dt>
                <dd className="font-medium tabular-nums">
                  {detail.estimation?.accuracyPct != null
                    ? `${detail.estimation.accuracyPct}%`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceAvgEst')}</dt>
                <dd className="font-medium tabular-nums">{hours(detail.estimation?.avgEstimateHours)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceAvgAct')}</dt>
                <dd className="font-medium tabular-nums">{hours(detail.estimation?.avgActualHours)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceCycle')}</dt>
                <dd className="font-medium tabular-nums">{hours(detail.cycleTimeHours?.average)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceBugRate')}</dt>
                <dd className="font-medium tabular-nums">{pct(detail.quality?.bugRate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('adminTasks.performanceReworkRate')}</dt>
                <dd className="font-medium tabular-nums">{pct(detail.quality?.reworkRate)}</dd>
              </div>
              {detail.confidence === 'low' ? (
                <p className="sm:col-span-2 lg:col-span-3 text-amber-600 dark:text-amber-400">
                  {t('adminTasks.performanceLowConfidence')}
                </p>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">{t('adminTasks.performanceDetailEmpty')}</p>
          )}
        </div>
      ) : null}
    </AdminUserPanelShell>
  );
}

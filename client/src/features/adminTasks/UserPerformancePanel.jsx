import { useCallback, useEffect, useState } from 'react';
import {
  AdminBusySpinner,
  AdminEmptyState,
  AdminListSkeleton,
  AdminLoadErrorState,
} from '../../components/adminUsers/adminPanelStates';
import {
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import useAdminMembers from '../../hooks/useAdminMembers';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { memberLabelById } from '../../utils/adminUserUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';

const WINDOW_OPTIONS = [30, 90, 180];

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
  const [loadError, setLoadError] = useState('');
  const [windowDays, setWindowDays] = useState(90);
  const [data, setData] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const { membersById } = useAdminMembers(orgId, { view: 'directory' });

  const userLabel = useCallback(
    (userId) => memberLabelById(membersById, userId, t('adminTasks.unknownUser')),
    [membersById, t]
  );

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.listUserPerformance(orgId, { windowDays });
      setData(unwrap(res));
    } catch (error) {
      setLoadError(
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
    void load();
  }, [load]);

  const loadDetail = useCallback(
    async (userId) => {
      if (!orgId || !userId) return;
      setSelectedUserId(userId);
      setDetailLoading(true);
      setDetailError('');
      try {
        const res = await projectAPI.getUserPerformance(orgId, userId, { windowDays });
        setDetail(unwrap(res));
      } catch (error) {
        setDetail(null);
        setDetailError(
          resolveApiErrorMessage(error, {
            t,
            fallback: t('adminTasks.performanceDetailFail'),
          })
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [orgId, windowDays, t]
  );

  const items = Array.isArray(data?.items) ? data.items : [];

  let tableBody;
  if (loading && !items.length) {
    tableBody = <AdminListSkeleton rows={6} />;
  } else if (loadError) {
    tableBody = <AdminLoadErrorState message={loadError} onRetry={load} disabled={loading} />;
  } else if (!items.length) {
    tableBody = <AdminEmptyState message={t('adminTasks.performanceEmpty')} />;
  } else {
    tableBody = (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted text-xs uppercase tracking-wide text-muted-foreground">
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
            {items.map((row) => {
              const selected = String(row.userId) === String(selectedUserId);
              return (
                <tr
                  key={row.userId}
                  className={`border-t border-border hover:bg-muted ${
                    selected ? 'bg-primary-subtle' : ''
                  }`}
                >
                  <td className="px-3 py-2 text-sm">{userLabel(row.userId)}</td>
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
                    <span className="text-muted-foreground">
                      {' '}
                      {t('adminTasks.performancePerWeek')}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className={adminSecondaryBtnClass()}
                      onClick={() => loadDetail(row.userId)}
                      disabled={detailLoading && selected}
                    >
                      {t('adminTasks.performanceDetail')}
                    </button>
                  </td>
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
      title={t('adminDomains.projects.performance')}
      hint={t('adminTasks.performanceHint')}
      wide
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label={t('adminTasks.performanceWindow')}
            className="flex flex-wrap gap-1"
          >
            {WINDOW_OPTIONS.map((days) => {
              const pressed = windowDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  role="radio"
                  aria-checked={pressed}
                  aria-pressed={pressed}
                  className={adminSecondaryBtnClass(
                    pressed ? 'border-primary bg-primary-subtle font-semibold' : ''
                  )}
                  onClick={() => setWindowDays(days)}
                >
                  {t(`adminTasks.performanceWindow${days}`)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={load}
            disabled={loading}
            aria-busy={loading || undefined}
          >
            <AdminBusySpinner busy={loading} />
            {loading ? t('common.loading') : t('adminTasks.performanceReload')}
          </button>
        </div>
      }
    >
      {tableBody}

      {selectedUserId ? (
        <div className="mt-6 rounded-xl border border-border bg-card p-4">
          <h3 className="mb-2 text-sm font-semibold">
            {t('adminTasks.performanceDetailTitle')}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              {userLabel(selectedUserId)}
            </span>
          </h3>
          {detailLoading ? (
            <AdminListSkeleton rows={3} />
          ) : detailError ? (
            <AdminLoadErrorState
              message={detailError}
              onRetry={() => loadDetail(selectedUserId)}
              disabled={detailLoading}
            />
          ) : detail ? (
            <dl className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
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
                <p className="text-warning sm:col-span-2 lg:col-span-3">
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AdminUserFormCard,
  AdminUserPanelShell,
  adminSecondaryBtnClass,
} from '../../components/adminUsers/adminUserPanelUi';
import { useAppStrings } from '../../locales/appStrings';
import { projectAPI } from '../../services/api/projectAPI';
import { buildCollaborateProjectHubPath } from '../../utils/suitePathUtils';
import { resolveApiErrorMessage } from '../../utils/resolveApiErrorMessage';
import { HubDonutChart } from '../projects/hub/ProjectHubOverviewCharts';
import {
  buildDirectorHealthChartSegments,
  buildDirectorHoursChartSegments,
} from '../projects/hub/projectHubUtils';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function healthClass(health) {
  if (health === 'delayed') return 'text-destructive';
  if (health === 'at_risk') return 'text-warning';
  return 'text-muted-foreground';
}

function formatPct(ratio) {
  if (ratio == null || !Number.isFinite(Number(ratio))) return null;
  return Math.round(Number(ratio) * 100);
}

function formatHours(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0';
  return String(Math.round(n * 10) / 10);
}

function statusLabel(t, status) {
  const key = `adminTasks.directorStatus_${String(status || '').trim()}`;
  const label = t(key);
  return label === key ? String(status || '—') : label;
}

function healthLabel(t, health) {
  const key = `adminTasks.directorHealth_${String(health || '').trim()}`;
  const label = t(key);
  return label === key ? String(health || '—') : label;
}

function DeliveryMeta({ project, t }) {
  const progress = project?.progress || {};
  const terminal = project?.health === 'completed' || project?.health === 'cancelled';
  const hasSprint = Number(progress.sprintCommittedCards) > 0 || project?.sprint?.name;
  const cycleHours = Number(progress.cycleTimeHours);
  const hasCycle = Number.isFinite(cycleHours) && cycleHours > 0 && Number(progress.cycleTimeSample) > 0;
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
      {hasSprint ? (
        <p>
          {project?.sprint?.name ? `${project.sprint.name} · ` : ''}
          {t('adminTasks.directorSprintCommit', {
            done: Number(progress.sprintDoneCards) || 0,
            committed: Number(progress.sprintCommittedCards) || 0,
            doneHours: formatHours(progress.sprintCompletedHours),
            committedHours: formatHours(progress.sprintCommittedHours),
          })}
        </p>
      ) : terminal ? null : (
        <p>{t('adminTasks.directorNoSprint')}</p>
      )}
      {hasCycle ? (
        <p>
          {t('adminTasks.directorCycle', {
            hours: formatHours(cycleHours),
            n: Number(progress.cycleTimeSample) || 0,
          })}
        </p>
      ) : null}
    </div>
  );
}
function ProjectProgressBar({ project, t }) {
  const progress = project?.progress || {};
  const work = Math.max(0, (Number(progress.doneCards) || 0) + (Number(progress.openCards) || 0));
  const done = Math.max(0, Number(progress.doneCards) || 0);
  const pct = formatPct(progress.percentDoneCards);
  const width = work > 0 ? Math.min(100, (done / work) * 100) : 0;
  if (work <= 0) {
    return <p className="mt-1 text-[11px] text-muted-foreground">{t('adminTasks.directorNoCards')}</p>;
  }
  return (
    <div className="mt-2 min-w-[8rem] flex-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? 0}
        aria-label={t('adminTasks.directorCardsBar', { done, work })}
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {t('adminTasks.directorCardsBar', { done, work })}
        {pct != null ? ` · ${pct}%` : ''}
      </p>
      <p className="text-[11px] text-muted-foreground">
        {t('adminTasks.directorHoursSide', {
          done: formatHours(progress.estimateHoursDone),
          open: formatHours(progress.estimateHoursOpen),
        })}
      </p>
    </div>
  );
}

function PortfolioStat({ label, value, valueClass = '' }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

/**
 * Portfolio GD — RAG + % thẻ (thanh chính) + giờ ước lượng (kèm).
 */
export default function DirectorProjectHealthPanel({ orgId }) {
  const { t } = useAppStrings();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [healthFilter, setHealthFilter] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setLoadError('');
    try {
      const res = await projectAPI.getDirectorHealth(orgId, { includeArchived });
      setData(unwrap(res));
    } catch (error) {
      const message = resolveApiErrorMessage(error, {
        t,
        fallback: t('adminTasks.directorHealthLoadFail'),
      });
      setLoadError(message);
      setData(null);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [orgId, includeArchived, t]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = data?.counts || {
    delayed: 0,
    atRisk: 0,
    onTrack: 0,
    paused: 0,
    cancelled: 0,
    completed: 0,
    total: 0,
  };
  const portfolio = data?.portfolio || {};

  const ragSegments = useMemo(() => buildDirectorHealthChartSegments(counts), [counts]);
  const hoursSegments = useMemo(
    () => buildDirectorHoursChartSegments(portfolio),
    [portfolio]
  );
  const ragTotal = ragSegments.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const hoursTotal =
    (Number(portfolio.estimateHoursOpen) || 0) + (Number(portfolio.estimateHoursDone) || 0);
  const filteredProjects = (data?.projects || []).filter((p) =>
    healthFilter ? p.health === healthFilter : true
  );

  const toggleHealthFilter = useCallback((health) => {
    const next = String(health || '').trim();
    if (!next) {
      setHealthFilter(null);
      return;
    }
    setHealthFilter((prev) => (prev === next ? null : next));
  }, []);

  return (
    <AdminUserPanelShell
      title={t('adminTasks.directorHealthTitle')}
      hint={t('adminTasks.directorHealthHint')}
      wide
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
          />
          {t('adminTasks.directorIncludeArchived')}
        </label>
        <button type="button" className={adminSecondaryBtnClass()} onClick={load} disabled={loading}>
          {loading ? t('common.loading') : t('adminTasks.directorRefresh')}
        </button>
      </div>

      {loadError ? (
        <div className="mb-4 rounded-xl border border-destructive/30 bg-card px-4 py-3 text-sm">
          <p className="text-destructive">{loadError}</p>
          <button
            type="button"
            className={`${adminSecondaryBtnClass()} mt-2`}
            onClick={load}
            disabled={loading}
          >
            {t('adminTasks.directorRetry')}
          </button>
        </div>
      ) : null}

      <div
        className={`mb-4 grid gap-3 ${hoursTotal > 0 ? 'lg:grid-cols-2' : ''}`}
      >
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('adminTasks.directorHealthDonut')}
          </h3>
          <HubDonutChart
            segments={ragSegments}
            total={ragTotal}
            centerValue={String(counts.total || 0)}
            centerLabel={t('adminTasks.directorTotal')}
            ariaLabel={t('adminTasks.directorHealthDonutAria', { n: counts.total || 0 })}
            emptyLabel={t('adminTasks.directorHealthEmptySlice')}
            legendValueMode="countPct"
            muted="text-muted-foreground"
            titleCls="text-foreground"
            t={t}
            selectedKey={healthFilter}
            onSelectSegment={toggleHealthFilter}
          />
        </div>
        {hoursTotal > 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-3">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('adminTasks.directorPortfolioHours')}
            </h3>
            <HubDonutChart
              segments={hoursSegments}
              total={hoursTotal}
              centerValue={`${formatHours(hoursTotal)}h`}
              centerLabel={t('adminTasks.directorHoursDonut')}
              ariaLabel={t('adminTasks.directorHoursDonutAria')}
              emptyLabel={t('adminTasks.directorHealthEmptySlice')}
              legendValueMode="countPct"
              muted="text-muted-foreground"
              titleCls="text-foreground"
              t={t}
            />
          </div>
        ) : null}
      </div>

      {healthFilter ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            {t('adminTasks.directorHealthFilter', { label: healthLabel(t, healthFilter) })}
          </span>
          <button
            type="button"
            className={adminSecondaryBtnClass()}
            onClick={() => toggleHealthFilter('')}
          >
            {t('adminTasks.directorHealthFilterClear')}
          </button>
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <PortfolioStat
          label={t('adminTasks.directorPortfolioOpen')}
          value={portfolio.openCards || 0}
        />
        <PortfolioStat
          label={t('adminTasks.directorPortfolioOverdue')}
          value={portfolio.overdueCards || 0}
          valueClass={Number(portfolio.overdueCards) > 0 ? 'text-destructive' : ''}
        />
        <PortfolioStat
          label={t('adminTasks.directorCapacityPeople')}
          value={data?.capacity?.peopleOnListedProjects || 0}
        />
        <PortfolioStat
          label={t('adminTasks.directorCapacityOver')}
          value={data?.capacity?.overallocatedPeople || 0}
          valueClass={Number(data?.capacity?.overallocatedPeople) > 0 ? 'text-warning' : ''}
        />
      </div>

      <AdminUserFormCard title={t('adminTasks.directorProjects')}>
        {loading && !data?.projects?.length ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : !filteredProjects.length ? (
          <p className="text-sm text-muted-foreground">
            {healthFilter ? t('adminTasks.directorHealthFilterEmpty') : t('adminTasks.directorEmpty')}
          </p>
        ) : (
          <ul className="max-h-[50vh] space-y-2 overflow-y-auto text-sm">
            {filteredProjects.map((p, index) => {
              const pid = String(p.projectId || '').trim();
              const hubPath = pid
                ? buildCollaborateProjectHubPath(pid, { organizationId: orgId })
                : '';
              const overdue = Number(p.progress?.overdueCards) || 0;
              const dueLabel = p.dueDate
                ? t('adminTasks.directorDue', {
                    date: new Date(p.dueDate).toLocaleDateString(),
                  })
                : t('adminTasks.directorNoDue');
              return (
                <li
                  key={pid || `row-${index}`}
                  className="rounded-lg border border-border px-3 py-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      {hubPath ? (
                        <Link
                          to={hubPath}
                          aria-label={t('adminTasks.directorOpenHub')}
                          className="font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                          {p.title || pid}
                        </Link>
                      ) : (
                        <span className="font-semibold">{p.title || '—'}</span>
                      )}
                      {p.projectCode ? (
                        <span className="ml-2 text-[11px] text-muted-foreground">{p.projectCode}</span>
                      ) : null}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {statusLabel(t, p.status)} · {dueLabel}
                        {overdue > 0
                          ? ` · ${t('adminTasks.directorOverdueCards', { n: overdue })}`
                          : ''}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold uppercase ${healthClass(p.health)}`}>
                      {healthLabel(t, p.health)}
                    </span>
                  </div>
                  <ProjectProgressBar project={p} t={t} />
                  <DeliveryMeta project={p} t={t} />
                </li>
              );
            })}
          </ul>
        )}
      </AdminUserFormCard>
    </AdminUserPanelShell>
  );
}
